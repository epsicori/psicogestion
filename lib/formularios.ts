export type EstadoFormulario = {
  errores?: Record<string, string[]>;
  mensaje?: string;
};

export const ESTADO_INICIAL: EstadoFormulario = {};
