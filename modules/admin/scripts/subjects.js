// ============================================
// subjects.js - Gestión de Materias
// ============================================

import { supabase } from '../../../config/supabase-client.js';
import { store } from '../../../config/app-store.js';

let allSubjects = [];
let filteredSubjects = [];
let searchQuery = '';
let currentYearFilter = '';
let isInitialized = false;

// Inicializar módulo
export async function initSubjects() {
    if (isInitialized) return;
    console.log('[Subjects] Initializing subjects module');

    // Cargar materias
    await loadSubjects();

    // Setup event listeners
    setupEventListeners();

    isInitialized = true;
}

// Exponer función para lazy loading
window.loadSubjectsModule = async function () {
    if (!isInitialized) {
        await initSubjects();
    }
};

// Configurar event listeners
function setupEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('subjects-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            filterAndRenderSubjects();
        });
    }

    // Filtro por año (Select)
    const yearSelect = document.getElementById('subjects-filter-year');
    if (yearSelect) {
        yearSelect.addEventListener('change', (e) => {
            currentYearFilter = e.target.value;
            updateTabActiveState(currentYearFilter);
            filterAndRenderSubjects();
        });
    }

    // Filtro por año (Tabs)
    document.querySelectorAll('.subject-tab-year').forEach(tab => {
        tab.addEventListener('click', () => {
            currentYearFilter = tab.dataset.year;

            // Sincronizar select
            if (yearSelect) yearSelect.value = currentYearFilter;

            updateTabActiveState(currentYearFilter);
            filterAndRenderSubjects();
        });
    });

    // Botón nueva materia
    const btnNew = document.getElementById('btn-new-subject');
    if (btnNew) {
        btnNew.addEventListener('click', () => {
            const modal = document.getElementById('newSubjectModal');
            const form = document.getElementById('newSubjectForm');
            if (modal && form) {
                form.reset();
                modal.classList.remove('hidden');
            }
        });
    }

    // Form submit nueva materia
    const newSubjectForm = document.getElementById('newSubjectForm');
    if (newSubjectForm) {
        newSubjectForm.addEventListener('submit', handleNewSubjectSubmit);
    }
}

// Actualizar estado visual de tabs
function updateTabActiveState(year) {
    document.querySelectorAll('.subject-tab-year').forEach(tab => {
        if (tab.dataset.year === year) {
            tab.classList.add('active', 'border-gold', 'text-gold');
            tab.classList.remove('border-transparent', 'text-white/40');
        } else {
            tab.classList.remove('active', 'border-gold', 'text-gold');
            tab.classList.add('border-transparent', 'text-white/40');
        }
    });
}

// Cargar todas las materias
async function loadSubjects() {
    try {
        const { data, error } = await supabase
            .from('materias')
            .select(`
                id,
                codigo,
                nombre:nombre_materia,
                año_materia,
                creditos,
                descripcion,
                estado_id,
                orden_secuencia,
                prelaciones:materias_prelaciones!materia_id (
                    prelacion:prelacion_id (nombre:nombre_materia, codigo)
                ),
                cargas:cargas_academicas (
                    id,
                    sede_id, 
                    docente:docentes (nombres, apellidos)
                )
            `)
            .order('año_materia', { ascending: true })
            .order('nombre_materia', { ascending: true });

        if (error) throw error;

        allSubjects = data || [];
        filteredSubjects = [...allSubjects];

        renderSubjects();
        updateStats();

    } catch (error) {
        console.error('[Subjects] Error loading subjects:', error);
        const grid = document.getElementById('subjects-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <p class="text-red-400 font-bold">Error al cargar materias</p>
                    <p class="text-xs text-white/40 mt-1">${error.message}</p>
                </div>
            `;
        }
    }
}

// Filtrar y renderizar
function filterAndRenderSubjects() {
    filteredSubjects = allSubjects.filter(subject => {
        const matchesYear = !currentYearFilter || subject.año_materia == currentYearFilter;
        const matchesSearch = !searchQuery ||
            subject.codigo.toLowerCase().includes(searchQuery) ||
            subject.nombre.toLowerCase().includes(searchQuery);
        return matchesYear && matchesSearch;
    });

    renderSubjects();
}

// Renderizar grid de materias
function renderSubjects() {
    const grid = document.getElementById('subjects-grid');
    if (!grid) return;

    if (filteredSubjects.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-center opacity-50">
                <div class="size-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-4xl text-white">menu_book</span>
                </div>
                <h3 class="text-lg font-bold text-white uppercase tracking-widest">No hay materias</h3>
                <p class="text-sm text-white/60 mt-1">
                    ${searchQuery || currentYearFilter ? 'No se encontraron resultados con los filtros actuales.' : 'Comienza creando una nueva materia.'}
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredSubjects.map(subject => {
        // Check teacher assignment (any active load)
        // Check teacher assignment (any active load FOR CURRENT SEDE)
        const currentSedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;
        const activeCargas = subject.cargas ? subject.cargas.filter(c => c.sede_id === currentSedeId && c.docente) : [];
        const activeCarga = activeCargas.length > 0 ? activeCargas[0] : null;

        const hasTeacher = !!activeCarga;
        const teacherName = hasTeacher ? `${activeCarga.docente.nombres.split(' ')[0]} ${activeCarga.docente.apellidos.split(' ')[0]}` : null;

        // Check prerequisites
        const prelaciones = subject.prelaciones || [];

        return `
        <div class="bg-primary-dark rounded-2xl border border-white/10 p-6 hover:border-gold/30 transition-all group relative overflow-hidden flex flex-col h-full">
            <!-- Decorative corner -->
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span class="material-symbols-outlined text-6xl text-gold transform rotate-12">school</span>
            </div>

            <div class="flex items-start justify-between mb-4 relative z-10">
                <div>
                    <span class="px-2.5 py-1 rounded-lg bg-gold/10 text-gold text-[10px] font-black uppercase tracking-widest border border-gold/20">
                        ${subject.codigo}
                    </span>
                    ${subject.año_materia ?
                `<span class="ml-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">${subject.año_materia}º Año</span>`
                : ''}
                </div>
                <!-- Botones de acción - Temporalmente comentados para panel de admin -->
                <!--
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.deleteSubject(${subject.id})" class="size-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 flex items-center justify-center transition-all">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
                -->
            </div>
            
            <h3 class="text-lg font-black text-white mb-2 relative z-10 group-hover:text-gold transition-colors truncate" title="${subject.nombre}">
                ${subject.nombre}
            </h3>
            
            ${subject.creditos ?
                `<p class="text-xs text-white/60 mb-2 relative z-10">
                    <span class="font-bold text-white">${subject.creditos}</span> Créditos Académicos
                </p>`
                : ''}

            <!-- Prerequisites Badge -->
            ${prelaciones.length > 0 ? `
            <div class="mb-3 relative z-10">
                <p class="text-[9px] text-white/30 uppercase font-bold tracking-wider mb-1">Prelada por:</p>
                <div class="flex flex-wrap gap-1">
                    ${prelaciones.map(p => `
                        <span class="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-bold text-white/60 border border-white/10">
                            ${p.prelacion?.codigo || 'Materia'}
                        </span>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="mt-auto pt-4 border-t border-white/5 relative z-10">
                 ${hasTeacher ? `
                    <div class="flex items-center gap-2 text-green-400">
                        <span class="material-symbols-outlined text-sm">person_check</span>
                        <span class="text-[10px] font-bold uppercase tracking-wider">Prof. ${teacherName}</span>
                    </div>
                 ` : `
                    <div class="flex items-center gap-2 text-orange-400/60">
                         <span class="material-symbols-outlined text-sm">person_off</span>
                         <span class="text-[10px] font-bold uppercase tracking-wider">Sin docente</span>
                    </div>
                 `}
            </div>

        </div>
    `}).join('');
}

// Actualizar estadísticas
function updateStats() {
    const totalEl = document.getElementById('stat-total-subjects');
    const year1El = document.getElementById('stat-subjects-year-1');
    const year2El = document.getElementById('stat-subjects-year-2');
    const year3El = document.getElementById('stat-subjects-year-3');

    if (totalEl) totalEl.textContent = allSubjects.length;

    if (year1El) year1El.textContent = allSubjects.filter(s => s.año_materia == 1).length;
    if (year2El) year2El.textContent = allSubjects.filter(s => s.año_materia == 2).length;
    if (year3El) year3El.textContent = allSubjects.filter(s => s.año_materia == 3).length;
}

// Manejar creación de materia
async function handleNewSubjectSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btnSubmitNewSubject');

    // Loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <span class="animate-spin material-symbols-outlined font-black">sync</span>
            Guardando...
        `;
    }

    try {
        const subjectData = {
            codigo: formData.get('codigo'),
            nombre_materia: formData.get('nombre'),
            año_materia: formData.get('año_materia') || null,
            creditos: formData.get('creditos') || null,
            descripcion: formData.get('descripcion') || null,
            // sede_id is removed to default to NULL (Global)
        };

        const { error } = await supabase
            .from('materias')
            .insert(subjectData);

        if (error) throw error;

        showNotification('Materia creada exitosamente', 'success');
        document.getElementById('newSubjectModal').classList.add('hidden');
        await loadSubjects();

    } catch (error) {
        console.error('[Subjects] Error creating subject:', error);
        showNotification(error.message || 'Error al crear materia', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span class="material-symbols-outlined text-sm">save</span>
                Guardar Materia
            `;
        }
    }
}

// Eliminar materia
window.deleteSubject = async function (id) {
    const confirmed = await NotificationSystem.confirm(
        'Eliminar Materia',
        '¿Estás seguro de eliminar esta materia? Esta acción no se puede deshacer y podría afectar a estudiantes inscritos.',
        { confirmText: 'Sí, Eliminar', type: 'danger' }
    );
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('materias')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showNotification('Materia eliminada', 'success');
        await loadSubjects();

    } catch (error) {
        console.error('[Subjects] Error deleting subject:', error);
        showNotification('No se puede eliminar la materia porque tiene registros asociados', 'error');
    }
};

// --- Prelation Matrix (Modals) ---
window.openPrelationMatrix = async function () {
    // Generate Modal HTML dynamically
    const id = 'prelationMatrixModal';
    if (!document.getElementById(id)) {
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'fixed inset-0 bg-black/80 items-center justify-center z-50 flex backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-primary-dark rounded-2xl border border-white/10 max-w-4xl w-full mx-4 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div class="p-8 border-b border-white/10 flex justify-between items-center bg-black/20">
                    <div>
                        <h2 class="text-xl font-black text-white uppercase tracking-tight">Matriz de Prelaciones</h2>
                        <p class="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Mapa curricular (Año por Año)</p>
                    </div>
                    <button onclick="document.getElementById('${id}').remove()" class="size-10 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-8 overflow-y-auto custom-scrollbar space-y-8" id="prelationMatrixContent">
                    <div class="text-center py-12">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate Content
    const container = document.getElementById('prelationMatrixContent');
    const { data: subjects, error } = await supabase
        .from('materias')
        .select(`
            id,
            codigo,
            nombre:nombre_materia,
            año_materia,
            creditos,
            descripcion,
            estado_id,
            orden_secuencia,
            prelaciones:materias_prelaciones!materia_id (
                prelacion:prelacion_id (nombre:nombre_materia, codigo)
            )
        `)
        .order('año_materia', { ascending: true })
        .order('orden_secuencia', { ascending: true }); // Use new sequence order

    if (error) {
        container.innerHTML = `<p class="text-red-400">Error al cargar datos.</p>`;
        return;
    }

    // Group by Year
    const byYear = {};
    subjects.forEach(s => {
        const y = s.año_materia || 0;
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(s);
    });

    const years = Object.keys(byYear).sort();

    container.innerHTML = years.map(year => `
        <div class="space-y-4">
            <div class="flex items-center gap-4">
                <div class="size-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold font-black text-xs">
                    ${year}º
                </div>
                <div class="h-px bg-white/10 flex-1"></div>
            </div>
            
            <div class="relative pl-5 border-l border-white/10 space-y-0">
                ${byYear[year].map((s, index) => {
        const prereqs = s.prelaciones || [];
        const isLast = index === byYear[year].length - 1;

        return `
                    <div class="relative pl-8 py-3 group">
                        <!-- Connector Line -->
                        <div class="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-px bg-white/10 group-hover:bg-gold/50 transition-colors"></div>
                        <div class="absolute -left-[1px] top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-black border border-white/20 group-hover:border-gold transition-colors"></div>

                        <div class="flex items-center gap-4 bg-white/5 border border-white/5 rounded-xl p-4 hover:border-gold/30 transition-all">
                             <div class="flex flex-col items-center justify-center size-10 bg-black/30 rounded-lg border border-white/5">
                                <span class="text-[9px] font-black text-gold">${s.orden_secuencia || '?'}</span>
                             </div>
                             
                             <div class="flex-1">
                                <p class="text-sm font-bold text-white group-hover:text-gold transition-colors">${s.nombre}</p>
                                <p class="text-[10px] text-white/40 uppercase tracking-widest">${s.codigo}</p>
                             </div>

                             ${prereqs.length > 0 ? `
                             <div class="flex flex-col items-end gap-1">
                                <span class="text-[9px] text-white/20 font-bold uppercase tracking-widest">Requiere:</span>
                                <div class="flex gap-1">
                                    ${prereqs.map(p => `
                                        <span class="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-bold">
                                            ${p.prelacion.codigo}
                                        </span>
                                    `).join('')}
                                </div>
                             </div>
                             ` : `
                                <span class="text-[9px] text-green-400/40 font-bold uppercase tracking-widest border border-green-500/10 px-2 py-1 rounded bg-green-500/5">Sin Prelación</span>
                             `}
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `).join('');
};
// Función auxiliar para mostrar notificaciones
function showNotification(message, type = 'info') {
    if (window.NotificationSystem) {
        NotificationSystem.show(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}
