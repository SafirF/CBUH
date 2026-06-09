import { supabase } from '../../../config/supabase-client.js'

let allSchedules = [];
let isInitialized = false;

// Variables de configuración de tiempo (Valores por defecto)
let configStartStr = '07:00';
let configEndStr = '16:00';
let configStartMinutes = 420;
let configEndMinutes = 960;

export async function initTeacherSchedule() {
    if (isInitialized) return;
    console.log('[TeacherSchedule] Initializing...');

    // Cargar config de tiempos
    await loadTimeConfig();

    // Cargar horarios del docente
    await loadSchedules();

    setupEventListeners();
    isInitialized = true;
}

async function loadTimeConfig() {
    try {
        const sedeId = window.teacherContext?.sedeId || 1;
        const { data } = await supabase
            .from('configuraciones')
            .select('clave, valor')
            .eq('sede_id', sedeId)
            .in('clave', ['hora_inicio_clases', 'hora_fin_clases']);

        if (data && data.length > 0) {
            const startConf = data.find(c => c.clave === 'hora_inicio_clases');
            const endConf = data.find(c => c.clave === 'hora_fin_clases');

            if (startConf) {
                configStartStr = startConf.valor;
                configStartMinutes = timeToMinutes(configStartStr);
            }
            if (endConf) {
                configEndStr = endConf.valor;
                configEndMinutes = timeToMinutes(configEndStr);
            }
        }
    } catch (e) {
        console.error('Error loading time config:', e);
    }
    renderTimeGrid();
}

function renderTimeGrid() {
    const timeCol = document.getElementById('teacher-grid-time-column');
    if (!timeCol) return;

    const startHour = Math.floor(configStartMinutes / 60);
    const endHour = Math.floor(configEndMinutes / 60);

    let html = '';
    for (let h = startHour; h < endHour; h++) {
        const timeLabel = `${h.toString().padStart(2, '0')}:00`;
        html += `
             <div class="h-24 border-b border-white/5 flex items-start justify-center pt-2 text-[10px] font-bold text-white/20">
                ${timeLabel}
            </div>
        `;
    }
    timeCol.innerHTML = html;
}

async function loadSchedules() {
    const context = window.teacherContext;
    const loading = document.getElementById('teacher-schedules-loading');

    if (!context || !context.docenteId) {
        console.warn('[TeacherSchedule] No teacher context found');
        if (loading) loading.classList.add('hidden');
        return;
    }

    if (loading) {
        loading.classList.remove('hidden');
        loading.classList.add('flex');
    }

    try {
        const { data, error } = await supabase
            .from('horarios')
            .select(`
                id,
                dia_semana,
                hora_inicio,
                hora_fin,
                aula,
                mes,
                carga:cargas_academicas!inner (
                    id,
                    materia:materias (id, nombre:nombre_materia, codigo, año_materia)
                )
            `)
            .eq('cargas_academicas.docente_id', context.docenteId);

        if (error) throw error;

        allSchedules = data || [];
        filterAndRenderSchedules();

    } catch (error) {
        console.error('[TeacherSchedule] Error:', error);
    } finally {
        if (loading) {
            loading.classList.add('hidden');
            loading.classList.remove('flex');
        }
    }
}

function filterAndRenderSchedules() {
    const monthSelect = document.getElementById('teacher-schedule-month-filter');
    const selectedMonth = monthSelect ? monthSelect.value : new Date().getMonth() + 1;

    const filtered = allSchedules.filter(s => s.mes == selectedMonth);

    renderCalendar(filtered);
}

function renderCalendar(schedules) {
    // Limpiar columnas
    for (let i = 1; i <= 7; i++) {
        const col = document.getElementById(`teacher-schedule-day-${i}`);
        if (col) col.innerHTML = '';
    }

    schedules.forEach(schedule => {
        const col = document.getElementById(`teacher-schedule-day-${schedule.dia_semana}`);
        if (!col) return;

        const block = createScheduleBlock(schedule);
        col.appendChild(block);
    });
}

function createScheduleBlock(schedule) {
    const div = document.createElement('div');
    const startMinutes = timeToMinutes(schedule.hora_inicio);
    const endMinutes = timeToMinutes(schedule.hora_fin);
    const durationCurrent = endMinutes - startMinutes;

    const pxPerMin = 96 / 60;
    const baseStart = configStartMinutes;
    const top = (startMinutes - baseStart) * pxPerMin;
    const height = durationCurrent * pxPerMin;

    div.className = `absolute left-1 right-1 rounded-lg p-2 transition-all hover:z-10 border-l-4 shadow-lg`;

    const year = schedule.carga?.materia?.año_materia || 1;
    const colors = {
        1: 'bg-blue-500/20 border-blue-400',
        2: 'bg-eggplant/40 border-eggplant',
        3: 'bg-gold/20 border-gold'
    };
    div.classList.add(...(colors[year] || 'bg-primary/80 border-white/50').split(' '));

    div.style.top = `${top}px`;
    div.style.height = `${height}px`;

    div.innerHTML = `
        <p class="text-[9px] font-black text-white uppercase tracking-wider truncate mb-0.5">
            ${schedule.carga?.materia?.nombre || 'Materia'}
        </p>
        <div class="flex items-center justify-between">
             <p class="text-[9px] font-bold text-white bg-black/20 px-1.5 py-0.5 rounded">
                ${schedule.aula || 'Aula ?'}
            </p>
        </div>
        <p class="text-[8px] text-white/40 mt-1 font-mono">
            ${formatTime(schedule.hora_inicio)} - ${formatTime(schedule.hora_fin)}
        </p>
    `;

    return div;
}

function setupEventListeners() {
    const monthFilter = document.getElementById('teacher-schedule-month-filter');
    if (monthFilter) {
        // Set current month as default
        monthFilter.value = new Date().getMonth() + 1;
        monthFilter.addEventListener('change', filterAndRenderSchedules);
    }
}

// Helpers
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

window.initTeacherSchedule = initTeacherSchedule;
