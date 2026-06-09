import { supabase } from '../../../config/supabase-client.js'
import { store } from '../../../config/app-store.js'

let currentPage = 1
const itemsPerPage = 50
let currentFilter = {
    search: '',
    year: 'all',
    status: 'all'
}

// Flag to track if initial load has happened
let isDirectoryLoaded = false
let isDirectoryInitialized = false // Track listeners setup

export async function initDirectory() {
    if (isDirectoryInitialized) return;

    // Expose functions to window
    window.loadStudents = loadStudents
    console.log('Initializing Directory Module')

    // Setup event listeners for filters
    const searchInput = document.getElementById('searchInput')
    const yearSelect = document.getElementById('yearSelect')
    const statusSelect = document.getElementById('statusSelect')
    const prevBtn = document.getElementById('prevPageBtn')
    const nextBtn = document.getElementById('nextPageBtn')

    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentFilter.search = e.target.value
            currentPage = 1
            loadStudents()
        }, 500))
    }

    if (yearSelect) {
        yearSelect.addEventListener('change', (e) => {
            currentFilter.year = e.target.value
            currentPage = 1
            loadStudents()
        })
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            currentFilter.status = e.target.value
            currentPage = 1
            loadStudents()
        })
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--
                loadStudents()
            }
        })
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++
            loadStudents()
        })
    }

    // Expose modal functions globally for onclick handlers in HTML
    window.openViewModal = openViewModal
    window.openEditModal = openEditModal
    window.closeModal = closeModal

    // Expose load logic for tab switching
    window.loadDirectoryModule = async () => {
        if (!isDirectoryLoaded) {
            await loadStudents()
            isDirectoryLoaded = true
        }
    }

    isDirectoryInitialized = true;
}

/**
 * Setup listeners for the Edit Modal elements (called after loadModal)
 */
function setupEditModalListeners() {
    const photoInput = document.getElementById('edit_photo_input')
    const preview = document.getElementById('edit_avatar_preview')
    const initials = document.getElementById('edit_avatar_initials')

    if (photoInput) {
        photoInput.onchange = function (e) {
            if (this.files && this.files[0]) {
                const reader = new FileReader()
                reader.onload = function (e) {
                    if (preview) {
                        preview.src = e.target.result
                        preview.classList.remove('hidden')
                    }
                    if (initials) initials.classList.add('hidden')
                }
                reader.readAsDataURL(this.files[0])
            }
        }
    }
}

async function loadStudents() {
    const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId
    if (!sedeId) return

    const tableBody = document.getElementById('studentsTableBody')
    if (!tableBody) return

    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="p-8 text-center text-white/40 uppercase tracking-widest text-xs font-bold animate-pulse">
                Cargando estudiantes...
            </td>
        </tr>
    `

    try {
        let query = supabase
            .from('estudiantes')
            .select(`
                *,
                usuario:usuarios!usuario_id (correo, url_foto),
                estados_registro!estado_id (nombre),
                documentos_estudiantes (url_archivo, tipo_documento)
            `, { count: 'exact' })
            .eq('sede_id', store.get().adminContext?.sedeId || window.adminContext?.sedeId)

        // Apply filters
        if (currentFilter.search) {
            const searchTerm = `%${currentFilter.search}%`
            query = query.or(`nombres.ilike.${searchTerm},apellidos.ilike.${searchTerm},cedula.ilike.${searchTerm}`)
        }

        if (currentFilter.year !== 'all') {
            query = query.eq('año_actual', currentFilter.year)
        }

        if (currentFilter.status !== 'all') {
            query = query.eq('estado_id', currentFilter.status)
        }

        // Pagination
        const from = (currentPage - 1) * itemsPerPage
        const to = from + itemsPerPage - 1

        const { data: students, error, count } = await query
            .order('apellidos', { ascending: true })
            .range(from, to)

        if (error) throw error

        renderTable(students)
        updatePagination(count)

    } catch (error) {
        console.error('Error loading students:', error)
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-red-400 uppercase tracking-widest text-xs font-bold">
                    Error al cargar datos
                </td>
            </tr>
        `
        if (window.NotificationSystem) NotificationSystem.show('Error al cargar estudiantes', 'error')
    }
}

function renderTable(students) {
    const tableBody = document.getElementById('studentsTableBody')
    tableBody.innerHTML = ''

    if (students.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-white/40 uppercase tracking-widest text-xs font-bold">
                    No se encontraron estudiantes.
                </td>
            </tr>
        `
        return
    }

    students.forEach(student => {
        const studentData = encodeURIComponent(JSON.stringify(student))
        const statusClass = (student.estado_id == 1)
            ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20'

        const statusDot = (student.estado_id == 1) ? 'bg-green-400' : 'bg-red-400'
        const statusName = student.estados_registro?.nombre || 'Desconocido'

        // User data normalization (Supabase might return object or array)
        const user = Array.isArray(student.usuario) ? student.usuario[0] : student.usuario
        const photoUrlFromUser = user?.url_foto

        // Photo Priority: Documentos > Usuarios
        const photoDoc = student.documentos_estudiantes?.find(d => d.tipo_documento === 'foto_perfil')
        let photoUrl = photoUrlFromUser
        if (photoDoc) {
            photoUrl = photoDoc.url_archivo.startsWith('http')
                ? photoDoc.url_archivo
                : `${supabase.storageUrl}/object/public/avatars/profiles/${photoDoc.url_archivo}`
        }

        const initials = (student.nombres[0] || '') + (student.apellidos[0] || '')

        const row = `
            <tr class="hover:bg-white/5 transition-colors group">
                <td class="px-8 py-4">
                    <div class="flex items-center gap-4">
                        <div class="size-10 rounded-full bg-card-dark border border-gold/30 flex items-center justify-center text-xs font-bold text-gold shadow-lg overflow-hidden shrink-0">
                            ${photoUrl
                ? `<img src="${photoUrl}" class="w-full h-full object-cover">`
                : initials}
                        </div>
                        <div>
                            <p class="text-sm font-bold text-white group-hover:text-gold transition-colors">
                                ${student.nombres} ${student.apellidos}
                            </p>
                            <p class="text-[10px] text-white/40 font-medium">
                                ${user?.correo || 'Sin correo'}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="text-xs font-mono font-bold text-white/80">${student.cedula}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-2.5 py-1 whitespace-nowrap rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60">
                        ${student.año_actual}º Año
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusClass}">
                        <span class="size-1.5 rounded-full ${statusDot}"></span>
                        ${statusName}
                    </span>
                </td>
                <td class="px-8 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="openViewModal('${studentData}')"
                            class="p-2 text-white/40 hover:text-gold hover:bg-gold/10 rounded-lg transition-all"
                            title="Ver Expediente">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        <button onclick="openEditModal('${studentData}')"
                            class="p-2 text-white/40 hover:text-gold hover:bg-gold/10 rounded-lg transition-all"
                            title="Editar">
                            <span class="material-symbols-outlined text-lg">edit</span>
                        </button>
                    </div>
                </td>
            </tr>
        `
        tableBody.insertAdjacentHTML('beforeend', row)
    })
}

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const prevBtn = document.getElementById('prevPageBtn')
    const nextBtn = document.getElementById('nextPageBtn')
    const pageDisplay = document.getElementById('currentPageDisplay')
    const countDisplay = document.getElementById('totalRecordsDisplay')

    if (pageDisplay) pageDisplay.innerText = currentPage
    if (countDisplay) countDisplay.innerText = `Mostrando ${Math.min(itemsPerPage, totalItems)} de ${totalItems} registros`

    if (prevBtn) prevBtn.disabled = currentPage === 1
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages

    // Style adjustments for disabled state
    if (prevBtn) {
        if (prevBtn.disabled) prevBtn.classList.add('opacity-50', 'cursor-not-allowed')
        else prevBtn.classList.remove('opacity-50', 'cursor-not-allowed')
    }

    if (nextBtn) {
        if (nextBtn.disabled) nextBtn.classList.add('opacity-50', 'cursor-not-allowed')
        else prevBtn.classList.remove('opacity-50', 'cursor-not-allowed')
    }
}

// Utility: Debounce
function debounce(func, wait) {
    let timeout
    return function (...args) {
        const context = this
        clearTimeout(timeout)
        timeout = setTimeout(() => func.apply(context, args), wait)
    }
}

// --- MODAL LOGIC ---

async function openViewModal(encodedData) {
    // Cargar modal dinámicamente si aún no existe
    if (!document.getElementById('viewStudentModal')) {
        await window.loadModal('view-student-modal');
    }

    const data = JSON.parse(decodeURIComponent(encodedData))
    const modalContent = document.getElementById('viewStudentModalContent')

    // Create tabbed interface structure
    modalContent.innerHTML = `
        <div class="flex flex-col h-full">
            <!-- Header with tabs -->
            <div class="border-b border-white/10 px-8 pt-6 bg-primary-dark sticky top-0 z-10">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-4">
                        <div id="view_avatar" class="size-16 rounded-2xl bg-gold/10 border-2 border-gold/20 flex items-center justify-center overflow-hidden relative">
                            <img id="view_avatar_preview" class="w-full h-full object-cover hidden" alt="Avatar" />
                            <span id="view_avatar_initials" class="text-gold font-black text-2xl">${(data.nombres[0] || '') + (data.apellidos[0] || '')}</span>
                        </div>
                        <div>
                            <h3 class="text-xl font-black text-white tracking-tight">${data.nombres} ${data.apellidos}</h3>
                            <p class="text-xs font-bold text-gold/60 uppercase tracking-widest">${data.cedula}</p>
                        </div>
                    </div>
                    <button onclick="closeModal('viewStudentModal')" class="size-10 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <!-- Tab buttons -->
                <div class="flex gap-1">
                    <button onclick="window.switchViewTab('info')" id="viewtab-info" class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-gold bg-white/5 text-white">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">person</span>
                        Información
                    </button>
                    <button onclick="window.switchViewTab('academic')" id="viewtab-academic" class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">school</span>
                        Académico
                    </button>
                    <button onclick="window.switchViewTab('docs')" id="viewtab-docs" class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">folder</span>
                        Documentación
                    </button>
                </div>
            </div>

            <!-- Tab content area -->
            <div class="flex-1 overflow-y-auto custom-scrollbar bg-background-dark" id="viewTabContainer">
                <!-- Content will be injected here -->
            </div>
        </div>
    `

    // Load avatar
    const avatarImg = modalContent.querySelector('#view_avatar_preview')
    const photoDoc = data.documentos_estudiantes?.find(d => d.tipo_documento === 'foto_perfil')

    const user = Array.isArray(data.usuario) ? data.usuario[0] : data.usuario
    let photoUrl = user?.url_foto

    if (photoDoc && photoDoc.url_archivo.startsWith('http')) {
        photoUrl = photoDoc.url_archivo
    } else if (photoDoc) {
        photoUrl = `${supabase.storageUrl}/object/public/avatars/profiles/${photoDoc.url_archivo}`
    }

    if (photoUrl && avatarImg) {
        avatarImg.src = photoUrl
        avatarImg.classList.remove('hidden')
        modalContent.querySelector('#view_avatar_initials').classList.add('hidden')
    }

    // Store student data globally for tab switching
    window.currentStudentData = data

    // Show modal and load first tab
    document.getElementById('viewStudentModal').classList.remove('hidden')
    window.switchViewTab('info')
}

// Tab switching function (exposed globally)
window.switchViewTab = function (tabName) {
    const tabs = ['info', 'academic', 'docs']
    tabs.forEach(tab => {
        const btn = document.getElementById(`viewtab-${tab}`)
        if (btn) {
            if (tab === tabName) {
                btn.className = 'px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-gold bg-white/5 text-white'
            } else {
                btn.className = 'px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5'
            }
        }
    })

    // Load tab content
    const container = document.getElementById('viewTabContainer')
    if (!container || !window.currentStudentData) return

    switch (tabName) {
        case 'info':
            loadInfoTab(container, window.currentStudentData)
            break
        case 'academic':
            loadAcademicTab(container, window.currentStudentData)
            break
        case 'docs':
            loadDocsTab(container, window.currentStudentData.id)
            break
    }
}

function loadInfoTab(container, data) {
    const STATUS_MAP = { 1: 'Activo', 2: 'Suspendido', 3: 'Anulado', 4: 'Eliminado' }
    const statusName = data.estados_registro?.nombre || STATUS_MAP[data.estado_id] || 'Desconocido'
    const statusClass = (data.estado_id == 1)
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20'

    container.innerHTML = `
        <div class="p-8 space-y-8">
            <!-- Status & Year -->
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5">
                    <p class="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Estado</p>
                    <span class="px-3 py-1 rounded-full border ${statusClass} text-[10px] font-black uppercase tracking-widest">${statusName}</span>
                </div>
                <div class="bg-card-dark p-6 rounded-2xl border border-white/5">
                    <p class="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Año Actual</p>
                    <p class="text-xl font-black text-gold">${data.año_actual}º Año</p>
                </div>
            </div>

            <!-- Contact & Personal Info -->
            <div class="space-y-4">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em]">Información de Contacto</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-card-dark p-5 rounded-xl border border-white/5">
                        <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Correo</p>
                        <p class="text-sm font-bold text-white truncate">${(Array.isArray(data.usuario) ? data.usuario[0] : data.usuario)?.correo || 'No registrado'}</p>
                    </div>
                    <div class="bg-card-dark p-5 rounded-xl border border-white/5">
                        <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Teléfono</p>
                        <p class="text-sm font-bold text-white">${data.telefono || 'No registrado'}</p>
                    </div>
                </div>
                <div class="bg-card-dark p-5 rounded-xl border border-white/5">
                    <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Dirección</p>
                    <p class="text-sm font-medium text-white/80">${data.direccion || 'No registrada'}</p>
                </div>
            </div>

            <!-- Birth Info -->
            <div class="space-y-4">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em]">Datos de Nacimiento</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-card-dark p-5 rounded-xl border border-white/5">
                        <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Fecha</p>
                        <p class="text-sm font-bold text-white">${data.fecha_nacimiento || 'No registrada'}</p>
                    </div>
                    <div class="bg-card-dark p-5 rounded-xl border border-white/5">
                        <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Lugar</p>
                        <p class="text-sm font-bold text-white">${data.lugar_nacimiento || 'No registrado'}</p>
                    </div>
                </div>
            </div>
        </div>
    `
}

async function loadAcademicTab(container, data) {
    container.innerHTML = `
        <div class="p-8 flex items-center justify-center">
            <span class="animate-spin material-symbols-outlined text-gold font-black text-4xl">sync</span>
        </div>
    `

    try {
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId

        // 1. Fetch Sede Config
        const { data: sedeConfig, error: sedeError } = await supabase
            .from('sedes')
            .select('nota_minima, escala_maxima')
            .eq('id', sedeId)
            .single()

        if (sedeError) throw sedeError
        const MIN_PASSING_GRADE = Number(sedeConfig.nota_minima || 10)

        const { data: student, error } = await supabase
            .from('estudiantes')
            .select(`
                *,
                inscripciones (
                    id,
                    carga_academica:carga_academica_id (
                        materia:materia_id (nombre:nombre_materia, año_materia),
                        seccion:seccion_id (nombre, codigo),
                        docente:docente_id (nombres, apellidos)
                    ),
                    calificaciones (
                        nota_final,
                        nota_corte,
                        nota_reparacion,
                        estado_materia,
                        observaciones
                    )
                )
            `)
            .eq('id', data.id)
            .eq('sede_id', sedeId)
            .single()

        if (error) throw error

        // Helper to safely get the first (and usually only) grade record
        const getGrades = (insc) => {
            if (!insc.calificaciones) return null;
            if (Array.isArray(insc.calificaciones)) {
                return insc.calificaciones.length > 0 ? insc.calificaciones[0] : null;
            }
            return insc.calificaciones; // It's an object
        };

        // Calculate global stats
        const allInscripciones = student.inscripciones || [];
        const validGrades = allInscripciones
            .map(i => getGrades(i))
            .filter(g => g && (g.nota_final !== null || g.nota_reparacion !== null));

        let totalSum = 0;
        if (validGrades.length > 0) {
            totalSum = validGrades.reduce((acc, curr) => {
                const final = curr.nota_reparacion !== null ? Number(curr.nota_reparacion) : Number(curr.nota_final || 0);
                return acc + final;
            }, 0);
        }

        const avgGrade = validGrades.length > 0
            ? (totalSum / validGrades.length).toFixed(2)
            : '0.00';

        // Filter passed grades
        const passedCount = validGrades.filter(g => {
            const gradeVal = g.nota_reparacion !== null ? Number(g.nota_reparacion) : Number(g.nota_final || 0);
            return gradeVal >= MIN_PASSING_GRADE;
        }).length;

        // Group subjects by year
        const subjectsByYear = {};
        allInscripciones.forEach(ins => {
            const year = ins.carga_academica?.materia?.año_materia || 0;
            if (!subjectsByYear[year]) subjectsByYear[year] = [];
            subjectsByYear[year].push(ins);
        });

        const sortedYears = Object.keys(subjectsByYear).sort((a, b) => Number(a) - Number(b));

        container.innerHTML = `
            <div class="p-8 space-y-8">
                <!-- Academic Stats Summary -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gold/5 p-6 rounded-2xl border border-gold/20 shadow-xl relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="material-symbols-outlined text-4xl text-gold">analytics</span>
                        </div>
                        <p class="text-[9px] font-black text-gold/60 uppercase tracking-[0.2em] mb-2">Índice Académico Global</p>
                        <div class="flex items-baseline gap-2">
                            <p class="text-3xl font-black ${Number(avgGrade) >= MIN_PASSING_GRADE ? 'text-gold' : 'text-red-400'}">${avgGrade}</p>
                            <span class="text-[9px] font-black ${Number(avgGrade) >= MIN_PASSING_GRADE ? 'text-green-400' : 'text-red-400'} uppercase tracking-widest">${Number(avgGrade) >= MIN_PASSING_GRADE ? 'APROBADO' : 'REPROBADO'}</span>
                        </div>
                    </div>
                    <div class="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/20 shadow-xl relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="material-symbols-outlined text-4xl text-blue-400">event_available</span>
                        </div>
                        <p class="text-[9px] font-black text-blue-400/60 uppercase tracking-[0.2em] mb-2">Materias Aprobadas</p>
                        <p class="text-3xl font-black text-white">${passedCount} / ${allInscripciones.length}</p>
                    </div>
                </div>

                <!-- Subjects Grouped by Year -->
                <div class="space-y-10">
                    ${sortedYears.length > 0 ? sortedYears.map(year => {
            const yearInsc = subjectsByYear[year];

            // Calculate year average
            const yearGrades = yearInsc.map(i => {
                const cal = getGrades(i);
                if (!cal) return null;
                const grade = cal.nota_reparacion !== null ? cal.nota_reparacion : cal.nota_final;
                return grade !== null ? Number(grade) : null;
            }).filter(n => n !== null);

            const yearAvg = yearGrades.length > 0
                ? (yearGrades.reduce((a, b) => a + Number(b), 0) / yearGrades.length).toFixed(2)
                : '0.00';

            return `
                            <div class="space-y-4">
                                <div class="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div class="flex items-center gap-3">
                                        <div class="size-8 rounded-lg bg-gold/10 flex items-center justify-center text-gold font-black text-xs">
                                            ${year}º
                                        </div>
                                        <h4 class="text-[11px] font-black text-white uppercase tracking-[0.2em]">${year == 0 ? 'Trayecto Inicial / Otros' : `${year}º Año Académico`}</h4>
                                    </div>
                                    <div class="flex items-center gap-4 bg-black/20 px-4 py-1.5 rounded-full border border-white/5">
                                        <div class="flex items-center gap-2">
                                            <p class="text-[9px] font-black text-white/30 uppercase tracking-widest">Promedio:</p>
                                            <p class="text-xs font-black ${Number(yearAvg) >= MIN_PASSING_GRADE ? 'text-gold' : 'text-red-400'}">${yearAvg}</p>
                                        </div>
                                        <div class="w-px h-3 bg-white/10"></div>
                                        <div class="flex items-center gap-2">
                                            <p class="text-[9px] font-black text-white/30 uppercase tracking-widest">Materias:</p>
                                            <p class="text-xs font-black text-white">${yearInsc.length}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-1 gap-3">
                                    ${yearInsc.map(ins => {
                const cal = getGrades(ins);
                const hasGrade = cal && (cal.nota_final !== null || cal.nota_reparacion !== null);
                const finalGradeVal = hasGrade ? (cal.nota_reparacion !== null ? cal.nota_reparacion : cal.nota_final) : null;
                const isPassed = hasGrade && Number(finalGradeVal) >= MIN_PASSING_GRADE;

                let statusText = 'Pendiente';
                let statusClass = 'border-red-500/20 text-red-400 bg-red-500/5';

                if (hasGrade) {
                    if (isPassed) {
                        statusText = 'Aprobada';
                        statusClass = 'border-green-500/20 text-green-400 bg-green-500/5';
                    } else {
                        statusText = 'Reprobada';
                        statusClass = 'border-red-500/20 text-red-400 bg-red-500/5';
                    }
                }

                return `
                                        <div class="bg-card-dark p-5 rounded-2xl border border-white/5 hover:border-gold/30 transition-all group">
                                            <div class="flex justify-between items-start mb-4">
                                                <div class="flex-1 pr-4">
                                                    <div class="flex items-center gap-2 mb-1">
                                                        <span class="text-[8px] font-black px-1.5 py-0.5 rounded border ${statusClass} uppercase">
                                                            ${statusText}
                                                        </span>
                                                        <p class="text-sm font-black text-white uppercase tracking-wide group-hover:text-gold transition-colors">${ins.carga_academica?.materia?.nombre || 'Materia'}</p>
                                                        ${ins.carga_academica?.seccion ? `<span class="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-auto">Sección: ${ins.carga_academica.seccion.nombre}</span>` : ''}
                                                    </div>
                                                    <div class="flex items-center gap-2">
                                                        <span class="material-symbols-outlined text-[14px] text-white/20">person</span>
                                                        <p class="text-[10px] font-bold text-white/20 uppercase tracking-widest">Prof. ${ins.carga_academica?.docente?.nombres} ${ins.carga_academica?.docente?.apellidos}</p>
                                                    </div>
                                                </div>
                                                <div class="text-right">
                                                    <p class="text-2xl font-black ${isPassed ? 'text-gold' : (hasGrade ? 'text-red-400' : 'text-white/20')}">${finalGradeVal !== null ? Number(finalGradeVal).toFixed(1) : 'N/A'}</p>
                                                    <p class="text-[8px] font-black text-white/10 uppercase tracking-[0.2em]">Nota Final</p>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between pt-3 border-t border-white/5">
                                                <div class="flex items-center gap-4">
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-[9px] font-black text-white/20 uppercase tracking-widest">Corte:</span>
                                                        <span class="text-xs font-black text-white">${cal?.nota_corte !== null && cal?.nota_corte !== undefined ? cal.nota_corte : '-'}</span>
                                                    </div>
                                                    ${cal?.observaciones ? `
                                                        <div class="flex items-center gap-2 text-white/30" title="${cal.observaciones}">
                                                            <span class="material-symbols-outlined text-sm">info</span>
                                                            <span class="text-[8px] font-bold uppercase truncate max-w-[100px]">${cal.observaciones}</span>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                                <div class="flex gap-1">
                                                    <div class="w-1 h-3 rounded-full ${isPassed ? 'bg-green-400/20' : (hasGrade ? 'bg-red-400/20' : 'bg-white/5')}"></div>
                                                    <div class="w-1 h-3 rounded-full ${isPassed ? 'bg-green-400/40' : (hasGrade ? 'bg-red-400/40' : 'bg-white/10')}"></div>
                                                    <div class="w-1 h-3 rounded-full ${isPassed ? 'bg-green-400' : (hasGrade ? 'bg-red-400' : 'bg-white/20')} ${isPassed ? 'shadow-[0_0_10px_rgba(74,222,128,0.3)]' : ''}"></div>
                                                </div>
                                            </div>
                                        </div>
                                        `
            }).join('')}
                                </div>
                            </div>
                        `
        }).join('') : `
                        <div class="bg-white/5 p-16 rounded-3xl border border-dashed border-white/10 text-center">
                            <div class="size-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <span class="material-symbols-outlined text-4xl text-white/20">school</span>
                            </div>
                            <h5 class="text-sm font-black text-white/40 uppercase tracking-widest">Sin historial académico</h5>
                            <p class="text-[10px] text-white/20 mt-2 font-medium">El estudiante aún no tiene registros de inscripciones o notas en el sistema.</p>
                        </div>
                    `}
                </div>
            </div>
        `
    } catch (e) {
        console.error('Error loading academic data:', e)
        container.innerHTML = `
            <div class="p-16 text-center">
                <div class="size-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                    <span class="material-symbols-outlined text-3xl text-red-400">error</span>
                </div>
                <h5 class="text-sm font-black text-red-400 uppercase tracking-widest">Error al cargar datos</h5>
                <p class="text-[10px] text-red-400/50 mt-2 font-medium">${e.message}</p>
            </div>
        `
    }
}

function loadDocsTab(container, studentId) {
    // Create a well-structured container for documents
    container.innerHTML = `
        <div class="p-8">
            <div class="mb-6">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em] mb-2">Expediente Digital</h4>
                <p class="text-[10px] text-white/40 font-medium">Documentación requerida para el proceso de inscripción</p>
            </div>
            
            <div id="docs_list_container" class="space-y-3">
                <div class="flex items-center justify-center py-12">
                    <span class="animate-spin material-symbols-outlined text-gold font-black text-4xl">sync</span>
                </div>
            </div>
            
            <div class="mt-8 pt-6 border-t border-white/5">
                <p class="text-[8px] text-white/20 uppercase font-bold text-center">Verificación automática de expediente</p>
            </div>
        </div>
    `

    // Load documents into the inner container
    const docsListContainer = container.querySelector('#docs_list_container')
    loadStudentDocuments(studentId, docsListContainer)
}

async function loadStudentDocuments(studentId, container = null) {
    const docContainer = container || document.getElementById('view_docs_container')
    if (!docContainer) return

    docContainer.innerHTML = '<div class="animate-pulse text-white/20 text-[9px] font-black uppercase text-center mt-8">Consultando Supabase...</div>'

    try {
        const { data, error } = await supabase
            .from('documentos_estudiantes')
            .select('*')
            .eq('estudiante_id', studentId)
            .order('creado_el', { ascending: false })

        if (error) throw error

        if (data && data.length > 0) {
            docContainer.innerHTML = ''
            data.forEach(doc => {
                if (doc.tipo_documento === 'foto_perfil') return // Hide photo from list

                const docName = doc.tipo_documento.replace(/_/g, ' ').toUpperCase()

                // Get Public URL for the file
                const { data: { publicUrl } } = supabase.storage
                    .from('documentos')
                    .getPublicUrl(doc.url_archivo) // Assuming url_archivo is the path

                // If url_archivo is already a full URL (legacy), use it directly
                const fileUrl = doc.url_archivo.startsWith('http') ? doc.url_archivo : publicUrl

                const row = document.createElement('a')
                row.href = fileUrl
                row.target = '_blank'
                row.className = "flex items-center justify-between p-4 bg-card-dark hover:bg-gold/10 border border-white/10 hover:border-gold/30 rounded-2xl transition-all group shadow-sm hover:shadow-gold/10"

                row.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="size-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-all">
                            <span class="material-symbols-outlined text-xl">description</span>
                        </div>
                        <div>
                            <p class="text-[10px] font-black text-white/90 group-hover:text-gold transition-colors uppercase tracking-wide">${docName}</p>
                            <p class="text-[9px] text-white/40 font-medium mt-0.5">Click para abrir archivo</p>
                        </div>
                    </div>
                    <span class="material-symbols-outlined text-white/20 group-hover:text-gold text-lg transition-all">open_in_new</span>
                `
                docContainer.appendChild(row)
            })

            if (docContainer.children.length === 0) {
                docContainer.innerHTML = `
                    <div class="bg-white/5 p-10 rounded-2xl border border-dashed border-white/10 text-center">
                        <span class="material-symbols-outlined text-5xl text-white/10 mb-3 block">folder_open</span>
                        <p class="text-xs font-black text-white/20 uppercase tracking-widest">Sin documentos adicionales</p>
                    </div>
                `
            }

        } else {
            docContainer.innerHTML = `
                <div class="bg-white/5 p-10 rounded-2xl border border-dashed border-white/10 text-center">
                    <span class="material-symbols-outlined text-5xl text-white/10 mb-3 block">cloud_upload</span>
                    <p class="text-xs font-black text-white/20 uppercase tracking-widest">Sin documentos cargados</p>
                    <p class="text-[9px] text-white/10 mt-2">Los documentos aparecerán aquí una vez subidos</p>
                </div>
            `
        }
    } catch (e) {
        console.error(e)
        docContainer.innerHTML = `
            <div class="bg-red-500/5 p-10 rounded-2xl border border-red-500/20 text-center">
                <span class="material-symbols-outlined text-5xl text-red-400/30 mb-3 block">error</span>
                <p class="text-xs font-black text-red-400/50 uppercase tracking-widest">Error al cargar documentos</p>
            </div>
        `
    }
}

async function openEditModal(encodedData) {
    // Cargar modal dinámicamente si aún no existe
    if (!document.getElementById('editStudentModal')) {
        await window.loadModal('edit-student-modal');

        // Setup listeners for the newly loaded modal
        setupEditModalListeners();

        // Después de cargar, attach el event listener del form
        const form = document.querySelector('#editStudentModal form');
        if (form) {
            form.onsubmit = (e) => handleEditSubmit(e);
        }
    } else {
        // Modal already exists, just reset the input listener to be sure
        setupEditModalListeners();
    }

    const data = JSON.parse(decodeURIComponent(encodedData))

    // Fill Form inputs
    setValue('edit_id', data.id)
    setValue('edit_nombres', data.nombres)
    setValue('edit_apellidos', data.apellidos)
    setValue('edit_cedula', data.cedula)
    setValue('edit_telefono', data.telefono)
    setValue('edit_direccion', data.direccion)
    setValue('edit_lugar_nacimiento', data.lugar_nacimiento)
    setValue('edit_fecha_nacimiento', data.fecha_nacimiento)
    const user = Array.isArray(data.usuario) ? data.usuario[0] : data.usuario
    setValue('edit_correo', user?.correo)
    setValue('edit_anio', data.año_actual)
    setValue('edit_estado', data.estado_id)

    // Header
    setText('edit_header_name', `${data.nombres} ${data.apellidos}`)
    setText('edit_header_cedula', `Cédula: ${data.cedula}`)

    // Avatar Logic for Edit
    const preview = document.getElementById('edit_avatar_preview')
    const initials = document.getElementById('edit_avatar_initials')

    // Priority: Documentos > Usuarios
    const photoDoc = data.documentos_estudiantes?.find(d => d.tipo_documento === 'foto_perfil')
    const userForPhoto = Array.isArray(data.usuario) ? data.usuario[0] : data.usuario
    let photoUrl = userForPhoto?.url_foto
    if (photoDoc && photoDoc.url_archivo.startsWith('http')) photoUrl = photoDoc.url_archivo
    else if (photoDoc) photoUrl = `${supabase.storageUrl}/object/public/avatars/profiles/${photoDoc.url_archivo}`

    if (photoUrl) {
        preview.src = photoUrl
        preview.classList.remove('hidden')
        initials.classList.add('hidden')
    } else {
        preview.classList.add('hidden')
        initials.classList.remove('hidden')
        initials.textContent = (data.nombres[0] || '') + (data.apellidos[0] || '')
    }

    // Clean inputs that are optional or special
    const passwordInput = document.querySelector('input[name="nueva_clave"]')
    if (passwordInput) passwordInput.value = ''

    // Document Status Indicators
    const docTypes = ['cedula', 'titulo_bachiller', 'notas_certificadas', 'partida_nacimiento']
    docTypes.forEach(type => {
        const indicator = document.getElementById(`status_${type}`)
        const hasDoc = data.documentos_estudiantes?.some(d => d.tipo_documento === type)
        if (indicator) {
            indicator.className = `size-2 rounded-full ${hasDoc ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'bg-white/10'}`
        }
        // Reset file inputs
        const input = document.querySelector(`input[name="doc_${type}"]`)
        if (input) input.value = ''
    })

    // Reset profile photo input
    const photoInput = document.getElementById('edit_photo_input')
    if (photoInput) photoInput.value = ''

    document.getElementById('editStudentModal').classList.remove('hidden')
}


async function handleEditSubmit(e) {
    e.preventDefault()
    console.log('Iniciando actualización de estudiante...')

    const form = e.target
    const submitBtn = form.querySelector('button[type="submit"]')
    const originalText = submitBtn.textContent

    submitBtn.disabled = true
    submitBtn.textContent = 'Guardando...'

    try {
        const formData = new FormData(form)
        const studentId = formData.get('student_id')

        // 1. Get current student to find usuario_id
        const { data: currentStudent, error: fetchError } = await supabase
            .from('estudiantes')
            .select('usuario_id')
            .eq('id', studentId)
            .single()

        if (fetchError) throw new Error('Error buscando estudiante: ' + fetchError.message)

        const userId = currentStudent.usuario_id

        // --- 2. Handle Document Uploads (Profile Photo + Expediente) ---
        const docUploads = [
            { id: 'edit_photo_input', type: 'foto_perfil', bucket: 'avatars' },
            { name: 'doc_cedula', type: 'cedula', bucket: 'documentos' },
            { name: 'doc_titulo_bachiller', type: 'titulo_bachiller', bucket: 'documentos' },
            { name: 'doc_notas_certificadas', type: 'notas_certificadas', bucket: 'documentos' },
            { name: 'doc_partida_nacimiento', type: 'partida_nacimiento', bucket: 'documentos' }
        ]

        let newPhotoUrl = null

        for (const doc of docUploads) {
            const input = doc.id ? document.getElementById(doc.id) : form.querySelector(`input[name="${doc.name}"]`)

            if (input && input.files && input.files[0]) {
                const file = input.files[0]
                const fileExt = file.name.split('.').pop()
                const identifier = userId || `student-${studentId}`
                const fileName = `${identifier}-${doc.type}-${Date.now()}.${fileExt}`
                const filePath = doc.bucket === 'avatars' ? `profiles/${fileName}` : fileName

                console.log(`Subiendo ${doc.type}...`)

                const { error: uploadError } = await supabase.storage
                    .from(doc.bucket)
                    .upload(filePath, file, { upsert: true })

                if (uploadError) throw new Error(`Error subiendo ${doc.type}: ` + uploadError.message)

                const { data: { publicUrl } } = supabase.storage
                    .from(doc.bucket)
                    .getPublicUrl(filePath)

                // Update database record for this document
                const { data: existing } = await supabase
                    .from('documentos_estudiantes')
                    .select('id')
                    .eq('estudiante_id', studentId)
                    .eq('tipo_documento', doc.type)

                const docData = {
                    estudiante_id: studentId,
                    tipo_documento: doc.type,
                    url_archivo: publicUrl,
                    nombre_original: file.name,
                    verificado: true, // Auto-verify since Admin is uploading
                    estado_id: 1
                }

                if (existing && existing.length > 0) {
                    await supabase.from('documentos_estudiantes').update(docData).eq('id', existing[0].id)
                } else {
                    await supabase.from('documentos_estudiantes').insert(docData)
                }

                if (doc.type === 'foto_perfil') newPhotoUrl = publicUrl
            }
        }

        // 3. Update 'estudiantes' table (Personal Info)
        const updates = {
            nombres: formData.get('nombres'),
            apellidos: formData.get('apellidos'),
            telefono: formData.get('telefono'),
            direccion: formData.get('direccion'),
            fecha_nacimiento: formData.get('fecha_nacimiento') || null,
            lugar_nacimiento: formData.get('lugar_nacimiento'),
            año_actual: formData.get('anio_actual'),
            estado_id: formData.get('estado_id')
        }

        const { error: errorEst } = await supabase
            .from('estudiantes')
            .update(updates)
            .eq('id', studentId)

        if (errorEst) throw new Error('Error actualizando datos personales: ' + errorEst.message)

        // 4. Update 'usuarios' table (Email & Photo) - Only if user exists
        if (userId) {
            const userUpdates = {}
            const emailVal = document.getElementById('edit_correo')?.value
            if (emailVal) userUpdates.correo = emailVal
            if (newPhotoUrl) userUpdates.url_foto = newPhotoUrl

            if (Object.keys(userUpdates).length > 0) {
                const { error: errorUser } = await supabase
                    .from('usuarios')
                    .update(userUpdates)
                    .eq('id', userId)

                if (errorUser) console.warn('Advertencia: No se pudo actualizar usuario vinculado', errorUser)
            }
        }

        // Success Message
        const message = 'Expediente actualizado correctamente'
        const type = 'success'

        if (window.NotificationSystem && window.NotificationSystem.show) {
            window.NotificationSystem.show(message, type)
        } else {
            alert(message)
        }

        closeModal('editStudentModal')
        loadStudents() // Reload table

    } catch (error) {
        console.error('Error en handleEditSubmit:', error)
        if (window.NotificationSystem && window.NotificationSystem.show) {
            window.NotificationSystem.show('Error: ' + error.message, 'error')
        } else {
            alert('Error: ' + error.message)
        }
    } finally {
        submitBtn.disabled = false
        submitBtn.textContent = originalText
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden')
}

// Helpers
function setText(id, value) {
    const el = document.getElementById(id)
    if (el) el.textContent = value || ''
}

function setValue(id, value) {
    const el = document.getElementById(id)
    if (el) el.value = value || ''
}
