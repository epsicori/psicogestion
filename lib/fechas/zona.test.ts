import { describe, expect, it } from 'vitest';

import { esZonaHorariaValida, resolverZona } from './zona';

describe('esZonaHorariaValida', () => {
  it('acepta nombres IANA', () => {
    expect(esZonaHorariaValida('Europe/Madrid')).toBe(true);
    expect(esZonaHorariaValida('Atlantic/Canary')).toBe(true);
  });

  it('rechaza abreviaturas y nombres que no son IANA', () => {
    expect(esZonaHorariaValida('CET')).toBe(false);
    expect(esZonaHorariaValida('Madrid')).toBe(false);
  });
});

describe('resolverZona', () => {
  it('el centro manda sobre la organización', () => {
    expect(resolverZona('Atlantic/Canary', 'Europe/Madrid')).toBe('Atlantic/Canary');
  });

  it('la organización es el valor por defecto', () => {
    expect(resolverZona(null, 'Europe/Madrid')).toBe('Europe/Madrid');
  });

  it('un nulo en los dos lanza, no devuelve UTC silencioso', () => {
    expect(() => resolverZona(null, null)).toThrow(/Sin zona horaria/);
  });
});
