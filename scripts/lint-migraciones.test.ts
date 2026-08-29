import { describe, expect, it } from 'vitest';

import {
  TABLAS_SOLO_ADICION,
  analizarEdiciones,
  analizarFichero,
  analizarListado,
} from './lint-migraciones';

// Fragmentos SQL en línea, a propósito: ninguna migración de mentira vive
// dentro de supabase/migrations/.

const reglas = (hallazgos: Array<{ regla: number }>) => hallazgos.map((h) => h.regla);

describe('regla 1 · solo adición', () => {
  it('marca un delete sobre una tabla protegida y nombra la tabla', () => {
    const hallazgos = analizarFichero('m.sql', 'delete from public.auditoria where id = 1;\n');

    expect(reglas(hallazgos)).toEqual([1]);
    expect(hallazgos[0].mensaje).toContain('auditoria');
  });

  it('marca update y truncate sobre cualquier tabla protegida', () => {
    expect(reglas(analizarFichero('m.sql', 'update facturas set total = 0;\n'))).toEqual([1]);
    expect(reglas(analizarFichero('m.sql', 'truncate accesos_historia;\n'))).toEqual([1]);
  });

  it('no marca escrituras sobre tablas que no son de solo adición', () => {
    expect(
      analizarFichero('m.sql', 'update public.pacientes set nombre = \'x\';\n'),
    ).toEqual([]);
  });

  it('no marca un delete mencionado en un comentario ni en el cuerpo de una función', () => {
    const sql = [
      '-- delete from auditoria; no es una sentencia, es este comentario',
      'create function public.f() returns trigger language plpgsql security definer',
      "set search_path = '' as $$",
      'begin',
      '  -- aquí dentro: delete from auditoria tampoco cuenta',
      '  return new;',
      'end;',
      '$$;',
    ].join('\n');

    expect(reglas(analizarFichero('m.sql', sql))).toEqual([]);
  });
});

describe('regla 2 · nada destructivo en un solo paso', () => {
  it('un drop column sin anunciar falla', () => {
    const hallazgos = analizarFichero('m.sql', 'alter table public.pacientes drop column viejo;\n');

    expect(reglas(hallazgos)).toEqual([2]);
  });

  it('un drop column anunciado con `-- destructivo:` en la línea anterior pasa', () => {
    const sql = [
      '-- destructivo: la columna viejo se elimina tras dos migraciones de aviso',
      'alter table public.pacientes drop column viejo;',
    ].join('\n');

    expect(analizarFichero('m.sql', sql)).toEqual([]);
  });

  it('un set not null sin default falla; con default, pasa', () => {
    expect(
      reglas(
        analizarFichero('m.sql', 'alter table public.pacientes alter column nombre set not null;\n'),
      ),
    ).toEqual([2]);

    expect(
      analizarFichero(
        'm.sql',
        "alter table public.pacientes alter column nombre set default 'x', alter column nombre set not null;\n",
      ),
    ).toEqual([]);
  });

  it('drop table, drop type y alter column … type también se marcan', () => {
    expect(reglas(analizarFichero('m.sql', 'drop table public.borrador;\n'))).toEqual([2]);
    expect(reglas(analizarFichero('m.sql', 'drop type public.viejo_enum;\n'))).toEqual([2]);
    expect(
      reglas(analizarFichero('m.sql', 'alter table t alter column c type bigint;\n')),
    ).toEqual([2]);
  });

  it('un drop policy o drop trigger no es destructivo en este sentido', () => {
    const sql = [
      'drop policy if exists p on public.pacientes;',
      'drop trigger if exists t on public.pacientes;',
    ].join('\n');

    expect(analizarFichero('m.sql', sql)).toEqual([]);
  });
});

describe('regla 3 · RLS de origen', () => {
  it('un create table sin enable row level security en el mismo fichero falla', () => {
    const hallazgos = analizarFichero('m.sql', 'create table public.x (id uuid primary key);\n');

    expect(reglas(hallazgos)).toEqual([3]);
    expect(hallazgos[0].mensaje).toContain('x');
  });

  it('con su enable en el mismo fichero, pasa', () => {
    const sql = [
      'create table public.x (id uuid primary key);',
      'alter table public.x enable row level security;',
    ].join('\n');

    expect(analizarFichero('m.sql', sql)).toEqual([]);
  });

  it('no vale habilitar RLS de otra tabla: el emparejamiento es por nombre', () => {
    const sql = [
      'create table public.x (id uuid primary key);',
      'alter table public.y enable row level security;',
    ].join('\n');

    expect(reglas(analizarFichero('m.sql', sql))).toEqual([3]);
  });
});

describe('regla 4 · search_path en security definer', () => {
  const cabecera =
    'create function public.f() returns boolean language sql security definer\n';

  it('security definer sin set search_path falla', () => {
    expect(reglas(analizarFichero('m.sql', `${cabecera}as $$ select true; $$;\n`))).toEqual([4]);
  });

  it("security definer con set search_path = '' pasa", () => {
    const sql = `${cabecera}set search_path = ''\nas $$ select true; $$;\n`;

    expect(analizarFichero('m.sql', sql)).toEqual([]);
  });

  it('una función security invoker (o sin cláusula) no entra en la regla', () => {
    const sql =
      'create function public.g() returns boolean language sql as $$ select true; $$;\n';

    expect(analizarFichero('m.sql', sql)).toEqual([]);
  });
});

describe('regla 5 · nombres y orden', () => {
  it('dos ficheros con el mismo sello fallan', () => {
    const hallazgos = analizarListado([
      '20260101120000_una.sql',
      '20260101120000_otra.sql',
    ]);

    expect(reglas(hallazgos)).toEqual([5]);
    expect(hallazgos[0].mensaje).toContain('20260101120000');
  });

  it('un nombre que no sigue el patrón falla', () => {
    expect(reglas(analizarListado(['base.sql']))).toEqual([5]);
    expect(reglas(analizarListado(['20260101120000_ConMayusculas.sql']))).toEqual([5]);
  });

  it('un listado correcto y creciente pasa', () => {
    expect(
      analizarListado(['20260101120000_una.sql', '20260102120000_dos.sql']),
    ).toEqual([]);
  });

  it('sellos desordenados se marcan', () => {
    expect(
      reglas(analizarListado(['20260102120000_dos.sql', '20260101120000_una.sql'])),
    ).toEqual([5]);
  });
});

describe('regla 6 · sin ediciones hacia atrás', () => {
  const nombres = ['20260101120000_una.sql', '20260102120000_nueva.sql'];

  it('una migración ya presente en main cuyo contenido cambió, falla', () => {
    const hallazgos = analizarEdiciones(
      nombres,
      (nombre) => (nombre === nombres[0] ? 'contenido original' : null),
      () => 'contenido reescrito',
    );

    expect(reglas(hallazgos)).toEqual([6]);
    expect(hallazgos[0].fichero).toBe(nombres[0]);
  });

  it('contenido idéntico o migración nueva: pasa', () => {
    const hallazgos = analizarEdiciones(
      nombres,
      (nombre) => (nombre === nombres[0] ? 'igual' : null),
      () => 'igual',
    );

    expect(hallazgos).toEqual([]);
  });
});

describe('constantes exportadas', () => {
  it('la lista de tablas protegidas es la del ticket', () => {
    expect(TABLAS_SOLO_ADICION).toEqual([
      'auditoria',
      'notas_clinicas_versiones',
      'accesos_historia',
      'accesos_historia_vistas',
      'facturas',
    ]);
  });
});
