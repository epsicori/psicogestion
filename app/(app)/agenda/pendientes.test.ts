import { describe, expect, it } from 'vitest';

import type { AlertaPendiente } from '@/lib/citas/agenda';
import { Constants } from '@/lib/supabase/tipos-bd';

import {
  agruparYOrdenar,
  coincideBusqueda,
  destinoPendiente,
  hrefDocumentacion,
  MAXIMO_DESPLEGABLE,
  ORDEN_TIPOS,
  paginar,
  presentarGrupo,
  resumenPorTipo,
  textoAccesiblePaciente,
  textoDesde,
  tiposConsultados,
  tiposVisibles,
  type Filtros,
} from './pendientes';

const SIN_FILTROS: Filtros = { tipo: null, nivel: null, paciente: null };

function alerta(id: string, parcial: Partial<AlertaPendiente> = {}): AlertaPendiente {
  return {
    id,
    pacienteId: 'p1',
    tipo: 'nota_sin_firmar',
    fechaReferencia: '2026-09-20',
    creadaEn: '2026-09-20T10:00:00Z',
    nivel: 1,
    origenTabla: 'citas',
    origenId: `c-${id}`,
    ...parcial,
  };
}

describe('ORDEN_TIPOS (P1)', () => {
  it('es el orden del enum de la base', () => {
    expect(ORDEN_TIPOS).toEqual(Constants.public.Enums.tipo_alerta_documentacion);
    expect(ORDEN_TIPOS[0]).toBe('nota_sin_firmar');
    expect(ORDEN_TIPOS.at(-1)).toBe('evaluacion_sin_corregir');
  });
});

describe('tiposConsultados y tiposVisibles', () => {
  it('sin filtro devuelve lo del criterio, que puede ser undefined', () => {
    expect(tiposConsultados({}, null)).toBeUndefined();
    expect(tiposConsultados({ tipos: ['informe_pendiente'] }, null)).toEqual(['informe_pendiente']);
  });

  it('con filtro, solo estrecha: dentro del criterio es [tipo]; fuera, []', () => {
    expect(tiposConsultados({}, 'nota_sin_firmar')).toEqual(['nota_sin_firmar']);
    expect(tiposConsultados({ tipos: ['informe_pendiente', 'consentimiento_pendiente'] }, 'informe_pendiente')).toEqual([
      'informe_pendiente',
    ]);
    expect(tiposConsultados({ tipos: ['informe_pendiente'] }, 'nota_sin_firmar')).toEqual([]);
  });

  it('tiposVisibles es el criterio o todos, en orden del enum', () => {
    expect(tiposVisibles({})).toEqual(ORDEN_TIPOS);
    expect(tiposVisibles({ tipos: ['informe_pendiente'] })).toEqual(['informe_pendiente']);
  });
});

describe('agruparYOrdenar', () => {
  it('agrupa por paciente y no confía en el orden de la lectura', () => {
    const grupos = agruparYOrdenar([
      alerta('a1', { pacienteId: 'pB', nivel: 1, fechaReferencia: '2026-09-01' }),
      alerta('a2', { pacienteId: 'pA', nivel: 3, fechaReferencia: '2026-09-10' }),
      alerta('a3', { pacienteId: 'pB', nivel: 2, fechaReferencia: '2026-09-05' }),
    ]);
    expect(grupos.map((g) => g.pacienteId)).toEqual(['pA', 'pB']);
    expect(grupos[1].alertas.map((a) => a.id)).toEqual(['a3', 'a1']);
    expect(grupos[1]).toMatchObject({ recuento: 2, escalados: 1, nivelMaximo: 2, fechaMasAntigua: '2026-09-01' });
    expect(grupos[0]).toMatchObject({ recuento: 1, escalados: 1, nivelMaximo: 3 });
  });

  it('a igual nivel máximo, gana el más antiguo; después, el id del paciente', () => {
    const grupos = agruparYOrdenar([
      alerta('a1', { pacienteId: 'pC', nivel: 2, fechaReferencia: '2026-09-10' }),
      alerta('a2', { pacienteId: 'pB', nivel: 2, fechaReferencia: '2026-09-01' }),
      alerta('a3', { pacienteId: 'pA', nivel: 2, fechaReferencia: '2026-09-10' }),
      alerta('a4', { pacienteId: 'pD', nivel: 2, fechaReferencia: null }),
    ]);
    expect(grupos.map((g) => g.pacienteId)).toEqual(['pB', 'pA', 'pC', 'pD']);
  });

  it('el nivel nulo cuenta como 0 y los nulos van al final dentro de un paciente', () => {
    const grupos = agruparYOrdenar([
      alerta('a1', { pacienteId: 'pA', nivel: null }),
      alerta('a2', { pacienteId: 'pB', nivel: 1, fechaReferencia: '2026-09-01' }),
      alerta('a3', { pacienteId: 'pA', nivel: 1, fechaReferencia: null }),
      alerta('a4', { pacienteId: 'pA', nivel: 1, fechaReferencia: '2026-09-15' }),
    ]);
    expect(grupos.map((g) => g.pacienteId)).toEqual(['pB', 'pA']);
    expect(grupos[1].alertas.map((a) => a.id)).toEqual(['a4', 'a3', 'a1']);
    expect(grupos[1].escalados).toBe(0);
  });

  it('desempata dentro de un paciente por creación y luego id', () => {
    const [g] = agruparYOrdenar([
      alerta('b', { creadaEn: '2026-09-20T10:00:00Z' }),
      alerta('a', { creadaEn: '2026-09-20T10:00:00Z' }),
      alerta('c', { creadaEn: '2026-09-19T10:00:00Z' }),
      alerta('d', { creadaEn: null }),
    ]);
    expect(g.alertas.map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('sin alertas, sin grupos', () => {
    expect(agruparYOrdenar([])).toEqual([]);
  });
});

describe('paginar', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  it('devuelve la página pedida y la última', () => {
    expect(paginar(items, 1, 20)).toMatchObject({ pagina: 1, ultima: 3 });
    expect(paginar(items, 3, 20).items).toHaveLength(5);
  });
  it('sin elementos hay una página vacía', () => {
    expect(paginar([], 1, 20)).toEqual({ items: [], pagina: 1, ultima: 1 });
  });
  it('no corrige una página pasada de la última: devuelve vacío', () => {
    expect(paginar(items, 4, 20)).toEqual({ items: [], pagina: 4, ultima: 3 });
  });
  it('un múltiplo exacto no crea página de más', () => {
    expect(paginar(Array.from({ length: 40 }, (_, i) => i), 2, 20).ultima).toBe(2);
  });
});

describe('textoDesde', () => {
  it('cubre sin fecha, hoy, mañana (H12), un día y varios', () => {
    expect(textoDesde(null)).toBe('pendiente');
    expect(textoDesde(0)).toBe('pendiente desde hoy');
    expect(textoDesde(-1)).toBe('pendiente desde hoy');
    expect(textoDesde(1)).toBe('pendiente desde hace 1 día');
    expect(textoDesde(12)).toBe('pendiente desde hace 12 días');
  });
});

describe('destinoPendiente (D8)', () => {
  const nota = alerta('a', { pacienteId: 'p9', origenId: 'c9' });
  it('una nota sin firmar con cita de origen lleva a la nota, solo a quien puede abrirla', () => {
    expect(destinoPendiente(nota, 'profesional_sanitario')).toBe('/pacientes/p9/historia/notas?cita=c9');
    expect(destinoPendiente(nota, 'administrador')).toBe('/pacientes/p9/historia/notas?cita=c9');
  });
  it('el técnico y el rol desconocido van a la ficha', () => {
    expect(destinoPendiente(nota, 'tecnico_administrativo')).toBe('/pacientes/p9');
    expect(destinoPendiente(nota, null)).toBe('/pacientes/p9');
  });
  it('sin origen de cita, o de otro tipo, va a la ficha', () => {
    expect(destinoPendiente({ ...nota, origenId: null }, 'administrador')).toBe('/pacientes/p9');
    expect(destinoPendiente({ ...nota, origenTabla: 'notas_clinicas' }, 'administrador')).toBe('/pacientes/p9');
    expect(destinoPendiente({ ...nota, origenTabla: null }, 'administrador')).toBe('/pacientes/p9');
    expect(destinoPendiente({ ...nota, tipo: 'informe_pendiente' }, 'administrador')).toBe('/pacientes/p9');
  });
});

describe('hrefDocumentacion', () => {
  it('sin parámetros no lleva interrogante', () => {
    expect(hrefDocumentacion({})).toBe('/agenda/documentacion');
  });
  it('omite nulos, undefined y la página 1, y fija el orden', () => {
    expect(hrefDocumentacion({ pagina: 1, tipo: null, nivel: undefined })).toBe('/agenda/documentacion');
    expect(hrefDocumentacion({ pagina: 3, paciente: 'u1', nivel: 2, tipo: 'informe_pendiente' })).toBe(
      '/agenda/documentacion?tipo=informe_pendiente&nivel=2&paciente=u1&pagina=3',
    );
  });
});

describe('textoAccesiblePaciente (criterio 6)', () => {
  it('compone nombre, recuento y escalados', () => {
    expect(textoAccesiblePaciente('Ana López', 6, 2)).toBe('Ana López, 6 pendientes, 2 escalados');
    expect(textoAccesiblePaciente('Ana López', 2, 1)).toBe('Ana López, 2 pendientes, 1 escalado');
    expect(textoAccesiblePaciente('Ana López', 3, 0)).toBe('Ana López, 3 pendientes');
    expect(textoAccesiblePaciente('Ana López', 1, 0)).toBe('Ana López, 1 pendiente');
  });
});

describe('resumenPorTipo (D7, P1)', () => {
  const HOY = '2026-10-02';
  function grupo(alertas: AlertaPendiente[]) {
    return agruparYOrdenar(alertas)[0];
  }
  it('con un solo pendiente no hay resumen', () => {
    expect(resumenPorTipo(grupo([alerta('a')]), HOY)).toBeNull();
  });
  it('cuenta por tipo en el orden del enum y añade el más antiguo', () => {
    const g = grupo([
      alerta('a1', { tipo: 'informe_pendiente', fechaReferencia: '2026-09-25' }),
      alerta('a2', { tipo: 'nota_sin_firmar', fechaReferencia: '2026-09-20' }),
      alerta('a3', { tipo: 'consentimiento_pendiente', fechaReferencia: '2026-09-22' }),
      alerta('a4', { tipo: 'nota_sin_firmar', fechaReferencia: '2026-09-21' }),
      alerta('a5', { tipo: 'informe_pendiente', fechaReferencia: '2026-09-30' }),
      alerta('a6', { tipo: 'nota_sin_firmar', fechaReferencia: '2026-09-23' }),
    ]);
    expect(resumenPorTipo(g, HOY)).toBe('3 notas · 1 consentimiento · 2 informes — el más antiguo, hace 12 días');
  });
  it('el más antiguo de hoy y de hace un día', () => {
    expect(
      resumenPorTipo(grupo([alerta('a'), alerta('b', { fechaReferencia: '2026-10-02' }), alerta('c', { fechaReferencia: '2026-10-02' })].map((x) => ({ ...x, fechaReferencia: '2026-10-02' }))), HOY),
    ).toBe('3 notas — el más antiguo, de hoy');
    expect(
      resumenPorTipo(grupo([alerta('a', { fechaReferencia: '2026-10-01' }), alerta('b', { fechaReferencia: '2026-10-02' })]), HOY),
    ).toBe('2 notas — el más antiguo, hace 1 día');
  });
  it('sin ninguna fecha, sin sufijo', () => {
    expect(
      resumenPorTipo(grupo([alerta('a', { fechaReferencia: null }), alerta('b', { fechaReferencia: null, tipo: 'borrador_abandonado' })]), HOY),
    ).toBe('1 nota · 1 borrador');
  });
});

describe('presentarGrupo', () => {
  const HOY = '2026-10-02';
  const base = { rol: 'administrador' as const, hoy: HOY, nombre: 'Ana López', modo: 'desplegable' as const, filtros: SIN_FILTROS };

  it('presenta un paciente con un pendiente', () => {
    const [g] = agruparYOrdenar([alerta('a1', { pacienteId: 'p1', nivel: 3, tipo: 'informe_pendiente', origenTabla: null, origenId: null })]);
    const p = presentarGrupo(g, base);
    expect(p).toMatchObject({
      pacienteId: 'p1',
      nombre: 'Ana López',
      hrefPaciente: '/pacientes/p1',
      recuento: 1,
      insignia: '1 pendiente',
      urgencia: 'muy-atrasada',
      textoUrgencia: 'Muy atrasada',
      textoAccesible: 'Ana López, 1 pendiente, 1 escalado',
      resumen: null,
      verTodos: null,
    });
    expect(p.pendientes).toHaveLength(1);
    expect(p.pendientes[0]).toMatchObject({
      id: 'a1',
      etiquetaTipo: 'Informe pendiente',
      textoDesde: 'pendiente desde hace 12 días',
      pildora: 'Muy atrasada',
      destino: '/pacientes/p1',
      nombreEnlace: 'Informe pendiente de Ana López: ir a la ficha',
      resoluble: true,
    });
  });

  it('sin nombre, la etiqueta genérica; el enlace a la nota, con su nombre', () => {
    const [g] = agruparYOrdenar([alerta('a1', { nivel: 2 })]);
    const p = presentarGrupo(g, { ...base, nombre: null });
    expect(p.nombre).toBe('Paciente');
    expect(p.urgencia).toBe('atrasada');
    expect(p.pendientes[0]).toMatchObject({
      pildora: 'Atrasada',
      resoluble: false,
      nombreEnlace: 'Nota sin firmar de Paciente: abrir la nota',
    });
  });

  it('el nivel 1 y el nulo no marcan urgencia', () => {
    const [g] = agruparYOrdenar([alerta('a1', { nivel: 1 })]);
    expect(presentarGrupo(g, base)).toMatchObject({ urgencia: null, textoUrgencia: null });
    expect(presentarGrupo(g, base).pendientes[0].pildora).toBeNull();
  });

  it('en desplegable corta a 10 y ofrece «Ver todos» con el filtro conservado', () => {
    const alertas = Array.from({ length: 12 }, (_, i) => alerta(`a${String(i).padStart(2, '0')}`));
    const [g] = agruparYOrdenar(alertas);
    const p = presentarGrupo(g, base);
    expect(MAXIMO_DESPLEGABLE).toBe(10);
    expect(p.pendientes).toHaveLength(10);
    expect(p.recuento).toBe(12);
    expect(p.verTodos).toEqual({ href: '/agenda/documentacion?paciente=p1', texto: 'Ver todos (12)' });
    expect(p.resumen).toContain('12 notas');
    expect(p.anuncio).toBe(`${p.textoAccesible} — ${p.resumen}`);

    const conFiltro = presentarGrupo(g, { ...base, filtros: { tipo: 'nota_sin_firmar', nivel: 2, paciente: null } });
    expect(conFiltro.verTodos?.href).toBe('/agenda/documentacion?tipo=nota_sin_firmar&nivel=2&paciente=p1');
  });

  it('con exactamente 10 no hay «Ver todos»; en completo salen todos', () => {
    const diez = agruparYOrdenar(Array.from({ length: 10 }, (_, i) => alerta(`a${i}`)))[0];
    expect(presentarGrupo(diez, base).verTodos).toBeNull();
    const doce = agruparYOrdenar(Array.from({ length: 12 }, (_, i) => alerta(`a${i}`)))[0];
    const completo = presentarGrupo(doce, { ...base, modo: 'completo' });
    expect(completo.pendientes).toHaveLength(12);
    expect(completo.verTodos).toBeNull();
  });

  it('el anuncio sin resumen es el texto accesible', () => {
    const [g] = agruparYOrdenar([alerta('a1')]);
    const p = presentarGrupo(g, base);
    expect(p.anuncio).toBe(p.textoAccesible);
  });
});

describe('coincideBusqueda', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(coincideBusqueda('lopez', 'Ana', 'López')).toBe(true);
    expect(coincideBusqueda('ANA', 'ana', null)).toBe(true);
  });
  it('exige cada palabra, en nombre o en apellidos, en cualquier orden', () => {
    expect(coincideBusqueda('ana lopez', 'Ana', 'López García')).toBe(true);
    expect(coincideBusqueda('lopez ana', 'Ana', 'López García')).toBe(true);
    expect(coincideBusqueda('ana perez', 'Ana', 'López García')).toBe(false);
  });
  it('tolera espacios sobrantes', () => {
    expect(coincideBusqueda('  ana   lopez ', 'Ana', 'López')).toBe(true);
  });
  it('sin nombre ni apellidos, no coincide', () => {
    expect(coincideBusqueda('ana', null, null)).toBe(false);
  });
});
