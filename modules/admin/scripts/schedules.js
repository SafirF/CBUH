// ============================================
// schedules.js - Gestión de Horarios
// ============================================

import { supabase } from '../../../config/supabase-client.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

let allSchedules = [];
let allCargas = [];
let allPrelaciones = []; // Store prelation rules
let filteredSchedules = [];
let isInitialized = false;

// Variables de configuración de tiempo (Valores por defecto)
let configStartStr = '07:00';
let configEndStr = '16:00';
let configStartMinutes = 420; // 7 * 60
let configEndMinutes = 960;  // 16 * 60

// Inicializar módulo
export async function initSchedules() {
    if (isInitialized) return;
    console.log('[Schedules] Initializing schedules module');

    // Cargar config de tiempos PRIMERO
    await loadTimeConfig();

    // Cargar datos
    await Promise.all([
        loadCargas(),
        loadSchedules(),
        loadPrelaciones()
    ]);

    // Check Config
    const canEdit = await checkScheduleConfig();
    if (!canEdit) {
        disableScheduleEditing();
    }

    // Setup event listeners (conditional?)
    setupEventListeners(canEdit);

    isInitialized = true;
}

async function checkScheduleConfig() {
    try {
        const sedeId = window.adminContext?.sedeId;
        if (!sedeId) return true;

        const { data } = await supabase
            .from('configuraciones')
            .select('valor')
            .eq('sede_id', sedeId)
            .eq('clave', 'edicion_horarios_abierta')
            .single();

        if (data && data.valor === 'false') return false;
        return true;
    } catch (e) { return true; }
}

// Cargar configuración de tiempos desde Supabase
async function loadTimeConfig() {
    try {
        const sedeId = window.adminContext?.sedeId || 1;
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
    // Render grid
    renderTimeGrid();
}

function renderTimeGrid() {
    const timeCol = document.getElementById('grid-time-column');
    const headerCols = document.getElementById('grid-header-row');

    if (!timeCol) return; // Might need to add ID to HTML first

    // Calculate hours range
    const startHour = Math.floor(configStartMinutes / 60);
    const endHour = Math.floor(configEndMinutes / 60);

    let html = '';
    // Generate slots for each hour
    for (let h = startHour; h < endHour; h++) { // < endHour because e.g. 16:00 is the limit
        const timeLabel = `${h.toString().padStart(2, '0')}:00`;
        html += `
             <div class="h-24 border-b border-white/5 flex items-start justify-center pt-2 text-[10px] font-bold text-white/20">
                ${timeLabel}
            </div>
        `;
    }
    timeCol.innerHTML = html;
}

function disableScheduleEditing() {
    const btnNew = document.getElementById('btn-new-class');
    if (btnNew) {
        btnNew.disabled = true;
        btnNew.classList.add('opacity-50', 'cursor-not-allowed');
        btnNew.title = "La edición de horarios está cerrada por configuración.";
    }
}

// Cargar prelaciones
async function loadPrelaciones() {
    const { data } = await supabase.from('materias_prelaciones').select('*');
    allPrelaciones = data || [];
}

// Exponer función para lazy loading
window.loadSchedulesModule = async function () {
    if (!isInitialized) {
        await initSchedules();
    }
};

// Configurar event listeners
function setupEventListeners(canEdit = true) {
    // Botón Nueva Clase
    const btnNew = document.getElementById('btn-new-class');
    if (btnNew && canEdit) {
        btnNew.addEventListener('click', () => {
            resetEditor();
            openEditor();
        });
    }

    // Cerrar Editor
    const btnClose = document.getElementById('btn-close-editor');
    if (btnClose) {
        btnClose.addEventListener('click', closeEditor);
    }

    // Selector de Días
    document.querySelectorAll('.day-selector').forEach(btn => {
        btn.addEventListener('click', () => {
            selectDay(btn.dataset.day);
        });
    });

    // Filtros de Año
    document.querySelectorAll('.schedule-year-filter').forEach(chk => {
        chk.addEventListener('change', filterAndRenderSchedules);
    });

    // Filtro de Mes
    const monthFilter = document.getElementById('schedule-month-filter');
    if (monthFilter) {
        monthFilter.addEventListener('change', filterAndRenderSchedules);
    }

    // Formulario Guardar
    const form = document.getElementById('schedule-form');
    if (form) {
        form.addEventListener('submit', handleSaveSchedule);
    }

    // Selector de Materia (actualizar profesor)
    const selectCarga = document.getElementById('schedule-carga');
    if (selectCarga) {
        selectCarga.addEventListener('change', (e) => {
            updateTeacherInput(e.target.value);
        });
    }

    // Botón Eliminar
    const btnDelete = document.getElementById('btn-delete-schedule');
    if (btnDelete) {
        btnDelete.addEventListener('click', handleDeleteSchedule);
    }

    // Botón Imprimir
    const btnPrint = document.getElementById('btn-print-schedule');
    if (btnPrint) {
        btnPrint.addEventListener('click', handlePrintSchedule);
    }
}

// Actualizar input de profesor basado en la carga seleccionada
function updateTeacherInput(cargaId) {
    const teacherInput = document.getElementById('teacher-designed');
    if (!teacherInput) return;

    if (!cargaId) {
        teacherInput.value = '';
        teacherInput.placeholder = 'Seleccione una materia...';
        return;
    }

    const carga = allCargas.find(c => c.id == cargaId);
    if (carga && carga.docente) {
        teacherInput.value = `${carga.docente.nombres} ${carga.docente.apellidos}`;
    } else {
        teacherInput.value = 'Sin docente asignado';
    }
}

// Cargar cargas académicas (para el select)
async function loadCargas() {
    try {
        const { data, error } = await supabase
            .from('cargas_academicas')
            .select(`
                id,
                sede_id,
                materia:materias (
                    id,
                    nombre:nombre_materia,
                    codigo,
                    año_materia
                ),
                seccion:secciones (
                    nombre,
                    codigo
                ),
                docente:docentes (
                    id,
                    nombres,
                    apellidos
                )
            `)
            .eq('sede_id', window.adminContext?.sedeId);

        if (error) throw error;

        // Sort in memory by academic order (Year -> Code)
        allCargas = (data || []).sort((a, b) => {
            const yearA = a.materia?.año_materia || 0;
            const yearB = b.materia?.año_materia || 0;
            if (yearA !== yearB) return yearA - yearB;

            const codeA = a.materia?.codigo || '';
            const codeB = b.materia?.codigo || '';
            return codeA.localeCompare(codeB);
        });

        renderCargasDropdown();

    } catch (error) {
        console.error('[Schedules] Error loading cargas:', error);
    }
}

// Renderizar dropdown de cargas
function renderCargasDropdown() {
    const select = document.getElementById('schedule-carga');
    if (!select) return;

    select.innerHTML = '<option value="">Seleccionar materia...</option>';

    // Agrupar por año o simplemente listar
    console.log(allCargas)
    allCargas.forEach(carga => {
        if (!carga.materia) return;
        const option = document.createElement('option');
        option.value = carga.id;
        // Format: Materia - Año - Sección (Código)
        const secInfo = carga.seccion ? ` - ${carga.seccion.nombre} (${carga.seccion.codigo || 'S/C'})` : '';
        option.textContent = `${carga.materia.nombre} - ${carga.materia.año_materia}º Año${secInfo}`;
        select.appendChild(option);
    });
}

// Cargar horarios
async function loadSchedules() {
    const loading = document.getElementById('schedules-loading');
    try {
        if (loading) {
            loading.classList.remove('hidden');
            loading.classList.add('flex');
        }

        // Set period title (could be dynamic)
        const periodTitle = document.getElementById('schedule-period-title');
        if (periodTitle) periodTitle.textContent = "Periodo 2024-I";

        const { data, error } = await supabase
            .from('horarios')
            .select(`
                id,
                dia_semana,
                hora_inicio,
                hora_fin,
                aula,
                mes,
                carga_academica_id,
                sede_id,
                carga: cargas_academicas(
                    materia: materias(
                        id,
                        nombre:nombre_materia,
                        codigo,
                        año_materia
                    ),
                    seccion: secciones(
                        nombre,
                        codigo
                    ),
                    docente: docentes(
                        id,
                        nombres,
                        apellidos
                    )
                )
            `)
            .eq('sede_id', window.adminContext?.sedeId);

        if (error) throw error;

        allSchedules = data || [];
        filterAndRenderSchedules();

    } catch (error) {
        console.error('[Schedules] Error loading schedules:', error);
        showNotification('Error al cargar horarios', 'error');
    } finally {
        if (loading) {
            loading.classList.add('hidden');
            loading.classList.remove('flex');
        }
    }
}

// Filtrar y Renderizar
function filterAndRenderSchedules() {
    // Obtener año seleccionado
    const selectedRadio = document.querySelector('.schedule-year-filter:checked');
    const selectedYear = selectedRadio ? selectedRadio.dataset.year : 'all';

    // Obtener mes seleccionado
    const monthSelect = document.getElementById('schedule-month-filter');
    const selectedMonth = monthSelect ? monthSelect.value : 'all';

    filteredSchedules = allSchedules.filter(s => {
        // Year filter
        if (selectedYear !== 'all') {
            const year = s.carga?.materia?.año_materia;
            if (year != selectedYear) return false;
        }

        // Month filter
        if (selectedMonth !== 'all') {
            const mes = s.mes;
            if (!mes || mes != selectedMonth) return false;
        }

        return true;
    });

    renderCalendar();
}

// Renderizar Calendario
function renderCalendar() {
    // Limpiar columnas
    for (let i = 1; i <= 7; i++) {
        const col = document.getElementById(`schedule-day-${i}`);
        if (col) col.innerHTML = '';
    }

    // Crear bloques
    filteredSchedules.forEach(schedule => {
        const col = document.getElementById(`schedule-day-${schedule.dia_semana}`);
        if (!col) return;

        const block = createScheduleBlock(schedule);
        col.appendChild(block);
    });
}

// Crear bloque de horario
function createScheduleBlock(schedule) {
    const div = document.createElement('div');
    const startMinutes = timeToMinutes(schedule.hora_inicio);
    const endMinutes = timeToMinutes(schedule.hora_fin);
    const durationCurrent = endMinutes - startMinutes;

    // Grid empieza a las 7:00 AM (420 min)
    // 1 hora = 96px (height-24 * 4 quarters)
    // 96px / 60min = 1.6 px/min.

    const pxPerMin = 96 / 60;

    // Usar la configuración cargada
    const baseStart = configStartMinutes;

    // Si la clase empieza antes del inicio de jornada, se corta visualmente (o validación previa lo impide)
    // Pero calculamos relativo al inicio configurado
    const top = (startMinutes - baseStart) * pxPerMin;
    const height = durationCurrent * pxPerMin;

    div.className = `absolute left-1 right-1 rounded-lg p-2 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg hover:z-10 group border-l-4`;

    // Assign colors based on year or random logic
    const year = schedule.carga?.materia?.año_materia || 1;
    const hasTeacher = !!schedule.carga?.docente;

    const colors = {
        1: 'bg-blue-500/20 border-blue-400 hover:bg-blue-500/30',
        2: 'bg-eggplant/40 border-eggplant hover:bg-eggplant/60',
        3: 'bg-gold/20 border-gold hover:bg-gold/30'
    };

    // Orange for "Sin docente assigned"
    let colorClass = colors[year] || 'bg-primary/80 border-white/50';

    if (!hasTeacher) {
        colorClass = 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30';
    }

    div.classList.add(...colorClass.split(' '));

    div.style.top = `${top}px`;
    div.style.height = `${height}px`;

    div.innerHTML = `
        <p class="text-[9px] font-black text-white uppercase tracking-wider truncate mb-0.5">
            ${schedule.carga?.materia?.nombre || 'Materia'} <span class="text-gold opacity-80 text-[8px] ml-1">${schedule.carga?.seccion?.nombre || '(S/C)'}</span>
        </p>
        <div class="flex items-center justify-between">
             <p class="text-[9px] text-white/60 font-medium leading-tight truncate">
                ${schedule.carga?.docente?.nombres.split(' ')[0] || ''}
            </p>
             <p class="text-[9px] font-bold text-white bg-black/20 px-1.5 py-0.5 rounded">
                ${schedule.aula || 'Aula ?'}
            </p>
        </div>
        <p class="text-[8px] text-white/40 mt-1 font-mono">
            ${formatTime(schedule.hora_inicio)} - ${formatTime(schedule.hora_fin)}
        </p>
    `;

    div.addEventListener('click', (e) => {
        e.stopPropagation();
        editSchedule(schedule);
    });

    return div;
}

// Convertir hora HH:MM:SS a minutos
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// Formatear hora
function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hours = parseInt(h);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${m} ${ampm} `;
}

// ---- Editor Logic ----

function openEditor() {
    const editor = document.getElementById('schedule-editor');
    if (editor) {
        editor.classList.remove('translate-x-full');
    }
}

function closeEditor() {
    const editor = document.getElementById('schedule-editor');
    if (editor) {
        editor.classList.add('translate-x-full');
    }
    resetEditor();
}

function resetEditor() {
    const form = document.getElementById('schedule-form');
    if (form) form.reset();

    document.getElementById('schedule-id').value = '';
    document.getElementById('schedule-day').value = '';

    // Reset Month to currently selected filter if possible, else 1
    const currentFilter = document.getElementById('schedule-month-filter');
    const formMonth = document.getElementById('schedule-month');
    if (currentFilter && formMonth && currentFilter.value !== 'all') {
        formMonth.value = currentFilter.value;
    } else if (formMonth) {
        formMonth.value = '1';
    }

    document.getElementById('editor-mode-text').textContent = 'Nueva Asignación';
    document.getElementById('btn-delete-schedule').classList.add('hidden');

    // Reset day buttons
    document.querySelectorAll('.day-selector').forEach(btn => {
        btn.classList.remove('bg-gold', 'text-primary-dark');
        btn.classList.add('text-white/40');
    });

    updateTeacherInput('');
}

function selectDay(day) {
    document.getElementById('schedule-day').value = day;
    document.querySelectorAll('.day-selector').forEach(btn => {
        if (btn.dataset.day === day) {
            btn.classList.add('bg-gold', 'text-primary-dark');
            btn.classList.remove('text-white/40');
        } else {
            btn.classList.remove('bg-gold', 'text-primary-dark');
            btn.classList.add('text-white/40');
        }
    });
}

function editSchedule(schedule) {
    resetEditor();

    document.getElementById('schedule-id').value = schedule.id;
    // Map column name (carga_academica_id) to input (schedule-carga which is carga_id in HTML)
    document.getElementById('schedule-carga').value = schedule.carga_academica_id;
    document.getElementById('schedule-start').value = schedule.hora_inicio;
    document.getElementById('schedule-end').value = schedule.hora_fin;
    document.getElementById('schedule-aula').value = schedule.aula;

    const monthSelect = document.getElementById('schedule-month');
    if (monthSelect) monthSelect.value = schedule.mes || '1';

    document.getElementById('editor-mode-text').textContent = 'Editando Clase';
    document.getElementById('btn-delete-schedule').classList.remove('hidden');

    selectDay(schedule.dia_semana.toString());
    updateTeacherInput(schedule.carga_academica_id);

    // Auto-open panel
    openEditor();
}

async function handleSaveSchedule(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-schedule');
    btn.disabled = true;

    try {
        const formData = new FormData(e.target);
        const id = formData.get('id');
        const rawCargaId = formData.get('carga_id');
        const rawDia = formData.get('dia_semana');
        const rawMes = formData.get('mes');

        // Map and ensure numeric types for integer columns
        const scheduleData = {
            carga_academica_id: rawCargaId ? parseInt(rawCargaId) : null,
            dia_semana: rawDia ? parseInt(rawDia) : null,
            hora_inicio: formData.get('hora_inicio'),
            hora_fin: formData.get('hora_fin'),
            aula: formData.get('aula'),
            mes: rawMes ? parseInt(rawMes) : null
        };

        // --- VALIDATIONS ---
        const cargaId = scheduleData.carga_academica_id;
        const newStart = timeToMinutes(scheduleData.hora_inicio);
        const newEnd = timeToMinutes(scheduleData.hora_fin);
        const newDay = Number(scheduleData.dia_semana);
        const newAula = scheduleData.aula?.trim().toLowerCase();
        const newMes = Number(scheduleData.mes);

        // 1. Validar campos obligatorios
        if (!scheduleData.carga_academica_id || !scheduleData.dia_semana || !scheduleData.mes || !scheduleData.aula?.trim()) {
            showNotification('Por favor, completa todos los campos obligatorios: Materia, Mes, Día y AULA/UBICACIÓN.', 'error');
            btn.disabled = false;
            return;
        }

        // 2. Validar coherencia de horas
        if (newEnd <= newStart) {
            showNotification('La hora fin debe ser mayor a la hora inicio', 'error');
            btn.disabled = false;
            return;
        }

        // 3. Validar rango permitido por sede
        if (newStart < configStartMinutes || newEnd > configEndMinutes) {
            showNotification(`El horario debe estar dentro de la jornada configurada (${configStartStr} - ${configEndStr})`, 'error');
            btn.disabled = false;
            return;
        }

        // Get teacher from selected carga
        const selectedCarga = allCargas.find(c => c.id == cargaId);
        const teacherId = selectedCarga?.docente?.id;

        // Check for conflicts against ALL schedules (not just filtered ones)
        for (const existing of allSchedules) {
            // Skip self if updating
            if (id && existing.id == id) continue;

            // Check Month overlap
            // If modular, we only conflict if in same month
            const exMes = Number(existing.mes);
            if (exMes && newMes && exMes !== newMes) continue;

            // Check Day
            if (existing.dia_semana != newDay) continue;

            const exStart = timeToMinutes(existing.hora_inicio);
            const exEnd = timeToMinutes(existing.hora_fin);

            // Check Time Overlap using standard interval overlap logic
            // (StartA < EndB) and (EndA > StartB)
            if (newStart < exEnd && newEnd > exStart) {

                // 1. Teacher Conflict (only if teacher assigned)
                const exTeacherId = existing.carga?.docente?.id;
                if (teacherId && exTeacherId && teacherId === exTeacherId) {
                    const teacherName = existing.carga.docente.nombres.split(' ')[0] + ' ' + existing.carga.docente.apellidos.split(' ')[0];
                    const conflictMateria = existing.carga.materia.nombre;
                    showNotification(`Conflicto: El docente ${teacherName} ya tiene clase a esa hora en ese mes(${conflictMateria})`, 'error');
                    return;
                }

                // 2. Classroom Conflict (only if Aula is specified for both)
                if (newAula && existing.aula) {
                    const exAula = existing.aula.trim().toLowerCase();
                    if (newAula === exAula) {
                        const conflictMateria = existing.carga.materia.nombre;
                        showNotification(`Conflicto: El aula ${existing.aula} ya está ocupada por ${conflictMateria} `, 'error');
                        return;
                    }
                }
            }
        }

        // --- PRELATION VALIDATION (Sequential Month Check) ---
        // Verify that prerequisites are scheduled in strictly PREVIOUS months

        // 1. Identify current subject
        const currentMateriaId = selectedCarga?.materia?.id;
        if (currentMateriaId && allPrelaciones.length > 0) {

            // 2. Find prerequisites for this subject
            const prerequisites = allPrelaciones
                .filter(p => p.materia_id === currentMateriaId)
                .map(p => p.prelacion_id); // IDs of required subjects (fixed from prelacion_materia_id)

            if (prerequisites.length > 0) {
                // 3. Check each prerequisite
                for (const prereqId of prerequisites) {
                    // Find if/when this prereq is scheduled
                    const scheduledPrereq = allSchedules.find(s => s.carga?.materia?.id === prereqId);

                    if (scheduledPrereq) {
                        const prereqMes = Number(scheduledPrereq.mes);

                        // Rule: Current Month MUST be GREATER than Prerequisite Month
                        if (newMes <= prereqMes) {
                            const prereqName = scheduledPrereq.carga?.materia?.nombre || 'Materia Previa';
                            const mesName = document.querySelector(`#schedule-month option[value="${prereqMes}"]`)?.text || prereqMes;

                            showNotification(`Error de Prelación: "${selectedCarga.materia.nombre}" requiere aprobar "${prereqName}". "${prereqName}" está programada en ${mesName}, por lo que esta materia debe ser en un mes posterior.`, 'error');
                            return;
                        }
                    } else {
                        // BLOQUEO: Pre-requisito no programado
                        const { data: prereqObj } = await supabase.from('materias').select('nombre:nombre_materia').eq('id', prereqId).single();
                        const prereqName = prereqObj?.nombre || `ID: ${prereqId} `;

                        showNotification(`BLOQUEO DE PRELACIÓN: No puedes programar "${selectedCarga.materia.nombre}" porque su pre - requisito "${prereqName}" aún no ha sido asignado a un mes en el horario.`, 'error');
                        return;
                    }
                }
            }
        }


        if (id) {
            // Update
            const { error } = await supabase
                .from('horarios')
                .update(scheduleData)
                .eq('id', id);
            if (error) throw error;
        } else {
            // Insert
            const { error } = await supabase
                .from('horarios')
                .insert(scheduleData);
            if (error) throw error;
        }

        showNotification('Horario guardado correctamente', 'success');
        resetEditor();
        await loadSchedules();

    } catch (error) {
        console.error('[Schedules] Error saving:', error);
        showNotification('Error al guardar horario', 'error');
    } finally {
        btn.disabled = false;
    }
}

async function handleDeleteSchedule() {
    const id = document.getElementById('schedule-id').value;
    if (!id) return;

    const confirmed = await NotificationSystem.confirm(
        'Eliminar Clase',
        '¿Estás seguro de eliminar esta clase del horario? Esta acción no se puede deshacer.',
        { confirmText: 'Eliminar Clase', type: 'danger' }
    );
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('horarios')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showNotification('Horario eliminado', 'success');
        resetEditor();
        await loadSchedules();

    } catch (error) {
        console.error('[Schedules] Error deleting:', error);
        showNotification('Error al eliminar horario', 'error');
    }
}

// --- Print Logic ---
async function handlePrintSchedule() {
    if (filteredSchedules.length === 0) {
        showNotification('No hay clases programadas para imprimir con los filtros actuales', 'warning');
        return;
    }

    try {
        const sedeId = window.adminContext?.sedeId;

        // Fetch Configs
        const { data: configs } = await supabase
            .from('configuraciones')
            .select('*')
            .eq('sede_id', sedeId)
            .in('clave', ['logo_url_sede', 'nombre_sede']);

        let logoUrl = null;
        let institutionName = 'COLEGIO BÍBLICO UNIVERSAL HOREB';

        if (configs) {
            const map = {};
            configs.forEach(c => map[c.clave] = c.valor);
            if (map['logo_url_sede']) logoUrl = map['logo_url_sede'];
            if (map['nombre_sede']) institutionName = map['nombre_sede'].toUpperCase();
        }

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const selectedYear = document.querySelector('.schedule-year-filter:checked')?.dataset.year || 'all';
        const monthSelect = document.getElementById('schedule-month-filter');
        const monthName = monthSelect?.options[monthSelect.selectedIndex]?.text || 'Todos';
        const yearText = selectedYear === 'all' ? 'Todos los Años' : `${selectedYear}º Año`;

        // -- Header Design --
        doc.setFillColor(20, 20, 20); // Dark background
        doc.rect(0, 0, 297, 40, 'F');

        // Logo
        if (logoUrl) {
            try {
                // Fetch image to get base64/blob
                // jsPDF needs base64 or HTMLImageElement
                // Simplest: Create hidden image element or fetch blob
                /* NOTE: Fetching external image might fail if CORS is not set on Storage bucket.
                   Assuming standard Supabase Storage setup allows GET. */
                const img = new Image();
                img.src = logoUrl;
                // Sync wait for loading is tricky in pure JS without promise wrapper, but doc.addImage handles URLs if CORS allows, 
                // however, standard jsPDF in browser often needs Base64.
                // Let's try adding it via the addImage URL support (might require specific jsPDF plugins).
                // Safest fallback: no logo if complex.
                // Better: Use a simple fetch and convert to base64 helper.
                // For now, let's try direct URL which modern jsPDF supports if CORS is OK.
                doc.addImage(logoUrl, 'PNG', 15, 5, 30, 30);
            } catch (e) {
                console.warn('Could not add logo to PDF', e);
            }
        }

        doc.setTextColor(201, 169, 97); // Gold
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('HORARIO ACADÉMICO', logoUrl ? 50 : 15, 20);

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(institutionName, logoUrl ? 50 : 15, 28);
        doc.text(`${yearText} | Mes: ${monthName} | Generado: ${new Date().toLocaleDateString()} `, logoUrl ? 50 : 15, 33);

        // -- Table Logic --
        const daysMap = {
            1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo'
        };

        // Group and sort schedules
        const sortedSchedules = [...filteredSchedules].sort((a, b) => {
            if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
            return timeToMinutes(a.hora_inicio) - timeToMinutes(b.hora_inicio);
        });

        const tableBody = sortedSchedules.map(s => [
            daysMap[s.dia_semana] || 'Desconocido',
            `${formatTime(s.hora_inicio)} - ${formatTime(s.hora_fin)} `,
            s.carga?.materia?.nombre || 'Materia',
            s.carga?.materia?.codigo || '-',
            s.carga?.docente ? `${s.carga.docente.nombres} ${s.carga.docente.apellidos} ` : 'SIN DOCENTE',
            s.aula || '-'
        ]);

        autoTable(doc, {
            startY: 45,
            head: [['Día', 'Horario', 'Materia', 'Código', 'Docente', 'Aula']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [201, 169, 97],
                textColor: [20, 20, 20],
                fontStyle: 'bold',
                halign: 'center'
            },
            styles: {
                fontSize: 9,
                cellPadding: 3
            },
            columnStyles: {
                0: { fontStyle: 'bold', width: 25 },
                1: { halign: 'center', width: 40 },
                2: { fontStyle: 'bold' },
                5: { halign: 'center', width: 20 }
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            }
        });

        // Save
        const fileName = `Horario_${yearText.replace(' ', '_')}_${monthName}.pdf`;
        doc.save(fileName);
        showNotification('Horario descargado correctamente', 'success');

    } catch (error) {
        console.error('[Schedules] Error generating PDF:', error);
        showNotification('Error al generar el PDF', 'error');
    }
}

// Notification Helper
function showNotification(msg, type) {
    if (window.NotificationSystem) {
        NotificationSystem.show(msg, type);
    } else {
        console.log(`[Notification] ${type}: ${msg}`);
    }
}
