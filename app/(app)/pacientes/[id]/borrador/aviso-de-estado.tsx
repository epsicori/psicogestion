'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Descartar desde la ruta de corrección revalida la página en la misma respuesta de la acción, y el
 * servidor sustituye el editor por la vista de solo lectura: el aviso del editor, que tenía el foco,
 * desaparece con él (H3 de la revisión). El editor marca aquí que hay un descarte en curso, y el aviso
 * de la vista nueva recoge el foco al montarse si nadie lo tiene. Fuera de ese caso el aviso no roba
 * el foco: abrir un borrador descartado deja el foco donde lo pone la navegación.
 */
let descarteEnCurso = false;

export function marcarDescarteEnCurso(activo: boolean) {
  descarteEnCurso = activo;
}

export function AvisoDeEstado({ children }: { children: ReactNode }) {
  const aviso = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!descarteEnCurso) return;
    descarteEnCurso = false;
    const activo = document.activeElement;
    if (!activo || activo === document.body) aviso.current?.focus();
  }, []);
  return (
    <p ref={aviso} role="status" tabIndex={-1} className="text-sm font-medium outline-none">
      {children}
    </p>
  );
}
