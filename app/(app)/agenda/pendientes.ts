import type { RolUsuario } from '@/components/armazon/modulos';
import type { AlertaPendiente } from '@/lib/citas/agenda';
import { t, tCon } from '@/lib/i18n';
import { Constants } from '@/lib/supabase/tipos-bd';

import { diasPendiente, puedeResolverAlerta } from './bloques';

/**
 * Lo que la bandeja de documentación calcula antes de pintar (T-048): agrupar por paciente,
 * ordenar, paginar, resumir y presentar. Puro y sin E/S ni reloj (`hoy` lo pasa quien llama,
 * que antes ha hecho `await connection()`). El cliente recibe ya presentado lo que pinta.
 */

type TipoAlerta = AlertaPendiente['tipo'];
type Nivel = 1 | 2 | 3;

/** Pacientes que enseña el panel de /agenda (D13). */
export const TAMANO_PANEL = 6;
export const TAMANO_PAGINA = 20;
/** Pendientes que enseña la fila desplegada en el panel; el resto, tras «Ver todos». */
export const MAXIMO_DESPLEGABLE = 10;
/** Pacientes que devuelve una búsqueda (D10). */
export const MAXIMO_RESULTADOS = 20;

/** Orden fijo de los tipos en el resumen (D7): el del enum de la base (P1). */
export const ORDEN_TIPOS: readonly TipoAlerta[] = Constants.public.Enums.tipo_alerta_documentacion;

export type Filtros = { tipo: TipoAlerta | null; nivel: Nivel | null; paciente: string | null };

export type GrupoOrdenado = {
  pacienteId: string;
  alertas: AlertaPendiente[];
  recuento: number;
  /** Nivel 2 o 3 (D4). */
  escalados: number;
  nivelMaximo: Nivel | null;
  /** La menor `fechaReferencia` no nula. */
  fechaMasAntigua: string | null;
};

export type PendientePresentado = {
  id: string;
  etiquetaTipo: string;
  textoDesde: string;
  pildora: string | null;
  destino: string;
  nombreEnlace: string;
  resoluble: boolean;
};

export type GrupoPresentado = {
  pacienteId: string;
  nombre: string;
  hrefPaciente: string;
  recuento: number;
  insignia: string;
  urgencia: 'muy-atrasada' | 'atrasada' | null;
  textoUrgencia: string | null;
  textoAccesible: string;
  resumen: string | null;
  anuncio: string;
  pendientes: PendientePresentado[];
  verTodos: { href: string; texto: string } | null;
};

/**
 * Los tipos que se piden a la base. El filtro del usuario solo estrecha lo que el rol ya ve:
 * un tipo fuera del criterio da `[]` (nada que leer), nunca una ampliación.
 */
export function tiposConsultados(
  criterio: { tipos?: readonly TipoAlerta[] },
  tipo: TipoAlerta | null,
): readonly TipoAlerta[] | undefined {
  if (tipo === null) return criterio.tipos;
  if (!criterio.tipos || criterio.tipos.includes(tipo)) return [tipo];
  return [];
}

/** Los tipos que el rol puede ver, para decidir qué filtros se pintan. */
export function tiposVisibles(criterio: { tipos?: readonly TipoAlerta[] }): readonly TipoAlerta[] {
  return criterio.tipos ?? ORDEN_TIPOS;
}

// Se comparan con `<` y `>` y no con `localeCompare`: el orden no puede depender de la configuración
// regional del servidor, y los uuid y las fechas AAAA-MM-DD ya ordenan bien así.
function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compararNulosAlFinal(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return comparar(a, b);
}

function compararAlertas(a: AlertaPendiente, b: AlertaPendiente): number {
  const nivel = (b.nivel ?? 0) - (a.nivel ?? 0);
  if (nivel !== 0) return nivel;
  // El nivel nulo va después de cualquier nivel.
  if ((a.nivel === null) !== (b.nivel === null)) return a.nivel === null ? 1 : -1;
  return (
    compararNulosAlFinal(a.fechaReferencia, b.fechaReferencia) ||
    compararNulosAlFinal(a.creadaEn, b.creadaEn) ||
    comparar(a.id, b.id)
  );
}

/**
 * Agrupa por paciente y ordena: dentro del paciente, por urgencia; entre pacientes, por el nivel
 * máximo, el pendiente más antiguo y el id. No confía en el orden de la lectura.
 */
export function agruparYOrdenar(alertas: readonly AlertaPendiente[]): GrupoOrdenado[] {
  const porPaciente = new Map<string, AlertaPendiente[]>();
  for (const alerta of alertas) {
    const lista = porPaciente.get(alerta.pacienteId);
    if (lista) lista.push(alerta);
    else porPaciente.set(alerta.pacienteId, [alerta]);
  }

  const grupos: GrupoOrdenado[] = [...porPaciente].map(([pacienteId, lista]) => {
    const ordenadas = [...lista].sort(compararAlertas);
    const niveles = ordenadas.flatMap((a) => (a.nivel === null ? [] : [a.nivel]));
    const fechas = ordenadas.flatMap((a) => (a.fechaReferencia === null ? [] : [a.fechaReferencia]));
    return {
      pacienteId,
      alertas: ordenadas,
      recuento: ordenadas.length,
      escalados: ordenadas.filter((a) => a.nivel === 2 || a.nivel === 3).length,
      nivelMaximo: niveles.length === 0 ? null : (Math.max(...niveles) as Nivel),
      fechaMasAntigua: fechas.length === 0 ? null : fechas.reduce((a, b) => (b < a ? b : a)),
    };
  });

  return grupos.sort(
    (a, b) =>
      (b.nivelMaximo ?? 0) - (a.nivelMaximo ?? 0) ||
      compararNulosAlFinal(a.fechaMasAntigua, b.fechaMasAntigua) ||
      comparar(a.pacienteId, b.pacienteId),
  );
}

/**
 * Una página de la lista. No corrige una página pasada de la última: devuelve vacío, y de
 * redirigir se encarga quien llama.
 */
export function paginar<T>(
  items: readonly T[],
  pagina: number,
  tamano: number,
): { items: T[]; pagina: number; ultima: number } {
  const ultima = Math.max(1, Math.ceil(items.length / tamano));
  return { items: items.slice((pagina - 1) * tamano, pagina * tamano), pagina, ultima };
}

export function textoDesde(dias: number | null): string {
  if (dias === null) return t('agenda.documentacion.desde.sinFecha');
  // Una fecha de referencia «de mañana» sale del cálculo en UTC de la base (H12): cuenta como hoy.
  if (dias <= 0) return t('agenda.documentacion.desde.hoy');
  if (dias === 1) return t('agenda.documentacion.desde.una');
  return tCon('agenda.documentacion.desde.varias', { n: dias });
}

/**
 * A dónde lleva un pendiente (D8): a la nota solo si es una nota sin firmar con su cita de origen
 * y el rol puede abrir la historia; en cualquier otro caso, a la ficha del paciente.
 */
export function destinoPendiente(alerta: AlertaPendiente, rol: RolUsuario | null): string {
  const ficha = `/pacientes/${alerta.pacienteId}`;
  const puedeAbrirNota = rol === 'administrador' || rol === 'profesional_sanitario';
  if (
    alerta.tipo === 'nota_sin_firmar' &&
    alerta.origenTabla === 'citas' &&
    alerta.origenId !== null &&
    puedeAbrirNota
  ) {
    return `${ficha}/historia/notas?cita=${alerta.origenId}`;
  }
  return ficha;
}

/** La dirección de la página, con los parámetros en un orden fijo y sin los vacíos. */
export function hrefDocumentacion(p: Partial<Filtros> & { pagina?: number }): string {
  const parametros = new URLSearchParams();
  if (p.tipo) parametros.set('tipo', p.tipo);
  if (p.nivel) parametros.set('nivel', String(p.nivel));
  if (p.paciente) parametros.set('paciente', p.paciente);
  if (p.pagina !== undefined && p.pagina > 1) parametros.set('pagina', String(p.pagina));
  const consulta = parametros.toString();
  return consulta ? `/agenda/documentacion?${consulta}` : '/agenda/documentacion';
}

function textoInsignia(recuento: number): string {
  return recuento === 1
    ? t('agenda.documentacion.insignia.una')
    : tCon('agenda.documentacion.insignia.varias', { n: recuento });
}

/** El nombre accesible de la fila del paciente (criterio 6): «Ana López, 6 pendientes, 2 escalados». */
export function textoAccesiblePaciente(nombre: string, recuento: number, escalados: number): string {
  const insignia = textoInsignia(recuento);
  if (escalados === 0) return tCon('agenda.documentacion.accesible.base', { nombre, insignia });
  const texto =
    escalados === 1
      ? t('agenda.documentacion.accesible.escalados.una')
      : tCon('agenda.documentacion.accesible.escalados.varias', { n: escalados });
  return tCon('agenda.documentacion.accesible.conEscalados', { nombre, insignia, escalados: texto });
}

/** «3 notas · 1 consentimiento — el más antiguo, hace 12 días» (D7); nada con un solo pendiente. */
export function resumenPorTipo(grupo: GrupoOrdenado, hoy: string): string | null {
  if (grupo.recuento < 2) return null;
  const partes = ORDEN_TIPOS.flatMap((tipo) => {
    const n = grupo.alertas.filter((a) => a.tipo === tipo).length;
    if (n === 0) return [];
    return [
      n === 1
        ? t(`agenda.documentacion.resumen.tipos.${tipo}.una`)
        : tCon(`agenda.documentacion.resumen.tipos.${tipo}.varias`, { n }),
    ];
  });
  const lista = partes.join(t('agenda.documentacion.resumen.separador'));
  const dias = diasPendiente(grupo.fechaMasAntigua, hoy);
  if (dias === null) return lista;
  if (dias <= 0) return lista + t('agenda.documentacion.resumen.antiguo.hoy');
  if (dias === 1) return lista + t('agenda.documentacion.resumen.antiguo.una');
  return lista + tCon('agenda.documentacion.resumen.antiguo.varias', { n: dias });
}

function presentarPendiente(
  alerta: AlertaPendiente,
  nombre: string,
  rol: RolUsuario | null,
  hoy: string,
): PendientePresentado {
  const etiquetaTipo = t(`agenda.documentacion.tipos.${alerta.tipo}`);
  const destino = destinoPendiente(alerta, rol);
  const aLaNota = destino !== `/pacientes/${alerta.pacienteId}`;
  return {
    id: alerta.id,
    etiquetaTipo,
    textoDesde: textoDesde(diasPendiente(alerta.fechaReferencia, hoy)),
    // El nivel lo calcula la base (T-015 §1.7); el nivel 1 es la presencia discreta en la lista.
    pildora:
      alerta.nivel === 3
        ? t('agenda.documentacion.nivel3')
        : alerta.nivel === 2
          ? t('agenda.documentacion.nivel2')
          : null,
    destino,
    nombreEnlace: tCon(aLaNota ? 'agenda.documentacion.enlace.nota' : 'agenda.documentacion.enlace.ficha', {
      tipo: etiquetaTipo,
      paciente: nombre,
    }),
    resoluble: puedeResolverAlerta(rol, alerta.tipo),
  };
}

export function presentarGrupo(
  grupo: GrupoOrdenado,
  opciones: {
    rol: RolUsuario | null;
    hoy: string;
    nombre: string | null;
    modo: 'desplegable' | 'completo';
    filtros: Filtros;
  },
): GrupoPresentado {
  const { rol, hoy, modo, filtros } = opciones;
  const nombre = opciones.nombre ?? t('agenda.cita.paciente');
  const urgencia =
    grupo.nivelMaximo === 3 ? 'muy-atrasada' : grupo.nivelMaximo === 2 ? 'atrasada' : null;
  const textoAccesible = textoAccesiblePaciente(nombre, grupo.recuento, grupo.escalados);
  const resumen = resumenPorTipo(grupo, hoy);
  const recortar = modo === 'desplegable' && grupo.recuento > MAXIMO_DESPLEGABLE;
  const visibles = recortar ? grupo.alertas.slice(0, MAXIMO_DESPLEGABLE) : grupo.alertas;

  return {
    pacienteId: grupo.pacienteId,
    nombre,
    hrefPaciente: `/pacientes/${grupo.pacienteId}`,
    recuento: grupo.recuento,
    insignia: textoInsignia(grupo.recuento),
    urgencia,
    textoUrgencia:
      urgencia === 'muy-atrasada'
        ? t('agenda.documentacion.nivel3')
        : urgencia === 'atrasada'
          ? t('agenda.documentacion.nivel2')
          : null,
    textoAccesible,
    resumen,
    anuncio: resumen ? `${textoAccesible} — ${resumen}` : textoAccesible,
    pendientes: visibles.map((a) => presentarPendiente(a, nombre, rol, hoy)),
    verTodos: recortar
      ? {
          href: hrefDocumentacion({ tipo: filtros.tipo, nivel: filtros.nivel, paciente: grupo.pacienteId }),
          texto: tCon('agenda.documentacion.verTodos', { n: grupo.recuento }),
        }
      : null,
  };
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
}

/** ¿Cada palabra del término está en el nombre o en los apellidos? Sin tildes ni mayúsculas. */
export function coincideBusqueda(termino: string, nombre: string | null, apellidos: string | null): boolean {
  if (nombre === null && apellidos === null) return false;
  const palabras = normalizar(termino)
    .split(/\s+/)
    .filter((p) => p !== '');
  const normalizadoNombre = normalizar(nombre ?? '');
  const normalizadoApellidos = normalizar(apellidos ?? '');
  return palabras.every((p) => normalizadoNombre.includes(p) || normalizadoApellidos.includes(p));
}
