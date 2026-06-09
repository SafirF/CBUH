import { supabase } from '../../../config/supabase-client.js'

/**
 * Inicializar módulo de materias
 */
export async function initSubjects() {
    console.log('[SubjectsModule] Initializing...');
    await loadSubjects();
}

async function loadSubjects() {
    const context = window.teacherContext;
    if (!context) return;

    const grid = document.getElementById('subjects-grid');
    if (!grid) return;

    try {
        const { data: assignments, error } = await supabase
            .from('cargas_academicas')
            .select(`
                id,
                materia:materias (id, nombre:nombre_materia, codigo, descripcion),
                seccion:secciones (id, nombre),
                horarios (id, dia_semana, hora_inicio, hora_fin, aula)
            `)
            .eq('docente_id', context.docenteId);

        if (error) throw error;

        if (!assignments || assignments.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-20 flex flex-col items-center justify-center text-white/20">
                    <span class="material-symbols-outlined text-6xl">upcoming</span>
                    <p class="mt-4 uppercase font-bold tracking-widest">No tienes materias asignadas</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = assignments.map(assign => {
            const horarioPrincipal = assign.horarios && assign.horarios.length > 0
                ? `${assign.horarios[0].hora_inicio} - ${assign.horarios[0].hora_fin}`
                : 'Horario no definido';
            const aulaPrincipal = assign.horarios && assign.horarios.length > 0
                ? assign.horarios[0].aula
                : 'N/A';

            return `
            <div class="bg-primary-dark rounded-2xl border border-white/10 overflow-hidden group hover:border-gold/30 transition-all flex flex-col shadow-lg shadow-black/20">
                <div class="p-6 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                    <div class="flex justify-between items-start mb-4">
                        <div class="size-12 rounded-xl bg-card-dark border border-gold/20 flex items-center justify-center text-gold">
                            <span class="material-symbols-outlined">menu_book</span>
                        </div>
                        <span class="text-[10px] font-black bg-gold/10 text-gold px-2 py-1 rounded-md border border-gold/20 uppercase">${assign.seccion?.nombre || 'S/S'}</span>
                    </div>
                    <h3 class="text-xl font-black text-white uppercase tracking-tight leading-tight mb-2">${assign.materia.nombre}</h3>
                    <p class="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em]">${assign.materia.codigo}</p>
                </div>
                <div class="p-6 space-y-4 flex-1">
                    <div class="flex items-center gap-3 text-white/60">
                        <span class="material-symbols-outlined text-gold">calendar_month</span>
                        <div class="text-xs font-bold uppercase tracking-wider">${horarioPrincipal}</div>
                    </div>
                    <div class="flex items-center gap-3 text-white/60">
                        <span class="material-symbols-outlined text-gold">location_on</span>
                        <div class="text-xs font-bold uppercase tracking-wider">AULA ${aulaPrincipal}</div>
                    </div>
                </div>
                <div class="p-4 bg-black/20 border-t border-white/5 flex gap-2">
                    <button onclick="switchTab('estudiantes', ${assign.id})" class="flex-1 bg-white/5 hover:bg-gold hover:text-primary-dark text-white/60 text-[10px] font-black uppercase py-2.5 rounded-lg transition-all border border-white/10 group-hover:border-gold/50">
                        Ver Estudiantes
                    </button>
                </div>
            </div>
        `}).join('');

    } catch (e) {
        console.error('[SubjectsModule] Error:', e);
        grid.innerHTML = '<p class="text-red-400 text-center py-10 col-span-full">Error al cargar materias</p>';
    }
}

// Exponer globalmente
window.initSubjects = initSubjects;
