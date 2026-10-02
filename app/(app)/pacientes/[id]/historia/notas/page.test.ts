import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * El armazón de la ruta no puede leer nada clínico: lo clínico se abre con un gesto y deja su
 * acceso. Se comprueba sobre el FUENTE, que es lo que decide qué viaja en el HTML del servidor.
 */
const fuente = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('page.tsx de la nota (armazón)', () => {
  it('no menciona la tabla de notas clínicas', () => {
    expect(fuente).not.toContain('notas_clinicas');
  });

  it('no importa el servidor de notas', () => {
    expect(fuente).not.toContain('lib/notas/servidor');
  });

  it('no importa las acciones de la nota: el editor las importa por su cuenta', () => {
    expect(fuente).not.toMatch(/from\s+['"]\.\/acciones['"]/);
  });

  it('no usa `use cache` (ADR-043)', () => {
    expect(fuente).not.toMatch(/['"]use cache/);
  });

  it('exporta el viewport con interactiveWidget resizes-content', () => {
    expect(fuente).toMatch(/export const viewport[^=]*=\s*\{\s*interactiveWidget:\s*'resizes-content'\s*\}/);
  });

  it('el trabajo asíncrono va bajo Suspense con el esqueleto', () => {
    expect(fuente).toContain('<Suspense fallback={<EsqueletoEditor />}>');
  });
});
