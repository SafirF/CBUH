import '../../../assets/css/tailwind.css'
import { supabase } from '../../../config/supabase-client.js'
import { store } from '../../../config/app-store.js'
import { timeAgo } from '../../../shared/scripts/utils.js'
import { initDirectory } from './directory.js'
import { initRegistration } from './registration.js'
import { initTeachers } from './teachers.js'
import { initSubjects } from './subjects.js'
import { initSchedules } from './schedules.js'
import { initReports } from './reports.js'
import { initSettings } from './settings.js'
import './component-loader.js' // Sistema de carga de componentes

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
            .select('*')
            .eq('auth_id', currentUser.id)
            .single()

        if (error) throw error

        // Verify admin/staff role (Admin = 1, Control de Estudio = 2)
        if (profile.rol_id !== 1 && profile.rol_id !== 2) {
            window.location.href = '/'
            return
        }

        currentProfile = profile

        // Expose admin context via centralized store
        store.set({
            adminContext: {
                sedeId: profile.sede_id,
                roleId: profile.rol_id
            }
        })

        // Backward compatibility: mantener window.adminContext durante la migración
        window.adminContext = {
            sedeId: profile.sede_id,
            roleId: profile.rol_id
        }

        // Get personal_administrativo separately, handling if not exists
        const { data: adminData } = await supabase
            .from('personal_administrativo')
            .select('*')
            .eq('usuario_id', profile.id)
            .maybeSingle()

        currentProfile.personal_administrativo = adminData

        // Initialize Modules
        await loadLayout(); // Load Sidebar & Header

        // Load initial tab (dashboard) or restore from URL? For now default.
        // But layout needs to be ready before switchTab works fully? 
        // switchTab updates DOM elements that must exist.

        // Load dashboard data
        await loadAdminProfile()
        await loadStatistics()
        await loadPendingDocs()
        await loadActivity()
        setupEventListeners()

        initRegistration()

    } catch (error) {
        console.error('Error:', error)
        if (window.NotificationSystem) {
            NotificationSystem.show('Error al cargar perfil: ' + error.message, 'error')
        } else {
            console.error('Error al cargar perfil: ' + error.message)
        }
    }
}

async function loadLayout() {
    try {
        // Parallel load from SHARED folder
        await Promise.all([
            window.loadComponent('/modules/shared/components/layout/sidebar-admin.html', 'layout-sidebar'),
            window.loadComponent('/modules/shared/components/layout/header.html', 'layout-header')
        ]);

        // Initialize Mobile Menu Logic
        initMobileMenu();
    } catch (e) {
        console.error('Layout load failed:', e);
    }
}

function initMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const openBtn = document.getElementById('open-sidebar-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');

    function openMenu() {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
        // Small delay for fade in
        setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
    }

    function closeMenu() {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('opacity-0');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }

    if (openBtn) openBtn.addEventListener('click', openMenu);
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    // Close on navigation (mobile)
    document.querySelectorAll('.section-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 1024) closeMenu();
        });
    });
}

// Load admin profile
async function loadAdminProfile() {
    const admin = currentProfile.personal_administrativo || {}

    const nombre = admin.nombres && admin.apellidos
        ? `${admin.nombres} ${admin.apellidos}`
        : currentProfile.usuario || 'ADMINISTRADOR'

    const adminNameEl = document.getElementById('admin-name')
    if (adminNameEl) adminNameEl.textContent = nombre

    document.getElementById('profile-name').textContent = nombre
    document.getElementById('profile-cargo').textContent = admin.cargo || 'ADMINISTRADOR'

    // Set photo if exists
    if (currentProfile.url_foto) {
        document.getElementById('profileImageDisplay').src = currentProfile.url_foto
        document.getElementById('profileImageDisplay').classList.remove('hidden')
        document.getElementById('profileIconDisplay').classList.add('hidden')
    }

    // Calculate age
    let edad = 'N/A'
    let fechaNac = 'No registrada'

    if (admin.fecha_nacimiento) {
        const dob = new Date(admin.fecha_nacimiento)
        const now = new Date()
        const age = Math.floor((now - dob) / (365.25 * 24 * 60 * 60 * 1000))
        edad = `${age} Años`

        const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        fechaNac = `${dob.getDate()} de ${meses[dob.getMonth() + 1]}, <br />${dob.getFullYear()}`
    }

    // Fill info grid
    const infoGrid = document.getElementById('admin-info-grid')
    if (infoGrid) {
        infoGrid.innerHTML = `
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">id_card</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Cédula</span>
                </div>
                <p class="text-xl font-bold text-white">${admin.cedula || 'N/A'}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">cake</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Edad</span>
                </div>
                <p class="text-xl font-bold text-white">${edad}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">call</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Teléfono</span>
                </div>
                <p class="text-xl font-bold text-white">${admin.telefono || 'N/A'}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">location_on</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Lugar de Nacimiento</span>
                </div>
                <p class="text-base font-bold text-white leading-tight">${admin.lugar_nacimiento || 'No registrado'}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">event</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Fecha de Nacimiento</span>
                </div>
                <p class="text-base font-bold text-white leading-tight">${fechaNac}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">mail</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Correo Institucional</span>
                </div>
                <p class="text-base font-bold text-white truncate">${currentProfile.correo || 'admin@cbuh.edu'}</p>
            </div>
            <div class="bg-card-dark p-6 rounded-2xl border border-white/5 flex flex-col gap-1 md:col-span-2 lg:col-span-3">
                <div class="flex items-center gap-2 text-white/40 mb-2">
                    <span class="material-symbols-outlined text-sm">home</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-gold/60">Dirección de Habitación</span>
                </div>
                <p class="text-sm font-medium text-white/90 leading-relaxed">${admin.direccion || 'No registrada'}</p>
            </div>
        `
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const statsRow = document.getElementById('stats-row')
        if (!statsRow) return

        // Get current counts - using estado_id=1 for active
        const [
            { count: totalStudents },
            { count: activeStudents },
            { data: graduating },
            { data: newStudents }
        ] = await Promise.all([
            supabase.from('estudiantes').select('id', { count: 'exact', head: true }).eq('sede_id', currentProfile.sede_id),
            supabase.from('estudiantes').select('id', { count: 'exact', head: true }).eq('estado_id', 1).eq('sede_id', currentProfile.sede_id),
            supabase.from('estudiantes').select('id', { count: 'exact' }).eq('año_actual', 3).eq('sede_id', currentProfile.sede_id),
            supabase.from('estudiantes').select('id', { count: 'exact' }).eq('sede_id', currentProfile.sede_id).gte('creado_el', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString())
        ])

        // Calculate growth
        const prevTotal = totalStudents - (newStudents.length || 0)
        const growthTotal = prevTotal > 0 ? ((newStudents.length || 0) / prevTotal) * 100 : 0
        const growthClass = growthTotal >= 0 ? 'text-green-400' : 'text-red-400'
        const growthSign = growthTotal >= 0 ? '+' : ''

        statsRow.innerHTML = `
            <div class="bg-primary-dark p-6 rounded-2xl border border-white/10 flex items-center gap-6">
                <div class="size-14 bg-gold/10 rounded-xl flex items-center justify-center text-gold">
                    <span class="material-symbols-outlined text-3xl">school</span>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">Estudiantes Totales</p>
                    <div class="flex items-baseline gap-2">
                        <h3 class="text-3xl font-black text-white">${totalStudents || 0}</h3>
                        ${growthTotal > 0 ? `<span class="${growthClass} text-xs font-bold">${growthSign}${growthTotal.toFixed(1)}%</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="bg-primary-dark p-6 rounded-2xl border border-white/10 flex items-center gap-6">
                <div class="size-14 bg-gold/10 rounded-xl flex items-center justify-center text-gold">
                    <span class="material-symbols-outlined text-3xl">check_circle</span>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">Inscritos Activos</p>
                    <div class="flex items-baseline gap-2">
                        <h3 class="text-3xl font-black text-white">${activeStudents || 0}</h3>
                    </div>
                </div>
            </div>
            <div class="bg-primary-dark p-6 rounded-2xl border border-white/10 flex items-center gap-6">
                <div class="size-14 bg-orange-400/10 rounded-xl flex items-center justify-center text-orange-400">
                    <span class="material-symbols-outlined text-3xl">pending_actions</span>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">Por Graduarse</p>
                    <div class="flex items-baseline gap-2">
                        <h3 class="text-3xl font-black text-white">${graduating.length || 0}</h3>
                    </div>
                </div>
            </div>
        `

    } catch (error) {
        console.error('Error loading stats:', error)
    }
}

// Load pending documents
// Código corregido para loadPendingDocs()
// Reemplazar la función existente con esta versión

// Versión corregida de loadPendingDocs() usando la misma lógica que el modal

async function loadPendingDocs() {
    try {
        const tbody = document.getElementById('pending-docs-table')
        if (!tbody) return

        // Get all students from the sede
        const { data: students, error } = await supabase
            .from('estudiantes')
            .select(`
                id,
                nombres,
                apellidos,
                cedula,
                documentos_estudiantes(
                    id,
                    tipo_documento,
                    verificado,
                    creado_el
                )
            `)
            .eq('sede_id', currentProfile.sede_id)

        if (error) throw error

        if (!students || students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-white/40 font-bold uppercase tracking-widest text-xs">
                        ✅ No hay estudiantes en la sede
                    </td>
                </tr>
            `
            return
        }

        // Standardized Document List (Matching Directory & Inscription goals)
        const requiredDocTypes = ['cedula', 'titulo_bachiller', 'notas_certificadas', 'partida_nacimiento']

        const studentsWithIssues = students.map(student => {
            const studentDocs = student.documentos_estudiantes || []

            // Check for MISSING documents (Priority 1)
            const missingDocs = requiredDocTypes.filter(type =>
                !studentDocs.some(doc => doc.tipo_documento === type)
            )

            // Check for UNVERIFIED documents (Priority 2 - Informational only for now)
            // Note: Currently we only block/warn based on MISSING documents to match Directory view.
            const pendingDocs = studentDocs.filter(doc => doc.verificado === false)

            return {
                ...student,
                missingCount: missingDocs.length,
                pendingCount: pendingDocs.length,
                missingTypes: missingDocs.map(t => t.replace('_', ' ').toUpperCase()).join(', '),
                // We determine "Issue" mainly by missing docs for the dashboard alert
                isCritical: missingDocs.length > 0
            }
        }).filter(student => student.isCritical) // Only show students with MISSING documents

        if (studentsWithIssues.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-white/40 font-bold uppercase tracking-widest text-xs">
                        ✅ Todos los estudiantes tienen la documentación completa
                    </td>
                </tr>
            `
            return
        }

        // Generate table rows
        const rows = studentsWithIssues.map(student => {
            return `
                <tr class="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="size-10 bg-gold/10 rounded-full flex items-center justify-center border border-gold/20 group-hover:border-gold/50 transition-colors">
                                <span class="text-gold font-black text-xs">${student.nombres.charAt(0)}${student.apellidos.charAt(0)}</span>
                            </div>
                            <div>
                                <p class="text-white font-bold text-sm">${student.nombres} ${student.apellidos}</p>
                                <p class="text-white/40 text-[10px] font-mono tracking-wider">${student.cedula}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-widest rounded-full">
                            <span class="size-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            ${student.missingCount} Faltantes
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-white/60 text-xs truncate max-w-[200px]" title="${student.missingTypes}">
                            ${student.missingTypes}
                        </p>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="goToStudentProfile(${student.id})" class="p-2 rounded-lg hover:bg-gold/10 text-white/40 hover:text-gold transition-all" title="Gestionar Documentos">
                            <span class="material-symbols-outlined text-lg">folder_open</span>
                        </button>
                    </td>
                </tr>
            `
        }).join('')

        tbody.innerHTML = rows

    } catch (error) {
        console.error('Error loading pending docs:', error)
        const tbody = document.getElementById('pending-docs-table')
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-red-400 font-bold uppercase tracking-widest text-xs">
                        ❌ Error al cargar validaciones
                    </td>
                </tr>
            `
        }
    }
}

// Go to student profile in directory
window.goToStudentProfile = async function (studentId) {
    try {
        // Switch to directory tab
        window.switchTab('directorio')

        // Wait for directory to load, then get student data and open edit modal
        setTimeout(async () => {
            try {
                // Get student data from Supabase
                const { data: student, error } = await supabase
                    .from('estudiantes')
                    .select(`
                        *,
                        usuarios!usuario_id (correo, url_foto),
                        estados_registro!estado_id (nombre),
                        documentos_estudiantes (
                            id,
                            tipo_documento,
                            url_archivo,
                            nombre_original,
                            verificado,
                            creado_el
                        )
                    `)
                    .eq('id', studentId)
                    .single()

                if (error) throw error

                // Encode student data for the modal
                const studentData = encodeURIComponent(JSON.stringify(student))

                // Open edit modal
                if (window.openEditModal && typeof window.openEditModal === 'function') {
                    window.openEditModal(studentData)
                } else {
                    // Store for when directory loads
                    window.pendingStudentEdit = studentData
                    if (window.NotificationSystem) {
                        NotificationSystem.show('Abriendo perfil del estudiante...', 'info')
                    }
                }

            } catch (error) {
                console.error('Error loading student data:', error)
                if (window.NotificationSystem) {
                    NotificationSystem.show('Error al cargar datos del estudiante: ' + error.message, 'error')
                }
            }
        }, 1000) // Increased timeout to ensure directory loads

    } catch (error) {
        console.error('Error navigating to student profile:', error)
        if (window.NotificationSystem) {
            NotificationSystem.show('Error al navegar al perfil: ' + error.message, 'error')
        }
    }
}

// Load recent activity
async function loadActivity() {
    try {
        // Get recent grade updates from 'calificaciones' table
        const { data: grades, error } = await supabase
            .from('calificaciones')
            .select(`
                *,
                inscripciones!inner (
                    estudiantes!inner (nombres, apellidos, sede_id),
                    cargas_academicas (
                        materias (nombre)
                    )
                )
            `)
            .eq('inscripciones.estudiantes.sede_id', currentProfile.sede_id)
            .order('actualizado_el', { ascending: false })
            .limit(5)

        if (error) throw error

        const activityList = document.getElementById('activity-list')
        if (!activityList) return

        if (!grades || grades.length === 0) {
            activityList.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-white/20 py-8">
                    <span class="material-symbols-outlined text-4xl mb-2">history</span>
                    <p class="text-xs uppercase tracking-widest font-bold">Sin actividad reciente</p>
                </div>
            `
            return
        }

        const activities = grades.map(grade => {
            // Extract deep nested data safely
            const student = grade.inscripciones?.estudiantes
            const subject = grade.inscripciones?.cargas_academicas?.materias

            // Determine what changed or just show update
            const statusText = grade.nota_reparacion
                ? 'Examen de Reparación'
                : (grade.nota_final ? 'Nota Definitiva' : 'Nota de Corte')

            return `
                <div class="flex gap-4 items-start">
                    <div class="size-2 mt-2 bg-green-500 rounded-full shrink-0 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <div>
                        <p class="text-sm font-bold text-white">${statusText}</p>
                        <p class="text-xs text-white/40">
                            ${student?.nombres || ''} ${student?.apellidos || ''} • ${subject?.nombre || 'Materia'}
                        </p>
                        <p class="text-[10px] text-gold mt-1 uppercase font-bold tracking-widest">
                            ${timeAgo(grade.actualizado_el)}
                        </p>
                    </div>
                </div>
            `
        }).join('')

        activityList.innerHTML = activities

    } catch (error) {
        console.error('Error loading activity:', error)
        if (document.getElementById('activity-list')) {
            document.getElementById('activity-list').innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-white/20 py-8">
                    <span class="material-symbols-outlined text-4xl mb-2">history</span>
                    <p class="text-xs uppercase tracking-widest font-bold">Sin actividad reciente</p>
                </div>
            `
        }
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Photo upload handler
    const photoInput = document.getElementById('profilePhotoInput')
    if (photoInput) {
        photoInput.addEventListener('change', async function (e) {
            if (!this.files || !this.files[0]) return

            const file = this.files[0]
            const fileExt = file.name.split('.').pop()
            const filePath = `${currentUser.id}-${Date.now()}.${fileExt}`

            try {
                // Show loading
                const icon = document.getElementById('profileIconDisplay')
                const img = document.getElementById('profileImageDisplay')
                icon.textContent = '⏳'

                // Upload to Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    })

                if (uploadError) throw uploadError

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(filePath)

                // Update usuarios table
                const { error: updateError } = await supabase
                    .from('usuarios')
                    .update({ url_foto: publicUrl })
                    .eq('id', currentProfile.id)

                if (updateError) throw updateError

                // Update UI
                img.src = publicUrl + '?t=' + Date.now()
                img.classList.remove('hidden')
                icon.classList.add('hidden')

                // Use global NotificationSystem
                if (window.NotificationSystem) {
                    NotificationSystem.show('✅ Foto actualizada correctamente. Recargando...', 'success')
                } else {
                    console.log('✅ Foto actualizada correctamente')
                }

                // Reload after delay
                setTimeout(() => {
                    window.location.reload()
                }, 1500)

            } catch (error) {
                console.error('Error uploading photo:', error)
                if (window.NotificationSystem) {
                    NotificationSystem.show('❌ Error al subir la foto: ' + error.message, 'error')
                } else {
                    console.error('❌ Error al subir la foto: ' + error.message)
                }

                // Restore icon
                document.getElementById('profileIconDisplay').textContent = '👤'
            }
        })
    }

    // Global search
    const searchInput = document.getElementById('globalSearchInput')
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                window.switchTab('directorio')
            }
        })
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn')
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut()
            window.location.href = '/'
        })
    }
}

// Global Tab switching function
window.switchTab = async function (tabId) {
    // Hide all
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'))

    // Update nav immediately for better UX
    document.querySelectorAll('.section-link').forEach(btn => {
        btn.classList.remove('bg-gold', 'text-primary-dark', 'font-bold')
        btn.classList.add('text-white/60', 'font-medium', 'hover:bg-white/5', 'hover:text-white')
        if (btn.id === 'nav-' + tabId) {
            btn.classList.add('bg-gold', 'text-primary-dark', 'font-bold')
            btn.classList.remove('text-white/60', 'font-medium', 'hover:bg-white/5', 'hover:text-white')
        }
    })

    // Dynamic Tab Loading
    if (window.loadTab) {
        const dynamicTabs = ['directorio', 'profesores', 'inscripciones', 'horarios', 'materias', 'reportes', 'configuracion', 'secciones'];
        if (dynamicTabs.includes(tabId)) {
            await window.loadTab(tabId);
        }
    }

    // Initialize Modules (re-attach listeners if needed)
    if (tabId === 'directorio') initDirectory();
    if (tabId === 'inscripciones') initRegistration();
    if (tabId === 'profesores') initTeachers();
    if (tabId === 'materias') initSubjects();
    if (tabId === 'horarios') initSchedules();
    if (tabId === 'reportes') initReports();
    if (tabId === 'configuracion') initSettings();
    if (tabId === 'secciones' && window.loadSectionsModule) await window.loadSectionsModule();

    // Show selected
    const target = document.getElementById('tab-' + tabId)
    if (target) target.classList.remove('hidden')

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'directorio': 'Directorio <span class="text-gold">Estudiantil</span>',
        'inscripciones': 'Ficha de <span class="text-gold">Inscripción</span>',
        'calificaciones': 'Control de <span class="text-gold">Calificaciones</span>',
        'horarios': 'Gestión de <span class="text-gold">Horarios</span>',
        'profesores': 'Vista <span class="text-gold">Profesor</span>',
        'materias': 'Gestión de <span class="text-gold">Materias</span>',
        'secciones': 'Gestión de <span class="text-gold">Secciones</span>',
        'reportes': 'Reportes y <span class="text-gold">Estadísticas</span>',
        'configuracion': 'Configuración del <span class="text-gold">Sistema</span>'
    }
    const headerTitle = document.getElementById('header-title')
    if (headerTitle) headerTitle.innerHTML = titles[tabId] || 'Dashboard'

    // Module Specific Lazy Loading
    if (tabId === 'directorio' && window.loadDirectoryModule) {
        window.loadDirectoryModule()
    }
    if (tabId === 'profesores' && window.loadTeachersModule) {
        window.loadTeachersModule()
    }
    if (tabId === 'materias' && window.loadSubjectsModule) {
        window.loadSubjectsModule()
    }
    if (tabId === 'horarios' && window.loadSchedulesModule) {
        window.loadSchedulesModule()
    }
}

// Initialize on load
init()


