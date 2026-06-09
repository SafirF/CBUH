import '../../../assets/css/tailwind.css'
import { supabase } from '../../../config/supabase-client.js'
import { timeAgo } from '../../../shared/scripts/utils.js'

let currentUser = null
let currentProfile = null

// Initialize
async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        window.location.href = '/auth/login.html'
        return
    }

    currentUser = session.user

    try {
        // Get profile
        const { data: profile, error } = await supabase
            .from('usuarios')
            .select(`
                *,
                rol:roles(nombre),
                sede:sedes(nombre, codigo)
            `)
            .eq('auth_id', currentUser.id)
            .single()

        if (error) throw error

        // Verify teacher role (Docente = 3)
        if (profile.rol_id !== 3) {
            window.location.href = '/'
            return
        }

        currentProfile = profile

        // Get docente data
        const { data: docenteData } = await supabase
            .from('docentes')
            .select('*')
            .eq('usuario_id', profile.id)
            .maybeSingle()

        currentProfile.docente = docenteData

        // Expose teacher context globally
        window.teacherContext = {
            sedeId: profile.sede_id,
            roleId: profile.rol_id,
            profileId: profile.id,
            docenteId: docenteData ? docenteData.id : null
        }

        // Initialize Layout
        await loadLayout();

        // Load initial tab
        await switchTab('dashboard');

        setupEventListeners();

    } catch (error) {
        console.error('Error:', error)
        if (window.NotificationSystem) {
            NotificationSystem.show('Error al cargar perfil: ' + error.message, 'error')
        } else {
            alert('Error al cargar perfil: ' + error.message)
        }
    }
}

async function loadLayout() {
    try {
        await Promise.all([
            window.loadComponent('/modules/shared/components/layout/sidebar-teacher.html', 'layout-sidebar'),
            window.loadComponent('/modules/shared/components/layout/header.html', 'layout-header')
        ]);

        // Update header info
        const displayNombre = currentProfile.docente ? currentProfile.docente.nombres : currentProfile.usuario;
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) headerTitle.innerHTML = 'HOLA, <span class="text-gold">' + displayNombre.toUpperCase() + '</span>';

        // Update name in session info (shared header uses admin-name ID)
        const nameDisplay = document.getElementById('admin-name');
        if (nameDisplay) nameDisplay.textContent = displayNombre;

        // Update header image if exists
        if (currentProfile.url_foto) {
            const hImg = document.getElementById('header-mobile-profile-img');
            const hIcon = document.getElementById('header-mobile-profile-icon');
            if (hImg) {
                hImg.src = currentProfile.url_foto;
                hImg.classList.remove('hidden');
            }
            if (hIcon) hIcon.classList.add('hidden');
        }

    } catch (e) {
        console.error('Layout load failed:', e);
    }
}

// Tab switching logic
window.switchTab = async function (tabId, param = null) {
    // Hide all
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'))

    // Update nav immediately
    document.querySelectorAll('.section-link').forEach(btn => {
        btn.classList.remove('bg-gold', 'text-primary-dark', 'font-bold')
        btn.classList.add('text-white/60', 'font-medium', 'hover:bg-white/5', 'hover:text-white')
        if (btn.id === 'nav-' + tabId) {
            btn.classList.add('bg-gold', 'text-primary-dark', 'font-bold')
            btn.classList.remove('text-white/60', 'font-medium', 'hover:bg-white/5', 'hover:text-white')
        }
    })

    // Dynamic Tab Loading (uses admin's component-loader.js)
    if (window.loadTab) {
        await window.loadTab(tabId);
    }

    // Initialize Modules
    if (tabId === 'dashboard') loadDashboardData();
    if (tabId === 'materias') {
        if (window.initSubjects) window.initSubjects();
    }
    if (tabId === 'horario') {
        if (window.initTeacherSchedule) window.initTeacherSchedule();
    }
    if (tabId === 'estudiantes') {
        if (window.initStudents) window.initStudents(param);
    }
    if (tabId === 'configuracion') loadConfigData();

    // Show selected
    const target = document.getElementById('tab-' + tabId)
    if (target) target.classList.remove('hidden')

    // Update title in header if needed
    const titles = {
        'dashboard': 'Panel de <span class="text-gold">Inicio</span>',
        'materias': 'Mis <span class="text-gold">Materias</span>',
        'horario': 'Mi <span class="text-gold">Horario</span>',
        'estudiantes': 'Mis <span class="text-gold">Estudiantes</span>',
        'configuracion': 'Configuración de <span class="text-gold">Perfil</span>'
    }
    const headerTitle = document.getElementById('header-title')
    if (headerTitle) headerTitle.innerHTML = titles[tabId] || 'Inicio'
}

async function loadDashboardData() {
    try {
        const docente = currentProfile.docente || null;
        if (!docente) {
            console.warn('Datos de docente incompletos');
            const teacherNameEl = document.getElementById('teacher-name');
            if (teacherNameEl) teacherNameEl.textContent = "PERFIL INCOMPLETO";
            return;
        }

        const teacherNameEl = document.getElementById('teacher-name');
        if (teacherNameEl) teacherNameEl.textContent = (docente.nombres + ' ' + docente.apellidos).toUpperCase();

        // Set photo if exists
        const img = document.getElementById('profileImageDisplay');
        const icon = document.getElementById('profileIconDisplay');
        if (currentProfile.url_foto && img) {
            img.src = currentProfile.url_foto;
            img.classList.remove('hidden');
            if (icon) icon.classList.add('hidden');
        }

        // Fill info grid
        // Fill info grid
        const infoGrid = document.getElementById('teacher-info-grid');
        if (infoGrid) {
            const d = currentProfile.docente;

            // Helper to calculate age
            const calculateAge = (birthDateString) => {
                if (!birthDateString) return 'N/A';
                const today = new Date();
                const birthDate = new Date(birthDateString);
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                return age + ' años';
            };

            const formatDate = (dateString) => {
                if (!dateString) return 'No registrada';
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                return new Date(dateString).toLocaleDateString('es-ES', options);
            };

            const age = calculateAge(d.fecha_nacimiento);
            const birthDate = d.fecha_nacimiento ? formatDate(d.fecha_nacimiento) : 'No registrada';
            const location = d.direccion ? (d.direccion.length > 30 ? d.direccion.substring(0, 30) + '...' : d.direccion) : 'No registrada';
            const birthPlace = d.lugar_nacimiento || 'No registrado';
            const specialty = d.especialidad || 'Docente General';
            const bio = d.resumen_profesional || 'Sin descripción profesional.';

            infoGrid.innerHTML = `
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">person</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Nombre Completo</span>
                    </div>
                    <p class="text-base font-bold text-white uppercase">${d.nombres} ${d.apellidos}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">badge</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Cédula</span>
                    </div>
                    <p class="text-xl font-bold text-white">${d.cedula}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">cake</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Edad</span>
                    </div>
                    <p class="text-xl font-bold text-white">${age}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">call</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Número de Teléfono</span>
                    </div>
                    <p class="text-xl font-bold text-white">${d.telefono || 'Sin teléfono'}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">mail</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Correo Electrónico</span>
                    </div>
                    <p class="text-base font-bold text-white truncate" title="${currentProfile.correo}">${currentProfile.correo}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">location_on</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Ubicación Actual</span>
                    </div>
                    <p class="text-base font-bold text-white truncate" title="${d.direccion || ''}">${location}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1 md:col-span-2 lg:col-span-3">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">event</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Lugar y Fecha de Nacimiento</span>
                    </div>
                    <p class="text-base font-bold text-white">${birthPlace} • ${birthDate}</p>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1 md:col-span-2 lg:col-span-3">
                    <div class="flex items-center gap-2 text-white/40 mb-2">
                        <span class="material-symbols-outlined text-sm text-gold/60">info</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Resumen Docente</span>
                    </div>
                    <p class="text-sm font-medium text-white/90 leading-relaxed">${bio}</p>
                </div>
            `;

            // Subtitle role update
            const roleEl = document.querySelector('#teacher-name + p');
            if (roleEl) roleEl.textContent = specialty.toUpperCase();
        }

        if (currentProfile.docente) {
            // Stats: Subject Count
            const { count: subjectsCount } = await supabase
                .from('cargas_academicas')
                .select('id', { count: 'exact', head: true })
                .eq('docente_id', currentProfile.docente.id);

            const statMaterias = document.getElementById('stat-materias');
            if (statMaterias) statMaterias.textContent = subjectsCount || 0;

            // Stats: Total Students (unique students in teacher's classes)
            const { data: assignments } = await supabase
                .from('cargas_academicas')
                .select('id')
                .eq('docente_id', currentProfile.docente.id);

            if (assignments && assignments.length > 0) {
                const assignIds = assignments.map(a => a.id);
                // Fix: Ensure we are querying correctly. Sometimes .in() with numbers works better as strings or the column name might need check.
                const { count: studentsCount, error: countError } = await supabase
                    .from('inscripciones')
                    .select('*', { count: 'exact', head: true })
                    .in('carga_academica_id', assignIds);

                if (countError) throw countError;

                const statEstudiantes = document.getElementById('stat-estudiantes');
                if (statEstudiantes) statEstudiantes.textContent = studentsCount || 0;
            }

            // Today's classes
            const today = new Date().getDay() || 7; // Sunday is 0 in JS, 7 in our logic
            const currentMonth = new Date().getMonth() + 1;

            const { data: todayClasses } = await supabase
                .from('horarios')
                .select(`
                    hora_init:hora_inicio,
                    hora_end:hora_fin,
                    aula,
                    carga:cargas_academicas!inner (
                        docente_id,
                        materia:materias (nombre:nombre_materia)
                    )
                `)
                .eq('cargas_academicas.docente_id', currentProfile.docente.id)
                .eq('dia_semana', today)
                .eq('mes', currentMonth);

            const classesContainer = document.getElementById('today-classes');
            if (classesContainer) {
                if (todayClasses && todayClasses.length > 0) {
                    classesContainer.innerHTML = todayClasses.map(c => `
                        <div class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-all">
                            <div class="flex items-center gap-4">
                                <div class="size-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                                    <span class="material-symbols-outlined text-xl">menu_book</span>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-white uppercase">${c.carga.materia.nombre}</p>
                                    <p class="text-[10px] text-white/40 uppercase tracking-widest">AULA ${c.aula}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-xs font-mono text-gold">${formatTime(c.hora_init)}</p>
                                <p class="text-[9px] text-white/20 uppercase font-bold">Inicia</p>
                            </div>
                        </div>
                    `).join('');
                } else {
                    classesContainer.innerHTML = `
                        <p class="text-white/20 italic text-center text-sm uppercase font-bold py-4 tracking-widest">
                            No hay clases programadas para hoy
                        </p>
                    `;
                }
            }
        }

    } catch (e) {
        console.error('Error loading dashboard stats:', e);
    }
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function loadConfigData() {
    const userEl = document.getElementById('config-username');
    const mailEl = document.getElementById('config-email');
    const phoneEl = document.getElementById('config-phone');
    const addressEl = document.getElementById('config-address');

    if (userEl) userEl.value = currentProfile.usuario;
    if (mailEl) mailEl.value = currentProfile.correo;

    if (currentProfile.docente) {
        if (phoneEl) phoneEl.value = currentProfile.docente.telefono || '';
        if (addressEl) addressEl.value = currentProfile.docente.direccion || '';
        if (document.getElementById('config-specialty')) document.getElementById('config-specialty').value = currentProfile.docente.especialidad || '';
        if (document.getElementById('config-bio')) document.getElementById('config-bio').value = currentProfile.docente.resumen_profesional || '';
        if (document.getElementById('config-birthdate')) document.getElementById('config-birthdate').value = currentProfile.docente.fecha_nacimiento || '';

        const displayName = document.getElementById('config-display-name');
        if (displayName) displayName.textContent = (currentProfile.docente.nombres + ' ' + currentProfile.docente.apellidos).toUpperCase();
    }

    const displayEmail = document.getElementById('config-display-email');
    if (displayEmail) displayEmail.textContent = currentProfile.correo.toUpperCase();

    // Config Photo Preview
    const configImg = document.getElementById('config-profile-img');
    const configIcon = document.getElementById('config-profile-icon');
    if (currentProfile.url_foto && configImg) {
        configImg.src = currentProfile.url_foto;
        configImg.classList.remove('hidden');
        if (configIcon) configIcon.classList.add('hidden');
    }

    // Register listeners for config tab
    const saveBtn = document.getElementById('btn-save-config');
    if (saveBtn) {
        saveBtn.onclick = handleSaveConfig;
    }

    const resetPwdBtn = document.getElementById('btn-reset-password');
    if (resetPwdBtn) {
        resetPwdBtn.onclick = handleResetPassword;
    }

    const restoreBtn = document.getElementById('btn-restore-config');
    if (restoreBtn) {
        restoreBtn.onclick = () => {
            loadConfigData();
            if (window.NotificationSystem) NotificationSystem.show('Datos restaurados', 'info');
        };
    }

    const photoInput = document.getElementById('photo-upload');
    if (photoInput) {
        photoInput.onchange = handlePhotoUpload;
    }
}

async function handleResetPassword() {
    try {
        const confirmed = await NotificationSystem.confirm(
            'Restablecer Contraseña',
            '¿Estás seguro de que deseas recibir un correo para restablecer tu contraseña?',
            { confirmText: 'Enviar Correo' }
        );
        if (!confirmed) return;

        const { error } = await supabase.auth.resetPasswordForEmail(currentProfile.correo, {
            redirectTo: window.location.origin + '/auth/reset-password.html',
        });

        if (error) throw error;

        if (window.NotificationSystem) {
            NotificationSystem.show('Se ha enviado un correo de recuperación a: ' + currentProfile.correo, 'success');
        }
    } catch (e) {
        console.error('Reset error:', e);
        if (window.NotificationSystem) NotificationSystem.show('Error: ' + e.message, 'error');
        else console.error('Error: ' + e.message);
    }
}

async function handleSaveConfig() {
    const btn = document.getElementById('btn-save-config');
    const phone = document.getElementById('config-phone').value;
    const address = document.getElementById('config-address').value;
    const specialty = document.getElementById('config-specialty')?.value;
    const bio = document.getElementById('config-bio')?.value;
    const birthdate = document.getElementById('config-birthdate')?.value;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span> <span>GUARDANDO...</span>';

        // Update Docente table
        const { error: docenteError } = await supabase
            .from('docentes')
            .update({
                telefono: phone,
                direccion: address,
                especialidad: specialty,
                resumen_profesional: bio,
                fecha_nacimiento: birthdate || null
            })
            .eq('id', currentProfile.docente.id);

        if (docenteError) throw docenteError;

        // Update local state
        currentProfile.docente.telefono = phone;
        currentProfile.docente.direccion = address;
        currentProfile.docente.especialidad = specialty;
        currentProfile.docente.resumen_profesional = bio;

        if (window.NotificationSystem) {
            NotificationSystem.show('Perfil actualizado correctamente', 'success');
        } else {
            alert('Perfil actualizado correctamente');
        }

        // Refresh dashboard data too
        loadDashboardData();

    } catch (error) {
        console.error('Error saving config:', error);
        if (window.NotificationSystem) {
            NotificationSystem.show('Error al guardar: ' + error.message, 'error');
        } else {
            alert('Error al guardar: ' + error.message);
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Guardar Cambios</span><span class="material-symbols-outlined text-sm font-black group-hover:rotate-12 transition-transform">save</span>';
    }
}

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        if (window.NotificationSystem) NotificationSystem.show('Subiendo imagen...', 'info');

        const fileExt = file.name.split('.').pop();
        const fileName = `${currentProfile.id}-${Math.random()}.${fileExt}`;
        const filePath = `profiles/${fileName}`;

        // 1. Upload to storage
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        // 3. Update Usuarios table
        const { error: userError } = await supabase
            .from('usuarios')
            .update({ url_foto: publicUrl })
            .eq('id', currentProfile.id);

        if (userError) throw userError;

        // 4. Update UI & Local state
        currentProfile.url_foto = publicUrl;

        // Refresh previews
        const configImg = document.getElementById('config-profile-img');
        const configIcon = document.getElementById('config-profile-icon');
        if (configImg) {
            configImg.src = publicUrl;
            configImg.classList.remove('hidden');
            if (configIcon) configIcon.classList.add('hidden');
        }

        // Also update header/sidebar if needed (re-trigger layout update)
        await loadLayout();

        if (window.NotificationSystem) NotificationSystem.show('Foto de perfil actualizada', 'success');

    } catch (error) {
        console.error('Upload error:', error);
        alert('Error al subir imagen: ' + error.message);
    }
}

function setupEventListeners() {
    const logoutBtn = document.getElementById('logout-btn')
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut()
            window.location.href = '/'
        })
    }
}

// Initialize on load
init()
