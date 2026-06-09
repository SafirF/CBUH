
import { supabase } from '../../../config/supabase-client.js';
import { store } from '../../../config/app-store.js';

let allSections = [];
let isInitialized = false;

// Inicializar módulo
export async function initSections() {
    if (isInitialized) return;
    console.log('[Sections] Initializing sections module');

    // Cargar secciones
    await loadSections();

    // Setup events
    setupEventListeners();

    isInitialized = true;
}

// Exponer globalmente
window.loadSectionsModule = async function () {
    if (!isInitialized) {
        await initSections();
    }
};

function setupEventListeners() {
    // Botón Nueva Sección
    const btnNew = document.getElementById('btn-new-section');
    if (btnNew) {
        btnNew.addEventListener('click', async () => {
            const modal = document.getElementById('sectionModal');
            const form = document.getElementById('sectionForm');
            if (modal && form) {
                form.reset();
                document.getElementById('section-id').value = '';
                document.getElementById('modal-title-section').textContent = 'Nueva Sección';

                await loadSubjectsForDropdown(); // Load subjects

                modal.classList.remove('hidden');
            }
        });
    }

    // Form Submit
    const form = document.getElementById('sectionForm');
    if (form) {
        form.addEventListener('submit', handleSaveSection);
    }
}

async function loadSections() {
    try {
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;
        const grid = document.getElementById('sections-grid');

        if (grid) {
            grid.innerHTML = '<div class="col-span-full text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold mx-auto"></div></div>';
        }

        const { data, error } = await supabase
            .from('secciones')
            .select(`
                *,
                materia:materias(id, nombre:nombre_materia, codigo),
                cargas_academicas!inner(count)
            `)
            .eq('sede_id', sedeId)
            .order('nombre');

        if (error) throw error;
        allSections = data || [];

        renderSections();

    } catch (error) {
        console.error('[Sections] Error:', error);
        showNotification('Error al cargar secciones', 'error');
    }
}

function renderSections() {
    const grid = document.getElementById('sections-grid');
    if (!grid) return;

    if (allSections.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-50">
                <span class="material-symbols-outlined text-4xl text-white mb-2">grid_view</span>
                <p class="text-sm text-white/60">No hay secciones creadas.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = allSections.map(section => `
        <div class="bg-primary-dark rounded-xl border border-white/10 p-5 hover:border-gold/30 transition-all group relative">
            <div class="flex justify-between items-start mb-3">
                <div>
                     <span class="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-black text-white/40 uppercase tracking-widest border border-white/10 mb-2 inline-block">
                        ${section.codigo || 'S/C'}
                    </span>
                    <h3 class="text-lg font-black text-white uppercase tracking-tight group-hover:text-gold transition-colors">
                        ${section.nombre}
                    </h3>
                    ${section.materia ? `<p class="text-xs text-gold font-bold uppercase tracking-wider mt-1 border-t border-white/5 pt-1">${section.materia.nombre}</p>` : ''}
                </div>
                <div class="flex gap-1">
                    <button onclick="window.editSection(${section.id})" class="size-8 rounded-lg hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-all">
                        <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <!--
                    <button onclick="window.deleteSection(${section.id})" class="size-8 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 flex items-center justify-center transition-all">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                    -->
                </div>
            </div>

            <div class="flex items-center gap-4 text-xs text-white/60">
                <div class="flex items-center gap-1.5 tooltipped" data-tooltip="Capacidad Máxima">
                     <span class="material-symbols-outlined text-sm">groups</span>
                     <span class="font-bold text-white">${section.capacidad || 25}</span>
                     <span>Cupos</span>
                </div>
                <!-- 
                <div class="flex items-center gap-1.5 tooltipped" data-tooltip="Estado">
                    <div class="size-2 rounded-full ${section.estado_id === 1 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}"></div>
                    <span class="uppercase tracking-wider font-bold text-[9px]">${section.estado_id === 1 ? 'Activa' : 'Inactiva'}</span>
                </div>
                -->
            </div>
        </div>
    `).join('');
}

async function handleSaveSection(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-section');
    btn.disabled = true;

    try {
        const formData = new FormData(e.target);
        const id = document.getElementById('section-id').value;
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;

        const sectionData = {
            nombre: formData.get('nombre').toUpperCase(),
            codigo: formData.get('codigo').toUpperCase(),
            capacidad: parseInt(formData.get('capacidad')) || 40,
            materia_id: formData.get('materia_id'), // Now required
            sede_id: sedeId,
            estado_id: 1
        };

        if (!sectionData.materia_id) {
            alert('Debe seleccionar una materia para la sección.');
            throw new Error('Materia requerida');
        }

        if (id) {
            const { error } = await supabase.from('secciones').update(sectionData).eq('id', id);
            if (error) throw error;
            showNotification('Sección actualizada', 'success');
        } else {
            const { error } = await supabase.from('secciones').insert(sectionData);
            if (error) throw error;
            showNotification('Sección creada', 'success');
        }

        document.getElementById('sectionModal').classList.add('hidden');
        await loadSections();

    } catch (error) {
        console.error(error);
        showNotification('Error al guardar sección', 'error');
    } finally {
        btn.disabled = false;
    }
}

window.editSection = function (id) {
    const section = allSections.find(s => s.id == id);
    if (!section) return;

    document.getElementById('section-id').value = section.id;
    document.getElementById('section-nombre').value = section.nombre;
    document.getElementById('section-codigo').value = section.codigo || '';
    document.getElementById('section-capacidad').value = section.capacidad || 40;

    // Select materia
    loadSubjectsForDropdown().then(() => {
        const matSelect = document.getElementById('section-materia');
        if (matSelect) matSelect.value = section.materia_id || '';
    });

    document.getElementById('modal-title-section').textContent = 'Editar Sección';
    document.getElementById('sectionModal').classList.remove('hidden');
};

function showNotification(msg, type = 'info') {
    if (window.NotificationSystem) NotificationSystem.show(msg, type);
    else alert(msg);
}

// Load subjects for dropdown
async function loadSubjectsForDropdown() {
    const select = document.getElementById('section-materia');
    if (!select) return;

    select.innerHTML = '<option value="">Cargando...</option>';

    try {
        // Fetch subjects order by year then name
        const { data: materias, error } = await supabase
            .from('materias')
            .select('id, nombre:nombre_materia, codigo, año_materia')
            .eq('estado_id', 1)
            .order('año_materia', { ascending: true })
            .order('id', { ascending: true });

        if (error) throw error;

        // Populate select - Require selection (No Global Option)
        select.innerHTML = '<option value="">-- Seleccionar Materia --</option>' +
            materias.map(m => `<option value="${m.id}">${m.año_materia}º Año - ${m.nombre} (${m.codigo})</option>`).join('');

    } catch (error) {
        console.error('Error loading subjects:', error);
        select.innerHTML = '<option value="">Error al cargar materias</option>';
    }
}
