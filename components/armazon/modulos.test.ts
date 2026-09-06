import { describe, expect, it } from 'vitest';

import { MODULOS, modulosDe } from './modulos';

// La matriz de `docs/architecture.md` §Roles convertida en aserciones. El filtro por rol
// es una regla del dominio, y una regla del dominio que solo vive dentro de un JSX es una
// regla que nadie vuelve a comprobar.

describe('modulosDe · el armazón enseña lo que la matriz concede, y nada más', () => {
  it('el administrador ve los cuatro módulos', () => {
    expect(modulosDe('administrador').map((m) => m.href)).toEqual([
      '/agenda',
      '/pacientes',
      '/facturacion',
      '/ajustes',
    ]);
  });

  it('el profesional sanitario NO ve Ajustes: «Usuarios y ajustes de empresa: sin acceso»', () => {
    const hrefs = modulosDe('profesional_sanitario').map((m) => m.href);
    expect(hrefs).not.toContain('/ajustes');
    expect(hrefs).toEqual(['/agenda', '/pacientes', '/facturacion']);
  });

  it('el técnico administrativo tampoco ve Ajustes', () => {
    const hrefs = modulosDe('tecnico_administrativo').map((m) => m.href);
    expect(hrefs).not.toContain('/ajustes');
    expect(hrefs).toEqual(['/agenda', '/pacientes', '/facturacion']);
  });

  it('sin rol legible NO se enseña ningún módulo: fallo cerrado', () => {
    // Una sesión sin perfil, o con el perfil dado de baja, no recibe el mapa del
    // producto. Devolver la lista entera «porque total, no son enlaces» sería enseñar
    // qué existe a quien ya no debería estar mirando.
    expect(modulosDe(null)).toEqual([]);
  });

  it('Ajustes es el ÚNICO módulo recortado hoy, y lo es solo para el administrador', () => {
    // Gemela de las anteriores: si mañana alguien recorta otro módulo sin pasar por la
    // matriz, esta prueba lo señala en vez de dejarlo pasar en silencio.
    const recortados = MODULOS.filter((m) => m.roles.length < 3);
    expect(recortados.map((m) => m.href)).toEqual(['/ajustes']);
    expect(recortados[0].roles).toEqual(['administrador']);
  });

  it('ningún módulo se queda sin rol: una lista vacía lo escondería de todos en silencio', () => {
    for (const modulo of MODULOS) {
      expect(modulo.roles.length).toBeGreaterThan(0);
    }
  });
});
