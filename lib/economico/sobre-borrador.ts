// T-046 · El sobre canónico de una versión de borrador de factura, construido en TypeScript.
//
// La base no construye el sobre: lo COTEJA por valor (fn_sellar_version_borrador, T-021) y sella
// la huella sobre el texto que llega. Por eso este módulo es el único que escribe el texto, y
// devuelve también la entrada normalizada: el texto y las columnas salen de la MISMA entrada, y
// así un NFC aplicado solo al sobre, un uuid en mayúsculas o un `creada_en` con microsegundos no
// pueden dar un sobre que no coteja con su fila.
//
// Las quince claves, en el orden que exige el sellado (JCS las ordena solo):
// base_centimos, borrador_id, centro_id, creada_en, creada_por, cuota_iva_centimos, descartado,
// destinatario_nif, destinatario_nombre, esquema_version, lineas, numero_version, paciente_id,
// profesional_id, total_centimos.
import { comprobarCentimos, type Centimos } from '@/lib/dinero/importe';
import { canonizar, normalizarNfc, type ValorJson } from '@/lib/huella';

import type { LineaBorrador, NifCifrado } from './tipos';

export const ESQUEMA_VERSION_BORRADOR = 1;
/** La versión de la clave de cifrado del NIF (`lib/cifrado/claves.ts`, VERSION_CLAVE). */
const CLAVE_VERSION_NIF = 1;

export type EntradaSobreBorrador = {
  borradorId: string;
  numeroVersion: number;
  pacienteId: string;
  profesionalId: string;
  centroId: string | null;
  creadaPor: string;
  creadaEn: Date;
  descartado: boolean;
  destinatarioNombre: string;
  nif: NifCifrado;
  lineas: LineaBorrador[];
  baseCentimos: Centimos;
  cuotaCentimos: Centimos;
  totalCentimos: Centimos;
};

const minusculas = (uuid: string) => uuid.toLowerCase();

/**
 * Construye el texto del sobre y la entrada normalizada que va a las columnas. `normalizarNfc` se
 * aplica UNA vez, a la entrada entera, antes de escribir nada.
 */
export function construirSobreBorrador(e: EntradaSobreBorrador): {
  contenidoCanonico: string;
  normalizada: EntradaSobreBorrador;
} {
  comprobarCentimos(e.baseCentimos, 'La base');
  comprobarCentimos(e.cuotaCentimos, 'La cuota');
  comprobarCentimos(e.totalCentimos, 'El total');
  if (!Number.isSafeInteger(e.numeroVersion) || e.numeroVersion < 1) {
    throw new Error(`numero_version ha de ser un entero mayor o igual que 1: '${e.numeroVersion}'.`);
  }
  if (Number.isNaN(e.creadaEn.getTime())) throw new Error('creada_en no es un instante válido.');
  for (const l of e.lineas) {
    comprobarCentimos(l.precio_unitario_centimos, 'El precio de una línea');
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad < 1) {
      throw new Error(`La cantidad de una línea ha de ser un entero mayor o igual que 1: '${l.cantidad}'.`);
    }
  }

  // Los textos libres pasan por NFC; los uuid, a minúsculas; el instante, a milisegundos.
  const textos = normalizarNfc({
    destinatarioNombre: e.destinatarioNombre,
    conceptos: e.lineas.map((l) => l.concepto),
  } as unknown as ValorJson) as unknown as { destinatarioNombre: string; conceptos: string[] };

  const normalizada: EntradaSobreBorrador = {
    borradorId: minusculas(e.borradorId),
    numeroVersion: e.numeroVersion,
    pacienteId: minusculas(e.pacienteId),
    profesionalId: minusculas(e.profesionalId),
    centroId: e.centroId === null ? null : minusculas(e.centroId),
    creadaPor: minusculas(e.creadaPor),
    creadaEn: new Date(e.creadaEn.toISOString()),
    descartado: e.descartado,
    destinatarioNombre: textos.destinatarioNombre,
    nif: e.nif === null ? null : { cifrado: e.nif.cifrado, nonce: e.nif.nonce, etiqueta: e.nif.etiqueta },
    lineas: e.lineas.map((l, i) => ({
      concepto: textos.conceptos[i],
      cantidad: l.cantidad,
      precio_unitario_centimos: l.precio_unitario_centimos,
      regimen_iva: l.regimen_iva,
      tipo_iva_centesimas: l.tipo_iva_centesimas,
      cita_id: l.cita_id === null ? null : minusculas(l.cita_id),
    })),
    baseCentimos: e.baseCentimos,
    cuotaCentimos: e.cuotaCentimos,
    totalCentimos: e.totalCentimos,
  };

  const sobre = {
    base_centimos: normalizada.baseCentimos,
    borrador_id: normalizada.borradorId,
    centro_id: normalizada.centroId,
    creada_en: normalizada.creadaEn.toISOString(),
    creada_por: normalizada.creadaPor,
    cuota_iva_centimos: normalizada.cuotaCentimos,
    descartado: normalizada.descartado,
    destinatario_nif:
      normalizada.nif === null
        ? null
        : {
            cifrado: normalizada.nif.cifrado,
            clave_version: CLAVE_VERSION_NIF,
            etiqueta: normalizada.nif.etiqueta,
            nonce: normalizada.nif.nonce,
          },
    destinatario_nombre: normalizada.destinatarioNombre,
    esquema_version: ESQUEMA_VERSION_BORRADOR,
    lineas: normalizada.lineas,
    numero_version: normalizada.numeroVersion,
    paciente_id: normalizada.pacienteId,
    profesional_id: normalizada.profesionalId,
    total_centimos: normalizada.totalCentimos,
  };

  return { contenidoCanonico: canonizar(sobre as unknown as ValorJson), normalizada };
}
