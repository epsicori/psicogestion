import type { CitaVista, DiaVista } from './vista';

/** Una cita de prueba con todos los campos; cada prueba pisa lo que le interesa. */
export function citaDePrueba(extra: Partial<CitaVista> = {}): CitaVista {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tramo: 0,
    pacienteId: '33333333-3333-4333-8333-333333333333',
    diaIndice: 1,
    fechaLocal: '2026-09-29',
    horaLocal: '17:00',
    minutoPared: 1020,
    duracionMinutos: 50,
    columna: 0,
    columnasEnGrupo: 1,
    rango: '17:00–17:50',
    duracion: '50 min',
    nombrePaciente: 'Ana García López',
    nombreCorto: 'Ana G.',
    profesionalNombre: 'Lucía Márquez',
    colorProfesional: 1,
    tipoNombre: 'Terapia individual',
    centroNombre: 'Centro Norte',
    sala: '2',
    notaOperativa: 'Trae el informe',
    estado: 'programada',
    late: false,
    deSerie: false,
    desviada: false,
    motivoDesviacion: null,
    reprogramable: true,
    alcanceSiguientesPermitido: false,
    propuestaPendiente: null,
    notas: { mostrar: false, href: '/pacientes/x/historia/notas?cita=y', primario: false, diasPendiente: null },
    ...extra,
  };
}

const FECHAS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const NUMEROS = ['28', '29', '30', '1', '2', '3', '4'];
const CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Los siete días de la semana del lunes 28 de septiembre de 2026; hoy es el martes 29. */
export function diasDePrueba(): DiaVista[] {
  return FECHAS.map((fecha, i) => ({
    fecha,
    numero: NUMEROS[i],
    etiquetaCorta: CORTOS[i],
    etiquetaLarga: `${LARGOS[i]}, ${NUMEROS[i]} de ${i < 3 ? 'septiembre' : 'octubre'} de 2026`,
    esHoy: i === 1,
    delMes: true,
  }));
}
