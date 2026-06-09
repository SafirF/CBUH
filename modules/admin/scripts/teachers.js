// ============================================
// teachers.js - Directorio de Profesores
// ============================================

import { supabase } from '../../../config/supabase-client.js';

let allTeachers = [];
let filteredTeachers = [];
let searchQuery = '';
let isInitialized = false;
let allSubjects = [];
let currentPeriod = null;

// Inicializar módulo
export async function initTeachers() {
    if (isInitialized) return;
    console.log('[Teachers] Initializing teachers module');

    // Cargar profesores
    await loadTeachers();

    // Setup event listeners
    setupEventListeners();

    isInitialized = true;
}

// Exponer función para lazy loading
window.loadTeachersModule = async function () {
    if (!isInitialized) {
        await initTeachers();
    }
};

// Configurar event listeners
function setupEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('teachers-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            filterAndRenderTeachers();
        });
    }

    // Botón nuevo profesor
    const btnNew = document.getElementById('btn-new-teacher');
    if (btnNew) {
        btnNew.addEventListener('click', () => openNewTeacherModal());
    }

    // Form submit nuevo profesor
    const newTeacherForm = document.getElementById('newTeacherForm');
    if (newTeacherForm) {
        newTeacherForm.addEventListener('submit', handleNewTeacherSubmit);
    }
}

// Cargar todos los profesores
async function loadTeachers() {
    try {
        const sedeId = window.adminContext?.sedeId;

        if (!sedeId) {
            console.error('[Teachers] No sede_id found in adminContext');
            const tbody = document.getElementById('teachers-tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-8 text-center">
                            <div class="flex flex-col items-center gap-2">
                                <span class="material-symbols-outlined text-red-500 text-3xl">error</span>
                                <p class="text-red-400 font-bold text-sm">Error de configuración</p>
                                <p class="text-white/40 text-xs">No se encontró la sede asignada.</p>
                            </div>
                        </td>
                    </tr>
                `;
            }
            return;
        }

        // Consultar docentes con sus materias asignadas
        const { data, error } = await supabase
            .from('docentes')
            .select(`
                id,
                cedula,
                nombres,
                apellidos,
                especialidad,
                telefono,
                fecha_nacimiento,
                lugar_nacimiento,
                direccion,
                resumen_profesional,
                estado_id,
                usuario:usuario_id (url_foto),
                cargas_academicas (
                    id,
                    materia:materia_id (
                        id,
                        nombre:nombre_materia,
                        codigo,
                        año_materia
                    )
                )
            `)
            .eq('sede_id', sedeId)
            .eq('estado_id', 1) // Solo activos
            .order('apellidos', { ascending: true });

        if (error) throw error;

        // Procesar datos
        allTeachers = data.map(teacher => ({
            ...teacher,
            nombre_completo: `${teacher.nombres} ${teacher.apellidos}`,
            url_foto: teacher.usuario?.url_foto || null,
            materias: teacher.cargas_academicas?.map(ca => ca.materia) || [],
            materias_count: teacher.cargas_academicas?.length || 0,
            carga_estado: getCargaEstado(teacher.cargas_academicas?.length || 0)
        }));

        filteredTeachers = [...allTeachers];
        renderTeachers();
        updateStats();

    } catch (error) {
        console.error('[Teachers] Error loading teachers:', error);
        showNotification('Error al cargar profesores', 'error');
    }
}

// Determinar estado de carga
function getCargaEstado(count) {
    if (count === 0) return 'empty';
    if (count <= 2) return 'normal';
    if (count <= 4) return 'high';
    return 'full';
}

// Filtrar y renderizar
function filterAndRenderTeachers() {
    if (!searchQuery.trim()) {
        filteredTeachers = [...allTeachers];
    } else {
        filteredTeachers = allTeachers.filter(t => {
            const searchableText = `${t.nombres} ${t.apellidos} ${t.cedula}`.toLowerCase();
            return searchableText.includes(searchQuery);
        });
    }

    renderTeachers();
}

// Renderizar lista de profesores
function renderTeachers() {
    const tbody = document.getElementById('teachers-tbody');
    if (!tbody) return;

    if (filteredTeachers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-16 text-center">
                    <div class="flex flex-col items-center gap-4">
                        <div class="size-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                            <span class="material-symbols-outlined text-4xl text-white/20">search_off</span>
                        </div>
                        <div>
                            <p class="text-sm font-black text-white/40 uppercase tracking-widest">No se encontraron profesores</p>
                            <p class="text-xs text-white/20 mt-1">${searchQuery ? 'Intenta con otros términos de búsqueda' : 'Agrega el primer profesor'}</p>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredTeachers.map(teacher => {
        const cargaColors = {
            'empty': 'bg-white/5 text-white/40',
            'normal': 'bg-green-500/10 text-green-400',
            'high': 'bg-orange-500/10 text-orange-400',
            'full': 'bg-red-500/10 text-red-400'
        };

        const cargaColor = cargaColors[teacher.carga_estado];

        return `
            <tr class="hover:bg-white/5 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        <div class="size-12 rounded-xl bg-card-dark border border-gold/20 flex items-center justify-center text-sm font-bold text-gold overflow-hidden relative">
                            ${teacher.url_foto ?
                `<img src="${teacher.url_foto}" alt="${teacher.nombre_completo}" class="w-full h-full object-cover" />` :
                `<span class="font-black">${teacher.nombres.charAt(0)}${teacher.apellidos.charAt(0)}</span>`
            }
                        </div>
                        <div>
                            <p class="text-sm font-black text-white uppercase group-hover:text-gold transition-colors tracking-wide">
                                ${teacher.nombre_completo}
                            </p>
                            <p class="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                ${teacher.especialidad || 'Docente'}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm font-medium text-white/80">${teacher.cedula}</p>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-wrap gap-1.5">
                        ${teacher.materias.length > 0 ?
                teacher.materias.slice(0, 2).map(m =>
                    `<span class="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[10px] font-bold uppercase hover:border-gold/50 transition-all">${m.nombre}</span>`
                ).join('') + (teacher.materias.length > 2 ? `<span class="px-2.5 py-1 text-[10px] text-white/40 font-medium">+${teacher.materias.length - 2} más</span>` : '') :
                '<span class="text-[10px] italic text-white/20">Sin materias asignadas</span>'
            }
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1.5 rounded-full ${cargaColor} text-[10px] font-black uppercase tracking-wider">
                        ${teacher.materias_count}/5
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="window.openManageAssignments(${teacher.id})" 
                            class="bg-gold text-primary-dark hover:bg-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-lg shadow-gold/10">
                            <span class="material-symbols-outlined text-sm">edit_square</span>
                            Asignar
                        </button>
                        <button onclick="window.viewTeacherDetails(${teacher.id})" 
                            class="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-sm">visibility</span>
                            Ver Perfil
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Actualizar contador
    const countElement = document.getElementById('teachers-count');
    if (countElement) {
        countElement.textContent = `${filteredTeachers.length} ${filteredTeachers.length === 1 ? 'Profesor' : 'Profesores'}`;
    }
}

// Actualizar estadísticas
function updateStats() {
    // Total profesores
    const totalElement = document.getElementById('stat-total-teachers');
    if (totalElement) {
        totalElement.textContent = allTeachers.length;
    }

    // Profesores activos (con materias)
    const activeElement = document.getElementById('stat-active-teachers');
    if (activeElement) {
        const activeCount = allTeachers.filter(t => t.materias_count > 0).length;
        activeElement.textContent = activeCount;
    }

    // Promedio de carga
    const avgElement = document.getElementById('stat-avg-load');
    if (avgElement) {
        const avgLoad = allTeachers.length > 0
            ? (allTeachers.reduce((sum, t) => sum + t.materias_count, 0) / allTeachers.length).toFixed(1)
            : '0.0';
        avgElement.textContent = avgLoad;
    }

    // Profesores al máximo
    const fullElement = document.getElementById('stat-full-load');
    if (fullElement) {
        const fullCount = allTeachers.filter(t => t.materias_count >= 5).length;
        fullElement.textContent = fullCount;
    }
}

// Ver detalles del profesor
window.viewTeacherDetails = async function (teacherId) {
    try {
        const sedeId = window.adminContext?.sedeId;

        if (!sedeId) {
            showNotification('Error: Administrador sin sede asignada', 'error');
            return;
        }

        // Obtener datos completos del profesor
        const { data: teacher, error } = await supabase
            .from('docentes')
            .select(`
                *,
                usuario:usuario_id (url_foto, correo),
                cargas_academicas (
                    id,
                    materia:materia_id (
                        id,
                        nombre:nombre_materia,
                        codigo,
                        año_materia
                    ),
                    seccion:seccion_id (
                        nombre,
                        codigo
                    ),
                    periodo:periodo_id (
                        nombre
                    ),
                    horarios (
                        dia_semana,
                        hora_inicio,
                        hora_fin,
                        aula,
                        mes
                    )
                )
            `)
            .eq('id', teacherId)
            .eq('sede_id', sedeId)
            .single();

        if (error) throw error;

        // Abrir modal con los datos
        openTeacherModal(teacher);

    } catch (error) {
        console.error('[Teachers] Error loading teacher details:', error);
        showNotification('Error al cargar detalles del profesor', 'error');
    }
};

// Abrir modal de detalles del profesor
async function openTeacherModal(teacher) {
    // Cargar modal dinámicamente si aún no existe
    if (!document.getElementById('viewTeacherModal')) {
        await window.loadModal('view-teacher-modal');
    }

    const modal = document.getElementById('viewTeacherModal');
    const modalContent = document.getElementById('viewTeacherModalContent');

    if (!modal || !modalContent) {
        console.error('[Teachers] Modal elements not found');
        return;
    }

    // Calcular edad si existe fecha de nacimiento
    let edad = null;
    if (teacher.fecha_nacimiento) {
        const birthDate = new Date(teacher.fecha_nacimiento);
        const today = new Date();
        edad = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            edad--;
        }
    }

    const materias = teacher.cargas_academicas || [];
    const periodoActual = materias[0]?.periodo?.nombre || 'Periodo Actual';

    modalContent.innerHTML = `
        <div class="flex flex-col h-full">
            <!-- Header -->
            <div class="border-b border-white/10 px-8 pt-6 bg-primary-dark sticky top-0 z-10">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-4">
                        <div class="size-16 rounded-2xl bg-gold/10 border-2 border-gold/20 flex items-center justify-center overflow-hidden">
                            ${teacher.usuario?.url_foto ?
            `<img src="${teacher.usuario.url_foto}" alt="${teacher.nombres}" class="w-full h-full object-cover" />` :
            `<span class="text-gold font-black text-2xl">${teacher.nombres.charAt(0)}${teacher.apellidos.charAt(0)}</span>`
        }
                        </div>
                        <div>
                            <h3 class="text-xl font-black text-white tracking-tight uppercase">${teacher.nombres} ${teacher.apellidos}</h3>
                            <p class="text-xs font-bold text-gold/60 uppercase tracking-widest">${teacher.cedula}</p>
                        </div>
                    </div>
                    <button onclick="closeModal('viewTeacherModal')" class="size-10 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <!-- Tabs -->
                <div class="flex gap-1">
                    <button onclick="window.switchTeacherTab('info')" id="teachertab-info" 
                        class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-gold bg-white/5 text-white">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">person</span>
                        Información
                    </button>
                    <button onclick="window.switchTeacherTab('materias')" id="teachertab-materias" 
                        class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">school</span>
                        Materias
                    </button>
                    <button onclick="window.switchTeacherTab('horarios')" id="teachertab-horarios" 
                        class="px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
                        Horario
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="flex-1 overflow-y-auto custom-scrollbar bg-background-dark" id="viewTeacherTabContainer">
                <!-- Se cargará dinámicamente -->
            </div>
        </div>
    `;

    // Guardar datos globalmente para tabs
    window.currentTeacherData = teacher;

    // Mostrar modal
    modal.classList.remove('hidden');

    // Cargar primer tab
    window.switchTeacherTab('info');
}

// Cambiar tab del modal
window.switchTeacherTab = function (tabName) {
    const tabs = ['info', 'materias', 'horarios'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`teachertab-${tab}`);
        if (btn) {
            if (tab === tabName) {
                btn.className = 'px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-gold bg-white/5 text-white';
            } else {
                btn.className = 'px-6 py-3 text-xs font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 border-transparent text-white/40 hover:text-white hover:bg-white/5';
            }
        }
    });

    const container = document.getElementById('viewTeacherTabContainer');
    if (!container || !window.currentTeacherData) return;

    switch (tabName) {
        case 'info':
            loadTeacherInfoTab(container, window.currentTeacherData);
            break;
        case 'materias':
            loadTeacherMateriasTab(container, window.currentTeacherData);
            break;
        case 'horarios':
            loadTeacherScheduleTab(container, window.currentTeacherData);
            break;
    }
};

// Función para obtener nombre del mes
function getMesNombre(mes) {
    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return meses[mes - 1] || `Mes ${mes}`;
}

// Cargar tab de información
function loadTeacherInfoTab(container, teacher) {
    // Calcular edad
    let edad = null;
    if (teacher.fecha_nacimiento) {
        const birthDate = new Date(teacher.fecha_nacimiento);
        const today = new Date();
        edad = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            edad--;
        }
    }

    container.innerHTML = `
        <div class="p-8 space-y-6">
            <!-- Información Personal -->
            <div class="bg-card-dark rounded-2xl p-6 border border-white/10 space-y-4">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em] mb-4">Información Personal</h4>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-outlined text-white/40 text-lg">badge</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest">Cédula</p>
                            <p class="text-sm text-white font-medium">${teacher.cedula}</p>
                        </div>
                    </div>
                    
                    ${teacher.telefono ? `
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-outlined text-white/40 text-lg">phone</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest">Teléfono</p>
                            <p class="text-sm text-white font-medium">${teacher.telefono}</p>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${teacher.usuario?.correo ? `
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-outlined text-white/40 text-lg">email</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest">Correo</p>
                            <p class="text-sm text-white font-medium break-all">${teacher.usuario.correo}</p>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${edad ? `
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-outlined text-white/40 text-lg">cake</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest">Edad</p>
                            <p class="text-sm text-white font-medium">${edad} años</p>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${teacher.lugar_nacimiento ? `
                    <div class="flex items-start gap-3 md:col-span-2">
                        <span class="material-symbols-outlined text-white/40 text-lg">location_on</span>
                        <div class="flex-1">
                            <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest">Lugar de Nacimiento</p>
                            <p class="text-sm text-white font-medium">${teacher.lugar_nacimiento}</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Información Académica -->
            ${teacher.especialidad || teacher.resumen_profesional ? `
            <div class="bg-card-dark rounded-2xl p-6 border border-white/10 space-y-4">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em] mb-4">Información Académica</h4>
                
                ${teacher.especialidad ? `
                <div>
                    <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-2">Especialidad</p>
                    <p class="text-sm text-white font-medium">${teacher.especialidad}</p>
                </div>
                ` : ''}
                
                ${teacher.resumen_profesional ? `
                <div>
                    <p class="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-2">Resumen Profesional</p>
                    <p class="text-sm text-white/70 leading-relaxed">${teacher.resumen_profesional}</p>
                </div>
                ` : ''}
            </div>
            ` : ''}
            
            <!-- Dirección -->
            ${teacher.direccion ? `
            <div class="bg-card-dark rounded-2xl p-6 border border-white/10">
                <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em] mb-4">Dirección</h4>
                <p class="text-sm text-white/70">${teacher.direccion}</p>
            </div>
            ` : ''}
        </div>
    `;
}

// Cargar tab de materias
function loadTeacherMateriasTab(container, teacher) {
    const materias = teacher.cargas_academicas || [];
    const periodoActual = materias[0]?.periodo?.nombre || 'Periodo Actual';

    const materiasPorAño = {};
    materias.forEach(carga => {
        const materia = carga.materia;
        if (!materia) return;

        const año = materia.año_materia || 0;
        if (!materiasPorAño[año]) materiasPorAño[año] = [];
        materiasPorAño[año].push({
            ...materia,
            seccion: carga.seccion
        });
    });

    const años = Object.keys(materiasPorAño).sort((a, b) => Number(a) - Number(b));

    container.innerHTML = `
        <div class="p-8 space-y-6">
            <div class="bg-gold/5 p-4 rounded-xl border border-gold/20">
                <p class="text-xs font-black text-gold uppercase tracking-widest">
                    <span class="material-symbols-outlined text-sm align-middle mr-1">calendar_today</span>
                    ${periodoActual} • ${materias.length} ${materias.length === 1 ? 'Materia' : 'Materias'}
                </p>
            </div>
            
            ${años.length > 0 ? años.map(año => `
                <div class="bg-card-dark rounded-2xl p-6 border border-white/10">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="size-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold font-black text-sm">
                            ${año}º
                        </div>
                        <h4 class="text-xs font-black text-white uppercase tracking-widest">
                            ${año == 0 ? 'Trayecto Inicial / Otros' : `${año}º Año Académico`}
                        </h4>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${materiasPorAño[año].map(m => `
                            <div class="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-gold/30 transition-all">
                                <div class="flex justify-between items-start mb-2">
                                    <p class="text-sm font-black text-white uppercase tracking-wide">${m.nombre}</p>
                                    ${m.seccion ? `
                                        <span class="px-2 py-0.5 rounded-md bg-gold/10 text-gold border border-gold/20 text-[9px] font-black uppercase tracking-widest">
                                            ${m.seccion.nombre} ${m.seccion.codigo ? `(${m.seccion.codigo})` : ''}
                                        </span>
                                    ` : ''}
                                </div>
                                <p class="text-[10px] text-white/40 font-bold uppercase tracking-widest">${m.codigo}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('') : `
                <div class="bg-white/5 p-16 rounded-3xl border border-dashed border-white/10 text-center">
                    <div class="size-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <span class="material-symbols-outlined text-4xl text-white/20">school</span>
                    </div>
                    <h5 class="text-sm font-black text-white/40 uppercase tracking-widest">Sin materias asignadas</h5>
                    <p class="text-[10px] text-white/20 mt-2 font-medium">Este profesor aún no tiene materias asignadas para el periodo actual.</p>
                </div>
            `}
        </div>
    `;
}

// Función auxiliar para cerrar modal
window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
};

// Abrir modal de nuevo profesor
async function openNewTeacherModal() {
    // Cargar modal dinámicamente si aún no existe
    if (!document.getElementById('newTeacherModal')) {
        await window.loadModal('new-teacher-modal');

        // Después de cargar, volver a attach el event listener del form
        const newTeacherForm = document.getElementById('newTeacherForm');
        if (newTeacherForm) {
            newTeacherForm.addEventListener('submit', handleNewTeacherSubmit);
        }
    }

    const modal = document.getElementById('newTeacherModal');
    const form = document.getElementById('newTeacherForm');

    if (modal && form) {
        form.reset();
        modal.classList.remove('hidden');
    }
}

// Manejar envío del formulario de nuevo profesor
async function handleNewTeacherSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btnSubmitNewTeacher');

    // Deshabilitar botón
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <span class="animate-spin material-symbols-outlined font-black">sync</span>
            Creando...
        `;
    }

    try {
        const sedeId = window.adminContext?.sedeId;
        if (!sedeId) {
            throw new Error('No se encontró la sede asignada');
        }

        // Datos del docente
        const docenteData = {
            cedula: formData.get('cedula'),
            nombres: formData.get('nombres'),
            apellidos: formData.get('apellidos'),
            especialidad: formData.get('especialidad') || null,
            telefono: formData.get('telefono') || null,
            fecha_nacimiento: formData.get('fecha_nacimiento') || null,
            lugar_nacimiento: formData.get('lugar_nacimiento') || null,
            direccion: formData.get('direccion') || null,
            resumen_profesional: formData.get('resumen_profesional') || null,
            sede_id: sedeId,
            estado_id: 1 // Activo
        };

        // Crear usuario (ahora es obligatorio)
        const username = formData.get('usuario');
        const email = formData.get('correo');

        if (!username || !email) {
            throw new Error('Usuario y correo son obligatorios');
        }

        // Crear usuario de Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: 'profesor123', // Temporal
            options: {
                data: {
                    full_name: `${docenteData.nombres} ${docenteData.apellidos}`
                }
            }
        });

        if (authError) throw authError;

        // Crear registro en tabla usuarios
        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .insert({
                auth_id: authData.user.id,
                cedula: docenteData.cedula,
                nombres: docenteData.nombres,
                apellidos: docenteData.apellidos,
                correo: email,
                rol_id: 3, // Docente
                sede_id: sedeId,
                estado_id: 1
            })
            .select()
            .single();

        if (userError) throw userError;

        const usuarioId = userData.id;

        // Crear docente
        docenteData.usuario_id = usuarioId;

        const { data: docente, error: docenteError } = await supabase
            .from('docentes')
            .insert(docenteData)
            .select()
            .single();

        if (docenteError) throw docenteError;

        // Éxito
        showNotification('Profesor creado exitosamente', 'success');

        // Cerrar modal
        window.closeModal('newTeacherModal');

        // Recargar lista
        await loadTeachers();

    } catch (error) {
        console.error('[Teachers] Error creating teacher:', error);
        showNotification(error.message || 'Error al crear profesor', 'error');
    } finally {
        // Rehabilitar botón
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span class="material-symbols-outlined font-black">person_add</span>
                Crear Profesor
            `;
        }
    }
}

// Función auxiliar para mostrar notificaciones
function showNotification(message, type = 'info') {
    if (window.NotificationSystem) {
        NotificationSystem.show(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/* =========================================
   ASIGNACIÓN DE MATERIAS Y HORARIOS
   ========================================= */

// Cargar Tab de Horario
async function loadTeacherScheduleTab(container, teacher) {
    const horarios = [];
    // Aplanar data si existe
    if (teacher.cargas_academicas) {
        teacher.cargas_academicas.forEach(carga => {
            if (carga.horarios) {
                carga.horarios.forEach(h => {
                    horarios.push({
                        ...h,
                        materia: carga.materia?.nombre || 'Materia',
                        seccion: carga.seccion ? `${carga.seccion.nombre} ${carga.seccion.codigo ? `(${carga.seccion.codigo})` : ''}` : 'S/S',
                        aula: h.aula || 'Sin aula'
                    });
                });
            }
        });
    }

    // Ordenar: Día, Hora
    horarios.sort((a, b) => {
        if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
        return a.hora_inicio.localeCompare(b.hora_inicio);
    });

    const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    container.innerHTML = `
        <div class="p-8 space-y-6">
             <div class="bg-card-dark rounded-2xl p-6 border border-white/10">
                 <h4 class="text-xs font-black text-gold uppercase tracking-[0.2em] mb-4">Horario de Clases</h4>
                 ${horarios.length > 0 ? `
                 <div class="overflow-x-auto">
                     <table class="w-full text-left">
                         <thead class="bg-black/20 text-white/40 text-[10px] uppercase tracking-[0.2em]">
                             <tr>
                                 <th class="px-4 py-3 font-black">Mes</th>
                                 <th class="px-4 py-3 font-black">Día</th>
                                 <th class="px-4 py-3 font-black">Hora</th>
                                 <th class="px-4 py-3 font-black">Materia</th>
                                 <th class="px-4 py-3 font-black">Sección</th>
                                 <th class="px-4 py-3 font-black">Aula</th>
                             </tr>
                         </thead>
                         <tbody class="divide-y divide-white/5">
                             ${horarios.map(h => `
                                 <tr class="hover:bg-white/5 transition-colors">
                                     <td class="px-4 py-3 text-sm font-bold text-gold">${getMesNombre(h.mes)}</td>
                                     <td class="px-4 py-3 text-sm font-bold text-white">${dias[h.dia_semana] || 'Día ' + h.dia_semana}</td>
                                     <td class="px-4 py-3 text-sm text-white/80">${h.hora_inicio.slice(0, 5)} - ${h.hora_fin.slice(0, 5)}</td>
                                     <td class="px-4 py-3 text-sm text-white/80 shrink-0 capitalize">${h.materia.toLowerCase()}</td>
                                     <td class="px-4 py-3 text-sm font-bold text-gold/80">${h.seccion}</td>
                                     <td class="px-4 py-3 text-sm text-white/60">${h.aula}</td>
                                 </tr>
                             `).join('')}
                         </tbody>
                     </table>
                 </div>
                 ` : `
                 <div class="bg-white/5 p-8 rounded-xl border border-dashed border-white/10 text-center">
                    <span class="material-symbols-outlined text-3xl text-white/20 mb-2">calendar_today</span>
                    <p class="text-xs text-white/40 font-medium">No hay horarios registrados en el periodo actual.</p>
                 </div>
                 `}
             </div>
        </div>
    `;
}

// Cargar datos comunes
async function loadCommonData() {
    if (!currentPeriod || allSubjects.length === 0) {
        // Cargar Periodo Actual
        const { data: periodo } = await supabase
            .from('periodos_academicos')
            .select('*')
            .eq('estado_id', 1)
            .order('fecha_fin', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (periodo) currentPeriod = periodo;

        // Cargar Materias
        const { data: materias } = await supabase
            .from('materias')
            .select('*')
            .eq('estado_id', 1)
            .order('año_materia', { ascending: true })
            .order('codigo', { ascending: true });

        if (materias) allSubjects = materias;

        // Cargar Secciones (Globales + Específicas)
        const sedeId = window.adminContext?.sedeId;
        if (sedeId) {
            const { data: secs } = await supabase
                .from('secciones')
                .select('id, nombre, codigo, materia_id')
                .eq('sede_id', sedeId)
                .order('nombre');

            if (secs) window.allSectionsData = secs;
        }
    }
}

// Abrir modal de asignaciones
window.openManageAssignments = async function (teacherId) {
    try {
        const sedeId = window.adminContext?.sedeId;
        if (!sedeId) {
            showNotification('Error: Administrador sin sede asignada', 'error');
            return;
        }

        if (!document.getElementById('manageAssignmentsModal')) {
            await window.loadModal('manage-assignments-modal');
            const form = document.getElementById('assignmentsForm');
            if (form) form.addEventListener('submit', handleAssignmentsSubmit);
        }

        await loadCommonData();

        if (!currentPeriod) {
            showNotification('Error: No hay periodo académico activo', 'error');
            return;
        }

        // Global Section Loader Removed (Logic moved to renderSubjectsSelection)

        // Obtener profesor con IDs de materias actuales
        const { data: teacher, error } = await supabase
            .from('docentes')
            .select('*, cargas_academicas(materia_id)')
            .eq('id', teacherId)
            .single();

        if (error || !teacher) {
            throw error || new Error('Profesor no encontrado');
        }

        window.currentAssignTeacherId = teacherId;

        document.getElementById('assignTeacherName').textContent = `${teacher.nombres} ${teacher.apellidos}`;
        document.getElementById('currentPeriodName').textContent = currentPeriod.nombre;

        // Render materias
        renderSubjectsSelection(teacher);

        // Show modal
        const modal = document.getElementById('manageAssignmentsModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('#manageAssignmentsModalContent').classList.remove('scale-95');
        }, 10);

    } catch (e) {
        console.error('[Assignments] Error opening modal:', e);
        showNotification('Error al abrir asignaciones', 'error');
    }
};

function renderSubjectsSelection(teacher) {
    const list = document.getElementById('subjectsList');
    // IDs asignados y sus datos completos
    const currentCargas = teacher.cargas_academicas || [];
    const assignedIds = currentCargas.map(c => c.materia_id);

    // Agrupar available subjects by year
    const byYear = {};
    allSubjects.forEach(s => {
        const year = s.año_materia || 0;
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(s);
    });

    let html = '';
    Object.keys(byYear).sort((a, b) => Number(a) - Number(b)).forEach(year => {
        html += `<div class="col-span-1 md:col-span-2 mt-4 mb-2 first:mt-0">
                    <h5 class="text-[10px] font-black text-gold uppercase tracking-[0.2em] border-b border-white/5 pb-2">
                        ${year == 0 ? 'Trayecto Inicial / Electivas' : year + 'º Año Académico'}
                    </h5>
                  </div>`;

        byYear[year].forEach(subj => {
            const isChecked = assignedIds.includes(subj.id);
            const loadInfo = currentCargas.find(c => c.materia_id === subj.id);
            const currentSectionId = loadInfo?.seccion_id;

            // Filter sections: Global (materia_id is null) OR Specific (materia_id matches)
            const availableSections = (window.allSectionsData || []).filter(s =>
                s.materia_id === null || s.materia_id === subj.id
            );

            const options = availableSections.length > 0
                ? '<option value="">Seleccionar Sección...</option>' + availableSections.map(s =>
                    `<option value="${s.id}" ${s.id === currentSectionId ? 'selected' : ''}>${s.nombre} ${s.codigo ? `(${s.codigo})` : ''}</option>`
                ).join('')
                : '<option value="">Sin secciones disponibles</option>';

            html += `
            <div class="subject-row bg-black/20 border ${isChecked ? 'border-gold/50 bg-gold/10' : 'border-white/5'} rounded-xl p-3 transition-all hover:border-gold/30">
                <div class="flex items-start gap-3">
                    <label class="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" name="materia_id" value="${subj.id}" ${isChecked ? 'checked' : ''} class="subject-checkbox accent-gold size-4 shrink-0">
                        <div class="truncate">
                            <span class="block text-xs font-bold text-white group-hover:text-gold transition-colors truncate">${subj.nombre}</span>
                            <span class="block text-[10px] text-white/40 font-mono mt-0.5">${subj.codigo}</span>
                        </div>
                    </label>
                </div>
                
                <div class="mt-2 pl-7 ${isChecked ? '' : 'hidden opacity-50'} section-selector-container transition-all">
                     <select class="section-select-per-subject w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:ring-1 focus:ring-gold/50 outline-none"
                        data-subject-id="${subj.id}" ${isChecked ? 'required' : ''}>
                        ${options}
                     </select>
                </div>
            </div>
             `;
        });
    });

    list.innerHTML = html;
    updateSelectedCount();

    // Add listeners
    list.querySelectorAll('input.subject-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const row = e.target.closest('.subject-row');
            const selectorDiv = row.querySelector('.section-selector-container');
            const select = selectorDiv.querySelector('select');

            if (e.target.checked) {
                row.classList.add('border-gold/50', 'bg-gold/10');
                row.classList.remove('border-white/5');
                selectorDiv.classList.remove('hidden', 'opacity-50');
                if (select) select.required = true;
            } else {
                row.classList.remove('border-gold/50', 'bg-gold/10');
                row.classList.add('border-white/5');
                selectorDiv.classList.add('hidden', 'opacity-50');
                if (select) select.required = false;
            }
            updateSelectedCount();
        });
    });
}

function updateSelectedCount() {
    const count = document.querySelectorAll('.subject-checkbox:checked').length;
    const el = document.getElementById('selectedCount');
    if (el) {
        el.textContent = `${count}/5 Seleccionadas`;
        if (count > 5) {
            el.classList.add('text-red-400', 'animate-pulse');
            el.classList.remove('text-gold');
        } else {
            el.classList.remove('text-red-400', 'animate-pulse');
            el.classList.add('text-gold');
        }
    }

    const btn = document.getElementById('btnSaveAssignments');
    if (btn) btn.disabled = (count > 5);
}

// Guardar Asignaciones
async function handleAssignmentsSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveAssignments');

    const checkboxes = document.querySelectorAll('.subject-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (selectedIds.length === 0) {
        showNotification('Debe seleccionar al menos una materia', 'error');
        return;
    }

    if (selectedIds.length > 5) {
        showNotification('Máximo 5 materias por profesor', 'error');
        return;
    }

    const sedeId = window.adminContext?.sedeId;
    if (!sedeId || !currentPeriod || !window.currentAssignTeacherId) {
        showNotification('Error de contexto (Sede/Periodo/Profesor)', 'error');
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin material-symbols-outlined font-black text-sm">sync</span> Guardando...`;
        }

        const teacherId = window.currentAssignTeacherId;
        const periodoId = currentPeriod.id;

        // 1. Obtener cargas actuales para este periodo
        const { data: currentCargas, error: fetchError } = await supabase
            .from('cargas_academicas')
            .select('id, materia_id, seccion_id')
            .eq('docente_id', teacherId)
            .eq('periodo_id', periodoId)
            .eq('sede_id', sedeId);

        if (fetchError) throw fetchError;

        const currentMateriaIds = currentCargas.map(c => c.materia_id);

        // 2. Diff (Same as before)
        const toAdd = selectedIds.filter(id => !currentMateriaIds.includes(id));
        const toRemove = currentCargas.filter(c => !selectedIds.includes(c.materia_id));

        // 2b. Check for Updates (Materia kept, but section changed)
        // For simplicity, we can treat them as remove+add OR update. 
        // Current logic only does add/remove. 
        // Let's stick to Add/Remove for now, but really "Changing Section" requires "Update".
        // IMPROVEMENT: If I uncheck and check, it works. If I just change dropdown? 
        // The current diff logic ignores updates. 
        // FIX: Let's also find "Updates" where materia is in BOTH lists but Section differs.

        const keptIds = selectedIds.filter(id => currentMateriaIds.includes(id));
        const toUpdate = [];

        for (const mId of keptIds) {
            const select = document.querySelector(`.section-select-per-subject[data-subject-id="${mId}"]`);
            const newSectionId = select ? parseInt(select.value) : null;
            const oldSectionId = currentCargas.find(c => c.materia_id === mId)?.seccion_id;

            if (newSectionId && newSectionId !== oldSectionId) {
                const rowId = currentCargas.find(c => c.materia_id === mId).id;
                toUpdate.push({ id: rowId, seccion_id: newSectionId });
            }
        }

        // 3. Eliminar
        if (toRemove.length > 0) {
            const removeIds = toRemove.map(c => c.id);
            const { error: delError } = await supabase
                .from('cargas_academicas')
                .delete()
                .in('id', removeIds);

            if (delError) throw new Error('No se pueden eliminar materias con notas/alumnos asignados.');
        }

        // 4. Insertar
        if (toAdd.length > 0) {
            const newRows = [];

            for (const materiaId of toAdd) {
                // Find the dropdown for this subject
                const select = document.querySelector(`.section-select-per-subject[data-subject-id="${materiaId}"]`);
                const sectionId = select ? select.value : null;

                if (!sectionId) {
                    throw new Error(`Debes seleccionar una sección para la materia ID: ${materiaId}`);
                }

                newRows.push({
                    docente_id: teacherId,
                    periodo_id: periodoId,
                    materia_id: materiaId,
                    estado_id: 1,
                    sede_id: sedeId,
                    seccion_id: parseInt(sectionId)
                });
            }

            const { error: insError } = await supabase
                .from('cargas_academicas')
                .insert(newRows);

            if (insError) throw insError;
        }

        showNotification('Asignaciones actualizadas', 'success');
        window.closeModal('manageAssignmentsModal');
        await loadTeachers(); // Recargar lista completa

    } catch (error) {
        console.error('[Assignments] Error saving:', error);
        showNotification(error.message || 'Error al guardar asignaciones', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Asignaciones';
        }
    }
}
