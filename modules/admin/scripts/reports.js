
import { supabase } from '../../../config/supabase-client.js';
import { store } from '../../../config/app-store.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const reportConfig = {
    institutionName: 'Colegio Bíblico Universal Horeb',
    logoUrl: null,
    address: 'CON SEDE EN EL SECTOR VISTA ALEGRE, CALLE COLOMBIA, Nº 27 PARROQUIA AGUAS CALIENTE MUNICIPIO DIEGO IBARRA, MARIARA EDO CARABOBO.',
    logoBase64: null,
    country: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
    legalRegistry: 'REGISTRADO EN EL MINISTERIO DE JUSTICIA EN LA DIRECCIÓN DE CULTO BAJO Nº 1.234 Y EN LA OFICINA SUBALTERNA DE REGISTRO PÚBLICO DEL DISTRITO GUACARA DEL ESTADO CARABOBO BAJO NÚMERO 6. PROTOCOLO 1º. TOMO 15. FOLIOS 17 AL 19. RIF J-50091290-0.'
};

export async function initReports() {
    console.log('[Reports] Module Initialized');
    window.generatePDF = generatePDF;
    window.openReportModal = openReportModal;

    // Pre-fetch Report Configs
    try {
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId || window.teacherContext?.sedeId;
        if (sedeId) {
            const { data: configs } = await supabase
                .from('configuraciones')
                .select('*')
                .eq('sede_id', sedeId)
                .in('clave', ['logo_url_sede', 'nombre_sede', 'direccion_sede', 'pais_sede', 'registro_legal_sede']);

            if (configs) {
                for (const c of configs) {
                    if (c.clave === 'logo_url_sede') {
                        reportConfig.logoUrl = c.valor;
                        reportConfig.logoBase64 = await getBase64FromUrl(c.valor).catch(() => null);
                    }
                    if (c.clave === 'nombre_sede') reportConfig.institutionName = c.valor.toUpperCase();
                    if (c.clave === 'direccion_sede') reportConfig.address = c.valor.toUpperCase();
                    if (c.clave === 'pais_sede') reportConfig.country = c.valor.toUpperCase();
                    if (c.clave === 'registro_legal_sede') reportConfig.legalRegistry = c.valor.toUpperCase();
                }
            }
        }
        // Load Stats
        await loadReportStats();
    } catch (e) {
        console.warn('Error loading report configs/stats:', e);
    }
}

async function getBase64FromUrl(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('[Reports] Could not load logo as base64:', e);
        return null;
    }
}

async function loadReportStats() {
    try {
        // 1. New Students (Total Active)
        const { count: studentCount, error: stError } = await supabase
            .from('estudiantes')
            .select('*', { count: 'exact', head: true });

        if (!stError) {
            const el = document.getElementById('stat-new-students');
            if (el) el.innerText = studentCount || 0;
        }

        // 2. Approval Rate (Based on calificaciones)
        const { data: grades, error: gError } = await supabase
            .from('calificaciones')
            .select('nota_final');

        if (!gError && grades && grades.length > 0) {
            const total = grades.length;
            const approved = grades.filter(g => {
                // Handle text grades if any, defaulting to number check
                const val = Number(g.nota_final);
                return !isNaN(val) && val >= 10;
            }).length;

            const rate = ((approved / total) * 100).toFixed(1);

            const rateEl = document.getElementById('stat-approval-rate');
            const barEl = document.getElementById('stat-approval-bar');

            if (rateEl) rateEl.innerText = `${rate}%`;
            if (barEl) barEl.style.width = `${rate}%`;
        } else {
            const rateEl = document.getElementById('stat-approval-rate');
            if (rateEl) rateEl.innerText = `0%`;
        }

        // 3. Distribution Per Year (Donut Chart) & Enrollment History (Line Chart)
        const { data: allStudents, error: distError } = await supabase
            .from('estudiantes')
            .select('año_actual, creado_el, estado_id');

        if (distError) {
            console.error('[Reports] Error loading charts data:', distError);
        }

        if (!distError && allStudents) {
            const total = allStudents.length;
            const totalEl = document.getElementById('stat-dist-total');
            if (totalEl) totalEl.innerText = total;

            if (total > 0) {
                // Donut
                const y1 = allStudents.filter(s => s.año_actual == 1).length;
                const y2 = allStudents.filter(s => s.año_actual == 2).length;
                const y3 = allStudents.filter(s => s.año_actual == 3).length;
                updateDonutChart(total, y1, y2, y3);

                // Enrollment History (Dynamic 5-year range ending in Current Year)
                const currentYear = new Date().getFullYear();
                const years = [];
                for (let i = 4; i >= 0; i--) years.push(currentYear - i);

                // Update subtitle
                const subtitle = document.getElementById('enrollment-period-subtitle');
                if (subtitle) subtitle.innerText = `Histórico ${years[0]} - ${years[4]}`;

                const yearlyCounts = {};
                years.forEach(y => yearlyCounts[y] = 0);

                allStudents.forEach(s => {
                    if (s.creado_el) {
                        const yr = new Date(s.creado_el).getFullYear();
                        if (yearlyCounts.hasOwnProperty(yr)) yearlyCounts[yr]++;
                    }
                });
                updateEnrollmentChart(years, yearlyCounts);

                // 4. Dropout Rate (Deserción) - Dynamic based on "Retirado" status (3)
                const withdrawn = allStudents.filter(s => s.estado_id == 3).length;
                const dropoutRate = ((withdrawn / total) * 100).toFixed(1);

                const dropoutEl = document.getElementById('stat-dropout-rate');
                const dropoutBarEl = document.getElementById('stat-dropout-bar');

                if (dropoutEl) dropoutEl.innerText = `${dropoutRate}%`;
                if (dropoutBarEl) dropoutBarEl.style.width = `${dropoutRate}%`;
            }
        }

    } catch (e) {
        console.error('[Reports] Error loading stats:', e);
    }
}

function updateEnrollmentChart(years, counts) {
    const data = years.map(y => counts[y] || 0);
    const max = Math.max(...data, 10); // Scale reference

    // SVG ViewBox is 400x200
    const width = 400;
    const chartHeight = 160; // Internal height for the line
    const xStep = width / (years.length - 1);
    const bottomPadding = 20;

    // Draw Path
    let pathD = `M 0,${(chartHeight + bottomPadding) - (data[0] / max) * chartHeight}`;

    for (let i = 1; i < data.length; i++) {
        const x = i * xStep;
        const y = (chartHeight + bottomPadding) - (data[i] / max) * chartHeight;
        pathD += ` L ${x},${y}`;
    }

    const path = document.querySelector('#enrollment-path');
    const area = document.querySelector('#enrollment-area');

    if (path) path.setAttribute('d', pathD);
    if (area) {
        const areaD = `${pathD} V 200 H 0 Z`;
        area.setAttribute('d', areaD);
    }

    // Update Labels
    const labelsContainer = document.getElementById('enrollment-years-labels');
    if (labelsContainer) {
        labelsContainer.innerHTML = years.map(y => `<span>${y}</span>`).join('');
    }
}

function updateDonutChart(total, y1, y2, y3) {
    const p1 = (y1 / total) * 100;
    const p2 = (y2 / total) * 100;
    const p3 = (y3 / total) * 100;

    // Update Text
    const el1 = document.getElementById('stat-dist-1-val');
    const el2 = document.getElementById('stat-dist-2-val');
    const el3 = document.getElementById('stat-dist-3-val');

    if (el1) el1.innerText = `${p1.toFixed(1)}%`;
    if (el2) el2.innerText = `${p2.toFixed(1)}%`;
    if (el3) el3.innerText = `${p3.toFixed(1)}%`;

    // Update SVG Circles (Circumference ~ 251.2 for r=40)
    const C = 251.2;

    // Year 1 (Gold) - Starts at 0
    const dash1 = (p1 / 100) * C;
    const c1 = document.getElementById('donut-year-1');
    if (c1) {
        c1.style.strokeDasharray = `${dash1} ${C}`;
        c1.style.strokeDashoffset = 0;
    }

    // Year 2 (Dark Gold) - Starts after Year 1
    const dash2 = (p2 / 100) * C;
    const offset2 = -dash1; // Negative because SVG coords
    const c2 = document.getElementById('donut-year-2');
    if (c2) {
        c2.style.strokeDasharray = `${dash2} ${C}`;
        c2.style.strokeDashoffset = offset2;
    }

    // Year 3 (Red) - Starts after Year 1 + Year 2
    const dash3 = (p3 / 100) * C;
    const offset3 = -(dash1 + dash2);
    const c3 = document.getElementById('donut-year-3');
    if (c3) {
        c3.style.strokeDasharray = `${dash3} ${C}`;
        c3.style.strokeDashoffset = offset3;
    }
}

// Open Config Modal for parametric reports
async function openReportModal(type) {
    const modalId = `reportModal_${type}`;
    let modal = document.getElementById(modalId);

    // Remove existing if any (to reset state easier)
    if (modal) modal.remove();

    // Create container
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm';

    let contentHtml = '';
    let title = '';

    if (type === 'students') {
        title = 'Nómina Estudiantil';
        contentHtml = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">Año Académico</label>
                    <select id="report_year_select" class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-gold/50">
                        <option value="all">Todos los años</option>
                        <option value="1">1er Año</option>
                        <option value="2">2do Año</option>
                        <option value="3">3er Año</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">Estado</label>
                    <select id="report_status_select" class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-gold/50">
                        <option value="1">Activos</option>
                        <option value="all">Todos</option>
                    </select>
                </div>
            </div>
        `;
    } else if (type === 'grades_student') {
        title = 'Boletín de Notas';
        contentHtml = `
            <div class="space-y-4">
                 <div>
                    <label class="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">Buscar Estudiante</label>
                    <div class="relative">
                        <input id="report_student_search" type="text" placeholder="Nombre o Cédula..." 
                            oninput="searchStudentsForReport(this.value)"
                            class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-gold/50 placeholder:text-white/20">
                        
                        <!-- Search Results Dropdown -->
                        <div id="report_student_results" class="hidden absolute top-full left-0 right-0 bg-primary-dark border border-white/10 rounded-xl mt-2 max-h-48 overflow-y-auto z-50 shadow-2xl">
                            <!-- Results will be injected here -->
                        </div>
                    </div>
                </div>
                <div id="selected_student_indicator" class="hidden bg-gold/10 border border-gold/20 p-3 rounded-xl flex items-center justify-between">
                    <div>
                        <p id="selected_student_name" class="text-xs font-black text-gold uppercase"></p>
                        <p id="selected_student_cedula" class="text-[10px] text-white/40"></p>
                    </div>
                    <button onclick="clearSelectedStudent()" class="text-white/40 hover:text-white">
                        <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                    <input type="hidden" id="report_student_id">
                </div>
            </div>
        `;
        setTimeout(() => {
            window.searchStudentsForReport = searchStudentsForReport;
            window.selectStudentForReport = selectStudentForReport;
            window.clearSelectedStudent = clearSelectedStudent;
        }, 100);
    } else if (type === 'grades_subject') {
        title = 'Acta de Evaluación';
        // Need to fetch subjects first? We can do a quick fetch inside the generator, 
        // but for UI, let's load them or just ask for ID/Code? 
        // Better: Dropdown of subjects.

        // Fetch subjects on open
        contentHtml = `
             <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">Año/Nivel</label>
                     <select id="report_subject_year" onchange="loadSubjectsForReport(this.value)" class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-gold/50 mb-4">
                        <option value="" disabled selected>Seleccione año...</option>
                        <option value="1">1er Año</option>
                        <option value="2">2do Año</option>
                        <option value="3">3er Año</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">Materia</label>
                    <select id="report_subject_select" disabled class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-gold/50 disabled:opacity-50">
                        <option value="">Seleccione año primero...</option>
                    </select>
                </div>
            </div>
        `;
        // Trigger subject loading logic after render?
        setTimeout(() => window.loadSubjectsForReport = loadSubjectsForReport, 100);
    }

    modal.innerHTML = `
        <div class="bg-primary-dark border border-white/10 w-full max-w-md p-6 rounded-3xl shadow-2xl transform transition-all scale-100 relative">
            <button onclick="document.getElementById('${modalId}').remove()" class="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
            
            <h3 class="text-xl font-black text-white uppercase tracking-tight mb-1">${title}</h3>
            <p class="text-xs text-white/40 mb-6 font-medium">Configure los parámetros del reporte</p>

            ${contentHtml}

            <div class="mt-8 flex gap-3">
                <button onclick="document.getElementById('${modalId}').remove()" class="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors">
                    Cancelar
                </button>
                <button onclick="handleGenerateReport('${type}')" class="flex-1 px-4 py-3 rounded-xl bg-gold text-primary-dark font-black uppercase tracking-wider hover:brightness-110 transition-all shadow-lg shadow-gold/20">
                    Generar PDF
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Student Search within Modal
async function searchStudentsForReport(query) {
    const resultsContainer = document.getElementById('report_student_results');
    if (!query || query.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }

    try {
        const { data: students, error } = await supabase
            .from('estudiantes')
            .select('id, nombres, apellidos, cedula')
            .or(`nombres.ilike.%${query}%,apellidos.ilike.%${query}%,cedula.ilike.%${query}%`)
            .limit(5);

        if (error || !students || students.length === 0) {
            resultsContainer.innerHTML = '<div class="p-4 text-xs text-white/40 italic">No se encontraron resultados</div>';
        } else {
            resultsContainer.innerHTML = students.map(s => `
                <div onclick="selectStudentForReport('${s.id}', '${s.nombres} ${s.apellidos}', '${s.cedula}')" 
                     class="p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors">
                    <p class="text-xs font-bold text-white">${s.nombres} ${s.apellidos}</p>
                    <p class="text-[10px] text-white/40">${s.cedula}</p>
                </div>
            `).join('');
        }
        resultsContainer.classList.remove('hidden');
    } catch (e) {
        console.error(e);
    }
}

function selectStudentForReport(id, name, cedula) {
    document.getElementById('report_student_id').value = id;
    document.getElementById('selected_student_name').innerText = name;
    document.getElementById('selected_student_cedula').innerText = cedula;

    document.getElementById('selected_student_indicator').classList.remove('hidden');
    document.getElementById('report_student_results').classList.add('hidden');
    document.getElementById('report_student_search').value = '';
}

function clearSelectedStudent() {
    document.getElementById('report_student_id').value = '';
    document.getElementById('selected_student_indicator').classList.add('hidden');
}

// Helper to load subjects (Active Loads) for dropdown
window.loadSubjectsForReport = async function (year) {
    const select = document.getElementById('report_subject_select');
    select.innerHTML = '<option>Cargando...</option>';
    select.disabled = true;

    try {
        // Fetch active loads for the selected year
        // We only show loads from the ACTIVE period to print current Actas
        const { data: loads, error } = await supabase
            .from('cargas_academicas')
            .select(`
                id,
                materia:materias!inner(nombre:nombre_materia, año_materia),
                docente:docentes(nombres, apellidos),
                seccion:secciones(nombre, codigo),
                periodo:periodos_academicos!inner(id, estado_id)
            `)
            .eq('materia.año_materia', year)
            .eq('periodo.estado_id', 1) // Only active period
            .eq('estado_id', 1); // Only active loads

        if (error) throw error;

        select.innerHTML = '';
        if (loads && loads.length > 0) {
            loads.forEach(load => {
                const opt = document.createElement('option');
                opt.value = load.id; // We use Carga ID, not Materia ID
                const docName = load.docente ? `${load.docente.nombres} ${load.docente.apellidos}` : 'Sin Docente';
                opt.innerText = `${load.materia.nombre} - ${docName} - Sec. ${load.seccion?.codigo}`;
                select.appendChild(opt);
            });
            select.disabled = false;
        } else {
            select.innerHTML = '<option>No hay materias activas</option>';
        }

    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error al cargar</option>';
    }
}

window.handleGenerateReport = async function (type) {
    // Collect params based on type
    const modalId = `reportModal_${type}`;
    let params = {};

    if (type === 'students') {
        params.year = document.getElementById('report_year_select').value;
        params.status = document.getElementById('report_status_select').value;
    } else if (type === 'grades_student') {
        const studentId = document.getElementById('report_student_id').value;
        const manualCedula = document.getElementById('report_student_search').value;

        if (studentId) {
            params.studentId = studentId;
        } else if (manualCedula) {
            params.cedula = manualCedula.trim();
        } else {
            return alert('Seleccione un estudiante o ingrese una cédula');
        }
    } else if (type === 'grades_subject') {
        params.subjectId = document.getElementById('report_subject_select').value;
        if (!params.subjectId) return alert('Seleccione una materia');
    }

    // Close modal
    document.getElementById(modalId).remove();

    // Generate
    if (window.NotificationSystem) NotificationSystem.show('Generando reporte...', 'info');
    await generatePDF(type, params);
}


// Core Generator
export async function generatePDF(type, params = {}) {
    try {
        // Refresh config to ensure latest logo/text
        await initReports();

        let doc;
        // The Student Bulletin has a very specific full-page design, 
        // unlike the other list reports that use the standard simple header.
        if (type === 'grades_student' || type === 'students' || type === 'teachers' || type === 'grades_subject' || type === 'subject_roster') {
            doc = new jsPDF();
        } else {
            doc = getBasePDF();
        }

        if (type === 'teachers') {
            await generateTeachersReport(doc);
        } else if (type === 'students') {
            await generateStudentsReport(doc, params);
        } else if (type === 'grades_student') {
            await generateStudentBoletin(doc, params);
        } else if (type === 'grades_subject') {
            await generateSubjectGradesReport(doc, params);
        } else if (type === 'subject_roster') {
            await generateSubjectRosterReport(doc, params);
        }

        // Save
        doc.save(`reporte_${type}_${Date.now()}.pdf`);
        if (window.NotificationSystem) NotificationSystem.show('Reporte descargado exitosamente', 'success');

    } catch (e) {
        console.error(e);
        if (window.NotificationSystem) NotificationSystem.show('Error al generar PDF: ' + e.message, 'error');
    }
}

// ... Report Generators Implementation ...

async function generateTeachersReport(doc) {
    const title = 'DIRECTORIO DOCENTE';

    // 1. Header & Logos
    drawBoletinHeader(doc);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 105, 55, { align: 'center' });

    // 2. Fetch Data
    const { data: teachers, error } = await supabase
        .from('docentes')
        .select('*, usuario:usuarios(correo)');

    if (error) throw error;

    const tableData = teachers.map(t => [
        t.cedula,
        `${t.apellidos}, ${t.nombres}`.toUpperCase(),
        t.especialidad || 'DOCENTE',
        t.telefono || 'N/A',
        t.usuario?.correo || 'N/A'
    ]);

    // Summary Text
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`TOTAL DOCENTES: ${teachers.length}`, 14, 62);

    autoTable(doc, {
        startY: 65,
        head: [['Cédula', 'Docente', 'Especialidad', 'Teléfono', 'Correo Electrónico']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.1
        },
        styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.1
        },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 55 },
            2: { cellWidth: 35 },
            3: { cellWidth: 30 },
            4: { cellWidth: 41 }
        }
    });

    // Watermark & Footer
    drawBoletinWatermark(doc);
    drawBoletinFooter(doc);
}

async function generateStudentsReport(doc, params) {
    let title = 'NÓMINA DE ESTUDIANTES';
    if (params.year !== 'all') title += ` - ${params.year}º AÑO`;

    // 1. Header & Logos
    drawBoletinHeader(doc);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 105, 55, { align: 'center' });

    // 2. Fetch Data
    let query = supabase
        .from('estudiantes')
        .select('*, usuario:usuarios(correo)');

    if (params.year !== 'all') query = query.eq('año_actual', params.year);
    if (params.status === '1') query = query.eq('estado_id', 1);

    const { data: students, error: stError } = await query.order('apellidos');
    if (stError) throw stError;

    // 3. Check Enrollments for current ACTIVE period
    // A student is "Enrolled" if they have an active inscription in an open academic load
    const { data: activeEnrollments } = await supabase
        .from('inscripciones')
        .select(`
            estudiante_id, 
            carga:cargas_academicas!inner(
                es_confirmada,
                periodo:periodos_academicos!inner(estado_id)
            )
        `)
        .in('estado_id', [1, 2]) // Inscripción activa o finalizada en el periodo
        .eq('carga.periodo.estado_id', 1); // Periodo activo

    const enrolledStudentIds = new Set(activeEnrollments?.map(e => e.estudiante_id) || []);

    const tableData = students.map(s => {
        const isEnrolled = enrolledStudentIds.has(s.id);
        const yearText = `${s.año_actual}º Año`;
        const statusText = isEnrolled ? yearText : `${yearText} (PENDIENTE)`;

        return [
            s.cedula,
            `${s.apellidos} ${s.nombres}`.toUpperCase(),
            s.telefono || 'N/A',
            s.usuario?.correo || 'N/A',
            statusText
        ];
    });

    // Summary Text
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`TOTAL ESTUDIANTES: ${students.length}`, 14, 62);

    autoTable(doc, {
        startY: 65,
        head: [['Cédula', 'Nombre Completo', 'Teléfono', 'Correo Electrónico', 'Año / Estatus']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.1
        },
        styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.1
        },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 60 },
            2: { cellWidth: 30 },
            3: { cellWidth: 45 },
            4: { cellWidth: 26, halign: 'center' }
        }
    });

    // Watermark & Footer
    drawBoletinWatermark(doc);
    drawBoletinFooter(doc);
}

async function generateStudentBoletin(doc, params) {
    // 1. Fetch Student
    let student;
    if (params.studentId) {
        const { data } = await supabase.from('estudiantes').select('*').eq('id', params.studentId).maybeSingle();
        student = data;
    } else {
        student = await fetchStudentData(params.cedula);
    }

    if (!student) throw new Error('Estudiante no encontrado o cédula incorrecta');

    const enrollments = await fetchStudentGrades(student.id);
    const stats = await calculateStudentStats(student.id, student.año_actual);

    // Fetch all subjects for the student's current year
    const { data: yearSubjects } = await supabase
        .from('materias')
        .select('id, nombre:nombre_materia, codigo')
        .eq('año_materia', student.año_actual)
        .eq('estado_id', 1)
        .order('orden_secuencia', { ascending: true })
        .order('nombre_materia', { ascending: true });

    // Extract section name and code from the first enrollment that has it
    const sectionEnrollment = enrollments.find(e => e.seccion_nombre);
    student.seccion_nombre = sectionEnrollment ? sectionEnrollment.seccion_nombre : 'N/A';
    student.seccion_codigo = sectionEnrollment ? sectionEnrollment.seccion_codigo : '';

    // --- PAGE 1 DESIGN ---
    // 1. Header & Logos
    drawBoletinHeader(doc);

    // 2. Student Data Section
    drawStudentDataSection(doc, student, stats, enrollments);

    // 3. Title (Added vertical space as requested)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    // Moved down from 82 to 90 to separate from student data
    doc.text('"BOLETÍN INFORMATIVO"', 105, 90, { align: 'center' });

    // 4. Grades Table
    // Moved startY down to 96 to accommodate the title shift
    drawGradesTable(doc, yearSubjects || [], enrollments, 96);

    // 5. Watermark
    drawBoletinWatermark(doc);

    // 6. Signatures
    drawBoletinSignatures(doc);

    // 7. Footer Address
    drawBoletinFooter(doc);
}

function drawBoletinHeader(doc) {
    const margin = 14;
    doc.setTextColor(0);

    // Logos (Top Left & Top Right)
    if (reportConfig.logoBase64) {
        try {
            // Draw logo on left
            doc.addImage(reportConfig.logoBase64, 'PNG', 14, 10, 22, 22);
            // Draw logo on right (symmetrical)
            doc.addImage(reportConfig.logoBase64, 'PNG', 174, 10, 22, 22);
        } catch (e) {
            console.warn('[Reports] Error adding logo to PDF:', e);
        }
    }

    // Hierarchical Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(reportConfig.country, 105, 15, { align: 'center' });
    doc.text('IGLESIA UNIVERSAL DE JESUCRISTO', 105, 20, { align: 'center' });
    doc.setFontSize(9);
    doc.text('DEPARTAMENTO DE EDUCACIÓN', 105, 25, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`"${reportConfig.institutionName}"`, 105, 31, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('ACREDITADOS POR DAYSPRING THEOLOGICAL UNIVERSITY', 105, 36, { align: 'center' });

    // Legal Text (Small)
    doc.setFontSize(6);
    const splitLegal = doc.splitTextToSize(reportConfig.legalRegistry, 160);
    doc.text(splitLegal, 105, 41, { align: 'center' });
}

function drawStudentDataSection(doc, student, stats, enrollments) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Line 1: AÑO & Aula (formerly Matricula)
    doc.text('AÑO:', 14, 55);
    doc.line(35, 55, 60, 55);
    doc.text(student.año_actual + 'º', 40, 54, { align: 'center' });

    doc.text('MATRICULA:', 140, 55);
    doc.line(168, 55, 196, 55);
    // Get section from enrollments or student data if available
    // Assuming first enrollment's section is representative or fetching explicitly
    const seccion = student.seccion_nombre ? `${student.seccion_nombre} (${student.seccion_codigo || 'S/C'})` : 'N/A';
    doc.text(seccion, 182, 54, { align: 'center' });

    // Line 2: Name
    doc.text('Nombre y Apellido del Estudiante:', 14, 63);
    doc.line(65, 63, 196, 63);
    doc.setFont('helvetica', 'bold');
    doc.text(`${student.nombres} ${student.apellidos}`.toUpperCase(), 70, 62);
    doc.setFont('helvetica', 'normal');

    // Line 3: Cedula & Promedio
    doc.text('Cédula de Identidad:', 14, 71);
    doc.line(48, 71, 90, 71);
    doc.text(student.cedula, 69, 70, { align: 'center' });

    doc.text('Promedio del Estudiante:', 110, 71);
    doc.line(150, 71, 196, 71);
    doc.text(stats.average || '0', 173, 70, { align: 'center' });

    // Line 4: Posicion
    doc.text('Posición del Estudiante:', 14, 78);
    doc.line(55, 78, 100, 78);
    doc.text(stats.rank ? `${stats.rank}º` : '-', 77, 77, { align: 'center' });
}

function drawGradesTable(doc, yearSubjects, enrollments, startY = 88) {
    let sumGrades = 0;
    let countGrades = 0;

    const tableBody = yearSubjects.map((subject, index) => {
        // Find if student has this subject in their enrollments
        const match = enrollments.find(e => e.materia_id === subject.id);
        const nota = match ? (match.nota_final !== null ? match.nota_final : '') : '';

        if (nota !== '' && !isNaN(nota)) {
            sumGrades += Number(nota);
            countGrades++;
        }

        return [index + 1, subject.nombre, nota];
    });

    const average = countGrades > 0 ? (sumGrades / countGrades).toFixed(2) : '--';

    // Add Average Row
    const footerRow = ['', 'PROMEDIO GENERAL', average + ' Pts'];

    autoTable(doc, {
        startY: startY,
        head: [['', 'CONTENIDO GENERAL', 'NOTAS']],
        body: tableBody,
        foot: [footerRow],
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.1
        },
        styles: {
            fontSize: 9,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.1
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 130 },
            2: { cellWidth: 32, halign: 'center' }
        },
        footStyles: {
            fillColor: [74, 14, 28], // Dark primary color
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center', // Align center for stats
            lineWidth: 0.1
        },
        didParseCell: function (data) {
            // Center align the grade column
            if (data.column.index === 2) {
                data.cell.styles.halign = 'center';
            }
            // Right align the "Promedio General" text
            if (data.section === 'foot' && data.column.index === 1) {
                data.cell.styles.halign = 'right';
            }
        }
    });
}

function drawBoletinWatermark(doc) {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.1 }));
    doc.setFontSize(40);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150);
    doc.text('COLEGIO BIBLICO UNIVERSAL HOREB', 40, 190, { angle: 45 });
    doc.restoreGraphicsState();
}

function drawBoletinSignatures(doc) {
    const y1 = 235;
    const y2 = 265;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');

    // Row 1
    doc.line(20, y1, 90, y1);
    doc.text('PRESIDENTE OBISPO RECTOR', 55, y1 + 4, { align: 'center' });
    doc.text('JOSÉ ANTONIO URDANETA ESPINOZA', 55, y1 + 8, { align: 'center' });

    doc.line(120, y1, 190, y1);
    doc.text('DIRECTOR NACIONAL', 155, y1 + 4, { align: 'center' });
    doc.text('NESTOR GERARDO MONTOYA ARMAS', 155, y1 + 8, { align: 'center' });

    // Row 2
    doc.line(20, y2, 90, y2);
    doc.text('SECRETARIA NACIONAL', 55, y2 + 4, { align: 'center' });
    doc.text('GABRIELA DE LOS ANGELES PÉREZ GUILLEN', 55, y2 + 8, { align: 'center' });

    doc.line(120, y2, 190, y2);
    doc.text('SUBDIRECTORA NACIONAL', 155, y2 + 4, { align: 'center' });
    doc.text('JULEHEIDE YACKELIN ALVAREZ DE CARRIZO', 155, y2 + 8, { align: 'center' });

    // Seal Area Placeholder (Center)
    doc.setDrawColor(230);
    doc.rect(92, 240, 26, 20);
    doc.setFontSize(5);
    doc.text('Sello Húmedo', 105, 251, { align: 'center' });
}

function drawBoletinFooter(doc) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const address = reportConfig.address.includes('CON SEDE') ? reportConfig.address : `CON SEDE EN ${reportConfig.address}`;
    doc.text(address, 105, 285, { align: 'center' });
}

// Helpers for the new boletin logic
async function fetchStudentData(cedula) {
    const { data, error } = await supabase
        .from('estudiantes')
        .select('*')
        .eq('cedula', cedula)
        .maybeSingle();

    if (data) {
        // Fetch one enrollment to get the section name efficiently
        // Or we rely on calculateStudentStats/fetchStudentGrades to patch it.
        // Actually, let's fetch one enrollment here to populate "seccion_nombre" early if possible,
        // but fetchStudentGrades does it better. We'll simply wait for fetchStudentGrades result in generatePDF.
    }

    if (error) {
        console.error('[Reports] Error fetching student:', error);
        return null;
    }
    return data;
}


// ACTA DE EVALUACIÓN (Subject Grades)
async function generateSubjectGradesReport(doc, params) {
    if (!params.subjectId) throw new Error("ID de carga no válido");
    const cargaId = params.subjectId;

    // 1. Fetch Header & Carga Data
    const { data: carga, error: cError } = await supabase
        .from('cargas_academicas')
        .select(`
            id,
            materia:materias(nombre:nombre_materia),
            docente:docentes(nombres, apellidos, cedula),
            seccion:secciones(nombre, codigo),
            periodo:periodos_academicos(nombre, codigo)
        `)
        .eq('id', cargaId)
        .single();

    if (cError || !carga) throw new Error("No se encontró la carga académica");

    // 2. Fetch Students & Final Grades
    // We look at inscripciones -> notas_finales OR inscripciones -> calificaciones
    // Based on previous code, grades are in 'calificaciones' table (nota_final column) linked to inscripcion
    const { data: enrollments, error: eError } = await supabase
        .from('inscripciones')
        .select(`
            id,
            estudiante:estudiantes(nombres, apellidos, cedula),
            calificaciones(nota_final)
        `)
        .eq('carga_academica_id', cargaId)
        .order('estudiante(apellidos)', { ascending: true }); // Sort by name

    if (eError) throw eError;

    // --- RENDER ---
    drawBoletinHeader(doc);

    doc.setFontSize(14);
    doc.setFont('times', 'bold');

    // Custom Block "EVALUACION CONTINUA"
    const startY = 48; // Reduced from 60 to close gap with Header (Legal text ends ~42-45)
    const boxHeight = 25;
    const pageWidth = 210; // A4
    const margin = 14;
    const boxWidth = pageWidth - (margin * 2);

    // Box Title
    doc.setFillColor(230, 230, 230); // Light Gray
    doc.rect(margin, startY, boxWidth, 7, 'F'); // Title Background
    doc.rect(margin, startY, boxWidth, boxHeight); // Main Box Outline

    doc.setFontSize(10);
    doc.text('EVALUACION CONTINUA', pageWidth / 2, startY + 5, { align: 'center' });

    // Inner Lines
    const midY = startY + 16;
    const midX = pageWidth / 2 + 20; // Divider Position

    // Horizontal Divider inside box
    // doc.line(margin, midY, margin + boxWidth, midY); // Optional row divider? 
    // User asked for: Title Bar + Division Left + Division Right.
    // Let's interpret: Title bar is top. Below title bar, split vertically? 
    // "Inmediatamente debajo del encabezado... Título del Bloque... División Izquierda... División Derecha"
    // Usually means Title Row, then Content Rows split.

    // Draw Line below Title
    doc.line(margin, startY + 7, margin + boxWidth, startY + 7);

    // Draw Vertical Split
    doc.line(midX, startY + 7, midX, startY + boxHeight);

    // Content
    doc.setFontSize(9);
    doc.setFont('times', 'bold');

    // Left Side
    const leftX = margin + 2;
    const row1Y = startY + 13;
    const row2Y = startY + 18;

    doc.text('DOCENTE BIBLICO:', leftX, row1Y);
    doc.setFont('times', 'normal');
    const docName = carga.docente ? `${carga.docente.nombres} ${carga.docente.apellidos}`.toUpperCase() : 'POR ASIGNAR';
    doc.text(docName, leftX + 35, row1Y);

    doc.setFont('times', 'bold');
    doc.text('CURSO:', leftX, row2Y);
    doc.setFont('times', 'normal');
    doc.text((carga.materia?.nombre || '').toUpperCase(), leftX + 15, row2Y);

    // Right Side
    const rightX = midX + 2;

    doc.setFont('times', 'bold');
    doc.text('AÑO:', rightX, row1Y);
    doc.setFont('times', 'normal');
    doc.text(carga.periodo?.nombre || 'ACTUAL', rightX + 20, row1Y); // Or simple code like 2024-I

    doc.setFont('times', 'bold');
    doc.text('FECHA:', rightX, row2Y);
    doc.setFont('times', 'normal');
    const dateStr = new Date().toLocaleDateString('es-VE');
    doc.text(dateStr, rightX + 15, row2Y);


    // 3. Main Table
    // Columns: N (1-25), NOMBRE (Wide), CEDULA, DEFINITIVA
    // We strictly need 25 rows.

    const rows = [];
    // 1. Fill with students
    let counter = 1;
    // Helper to sort purely in JS if API sort failed
    const sortedStudents = (enrollments || []).sort((a, b) => {
        const nA = a.estudiante?.apellidos || '';
        const nB = b.estudiante?.apellidos || '';
        return nA.localeCompare(nB);
    });

    for (const e of sortedStudents) {
        let nota = '';
        if (e.calificaciones && e.calificaciones.length > 0) {
            const val = e.calificaciones[0].nota_final;
            if (val !== null && val !== undefined) nota = val;
        } else if (e.calificaciones && e.calificaciones.nota_final) {
            // Handle if object (O2O)
            nota = e.calificaciones.nota_final;
        }

        rows.push([
            counter,
            `${e.estudiante.apellidos}, ${e.estudiante.nombres}`.toUpperCase(),
            e.estudiante.cedula,
            nota
        ]);
        counter++;
    }

    // 2. Fill empty rows until 25
    while (rows.length < 25) {
        rows.push([counter, '', '', '']);
        counter++;
    }

    autoTable(doc, {
        startY: startY + boxHeight + 5,
        head: [['N', 'NOMBRE Y APELLIDO', 'CEDULA', 'DEFINITIVA']],
        body: rows,
        theme: 'plain', // Clean look as requested
        styles: {
            font: 'times',
            fontSize: 8, // Reduced font size
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            cellPadding: 1, // Reduced padding tightly
            textColor: [0, 0, 0]
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.1,
            lineColor: [0, 0, 0] // Black borders
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' }, // N smaller
            1: { cellWidth: 'auto' }, // Name (Takes remaining)
            2: { cellWidth: 25, halign: 'center' }, // Cedula smaller
            3: { cellWidth: 20, halign: 'center' }  // Definitiva smaller
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.1,
    });

    const finalY = doc.lastAutoTable.finalY;

    // 4. Footer & Signatures
    // Observaciones Box
    const obsY = finalY + 5;
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text('OBSERVACION:', margin, obsY + 4);

    // Draw lines for observation
    doc.setLineWidth(0.1);
    doc.line(margin + 25, obsY + 4, pageWidth - margin, obsY + 4); // Line 1
    doc.line(margin, obsY + 10, pageWidth - margin, obsY + 10);      // Line 2
    doc.line(margin, obsY + 16, pageWidth - margin, obsY + 16);      // Line 3

    // Signatures - Check if we need a page break
    // If obsY is too low, add page
    if (obsY > 250) {
        doc.addPage();
        doc.setFont('times', 'bold');
        doc.setFontSize(9);
        // Reset Y for new page
        // const obsY = 20; // Re-declare not possible easily here without refactor, 
        // simpler to just ensure table fits or signatures flow.
        // Let's just render signatures at bottom of page or relative.
    }

    const sigY = obsY + 30; // Reduced gap from 40 to 30
    const boxW = 50;
    const gap = (pageWidth - (margin * 2) - (boxW * 3)) / 2; // Space between boxes

    let currentX = margin;

    // Function to draw signature box
    const drawSigBox = (title) => {
        doc.line(currentX, sigY, currentX + boxW, sigY); // Top line for signature
        // doc.rect(currentX, sigY, boxW, 15); // Optional Box
        doc.text(title, currentX + (boxW / 2), sigY + 5, { align: 'center' });
        currentX += boxW + gap;
    };

    drawSigBox('DOCENTE BIBLICO');
    drawSigBox('CONTROL DE ESTUDIO');
    drawSigBox('DIRECTOR');
}

async function fetchStudentGrades(studentId) {
    // Corrected Join Path: inscripciones -> cargas_academicas -> materias
    const { data: inscriptions, error } = await supabase
        .from('inscripciones')
        .select(`
            id,
            carga:cargas_academicas(
                materia_id,
                materia:materias(nombre:nombre_materia),
                seccion:secciones(nombre, codigo)
            )
        `)
        .eq('estudiante_id', studentId);

    if (error || !inscriptions || inscriptions.length === 0) return [];

    const ids = inscriptions.map(i => i.id);
    const { data: grades } = await supabase
        .from('calificaciones')
        .select('inscripcion_id, nota_final')
        .in('inscripcion_id', ids);

    return inscriptions.map(i => ({
        ...i,
        materia_id: i.carga?.materia_id,
        materia_nombre: i.carga?.materia?.nombre || '',
        seccion_nombre: i.carga?.seccion?.nombre || '',
        seccion_codigo: i.carga?.seccion?.codigo || '',
        nota_final: grades?.find(g => g.inscripcion_id === i.id)?.nota_final || ''
    }));
}

async function calculateStudentStats(studentId, year) {
    try {
        // Consultar la vista de rendimiento que calcula promedios y ranking server-side
        const { data, error } = await supabase
            .from('vista_rendimiento_estudiantes')
            .select('promedio_general, posicion_ranking')
            .eq('estudiante_id', studentId)
            .single();

        if (error || !data) {
            console.warn('Error fetching computed view stats:', error);
            return { average: '0.0', rank: '-' };
        }

        return { 
            average: data.promedio_general.toFixed(1), 
            rank: data.posicion_ranking 
        };
    } catch (e) {
        console.warn('Error fetching computed view stats:', e);
        return { average: '0.0', rank: '-' };
    }
}



function getBasePDF() {
    const doc = new jsPDF();

    // Header Logic
    if (reportConfig.logoUrl) {
        try {
            // In a real app, you might need to convert URL to Base64 to avoid CORS in PDF.
            // For now, we trust autoTable or just place text if image fails.
            // img.src = reportConfig.logoUrl; 
            // doc.addImage(img, 'PNG', 10, 10, 20, 20);
        } catch (e) { }
    }

    // Simple textual header
    doc.setFontSize(16);
    doc.setTextColor(74, 14, 28); // Primary
    doc.text(reportConfig.institutionName.toUpperCase(), 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Sistema de Control de Estudios', 105, 28, { align: 'center' });
    doc.line(10, 35, 200, 35); // Separator

    return doc;
}

// LISTADO DE CLASE (Roster)
async function generateSubjectRosterReport(doc, params) {
    if (!params.subjectId) throw new Error("ID de carga no válido");
    const cargaId = params.subjectId;

    // 1. Fetch Header & Carga Data
    const { data: carga, error: cError } = await supabase
        .from('cargas_academicas')
        .select(`
            id,
            materia:materias(nombre:nombre_materia),
            docente:docentes(nombres, apellidos),
            seccion:secciones(nombre, codigo),
            periodo:periodos_academicos(nombre)
        `)
        .eq('id', cargaId)
        .single();

    if (cError || !carga) throw new Error("No se encontró la carga académica");

    // 2. Fetch Students
    const { data: enrollments, error: eError } = await supabase
        .from('inscripciones')
        .select(`
            id,
            estudiante:estudiantes(
                nombres, 
                apellidos, 
                cedula, 
                telefono,
                usuario:usuarios(correo)
            )
        `)
        .eq('carga_academica_id', cargaId)
        .order('estudiante(apellidos)', { ascending: true });

    if (eError) throw eError;

    // --- RENDER ---
    drawBoletinHeader(doc);

    doc.setFontSize(14);
    doc.setFont('times', 'bold');

    // Title Box
    const startY = 48;
    const boxHeight = 25;
    const pageWidth = 210;
    const margin = 14;
    const boxWidth = pageWidth - (margin * 2);

    doc.setFillColor(230, 230, 230);
    doc.rect(margin, startY, boxWidth, 7, 'F');
    doc.rect(margin, startY, boxWidth, boxHeight);

    doc.setFontSize(10);
    doc.text('CONTROL DE ASISTENCIA / LISTADO', pageWidth / 2, startY + 5, { align: 'center' });

    // Inner Lines
    const midX = pageWidth / 2 + 20;

    doc.line(margin, startY + 7, margin + boxWidth, startY + 7);
    doc.line(midX, startY + 7, midX, startY + boxHeight);

    // Content
    doc.setFontSize(9);
    doc.setFont('times', 'bold');

    // Left
    const leftX = margin + 2;
    const row1Y = startY + 13;
    const row2Y = startY + 18;

    doc.text('DOCENTE:', leftX, row1Y);
    doc.setFont('times', 'normal');
    const docName = carga.docente ? `${carga.docente.nombres} ${carga.docente.apellidos}`.toUpperCase() : 'POR ASIGNAR';
    doc.text(docName, leftX + 20, row1Y);

    doc.setFont('times', 'bold');
    doc.text('MATERIA:', leftX, row2Y);
    doc.setFont('times', 'normal');
    doc.text((carga.materia?.nombre || '').toUpperCase(), leftX + 20, row2Y);

    // Right
    const rightX = midX + 2;
    doc.setFont('times', 'bold');
    doc.text('SECCIÓN:', rightX, row1Y);
    doc.setFont('times', 'normal');
    doc.text(carga.seccion?.codigo || 'U', rightX + 20, row1Y);

    doc.setFont('times', 'bold');
    doc.text('PERIODO:', rightX, row2Y);
    doc.setFont('times', 'normal');
    doc.text(carga.periodo?.nombre || 'ACTUAL', rightX + 20, row2Y);


    // Table
    const rows = [];
    let counter = 1;

    // JS Sort just in case API sort missed
    const sortedStudents = (enrollments || []).sort((a, b) => {
        const nA = a.estudiante?.apellidos || '';
        const nB = b.estudiante?.apellidos || '';
        return nA.localeCompare(nB);
    });

    for (const e of sortedStudents) {
        rows.push([
            counter,
            `${e.estudiante.apellidos}, ${e.estudiante.nombres}`.toUpperCase(),
            e.estudiante.cedula,
            e.estudiante.telefono || 'N/A',
            e.estudiante.usuario?.correo ? e.estudiante.usuario.correo.toLowerCase() : 'N/A'
        ]);
        counter++;
    }

    // Fill to 25
    while (rows.length < 25) {
        rows.push([counter, '', '', '', '']);
        counter++;
    }

    autoTable(doc, {
        startY: startY + boxHeight + 5,
        head: [['N', 'NOMBRE Y APELLIDO', 'CEDULA', 'TELÉFONO', 'CORREO']],
        body: rows,
        theme: 'plain',
        styles: {
            font: 'times',
            fontSize: 8,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            cellPadding: 1,
            textColor: [0, 0, 0]
        },
        headStyles: {
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.1,
            lineColor: [0, 0, 0]
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 30, halign: 'center' },
            4: { cellWidth: 45, halign: 'center' }
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.1,
    });

    drawBoletinFooter(doc);
}
