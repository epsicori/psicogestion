// T-012 · Quién puede figurar como coprofesional de una nota. Es la misma regla que el
// disparador de T-034, y el disparador es quien manda; esto solo llena el selector.

/** T-035 añade `'administrador'` (ADR-073.2) en esta línea y en ningún otro sitio. */
export const ROLES_COPROFESIONAL = ['profesional_sanitario'] as const;
