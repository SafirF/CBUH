import { supabase } from '../../../config/supabase-client.js'
import { store } from '../../../config/app-store.js'

let isInitialized = false;

export async function initRegistration() {
    if (isInitialized) return;

    const registrationForm = document.getElementById('registrationForm')
    if (!registrationForm) return

    // Check Configuration
    const isOpen = await checkRegistrationStatus();
    if (!isOpen) {
        disableRegistrationForm(registrationForm);
    }

    initPhotoPreview()
    initFileInputs()
    initFormSubmit(registrationForm)

    isInitialized = true;
}

async function checkRegistrationStatus() {
    try {
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;
        if (!sedeId) return true; // Default open if no context

        const { data, error } = await supabase
            .from('configuraciones')
            .select('valor')
            .eq('sede_id', sedeId)
            .eq('clave', 'inscripciones_abiertas')
            .single();

        if (data && data.valor === 'false') return false;
        return true;
    } catch (e) {
        console.warn('Error checking config:', e);
        return true;
    }
}

function disableRegistrationForm(form) {
    const inputs = form.querySelectorAll('input, select, button[type="submit"]');
    inputs.forEach(el => {
        el.disabled = true;
        el.classList.add('opacity-50', 'cursor-not-allowed');
    });

    // Add Banner
    const banner = document.createElement('div');
    banner.className = 'bg-red-500/20 border border-red-500 text-red-100 p-4 rounded-xl mb-6 text-center font-bold uppercase tracking-widest';
    banner.innerHTML = '<span class="material-symbols-outlined align-middle mr-2">block</span> El periodo de inscripciones está cerrado';

    form.insertAdjacentElement('beforebegin', banner);
}

function initPhotoPreview() {
    const photoInput = document.getElementById('reg_photo_input')
    const preview = document.getElementById('reg_photo_preview')
    const icon = document.getElementById('reg_photo_placeholder_icon')
    const text = document.getElementById('reg_photo_placeholder_text')
    const container = document.getElementById('reg_photo_container')

    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                if (preview) {
                    preview.src = event.target.result
                    preview.classList.remove('hidden')
                }
                icon?.classList.add('hidden')
                text?.classList.add('hidden')
                container?.classList.remove('border-dashed')
            }
            reader.readAsDataURL(file)
        }
    })
}

function initFileInputs() {
    document.querySelectorAll('.reg-doc-input').forEach(input => {
        input.addEventListener('change', function () {
            const type = this.getAttribute('data-type')
            const statusLabel = document.getElementById('reg_status_' + type)
            const textLabel = document.getElementById('reg_label_' + type)

            if (this.files && this.files.length > 0) {
                if (statusLabel) {
                    statusLabel.innerHTML = 'Cargado'
                    statusLabel.classList.remove('bg-white/5', 'text-white/40')
                    statusLabel.classList.add('bg-green-500/10', 'text-green-400', 'border-green-500/20')
                }
                if (textLabel) {
                    textLabel.innerHTML = this.files[0].name
                    textLabel.classList.remove('text-gold/40')
                    textLabel.classList.add('text-gold')
                }
            }
        })
    })
}

function initFormSubmit(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault()

        const btnSubmit = document.getElementById('btnSubmitRegistration')
        const originalContent = btnSubmit.innerHTML

        try {
            btnSubmit.disabled = true
            btnSubmit.innerHTML = '<span class="animate-spin material-symbols-outlined font-black">sync</span> Procesando...'

            const formData = new FormData(form)
            const cedula = formData.get('cedula')
            const username = formData.get('usuario')
            const email = formData.get('correo')
            const nombres = formData.get('nombres')
            const apellidos = formData.get('apellidos')
            const rawPassword = formData.get('clave')
            const password = rawPassword && rawPassword.trim().length > 0 ? rawPassword : 'estudiante123'

            if (!username || !email) throw new Error('Usuario y correo son obligatorios para el acceso al sistema')

            // 0. Pre-check: Verify if student already exists GLOBALLY (to avoid creating Auth user if student exists)
            const { data: existingStudent, error: checkError } = await supabase
                .from('estudiantes')
                .select('id, sede_id')
                .eq('cedula', cedula)
                .maybeSingle()

            if (existingStudent) {
                // If in same sede or different, we block to maintain 1:1 person-student mapping
                throw new Error(`El estudiante ya está registrado (Sede ID: ${existingStudent.sede_id}). No se puede duplicar.`)
            }

            // 1. Create Supabase Auth User
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: `${nombres} ${apellidos}`,
                        cedula: cedula
                    }
                }
            })

            if (authError) throw new Error(`Error creando usuario: ${authError.message}`)

            // 2. Create 'usuarios' record
            const { data: userData, error: userError } = await supabase
                .from('usuarios')
                .insert({
                    auth_id: authData.user.id,
                    usuario: username,
                    correo: email,
                    clave_hash: password, // Legacy/Backup
                    nombres: nombres,
                    apellidos: apellidos,
                    cedula: cedula,
                    rol_id: 3, // Estudiante
                    estado_id: 1,
                    sede_id: store.get().adminContext?.sedeId || window.adminContext?.sedeId
                })
                .select()
                .single()

            if (userError) throw new Error(`Error registrando usuario en base de datos: ${userError.message}`)

            // 3. Create the student record (linked to user)
            const studentData = {
                nombres: nombres,
                apellidos: apellidos,
                cedula: cedula,
                telefono: formData.get('telefono'),
                lugar_nacimiento: formData.get('lugar_nacimiento'),
                fecha_nacimiento: formData.get('fecha_nacimiento') || null,
                direccion: formData.get('direccion'),
                año_actual: 1, // Default for new registration
                estado_id: 1,  // Active
                sede_id: store.get().adminContext?.sedeId || window.adminContext?.sedeId,
                usuario_id: userData.id // Link to user
            }

            const { data: newStudent, error: studentError } = await supabase
                .from('estudiantes')
                .insert(studentData)
                .select()
                .single()

            if (studentError) {
                // If student creation fails, we might leave a dangling user, but for now just error out.
                if (studentError.code === '23505') throw new Error('Esta cédula ya está registrada como estudiante')
                throw studentError
            }

            const studentId = newStudent.id

            // 2. Upload Documents & Photo
            const filesToUpload = [
                { inputId: 'reg_photo_input', type: 'foto_perfil', bucket: 'avatars' },
                { inputId: 'reg_doc_cedula', type: 'cedula', bucket: 'documentos' },
                { inputId: 'reg_doc_titulo', type: 'titulo_bachiller', bucket: 'documentos' },
                { inputId: 'reg_doc_notas', type: 'notas_certificadas', bucket: 'documentos' },
                { inputId: 'reg_doc_partida', type: 'partida_nacimiento', bucket: 'documentos' }
            ]

            const uploadPromises = filesToUpload.map(async (doc) => {
                const input = document.getElementById(doc.inputId)
                if (input && input.files && input.files[0]) {
                    const file = input.files[0]
                    const fileExt = file.name.split('.').pop()
                    const fileName = `student-${studentId}-${doc.type}-${Date.now()}.${fileExt}`

                    const { error: uploadError } = await supabase.storage
                        .from(doc.bucket)
                        .upload(fileName, file)

                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from(doc.bucket)
                        .getPublicUrl(fileName)

                    // Insert document record
                    await supabase.from('documentos_estudiantes').insert({
                        estudiante_id: studentId,
                        tipo_documento: doc.type,
                        url_archivo: publicUrl,
                        nombre_original: file.name,
                        verificado: true, // Auto-verify (Admin Registration)
                        estado_id: 1
                    })

                    return publicUrl
                }
                return null
            })

            await Promise.all(uploadPromises)

            // Success!
            if (window.NotificationSystem) {
                window.NotificationSystem.show('¡Estudiante inscrito con éxito!', 'success')
            } else {
                console.log('¡Estudiante inscrito con éxito!')
            }

            resetForm(form)

            // If the directory tab is active, reload it
            if (window.loadStudents) window.loadStudents()

        } catch (error) {
            console.error('Registration Error:', error)
            const errorMsg = error.message || 'Error al procesar la inscripción'
            if (window.NotificationSystem) {
                window.NotificationSystem.show(errorMsg, 'error')
            } else {
                console.error(errorMsg)
            }
        } finally {
            btnSubmit.disabled = false
            btnSubmit.innerHTML = originalContent
        }
    })
}

function resetForm(form) {
    form.reset()

    // Reset visual elements
    document.getElementById('reg_photo_preview')?.classList.add('hidden')
    document.getElementById('reg_photo_placeholder_icon')?.classList.remove('hidden')
    document.getElementById('reg_photo_placeholder_text')?.classList.remove('hidden')
    document.getElementById('reg_photo_container')?.classList.add('border-dashed')

    document.querySelectorAll('.reg-doc-input').forEach(input => {
        const type = input.getAttribute('data-type')
        const statusLabel = document.getElementById('reg_status_' + type)
        const textLabel = document.getElementById('reg_label_' + type)

        if (statusLabel) {
            statusLabel.innerHTML = 'Pendiente'
            statusLabel.classList.add('bg-white/5', 'text-white/40')
            statusLabel.classList.remove('bg-green-500/10', 'text-green-400', 'border-green-500/20')
        }
        if (textLabel) {
            textLabel.innerHTML = 'Seleccionar archivo'
            textLabel.classList.add('text-gold/40')
            textLabel.classList.remove('text-gold')
        }
    })
}
