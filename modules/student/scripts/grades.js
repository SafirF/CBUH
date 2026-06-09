import { supabase } from '../../../config/supabase-client.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function initGrades() {
    console.log('[Grades] Initializing...');
    const container = document.getElementById('grades-container');
    if (!container) return;

    // Get context
    const context = window.studentContext;
    if (!context || !context.estudiante) {
        container.innerHTML = '<p class="text-center text-white/40">No se pudo cargar la información del estudiante.</p>';
        return;
    }

    try {
        // 1. Fetch academic history (grades)
        // We select qualifications joined with inscriptions, loads and subjects.
        // We need all records to build the full history.
        const { data: grades, error } = await supabase
            .from('calificaciones')
            .select(`
                id,
                nota_corte,
                nota_final,
                inscripcion:inscripciones!inscripcion_id!inner (
                    id,
                    estudiante_id,
                    carga:cargas_academicas!carga_academica_id (
                        id,
                        periodo:periodos_academicos!periodo_id (nombre),
                        materia:materias!materia_id (
                            id,
                            codigo,
                            nombre:nombre_materia,
                            año_materia,
                            creditos,
                            descripcion
                        )
                    )
                )
            `)
            .eq('inscripciones.estudiante_id', context.estudiante.id)
            .order('id', { ascending: false }); // Latest first

        if (error) throw error;

        if (!grades || grades.length === 0) {
            container.innerHTML = `
                <div class="text-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-6xl text-white/20 mb-4">school</span>
                    <h3 class="text-xl font-bold text-white uppercase">Sin Historial Académico</h3>
                    <p class="text-sm text-white/40 mt-2">Aún no tienes notas registradas.</p>
                </div>
            `;
            return;
        }

        // 2. Process Data: Group by Year (año_materia)
        // Structure: yearGroups = { 1: [subjects...], 2: [subjects...] }
        const yearGroups = {};

        // Also calculate stats
        let totalSubjectsLength = 0;
        let totalApproved = 0;
        let sumGrades = 0;
        let countGrades = 0;
        let totalCredits = 0;

        grades.forEach(record => {
            const materia = record.inscripcion?.carga?.materia;
            if (!materia) return;

            const year = materia.año_materia || 0;
            if (!yearGroups[year]) yearGroups[year] = [];

            // Simplified Logic: 1 cut (nota_corte) and Final Grade (nota_final)
            let displayGrade = record.nota_final;
            let isProvisional = false;

            if (displayGrade === null && record.nota_corte !== null) {
                displayGrade = record.nota_corte;
                isProvisional = true;
            }

            // Add record
            yearGroups[year].push({
                ...materia,
                nota_final: record.nota_final,
                nota_provisional: isProvisional ? displayGrade : null,
                periodo: record.inscripcion?.carga?.periodo?.nombre
            });

            // Stats Logic
            if (displayGrade !== null) {
                countGrades++;
                sumGrades += displayGrade;
                if (displayGrade >= 10) {
                    totalApproved++;
                    totalCredits += (materia.creditos || 0);
                }
            }
            totalSubjectsLength++;
        });

        // Update Header Stats
        const avg = countGrades > 0 ? (sumGrades / countGrades).toFixed(2) : '--';
        const avgEl = document.getElementById('grades-avg-all');
        const creditEl = document.getElementById('grades-credits');
        const totalSubEl = document.getElementById('grades-total-subjects');

        if (avgEl) avgEl.textContent = avg;
        if (creditEl) creditEl.textContent = totalCredits;
        if (totalSubEl) totalSubEl.textContent = totalSubjectsLength;


        // 3. Render HTML
        const years = Object.keys(yearGroups).sort();

        container.innerHTML = years.map(year => {
            const subjects = yearGroups[year];
            const yearLabel = getYearLabel(year);

            return `
                <div class="bg-primary-dark/50 rounded-3xl border border-white/5 overflow-hidden">
                    <div class="p-8 border-b border-white/5 flex items-center gap-4 bg-black/10">
                         <div class="size-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-bold text-lg">
                            ${year}º
                         </div>
                         <h3 class="text-lg font-black text-white uppercase tracking-tight">${yearLabel}</h3>
                    </div>
                    
                    <div class="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${subjects.map(sub => renderSubjectCard(sub)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // 4. Report Buttons Logic (Corte vs Final)
        const currentYear = context.estudiante.año_actual;
        const subjectsCurrentYear = yearGroups[currentYear] || [];

        // Calculate progress for current year
        let subjectsWithFinal = 0;
        let subjectsTotal = subjectsCurrentYear.length;
        // Note: subjectsTotal here is only based on *grades table*. 
        // Ideally we should know the total curriculum count, but checking *enrolled* subjects is a good proxy.
        // If they are enrolled in 5 and completed 5, they are done.

        subjectsCurrentYear.forEach(s => {
            if (s.nota_final !== null && s.nota_final !== undefined) subjectsWithFinal++;
        });

        const isYearFinished = subjectsTotal > 0 && subjectsWithFinal === subjectsTotal;
        const hasProgress = subjectsTotal > 0;

        let reportButtonHtml = '';

        if (isYearFinished) {
            // Full Report Card (Boletín Final)
            reportButtonHtml = `
                <div class="fixed bottom-8 right-8 z-40">
                    <button onclick="window.downloadStudentReport('final')" 
                        class="bg-gold text-primary-dark font-black uppercase text-xs tracking-widest px-6 py-4 rounded-full shadow-2xl hover:bg-white hover:scale-105 transition-all flex items-center gap-3">
                        <span class="material-symbols-outlined">workspace_premium</span>
                        Descargar Boletín Final
                    </button>
                </div>
            `;
        } else if (hasProgress) {
            // Mid-term Report (Corte de Notas)
            reportButtonHtml = `
                <div class="fixed bottom-8 right-8 z-40">
                    <button onclick="window.downloadStudentReport('corte')" 
                        class="bg-blue-600 text-white font-black uppercase text-xs tracking-widest px-6 py-4 rounded-full shadow-2xl hover:bg-blue-500 hover:scale-105 transition-all flex items-center gap-3">
                        <span class="material-symbols-outlined">summarize</span>
                        Descargar Corte de Notas
                    </button>
                </div>
            `;
        }

        if (reportButtonHtml) container.insertAdjacentHTML('beforeend', reportButtonHtml);


    } catch (e) {
        console.error('[Grades] Error:', e);
        container.innerHTML = `
            <div class="p-8 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                <p class="text-red-400 font-bold">Error cargando notas</p>
                <p class="text-xs text-white/40 mt-1">${e.message}</p>
            </div>
        `;
    }
}

function getYearLabel(year) {
    const labels = {
        1: 'Primer Año Académico',
        2: 'Segundo Año Académico',
        3: 'Tercer Año Académico',
        4: 'Cuarto Año Académico',
        5: 'Quinto Año Académico'
    };
    return labels[year] || `Año ${year}`;
}

function renderSubjectCard(subject) {
    const hasFinal = subject.nota_final !== null && subject.nota_final !== undefined;
    const hasProvisional = subject.nota_provisional !== null && subject.nota_provisional !== undefined;

    // Status Logic
    let statusText = 'Sin Nota';
    let statusColor = 'text-white/40';
    let statusBg = 'bg-white/5';
    let icon = 'pending';
    let gradeValue = '';

    if (hasFinal) {
        const isApproved = subject.nota_final >= 10;
        statusText = 'Final';
        statusColor = isApproved ? 'text-emerald-400' : 'text-red-400';
        statusBg = isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20';
        icon = isApproved ? 'check_circle' : 'cancel';
        gradeValue = subject.nota_final + ' PTS';
    } else if (hasProvisional) {
        statusText = 'Progreso';
        statusColor = 'text-gold';
        statusBg = 'bg-gold/10 border-gold/20';
        icon = 'monitoring';
        gradeValue = subject.nota_provisional + ' PTS';
    }

    return `
        <div class="bg-card-dark p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col gap-4 group">
            <div class="flex justify-between items-start">
                <div>
                     <span class="text-[9px] font-black text-gold/60 uppercase tracking-widest border border-gold/10 px-2 py-0.5 rounded mb-2 inline-block">${subject.codigo}</span>
                     <h4 class="font-bold text-white leading-tight group-hover:text-gold transition-colors">${subject.nombre}</h4>
                </div>
                ${subject.creditos ? `<span class="text-[10px] font-bold text-white/20 bg-white/5 px-2 py-1 rounded">UC: ${subject.creditos}</span>` : ''}
            </div>
            
            <div class="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                <p class="text-[10px] font-bold text-white/40 uppercase tracking-wider">${subject.periodo || 'Periodo ?'}</p>
                
                <div class="flex items-center gap-2 ${statusBg} px-3 py-1.5 rounded-lg border border-transparent">
                    <span class="material-symbols-outlined text-sm ${statusColor}">${icon}</span>
                    <div class="flex flex-col items-end leading-none">
                        <span class="text-[8px] font-black uppercase opacity-60 ${statusColor}">${statusText}</span>
                        <span class="font-black ${statusColor} text-sm">${gradeValue || '---'}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Attach to window for dynamic calls
window.initGrades = initGrades;

// --- PDF REPORT GENERATION (Adapted for Student) ---


// --- PDF REPORT GENERATION (Adapted from Admin Module for Consistency) ---

const reportConfig = {
    institutionName: 'Colegio Bíblico Universal Horeb',
    address: 'CON SEDE EN EL SECTOR VISTA ALEGRE, CALLE COLOMBIA, Nº 27 PARROQUIA AGUAS CALIENTE MUNICIPIO DIEGO IBARRA, MARIARA EDO CARABOBO.',
    country: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
    legalRegistry: 'REGISTRADO EN EL MINISTERIO DE JUSTICIA EN LA DIRECCIÓN DE CULTO BAJO Nº 1.234 Y EN LA OFICINA SUBALTERNA DE REGISTRO PÚBLICO DEL DISTRITO GUACARA DEL ESTADO CARABOBO BAJO NÚMERO 6. PROTOCOLO 1º. TOMO 15. FOLIOS 17 AL 19. RIF J-50091290-0.',
    logoBase64: null
};

// Helper: Convert Image to Base64
async function getBase64FromUrl(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) { return null; }
}

window.downloadStudentReport = async function (type) {
    if (window.NotificationSystem) NotificationSystem.show('Generando documento...', 'info');

    const context = window.studentContext;
    if (!context || !context.estudiante) return;

    try {
        // Load Dynamic Logo based on Sede
        const context = window.studentContext;
        const sedeId = context.sede_id; // Usually available in profile

        if (sedeId) {
            const { data: configs } = await supabase
                .from('configuraciones')
                .select('valor')
                .eq('sede_id', sedeId)
                .eq('clave', 'logo_url_sede')
                .maybeSingle();

            if (configs && configs.valor) {
                // Fetch Base64
                reportConfig.logoBase64 = await getBase64FromUrl(configs.valor);
            }
        }

        // Fallback if no specific logo found
        if (!reportConfig.logoBase64) {
            // Try default asset or leave null
            reportConfig.logoBase64 = await getBase64FromUrl('/assets/img/libro.png');
        }

        const doc = new jsPDF();

        if (type === 'final') {
            await generateBoletinFinal(doc, context.estudiante);
        } else {
            generateCorteDeNotas(doc, context.estudiante);
        }

        doc.save(`boletin_${type}_${context.estudiante.cedula}.pdf`);
        if (window.NotificationSystem) NotificationSystem.show('Descarga exitosa', 'success');

    } catch (e) {
        console.error(e);
        alert('Error generando reporte: ' + e.message);
    }
}

// --- BOLETÍN FINAL LOGIC (Exact Copy of Admin Report) ---

async function generateBoletinFinal(doc, student) {
    // 1. Fetch Necessary Data
    const enrollments = await fetchStudentGrades(student.id);
    const stats = await calculateStudentStats(student.id, student.año_actual);

    // Fetch all subjects for the student's current year to show full curriculum
    const { data: yearSubjects } = await supabase
        .from('materias')
        .select('id, nombre:nombre_materia, codigo')
        .eq('año_materia', student.año_actual)
        .eq('estado_id', 1)
        .order('orden_secuencia', { ascending: true })
        .order('nombre_materia', { ascending: true });

    // Extract section name from enrollments
    const sectionEnrollment = enrollments.find(e => e.seccion_nombre);
    student.seccion_nombre = sectionEnrollment ? sectionEnrollment.seccion_nombre : 'N/A';
    student.seccion_codigo = sectionEnrollment ? sectionEnrollment.seccion_codigo : '';


    // 2. Build PDF
    // Header
    drawBoletinHeader(doc);

    // Student Data
    drawStudentDataSection(doc, student, stats);

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('"BOLETÍN INFORMATIVO"', 105, 90, { align: 'center' });

    // Grades Table
    drawGradesTable(doc, yearSubjects || [], enrollments, 96);

    // Watermark
    drawBoletinWatermark(doc);

    // Signatures
    drawBoletinSignatures(doc);

    // Footer
    drawBoletinFooter(doc);
}

// --- CORTE DE NOTAS LOGIC (Simple Version) ---
async function generateCorteDeNotas(doc, student) {
    // Header
    drawSimpleHeader(doc);

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CORTE DE NOTAS', 105, 50, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`AVANCE ACADÉMICO - AÑO ${student.año_actual}`, 105, 56, { align: 'center' });

    // Student Box
    doc.setDrawColor(0);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 62, 182, 20, 'F');
    doc.rect(14, 62, 182, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTUDIANTE:', 20, 70);
    doc.text('CÉDULA:', 20, 77);

    doc.setFont('helvetica', 'normal');
    doc.text(`${student.nombres} ${student.apellidos}`.toUpperCase(), 50, 70);
    doc.text(student.cedula, 50, 77);

    doc.setFont('helvetica', 'bold');
    doc.text('FECHA:', 130, 70);
    doc.setFont('helvetica', 'normal');
    const dateStr = new Date().toLocaleDateString('es-VE');
    doc.text(dateStr, 145, 70);

    // Fetch Data
    const enrollments = await fetchStudentGrades(student.id);
    // Filter only current year
    // Note: fetchStudentGrades returns normalized objects

    // Need subjects to map names? fetchStudentGrades already has materia_nombre
    const rows = enrollments.map((g, index) => {
        let nota = '---';
        let tipo = 'Parcial';

        if (g.nota_final) {
            nota = g.nota_final;
            tipo = 'Definitiva';
        } else if (g.nota_corte) {
            nota = g.nota_corte;
            tipo = 'Parcial';
        }

        return [
            index + 1,
            g.materia_nombre || 'Materia',
            tipo,
            nota
        ];
    });

    autoTable(doc, {
        startY: 90,
        head: [['#', 'ASIGNATURA', 'CONDICIÓN', 'CALIFICACIÓN']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [74, 14, 28], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
        }
    });
}

// --- SHARED DRAWING FUNCTIONS ---

function drawBoletinHeader(doc) {
    doc.setTextColor(0);

    // Logos
    if (reportConfig.logoBase64) {
        try {
            doc.addImage(reportConfig.logoBase64, 'PNG', 14, 10, 22, 22);
            doc.addImage(reportConfig.logoBase64, 'PNG', 174, 10, 22, 22);
        } catch (e) { }
    }

    // Text
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

    // Legal
    doc.setFontSize(6);
    const splitLegal = doc.splitTextToSize(reportConfig.legalRegistry, 160);
    doc.text(splitLegal, 105, 41, { align: 'center' });
}

function drawSimpleHeader(doc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('COLEGIO BÍBLICO UNIVERSAL HOREB', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Departamento de Control de Estudios', 105, 26, { align: 'center' });
}

function drawStudentDataSection(doc, student, stats) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Line 1
    doc.text('AÑO:', 14, 55);
    doc.line(35, 55, 60, 55);
    doc.text(student.año_actual + 'º', 40, 54, { align: 'center' });

    doc.text('MATRICULA:', 140, 55);
    doc.line(168, 55, 196, 55);
    const seccion = student.seccion_nombre ? `${student.seccion_nombre} (${student.seccion_codigo || 'S/C'})` : 'N/A';
    doc.text(seccion, 182, 54, { align: 'center' });

    // Line 2
    doc.text('Nombre y Apellido del Estudiante:', 14, 63);
    doc.line(65, 63, 196, 63);
    doc.setFont('helvetica', 'bold');
    doc.text(`${student.nombres} ${student.apellidos}`.toUpperCase(), 70, 62);
    doc.setFont('helvetica', 'normal');

    // Line 3
    doc.text('Cédula de Identidad:', 14, 71);
    doc.line(48, 71, 90, 71);
    doc.text(student.cedula, 69, 70, { align: 'center' });

    doc.text('Promedio del Estudiante:', 110, 71);
    doc.line(150, 71, 196, 71);
    doc.text(stats.average || '0', 173, 70, { align: 'center' });

    // Line 4
    doc.text('Posición del Estudiante:', 14, 78);
    doc.line(55, 78, 100, 78);
    doc.text(stats.rank ? `${stats.rank}º` : '-', 77, 77, { align: 'center' });
}

function drawGradesTable(doc, yearSubjects, enrollments, startY = 88) {
    let sumGrades = 0;
    let countGrades = 0;

    const tableBody = yearSubjects.map((subject, index) => {
        // Find match
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

    // Seal
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


// --- DATA HELPERS ---

async function fetchStudentGrades(studentId) {
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

    // Optimize: fetch grades in one go
    const ids = inscriptions.map(i => i.id);
    const { data: grades } = await supabase
        .from('calificaciones')
        .select('inscripcion_id, nota_final, nota_corte')
        .in('inscripcion_id', ids);

    return inscriptions.map(i => ({
        ...i,
        materia_id: i.carga?.materia_id,
        materia_nombre: i.carga?.materia?.nombre || '',
        seccion_nombre: i.carga?.seccion?.nombre || '',
        seccion_codigo: i.carga?.seccion?.codigo || '',
        nota_final: grades?.find(g => g.inscripcion_id === i.id)?.nota_final || null,
        nota_corte: grades?.find(g => g.inscripcion_id === i.id)?.nota_corte || null
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


