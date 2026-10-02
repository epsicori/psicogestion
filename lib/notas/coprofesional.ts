// T-012 · Quién puede figurar como coprofesional de una nota. Es la misma regla que el
// disparador de T-034, y el disparador es quien manda; esto solo llena el selector.

/** La misma lista cerrada que el paso 7b del disparador (ADR-073.2); el disparador manda. */
export const ROLES_COPROFESIONAL = ['profesional_sanitario', 'administrador'] as const;
