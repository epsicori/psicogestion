import { describe, expect, it } from 'vitest';

import { esquemaTermino, ID_TITULO, leerFiltrosDeFormulario, leerParametrosDocumentacion } from './parametros';

const UUID = '22222222-2222-4222-8222-222222222222';

describe('leerParametrosDocumentacion', () => {
  it('sin nada: página 1 y sin filtros', () => {
    expect(leerParametrosDocumentacion({})).toEqual({ pagina: 1, tipo: null, nivel: null, paciente: null });
  });

  it('lee tipo, nivel, paciente y página válidos', () => {
    expect(
      leerParametrosDocumentacion({ tipo: 'informe_pendiente', nivel: '3', paciente: UUID, pagina: '4' }),
    ).toEqual({ pagina: 4, tipo: 'informe_pendiente', nivel: 3, paciente: UUID });
  });

  it('lo que no valida es ausente: página, tipo, nivel y paciente', () => {
    for (const pagina of ['0', '-1', '1.5', 'abc', '', ' 2', '2e1'])
      expect(leerParametrosDocumentacion({ pagina }).pagina).toBe(1);
    expect(leerParametrosDocumentacion({ tipo: 'otro' }).tipo).toBeNull();
    expect(leerParametrosDocumentacion({ nivel: '4' }).nivel).toBeNull();
    expect(leerParametrosDocumentacion({ nivel: '0' }).nivel).toBeNull();
    expect(leerParametrosDocumentacion({ paciente: 'no-es-uuid' }).paciente).toBeNull();
  });

  it('un valor repetido (array) cuenta como ausente', () => {
    const r = leerParametrosDocumentacion({
      tipo: ['informe_pendiente', 'nota_sin_firmar'],
      nivel: ['1', '2'],
      paciente: [UUID, UUID],
      pagina: ['2', '3'],
    });
    expect(r).toEqual({ pagina: 1, tipo: null, nivel: null, paciente: null });
  });

  it('no lee ?profesional ni ninguna otra clave', () => {
    const r = leerParametrosDocumentacion({ profesional: UUID, rol: 'administrador', soloPropias: 'false' });
    expect(r).toEqual({ pagina: 1, tipo: null, nivel: null, paciente: null });
    expect(Object.keys(r).sort()).toEqual(['nivel', 'paciente', 'pagina', 'tipo']);
  });
});

describe('leerFiltrosDeFormulario', () => {
  it('aplica los mismos validadores', () => {
    const d = new FormData();
    d.set('tipo', 'consentimiento_pendiente');
    d.set('nivel', '2');
    expect(leerFiltrosDeFormulario(d)).toEqual({ tipo: 'consentimiento_pendiente', nivel: 2 });

    const mal = new FormData();
    mal.set('tipo', 'otro');
    mal.set('nivel', '9');
    expect(leerFiltrosDeFormulario(mal)).toEqual({ tipo: null, nivel: null });
  });

  it('sin campos y con un fichero: ausentes; no se lee nada más', () => {
    expect(leerFiltrosDeFormulario(new FormData())).toEqual({ tipo: null, nivel: null });
    const d = new FormData();
    d.set('tipo', new File(['x'], 'x.txt'));
    d.set('paciente', UUID);
    d.set('rol', 'administrador');
    expect(leerFiltrosDeFormulario(d)).toEqual({ tipo: null, nivel: null });
  });
});

describe('esquemaTermino', () => {
  it('recorta y exige entre 2 y 100 caracteres', () => {
    expect(esquemaTermino.safeParse('  an  ').data).toBe('an');
    expect(esquemaTermino.safeParse('a').success).toBe(false);
    expect(esquemaTermino.safeParse('  a ').success).toBe(false);
    expect(esquemaTermino.safeParse('a'.repeat(100)).success).toBe(true);
    expect(esquemaTermino.safeParse('a'.repeat(101)).success).toBe(false);
    expect(esquemaTermino.safeParse(undefined).success).toBe(false);
  });

  it('el id del título es el de la página', () => {
    expect(ID_TITULO).toBe('documentacion-titulo');
  });
});
