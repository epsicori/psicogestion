import { FORMAS_DE_PAGO } from './esquemas';

/**
 * Los filtros de la lista de facturas del espejo (T-023b), leídos de la URL. Puro: sin red, sin reloj
 * (el «hoy» lo trae quien llama, el de la zona de la organización).
 *
 * Un valor que no vale **no se aplica en silencio**: se usa el de siempre y se anota un aviso, que la pantalla
 * enseña. Un parámetro vacío es «sin valor» (así llega del formulario con el campo borrado) y no avisa.
 */

export type FormaDePago = (typeof FORMAS_DE_PAGO)[number];
export type AvisoDeFiltro = 'desde' | 'hasta' | 'forma' | 'rango';

export type FiltrosFacturas = {
  /** 'YYYY-MM-DD', día 1 del mes de hace dos meses salvo que la URL diga otra cosa. */
  desde: string;
  /** 'YYYY-MM-DD', hoy salvo que la URL diga otra cosa. */
  hasta: string;
  formaPago: FormaDePago | null;
  /** Página de la lista de facturas (1 si no valida). */
  pagina: number;
  avisos: AvisoDeFiltro[];
  /** Lo que el usuario puso y valió: es lo único que viaja de vuelta a la URL. */
  explicitos: { desde: string | null; hasta: string | null; formaPago: FormaDePago | null };
};

type Parametros = Record<string, string | string[] | undefined>;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es un día real del calendario? Con aritmética UTC a las 12:00: sin saltos de hora que valgan. */
function esFechaReal(texto: string): boolean {
  const m = FECHA.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** El día 1 del mes de hace `meses` meses respecto de `fecha` ('YYYY-MM-DD'). */
function primeroDeHaceMeses(fecha: string, meses: number): string {
  const m = FECHA.exec(fecha);
  if (!m) throw new Error(`Fecha no válida: ${fecha}`);
  const indice = Number(m[1]) * 12 + (Number(m[2]) - 1) - meses;
  const anio = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`;
}

/** `valor` de la URL: undefined/'' → ausente; un arreglo (parámetro repetido) → inválido. */
type Lectura = { tipo: 'ausente' } | { tipo: 'invalido' } | { tipo: 'valor'; valor: string };
function leer(valor: string | string[] | undefined): Lectura {
  if (valor === undefined || valor === '') return { tipo: 'ausente' };
  if (typeof valor !== 'string') return { tipo: 'invalido' };
  return { tipo: 'valor', valor };
}

export function leerFiltrosFacturas(parametros: Parametros, hoy: string): FiltrosFacturas {
  const avisos: AvisoDeFiltro[] = [];

  const lecturaDesde = leer(parametros.desde);
  const lecturaHasta = leer(parametros.hasta);
  const lecturaForma = leer(parametros.forma);

  let desde = lecturaDesde.tipo === 'valor' && esFechaReal(lecturaDesde.valor) ? lecturaDesde.valor : null;
  let hasta = lecturaHasta.tipo === 'valor' && esFechaReal(lecturaHasta.valor) ? lecturaHasta.valor : null;
  if (lecturaDesde.tipo !== 'ausente' && desde === null) avisos.push('desde');
  if (lecturaHasta.tipo !== 'ausente' && hasta === null) avisos.push('hasta');

  const formaPago =
    lecturaForma.tipo === 'valor' && (FORMAS_DE_PAGO as readonly string[]).includes(lecturaForma.valor)
      ? (lecturaForma.valor as FormaDePago)
      : null;
  if (lecturaForma.tipo !== 'ausente' && formaPago === null) avisos.push('forma');

  if (desde !== null && hasta !== null && desde > hasta) {
    avisos.push('rango');
    desde = null;
    hasta = null;
  }

  const hastaEfectivo = hasta ?? hoy;
  let desdeEfectivo = desde;
  if (desdeEfectivo === null) {
    // El de siempre; si el «hasta» elegido cae antes, se baja al primero de su mes para no dejar el rango al revés.
    const porDefecto = primeroDeHaceMeses(hoy, 2);
    desdeEfectivo = porDefecto <= hastaEfectivo ? porDefecto : `${hastaEfectivo.slice(0, 8)}01`;
  }

  const lecturaPagina = leer(parametros.paginaFacturas);
  const pagina =
    lecturaPagina.tipo === 'valor' && /^[1-9]\d{0,8}$/.test(lecturaPagina.valor) ? Number(lecturaPagina.valor) : 1;

  return {
    desde: desdeEfectivo,
    hasta: hastaEfectivo,
    formaPago,
    pagina,
    avisos,
    explicitos: { desde, hasta, formaPago },
  };
}

export type EstadoDeUrl = {
  profesional: string | null;
  /** Página de la lista del pendiente. */
  pagina: number;
  /** Página de la lista de facturas. */
  paginaFacturas: number;
  explicitos: FiltrosFacturas['explicitos'];
};

/** `/facturacion` con todo lo que hay que conservar al cambiar una cosa; lo que vale por defecto no va. */
export function hrefFacturacion(estado: EstadoDeUrl): string {
  const parametros = new URLSearchParams();
  if (estado.profesional) parametros.set('profesional', estado.profesional);
  if (estado.pagina > 1) parametros.set('pagina', String(estado.pagina));
  if (estado.explicitos.desde) parametros.set('desde', estado.explicitos.desde);
  if (estado.explicitos.hasta) parametros.set('hasta', estado.explicitos.hasta);
  if (estado.explicitos.formaPago) parametros.set('forma', estado.explicitos.formaPago);
  if (estado.paginaFacturas > 1) parametros.set('paginaFacturas', String(estado.paginaFacturas));
  const consulta = parametros.toString();
  return consulta ? `/facturacion?${consulta}` : '/facturacion';
}
