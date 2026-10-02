// T-005 · Reexportaciones del mecanismo de cadena de huellas.

export { canonizar, canonizarABytes, ErrorCanonicalizacion, type ValorJson } from './jcs';
export { normalizarNfc, ErrorNormalizacionNfc } from './nfc';
export { calcularRedactadaEnSesion, type ParametrosRedactadaEnSesion } from './sesion';
export {
  ESQUEMA_VERSION,
  ALGORITMO_VERSION,
  esquemaSobre,
  construirSobre,
  canonizarSobre,
  type Sobre,
  type EntradaFirma,
} from './sobre';
export { firmarVersionNota, type ResultadoFirma } from './firmar';
