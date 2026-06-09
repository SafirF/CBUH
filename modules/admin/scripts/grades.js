import { supabase } from '../../../config/supabase-client.js'

let allGradesData = []

export function initGrades() {
    const gradesTableBody = document.getElementById('gradesTableBody')
    if (!gradesTableBody) return

    // If context isn't ready, the dashboard will call us later
    if (window.adminContext) {
        loadGradesSummaries()
    }

    // Search functionality
    const searchInput = document.getElementById('gradeSearch')
    searchInput?.addEventListener('input', (e) => {
        filterGrades(e.target.value)
    })
}

async function loadGradesSummaries() {
    const sedeId = window.adminContext?.sedeId
    if (!sedeId) {
        console.error('Contexto de sede no encontrado')
        return
    }

    try {
        // 1. Obtener configuración de la Sede
        const { data: sedeConfig, error: sedeError } = await supabase
            .from('sedes')
            .select('nota_minima, escala_maxima')
            .eq('id', sedeId)
            .single()

        if (sedeError) throw sedeError
        const MIN_PASSING_GRADE = Number(sedeConfig.nota_minima || 10)
        const MAX_GRADE = Number(sedeConfig.escala_maxima || 20)

        // Guardar en contexto global para uso en renderizado
        window.gradeConfig = { MIN_PASSING_GRADE, MAX_GRADE }

        const { data, error } = await supabase
            .from('estudiantes')
            .select(`
                id,
                nombres,
                apellidos,
                cedula,
                inscripciones (
                    id,
                    calificaciones (
                        nota_final,
                        nota_corte,
                        nota_reparacion,
                        estado_materia
                    )
                )
            `)
            .eq('sede_id', sedeId)

        if (error) throw error

        allGradesData = data.map(student => {
            const grades = student.inscripciones.flatMap(i => i.calificaciones || [])

            // Calcular promedio usando la nota definitiva (Final o Reparación si aplica)
            const validGrades = grades.filter(g => g.nota_final !== null || g.nota_reparacion !== null)

            let total = 0
            if (validGrades.length > 0) {
                total = validGrades.reduce((acc, curr) => {
                    // Si tiene reparación, esa es la que cuenta como definitiva para el promedio? 
                    // O se promedia? Usualmente reparación reemplaza.
                    const final = curr.nota_reparacion !== null ? Number(curr.nota_reparacion) : Number(curr.nota_final || 0)
                    return acc + final
                }, 0)
            }

            const avgGrade = validGrades.length > 0
                ? (total / validGrades.length).toFixed(1)
                : '0.0'

            // Asistencia removida de tabla plana, o asumimos 0 por ahora ya que estaba en otra tabla
            const avgAttendance = '0'

            return {
                ...student,
                avgGrade,
                avgAttendance
            }
        })

        renderGradesTable(allGradesData)

    } catch (e) {
        console.error('Error loading grades:', e)
        const tableBody = document.getElementById('gradesTableBody')
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-8 py-20 text-center text-red-400 font-black text-[10px] tracking-widest">Error al cargar datos: ${e.message}</td></tr>`
        }
    }
}

function renderGradesTable(data) {
    const tableBody = document.getElementById('gradesTableBody')
    if (!tableBody) return

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-8 py-20 text-center text-white/20 uppercase font-black text-[10px] tracking-widest">No se encontraron estudiantes</td></tr>'
        return
    }

    tableBody.innerHTML = data.map(student => `
        <tr class="student-grade-row group hover:bg-white/[0.02] cursor-pointer transition-all border-b border-white/5" onclick="window.showStudentGradeDetails(${student.id})">
            <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                    <div class="size-10 rounded-full bg-gold/5 border border-gold/20 flex items-center justify-center text-gold font-bold text-xs">
                        ${student.nombres[0]}${student.apellidos[0]}
                    </div>
                    <div>
                        <p class="text-sm font-bold text-white group-hover:text-gold transition-colors">${student.nombres} ${student.apellidos}</p>
                        <p class="text-[10px] font-bold text-white/20 tracking-widest uppercase">${student.cedula}</p>
                    </div>
                </div>
            </td>
             <td class="px-8 py-5 text-center">
                <span class="text-lg font-black ${Number(student.avgGrade) >= window.gradeConfig.MIN_PASSING_GRADE ? 'text-gold' : 'text-red-400'}">${student.avgGrade}</span>
            </td>
            <td class="px-8 py-5">
                <div class="flex flex-col items-center gap-2">
                    <span class="text-xs font-black text-white/60">--</span>
                    <!-- Asistencia removida visualmente por ahora -->
                </div>
            </td>
            <td class="px-8 py-5">
                <span class="px-3 py-1 rounded-full ${Number(student.avgGrade) >= window.gradeConfig.MIN_PASSING_GRADE ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'} text-[9px] font-black uppercase tracking-widest border">
                    ${Number(student.avgGrade) >= window.gradeConfig.MIN_PASSING_GRADE ? 'Aprobado' : 'Reprobado'}
                </span>
            </td>
            <td class="px-8 py-5 text-right">
                <button class="size-8 rounded-lg bg-white/5 flex items-center justify-center text-white/20 group-hover:text-gold group-hover:bg-gold/10 transition-all">
                    <span class="material-symbols-outlined text-lg">chevron_right</span>
                </button>
            </td>
        </tr>
    `).join('')
}

function filterGrades(query) {
    const q = query.toLowerCase()
    const filtered = allGradesData.filter(s =>
        s.nombres.toLowerCase().includes(q) ||
        s.apellidos.toLowerCase().includes(q) ||
        s.cedula.toLowerCase().includes(q)
    )
    renderGradesTable(filtered)
}

window.showStudentGradeDetails = async (studentId) => {
    const panel = document.getElementById('gradeDetailPanel')
    if (!panel) return

    panel.classList.remove('hidden')
    panel.innerHTML = `
        <div class="p-8 h-full flex items-center justify-center">
            <span class="animate-spin material-symbols-outlined text-gold font-black">sync</span>
        </div>
    `

    try {
        const { data: student, error } = await supabase
            .from('estudiantes')
            .select(`
                *,
                inscripciones (
                    id,
                    carga_academica:carga_academica_id (
                        materia:materia_id (nombre:nombre_materia),
                        docente:docente_id (nombres, apellidos)
                    ),
                    calificaciones (
                        nota_corte,
                        nota_final,
                        nota_reparacion,
                        estado_materia,
                        observaciones
                    )
                )
            `)
            .eq('id', studentId)
            .single()

        if (error) throw error

        renderDetailPanel(student)

    } catch (e) {
        console.error('Error loading student details:', e)
        panel.innerHTML = `<div class="p-8 text-red-400 text-xs font-black uppercase tracking-widest">Error: ${e.message}</div>`
    }
}

function renderDetailPanel(student) {
    const panel = document.getElementById('gradeDetailPanel')
    const totalInscripciones = student.inscripciones.length

    // Calculate global stats
    const finalGrades = student.inscripciones.flatMap(i => i.calificaciones || [])

    // Calcular promedio
    const validGrades = finalGrades.filter(g => g.nota_final !== null || g.nota_reparacion !== null)
    let total = 0
    if (validGrades.length > 0) {
        total = validGrades.reduce((acc, curr) => {
            const final = curr.nota_reparacion !== null ? Number(curr.nota_reparacion) : Number(curr.nota_final || 0)
            return acc + final
        }, 0)
    }

    const avgGrade = validGrades.length > 0
        ? (total / validGrades.length).toFixed(2)
        : '0.00'

    const MIN_GRADE = window.gradeConfig?.MIN_PASSING_GRADE || 10
    const passedSubjects = finalGrades.filter(g => {
        const final = g.nota_reparacion !== null ? Number(g.nota_reparacion) : Number(g.nota_final || 0)
        return final >= MIN_GRADE
    }).length

    panel.innerHTML = `
        <div class="p-8 border-b border-white/5 bg-black/20">
            <div class="flex justify-between items-start mb-8">
                <div class="space-y-1">
                    <h3 class="text-xs font-black text-gold uppercase tracking-[0.3em]">Expediente Académico</h3>
                    <p class="text-[10px] text-white/20 font-bold uppercase tracking-widest">Detalle por unidad curricular</p>
                </div>
                <button onclick="document.getElementById('gradeDetailPanel').classList.add('hidden')" class="size-8 rounded-full hover:bg-white/5 text-white/20 hover:text-white transition-all">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
            </div>

            <div class="flex items-center gap-5 mb-8">
                <div class="size-20 rounded-3xl border-2 border-gold/30 p-1">
                    <div class="size-full rounded-2xl bg-gold/10 flex items-center justify-center text-gold font-black text-2xl">
                        ${student.nombres[0]}${student.apellidos[0]}
                    </div>
                </div>
                <div>
                    <h4 class="text-xl font-black text-white tracking-tighter">${student.nombres} ${student.apellidos}</h4>
                    <p class="text-xs font-black text-gold/60 uppercase tracking-widest mt-1">${student.cedula}</p>
                    <div class="flex gap-2 mt-3">
                        <span class="px-2 py-0.5 rounded bg-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest border border-white/10 italic">Cohorte 2024</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
                    <p class="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Índice Gral.</p>
                    <div class="flex items-baseline gap-2">
                        <p class="text-2xl font-black ${Number(avgGrade) >= MIN_GRADE ? 'text-gold' : 'text-red-400'}">${avgGrade}</p>
                        <span class="text-[9px] font-bold ${Number(avgGrade) >= MIN_GRADE ? 'text-green-400' : 'text-red-400'} tracking-tighter">
                            ${Number(avgGrade) >= MIN_GRADE ? 'GOOD' : 'ALERT'}
                        </span>
                    </div>
                </div>
                <div class="bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
                    <p class="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Materias Aprobadas</p>
                    <p class="text-2xl font-black text-white">${passedSubjects} / ${totalInscripciones}</p>
                </div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
            <div class="flex items-center justify-between">
                <h5 class="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Unidades Curriculares</h5>
                <span class="text-[9px] font-black text-gold uppercase tracking-widest">${totalInscripciones} Inscritas</span>
            </div>

            <div class="space-y-4">
                ${student.inscripciones.map(ins => {
        const cal = ins.calificaciones?.[0]
        const notaDefinitiva = cal?.nota_reparacion !== null && cal?.nota_reparacion !== undefined
            ? cal.nota_reparacion
            : (cal?.nota_final || 0)

        const minGrade = window.gradeConfig?.MIN_PASSING_GRADE || 10
        const isApproved = Number(notaDefinitiva) >= minGrade

        return `
                    <div class="bg-white/5 rounded-2xl border border-white/10 p-5 hover:border-gold/30 transition-all group">
                        <div class="flex justify-between items-start mb-4">
                            <div class="space-y-1">
                                <p class="text-xs font-black text-white uppercase tracking-wider group-hover:text-gold transition-colors">${ins.carga_academica?.materia?.nombre || 'Materia'}</p>
                                <p class="text-[9px] font-bold text-white/20 uppercase tracking-widest">Prof. ${ins.carga_academica?.docente?.nombres} ${ins.carga_academica?.docente?.apellidos}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xl font-black ${isApproved ? 'text-gold' : 'text-red-400'}">${notaDefinitiva}</p>
                                <p class="text-[8px] font-black text-white/20 uppercase tracking-tighter">Nota Definitiva</p>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-3 gap-2 pt-4 border-t border-white/5 mt-2">
                             <div class="text-center p-2 bg-black/20 rounded">
                                <span class="block text-[8px] font-black text-white/30 uppercase tracking-widest">Corte</span>
                                <span class="text-[10px] font-bold text-white">${cal?.nota_corte || '-'}</span>
                             </div>
                             <div class="text-center p-2 bg-black/20 rounded">
                                <span class="block text-[8px] font-black text-white/30 uppercase tracking-widest">Final</span>
                                <span class="text-[10px] font-bold ${cal?.nota_reparacion ? 'text-white/40 line-through' : 'text-white'}">${cal?.nota_final || '-'}</span>
                             </div>
                             <div class="text-center p-2 bg-black/20 rounded ${cal?.nota_reparacion ? 'bg-eggplant/20 border border-eggplant/50' : ''}">
                                <span class="block text-[8px] font-black text-white/30 uppercase tracking-widest">Reparación</span>
                                <span class="text-[10px] font-bold text-white">${cal?.nota_reparacion || '-'}</span>
                             </div>
                        </div>
                        
                        <div class="mt-3 flex justify-between items-center">
                            <span class="text-[9px] font-bold text-white/40 uppercase">${cal?.observaciones || 'Sin observaciones'}</span>
                            <div class="size-1.5 rounded-full ${isApproved ? 'bg-green-400' : 'bg-red-400'} shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                        </div>
                    </div>
                    `
    }).join('')}
            </div>
        </div>

        <div class="p-8 bg-black/40 border-t border-white/5 space-y-3">
            <button onclick="window.generateAcademicReport(${student.id})" class="w-full py-4 bg-gold text-primary-dark font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl hover:bg-white shadow-xl shadow-gold/10 transition-all active:scale-[0.98]">
                Emitir Historial Académico
            </button>
            <p class="text-center text-[8px] font-black text-white/20 uppercase tracking-widest">Documento con validez institucional</p>
        </div>
    `
}

window.generateAcademicReport = (studentId) => {
    if (window.NotificationSystem) {
        NotificationSystem.show('🚧 Módulo de Reportes en construcción', 'info')
    } else {
        alert('🚧 Módulo de Reportes en construcción\n\nPróximamente: Generación de PDF con historial oficial.')
    }
    console.log('[Grades] Generate report for:', studentId)
}
