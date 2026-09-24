import 'server-only';

import { normalizarNif } from '../identidad/nif';
import { cifrar, descifrar, indice } from './aes-gcm';
import { aBase64, desdeBytea } from './bytea';
import { claveDeCifrado, claveDeIndice, VERSION_CLAVE } from './claves';

// T-032, ADR-029/060. Compone lib/cifrado con lib/identidad: aquí, y solo aquí, un
// documento en claro se convierte en las columnas que `alta_paciente()` espera, y una
// fila devuelta por `leer_identificacion()` se convierte de vuelta en texto legible.

export type IdentificacionEnClaro = { documento?: string; domicilio?: string };

export type ColumnasIdentificacion = {
  p_tipo_documento: 'dni' | 'nie' | null;
  p_dni_cifrado: string | null;
  p_dni_nonce: string | null;
  p_dni_etiqueta: string | null;
  p_dni_indice: string | null;
  p_domicilio_cifrado: string | null;
  p_domicilio_nonce: string | null;
  p_domicilio_etiqueta: string | null;
  p_clave_version: number;
  p_indice_clave_version: number;
};

/** Exactamente lo que devuelve `leer_identificacion()` (una fila del array de datos). */
export type FilaIdentificacion = {
  tipo_documento: string | null;
  dni_cifrado: string | null;
  dni_nonce: string | null;
  dni_etiqueta: string | null;
  dni_clave_version: number | null;
  domicilio_cifrado: string | null;
  domicilio_nonce: string | null;
  domicilio_etiqueta: string | null;
  domicilio_clave_version: number | null;
};

/**
 * Solo existe la clave v1 (la rotación está fuera de T-032, y la tabla lo fija con un
 * `check (… = 1)`). Si una fila llegara con otra versión, descifrarla con la v1 daría un
 * fallo de etiqueta indistinguible de una manipulación: se lanza antes, con el motivo.
 */
function exigirVersion(parte: 'documento' | 'domicilio', version: number | null): void {
  if (version !== VERSION_CLAVE) {
    throw new Error(
      `El ${parte} está cifrado con la versión de clave ${version ?? '(nula)'} y este módulo ` +
        `solo sabe descifrar la ${VERSION_CLAVE}.`,
    );
  }
}

function derivarTipoDocumento(normalizado: string): 'dni' | 'nie' {
  return /^[XYZ]/.test(normalizado) ? 'nie' : 'dni';
}

/**
 * Cifra documento y domicilio para el alta. El documento se normaliza con
 * `normalizarNif()` **antes** de cifrar y de indexar: se cifra la forma normalizada, no
 * lo tecleado, o dos fichas del mismo DNI enseñarían textos distintos con el mismo
 * índice. El domicilio se cifra con la misma clave AES y no se indexa.
 */
export async function cifrarIdentificacion(
  datos: IdentificacionEnClaro,
): Promise<ColumnasIdentificacion> {
  // La clave se pide solo si hay algo que cifrar (M3 de la revisión): el alta mínima no
  // toca el Vault, así que una caída del Vault no impide dar de alta sin DNI ni domicilio.
  let claveMemo: Buffer | null = null;
  const clave = async () => (claveMemo ??= await claveDeCifrado());

  let tipoDocumento: 'dni' | 'nie' | null = null;
  let dniCifrado: string | null = null;
  let dniNonce: string | null = null;
  let dniEtiqueta: string | null = null;
  let dniIndice: string | null = null;

  if (datos.documento !== undefined && datos.documento !== '') {
    const normalizado = normalizarNif(datos.documento);
    tipoDocumento = derivarTipoDocumento(normalizado);
    const sobre = cifrar(await clave(), normalizado);
    dniCifrado = aBase64(sobre.cifrado);
    dniNonce = aBase64(sobre.nonce);
    dniEtiqueta = aBase64(sobre.etiqueta);

    const claveIndice = await claveDeIndice();
    dniIndice = aBase64(indice(claveIndice, normalizado));
  }

  let domicilioCifrado: string | null = null;
  let domicilioNonce: string | null = null;
  let domicilioEtiqueta: string | null = null;

  if (datos.domicilio !== undefined && datos.domicilio !== '') {
    const sobre = cifrar(await clave(), datos.domicilio);
    domicilioCifrado = aBase64(sobre.cifrado);
    domicilioNonce = aBase64(sobre.nonce);
    domicilioEtiqueta = aBase64(sobre.etiqueta);
  }

  return {
    p_tipo_documento: tipoDocumento,
    p_dni_cifrado: dniCifrado,
    p_dni_nonce: dniNonce,
    p_dni_etiqueta: dniEtiqueta,
    p_dni_indice: dniIndice,
    p_domicilio_cifrado: domicilioCifrado,
    p_domicilio_nonce: domicilioNonce,
    p_domicilio_etiqueta: domicilioEtiqueta,
    p_clave_version: VERSION_CLAVE,
    p_indice_clave_version: VERSION_CLAVE,
  };
}

/**
 * Descifra una fila devuelta por `leer_identificacion()`. Este módulo no consulta la
 * tabla: recibe la fila de quien la pidió por RPC, que es el único camino que deja
 * rastro (ADR-060). `dni_indice` no forma parte de `FilaIdentificacion` porque
 * `leer_identificacion()` no lo devuelve.
 */
export async function descifrarIdentificacion(
  fila: FilaIdentificacion,
): Promise<IdentificacionEnClaro> {
  const resultado: IdentificacionEnClaro = {};

  const dniCifrado = desdeBytea(fila.dni_cifrado);
  const dniNonce = desdeBytea(fila.dni_nonce);
  const dniEtiqueta = desdeBytea(fila.dni_etiqueta);
  if (dniCifrado && dniNonce && dniEtiqueta) {
    exigirVersion('documento', fila.dni_clave_version);
    resultado.documento = descifrar(await claveDeCifrado(), {
      cifrado: dniCifrado,
      nonce: dniNonce,
      etiqueta: dniEtiqueta,
    });
  }

  const domicilioCifrado = desdeBytea(fila.domicilio_cifrado);
  const domicilioNonce = desdeBytea(fila.domicilio_nonce);
  const domicilioEtiqueta = desdeBytea(fila.domicilio_etiqueta);
  if (domicilioCifrado && domicilioNonce && domicilioEtiqueta) {
    exigirVersion('domicilio', fila.domicilio_clave_version);
    resultado.domicilio = descifrar(await claveDeCifrado(), {
      cifrado: domicilioCifrado,
      nonce: domicilioNonce,
      etiqueta: domicilioEtiqueta,
    });
  }

  return resultado;
}
