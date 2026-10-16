// T-046 · El núcleo `guardarBorrador` con un supabase falso (diseño §1.4). Lo que se prueba aquí es
// el orden y las decisiones de la aplicación: quién no llega a la RPC, con qué columnas llega quien
// sí, y cómo se traduce cada error de la base. Lo que decide la base lo prueba el banco 32 y
// `borrador.bd.test.ts`.
import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cifrar, descifrar } from '@/lib/cifrado/aes-gcm';
import { desglosarDesdeTotal } from '@/lib/dinero/iva';

import { construirSobreBorrador } from './sobre-borrador';

const CLAVE = randomBytes(32);

vi.mock('@/lib/cifrado/claves', () => ({
  VERSION_CLAVE: 1,
  claveDeCifrado: async () => CLAVE,
  claveDeIndice: async () => CLAVE,
}));

vi.mock('@/lib/cifrado/aes-gcm', async (original) => {
  const real = await original<typeof import('@/lib/cifrado/aes-gcm')>();
  return { ...real, descifrar: vi.fn(real.descifrar) };
});

const { guardarBorrador } = await import('./borrador');

const PAC = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTRO_PAC = 'aaaaaaaa-0000-4000-8000-000000000002';
const PRO = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTRO_PRO = 'bbbbbbbb-0000-4000-8000-000000000002';
const ADM = 'bbbbbbbb-0000-4000-8000-0000000000ad';
const CEN = 'cccccccc-0000-4000-8000-000000000001';
const BOR = 'dddddddd-0000-4000-8000-000000000001';
const OTRO_BOR = 'dddddddd-0000-4000-8000-000000000002';
const BONO = 'eeeeeeee-0000-4000-8000-000000000001';
const cita = (n: number) => `ffffffff-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AHORA = new Date('2038-04-06T10:00:00.123Z');

type Fila = Record<string, unknown>;
type Respuesta = { data: unknown; error: { code: string; message: string } | null };

const hex = (b: Buffer) => '\\x' + b.toString('hex');

/** Un supabase de mentira: tablas en memoria con eq/in/order/limit y un registro de las rpc. */
function supabaseFalso(datos: {
  rol?: string | null;
  tablas?: Record<string, Fila[]>;
  rpc?: Record<string, Respuesta>;
}) {
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
  const tablas = datos.tablas ?? {};

  function consulta(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])];
    const cadena = {
      select: () => cadena,
      eq: (col: string, val: unknown) => {
        filas = filas.filter((f) => f[col] === val);
        return cadena;
      },
      in: (col: string, vals: unknown[]) => {
        filas = filas.filter((f) => vals.includes(f[col]));
        return cadena;
      },
      order: (col: string, o?: { ascending?: boolean }) => {
        const signo = o?.ascending === false ? -1 : 1;
        filas.sort((a, b) => ((a[col] as number) - (b[col] as number)) * signo);
        return cadena;
      },
      limit: (n: number) => {
        filas = filas.slice(0, n);
        return cadena;
      },
      maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
      then: (resolver: (r: Respuesta) => unknown) => resolver({ data: filas, error: null }),
    };
    return cadena;
  }

  return {
    llamadas,
    cliente: {
      from: (tabla: string) => consulta(tabla),
      rpc: async (nombre: string, args: Record<string, unknown> = {}) => {
        llamadas.push({ nombre, args });
        if (nombre === 'rol_actual') return { data: datos.rol ?? null, error: null };
        return datos.rpc?.[nombre] ?? { data: nombre === 'leer_identificacion' ? [] : 1, error: null };
      },
    },
  };
}

const PACIENTE = { id: PAC, nombre: 'Paz', apellidos: 'Pérez', profesional_id: PRO, centro_id: CEN };

function citaFila(n: number, cambios: Fila = {}): Fila {
  return { id: cita(n), paciente_id: PAC, profesional_id: PRO, estado: 'realizada', bono_id: null, ...cambios };
}

const lineaLibre = (precio = 6000, regimen: 'exento_sanitario' | 'general' = 'exento_sanitario') => ({
  cita_id: null,
  concepto: 'Informe',
  cantidad: 1,
  precio_centimos: precio,
  regimen_iva: regimen,
});

const lineaCita = (n: number, precio = 6000) => ({
  cita_id: cita(n),
  concepto: 'Sesión del 06/04/2038',
  cantidad: 1,
  precio_centimos: precio,
  regimen_iva: 'exento_sanitario' as const,
});

function crear(cambios: Record<string, unknown> = {}) {
  return {
    pacienteId: PAC,
    borradorId: null,
    partida: null,
    descartar: false,
    destinatario: { modo: 'tercero', nombre: 'Mutua Ejemplo', tipo: 'juridica', nif: null },
    lineas: [lineaLibre()],
    ...cambios,
  };
}

/** La versión N de un borrador, como la sirve PostgREST (bytea en `\x…`). */
function version(cambios: Fila = {}): Fila {
  const sobre = cifrar(CLAVE, 'B12345674');
  return {
    borrador_id: BOR,
    paciente_id: PAC,
    numero_version: 2,
    descartado: false,
    destinatario_nombre: 'Mutua Ejemplo',
    destinatario_nif_cifrado: hex(sobre.cifrado),
    destinatario_nif_nonce: hex(sobre.nonce),
    destinatario_nif_etiqueta: hex(sobre.etiqueta),
    lineas: [
      {
        concepto: 'Sesión del 06/04/2038',
        cantidad: 1,
        precio_unitario_centimos: 7000,
        regimen_iva: 'exento_sanitario',
        tipo_iva_centesimas: 0,
        cita_id: cita(1),
      },
    ],
    ...cambios,
  };
}

function deps(falso: ReturnType<typeof supabaseFalso>, usuario = PRO) {
  return {
    supabase: falso.cliente as never,
    usuario: { id: usuario },
    ahora: () => AHORA,
    claveDeCifrado: async () => CLAVE,
    proveedor: () => 'Holded',
  };
}

const escrituras = (f: ReturnType<typeof supabaseFalso>) =>
  f.llamadas.filter((l) => l.nombre === 'crear_borrador' || l.nombre === 'anadir_version_borrador');

function base(extra: { tablas?: Record<string, Fila[]>; rpc?: Record<string, Respuesta>; rol?: string } = {}) {
  return supabaseFalso({
    rol: extra.rol ?? 'profesional_sanitario',
    rpc: extra.rpc,
    tablas: {
      pacientes: [PACIENTE],
      citas: [],
      borradores_factura: [{ id: BOR, paciente_id: PAC }],
      borradores_factura_versiones: [],
      ...extra.tablas,
    },
  });
}

beforeEach(() => {
  vi.mocked(descifrar).mockClear();
});

describe('guardarBorrador · quién no llega a la base (CA6, CA11)', () => {
  const NO_DISPONIBLE = { ok: false, error: 'no_disponible' };

  it('el técnico, el no asignado y el paciente invisible reciben lo mismo, sin escribir', async () => {
    const tecnico = base({ rol: 'tecnico_administrativo' });
    const noAsignado = base();
    const invisible = base({ tablas: { pacientes: [] } });

    const r1 = await guardarBorrador(deps(tecnico), crear());
    const r2 = await guardarBorrador(deps(noAsignado, OTRO_PRO), crear());
    const r3 = await guardarBorrador(deps(invisible), crear());

    expect(r1).toEqual(NO_DISPONIBLE);
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    for (const f of [tecnico, noAsignado, invisible]) expect(escrituras(f)).toHaveLength(0);
  });

  it('gemelas: el asignado y el administrador sí llegan a crear_borrador', async () => {
    const asignado = base();
    const admin = base({ rol: 'administrador' });
    expect(await guardarBorrador(deps(asignado), crear())).toMatchObject({ ok: true, numeroVersion: 1 });
    expect(await guardarBorrador(deps(admin, ADM), crear())).toMatchObject({ ok: true, numeroVersion: 1 });
    expect(escrituras(asignado).map((l) => l.nombre)).toEqual(['crear_borrador']);
    // El profesional de la cabecera es el del paciente aunque cree el administrador (D13).
    expect(escrituras(admin)[0].args.p_profesional_id).toBe(PRO);
    expect(escrituras(admin)[0].args.p_centro_id).toBe(CEN);
  });

  it('corregir un borrador de otro paciente, o uno invisible: no_disponible', async () => {
    const ajeno = base({ tablas: { borradores_factura: [{ id: BOR, paciente_id: OTRO_PAC }] } });
    const sinVersion = base();
    const entrada = crear({ borradorId: BOR, partida: 2 });
    expect(await guardarBorrador(deps(ajeno), entrada)).toEqual(NO_DISPONIBLE);
    expect(await guardarBorrador(deps(sinVersion), entrada)).toEqual(NO_DISPONIBLE);
    expect(escrituras(ajeno)).toHaveLength(0);
    expect(escrituras(sinVersion)).toHaveLength(0);
  });
});

describe('guardarBorrador · validación', () => {
  it('una entrada que no pasa el esquema: validacion, sin leer nada', async () => {
    for (const mala of [
      crear({ lineas: [] }),
      crear({ lineas: [{ ...lineaLibre(), precio_centimos: 0 }] }),
      crear({ lineas: [{ ...lineaLibre(), regimen_iva: undefined }] }),
      crear({ lineas: [{ ...lineaLibre(), concepto: 'a\nb' }] }),
      crear({ destinatario: { modo: 'conservar' } }),
      crear({ destinatario: { modo: 'tercero', nombre: 'X', tipo: 'juridica', nif: 'B12345670' } }),
      crear({ destinatario: { modo: 'tercero', nombre: 'X', tipo: 'fisica', nif: '12345678A' } }),
      crear({ borradorId: BOR, partida: null }),
      crear({ descartar: true }),
    ]) {
      const f = base();
      expect(await guardarBorrador(deps(f), mala)).toEqual({ ok: false, error: 'validacion' });
      expect(f.llamadas).toHaveLength(0);
    }
  });
});

describe('guardarBorrador · corregir', () => {
  it('versión descartada: descartado; partida vieja: conflicto (CA3); ninguna escribe', async () => {
    const descartada = base({ tablas: { borradores_factura_versiones: [version({ descartado: true })] } });
    const vieja = base({ tablas: { borradores_factura_versiones: [version()] } });
    expect(await guardarBorrador(deps(descartada), crear({ borradorId: BOR, partida: 2 }))).toEqual({
      ok: false,
      error: 'descartado',
    });
    expect(await guardarBorrador(deps(vieja), crear({ borradorId: BOR, partida: 1 }))).toEqual({
      ok: false,
      error: 'conflicto',
    });
    expect(escrituras(descartada)).toHaveLength(0);
    expect(escrituras(vieja)).toHaveLength(0);
  });

  it('la versión nueva es partida + 1, en el sobre y en la respuesta', async () => {
    const f = base({ tablas: { borradores_factura_versiones: [version({ numero_version: 1 }), version()] } });
    f.cliente.rpc = (async (nombre: string, args: Record<string, unknown> = {}) => {
      f.llamadas.push({ nombre, args });
      if (nombre === 'rol_actual') return { data: 'profesional_sanitario', error: null };
      return { data: 3, error: null };
    }) as typeof f.cliente.rpc;
    const r = await guardarBorrador(deps(f), crear({ borradorId: BOR, partida: 2 }));
    expect(r).toEqual({ ok: true, borradorId: BOR, numeroVersion: 3 });
    const [escritura] = escrituras(f);
    expect(escritura.nombre).toBe('anadir_version_borrador');
    expect(JSON.parse(escritura.args.p_contenido_canonico as string).numero_version).toBe(3);
  });

  it('conservar arrastra los bytes de N sin descifrarlos (CA5, D11)', async () => {
    const n = version();
    const f = base({ tablas: { borradores_factura_versiones: [n] } });
    await guardarBorrador(deps(f), crear({ borradorId: BOR, partida: 2, destinatario: { modo: 'conservar' } }));
    const args = escrituras(f)[0].args;
    const b64 = (v: unknown) => Buffer.from((v as string).slice(2), 'hex').toString('base64');
    expect(args.p_nif_cifrado).toBe(b64(n.destinatario_nif_cifrado));
    expect(args.p_nif_nonce).toBe(b64(n.destinatario_nif_nonce));
    expect(args.p_nif_etiqueta).toBe(b64(n.destinatario_nif_etiqueta));
    expect(args.p_destinatario_nombre).toBe('Mutua Ejemplo');
    expect(vi.mocked(descifrar)).not.toHaveBeenCalled();
  });

  it('descartar conserva destinatario y líneas de N, y no revisa las citas', async () => {
    const n = version();
    // La cita de N ya va en un bono: descartar siempre se puede (D5, D9).
    const f = base({
      tablas: { borradores_factura_versiones: [n], citas: [citaFila(1, { bono_id: BONO })] },
    });
    const r = await guardarBorrador(
      deps(f),
      crear({ borradorId: BOR, partida: 2, descartar: true, destinatario: { modo: 'paciente' }, lineas: [lineaLibre(1)] }),
    );
    expect(r).toMatchObject({ ok: true });
    const args = escrituras(f)[0].args;
    expect(args.p_descartado).toBe(true);
    expect(args.p_lineas).toEqual(n.lineas);
    expect(args.p_total_centimos).toBe(7000);
    expect(args.p_destinatario_nombre).toBe('Mutua Ejemplo');
    expect(f.llamadas.some((l) => l.nombre === 'leer_identificacion')).toBe(false);
  });
});

describe('guardarBorrador · las citas de las líneas (CA16)', () => {
  const malas: [string, Fila | null][] = [
    ['con bono', citaFila(2, { bono_id: BONO })],
    ['de otro paciente', citaFila(2, { paciente_id: OTRO_PAC })],
    ['programada', citaFila(2, { estado: 'programada' })],
    ['cancelada', citaFila(2, { estado: 'cancelada' })],
    ['no_asistida', citaFila(2, { estado: 'no_asistida' })],
    ['de otro profesional', citaFila(2, { profesional_id: OTRO_PRO })],
    ['invisible o inexistente', null],
  ];

  for (const [que, fila] of malas) {
    it(`una cita ${que}: cita_no_elegible con su id y sin rpc de escritura`, async () => {
      const f = base({ tablas: { citas: fila ? [citaFila(1), fila] : [citaFila(1)] } });
      const r = await guardarBorrador(deps(f), crear({ lineas: [lineaCita(1), lineaCita(2)] }));
      expect(r).toEqual({ ok: false, error: 'cita_no_elegible', citas: [cita(2)] });
      expect(escrituras(f)).toHaveLength(0);
    });
  }

  it('la misma cita dos veces: cita_no_elegible', async () => {
    const f = base({ tablas: { citas: [citaFila(1)] } });
    const r = await guardarBorrador(deps(f), crear({ lineas: [lineaCita(1), lineaCita(1)] }));
    expect(r).toEqual({ ok: false, error: 'cita_no_elegible', citas: [cita(1)] });
  });

  it('gemela: la elegible llega a la rpc con su cita_id', async () => {
    const f = base({ tablas: { citas: [citaFila(1)] } });
    expect(await guardarBorrador(deps(f), crear({ lineas: [lineaCita(1)] }))).toMatchObject({ ok: true });
    const lineas = escrituras(f)[0].args.p_lineas as { cita_id: string | null }[];
    expect(lineas.map((l) => l.cita_id)).toEqual([cita(1)]);
  });

  it('al corregir se exige que TODAS las citas sigan siendo elegibles (D9)', async () => {
    const f = base({
      tablas: { borradores_factura_versiones: [version()], citas: [citaFila(1, { bono_id: BONO })] },
    });
    const r = await guardarBorrador(
      deps(f),
      crear({ borradorId: BOR, partida: 2, destinatario: { modo: 'conservar' }, lineas: [lineaCita(1)] }),
    );
    expect(r).toEqual({ ok: false, error: 'cita_no_elegible', citas: [cita(1)] });
  });

  it('la cita está en la última versión viva de otro borrador: cita_en_otro_borrador', async () => {
    const otro = version({ borrador_id: OTRO_BOR, numero_version: 1 });
    const f = base({ tablas: { citas: [citaFila(1)], borradores_factura_versiones: [otro] } });
    const r = await guardarBorrador(deps(f), crear({ lineas: [lineaCita(1)] }));
    expect(r).toEqual({ ok: false, error: 'cita_en_otro_borrador', citas: [cita(1)] });
    expect(escrituras(f)).toHaveLength(0);
  });

  it('gemelas: si la última del otro está descartada, o ya no la lleva, entra', async () => {
    const descartado = [
      version({ borrador_id: OTRO_BOR, numero_version: 1 }),
      version({ borrador_id: OTRO_BOR, numero_version: 2, descartado: true }),
    ];
    const sinLaCita = [
      version({ borrador_id: OTRO_BOR, numero_version: 1 }),
      version({ borrador_id: OTRO_BOR, numero_version: 2, lineas: [{ ...(version().lineas as Fila[])[0], cita_id: null }] }),
    ];
    for (const versiones of [descartado, sinLaCita]) {
      const f = base({ tablas: { citas: [citaFila(1)], borradores_factura_versiones: versiones } });
      expect(await guardarBorrador(deps(f), crear({ lineas: [lineaCita(1)] }))).toMatchObject({ ok: true });
    }
  });
});

describe('guardarBorrador · importes (CA9, CA17)', () => {
  it('una línea libre al 21 %: la cuota de lib/dinero, en céntimos hacia la rpc', async () => {
    const f = base();
    await guardarBorrador(deps(f), crear({ lineas: [lineaLibre(12100, 'general')] }));
    const args = escrituras(f)[0].args;
    const d = desglosarDesdeTotal(12100, 'general');
    expect([args.p_base_centimos, args.p_cuota_centimos, args.p_total_centimos]).toEqual([d.base, d.cuota, 12100]);
    expect((args.p_lineas as Fila[])[0]).toMatchObject({ regimen_iva: 'general', tipo_iva_centesimas: 2100 });
  });

  it('1 o 2 céntimos al 21 %: cuota_minima, sin rpc', async () => {
    const f = base();
    const r = await guardarBorrador(deps(f), crear({ lineas: [lineaLibre(2, 'general'), lineaLibre(5000)] }));
    expect(r).toEqual({ ok: false, error: 'cuota_minima' });
    expect(escrituras(f)).toHaveLength(0);
  });
});

describe('guardarBorrador · el sobre y el destinatario', () => {
  it('el contenido canónico es el del constructor con la misma entrada normalizada', async () => {
    const f = base();
    const r = await guardarBorrador(deps(f), crear());
    if (!r.ok) throw new Error('debía entrar');
    const args = escrituras(f)[0].args;
    const { contenidoCanonico } = construirSobreBorrador({
      borradorId: r.borradorId,
      numeroVersion: 1,
      pacienteId: PAC,
      profesionalId: PRO,
      centroId: CEN,
      creadaPor: PRO,
      creadaEn: AHORA,
      descartado: false,
      destinatarioNombre: 'Mutua Ejemplo',
      nif: null,
      lineas: [
        { concepto: 'Informe', cantidad: 1, precio_unitario_centimos: 6000, regimen_iva: 'exento_sanitario', tipo_iva_centesimas: 0, cita_id: null },
      ],
      baseCentimos: 6000,
      cuotaCentimos: 0,
      totalCentimos: 6000,
    });
    expect(args.p_contenido_canonico).toBe(contenidoCanonico);
    expect(args.p_creada_en).toBe(AHORA.toISOString());
    expect(args.p_borrador_id).toBe(r.borradorId);
    expect(args.p_paciente_id).toBe(PAC);
  });

  it('tercero con CIF: se cifra el normalizado con un nonce nuevo y nada en claro sale', async () => {
    const f = base();
    await guardarBorrador(
      deps(f),
      crear({ destinatario: { modo: 'tercero', nombre: 'Mutua', tipo: 'juridica', nif: 'b-1234567-4' } }),
    );
    const args = escrituras(f)[0].args;
    const claro = descifrar(CLAVE, {
      cifrado: Buffer.from(args.p_nif_cifrado as string, 'base64'),
      nonce: Buffer.from(args.p_nif_nonce as string, 'base64'),
      etiqueta: Buffer.from(args.p_nif_etiqueta as string, 'base64'),
    });
    expect(claro).toBe('B12345674');
    expect(JSON.stringify(args)).not.toContain('B12345674');
    expect(JSON.stringify(args)).not.toContain('1234567');
  });

  it('paciente: relee por leer_identificacion y recifra; sin documento, NIF nulo', async () => {
    const doc = cifrar(CLAVE, '12345678Z');
    const fila = {
      tipo_documento: 'dni',
      dni_cifrado: hex(doc.cifrado),
      dni_nonce: hex(doc.nonce),
      dni_etiqueta: hex(doc.etiqueta),
      dni_clave_version: 1,
      domicilio_cifrado: null,
      domicilio_nonce: null,
      domicilio_etiqueta: null,
      domicilio_clave_version: null,
    };
    const con = base({ rpc: { leer_identificacion: { data: [fila], error: null } } });
    await guardarBorrador(deps(con), crear({ destinatario: { modo: 'paciente' } }));
    const args = escrituras(con)[0].args;
    expect(con.llamadas.find((l) => l.nombre === 'leer_identificacion')?.args).toEqual({ p_paciente_id: PAC });
    expect(args.p_destinatario_nombre).toBe('Paz Pérez');
    expect(args.p_nif_nonce).not.toBe(doc.nonce.toString('base64'));
    const claro = descifrar(CLAVE, {
      cifrado: Buffer.from(args.p_nif_cifrado as string, 'base64'),
      nonce: Buffer.from(args.p_nif_nonce as string, 'base64'),
      etiqueta: Buffer.from(args.p_nif_etiqueta as string, 'base64'),
    });
    expect(claro).toBe('12345678Z');

    const sin = base();
    await guardarBorrador(deps(sin), crear({ destinatario: { modo: 'paciente' } }));
    const argsSin = escrituras(sin)[0].args;
    expect([argsSin.p_nif_cifrado, argsSin.p_nif_nonce, argsSin.p_nif_etiqueta]).toEqual([null, null, null]);
  });
});

describe('guardarBorrador · traducción de los errores de la base', () => {
  const casos: [string, string, Record<string, unknown>][] = [
    ['42501', 'new row violates row-level security policy', { error: 'no_disponible' }],
    ['23514', 'El profesional del borrador no atiende a ese paciente (T-021)', { error: 'no_disponible' }],
    ['23514', 'el borrador ya se preparó en el programa: no admite versiones nuevas', { error: 'congelado', programa: 'Holded' }],
    ['23514', 'El numero_version del sobre no es el que asigna la base (máximo + 1) (T-021)', { error: 'conflicto' }],
    ['23505', 'duplicate key value violates unique constraint "borradores_factura_versiones_numero_uq"', { error: 'conflicto' }],
    ['23514', 'La cita de la línea no está realizada (T-046, P-D1a)', { error: 'cita_no_elegible' }],
    ['23514', 'La cita de la línea no es del profesional del borrador (T-046, P-D1b)', { error: 'cita_no_elegible' }],
    ['23514', 'La cita de la línea va en un bono (T-046, D4)', { error: 'cita_no_elegible' }],
    ['23514', 'La misma cita aparece dos veces en el borrador (T-046)', { error: 'cita_no_elegible' }],
    ['23514', 'La cita ya está en otro borrador sin descartar (T-046)', { error: 'cita_en_otro_borrador' }],
    ['23514', 'creada_en se aparta del reloj de la base', { error: 'no_guardado' }],
    ['XX000', 'algo raro', { error: 'no_guardado' }],
  ];

  for (const [codigo, mensaje, esperado] of casos) {
    it(`${codigo} «${mensaje.slice(0, 40)}…» → ${String(esperado.error)}`, async () => {
      const f = base({ rpc: { crear_borrador: { data: null, error: { code: codigo, message: mensaje } } } });
      expect(await guardarBorrador(deps(f), crear())).toEqual({ ok: false, ...esperado });
    });
  }

  it('lo no traducido se registra con código y mensaje, nunca con la entrada ni el NIF', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = base({ rpc: { crear_borrador: { data: null, error: { code: 'XX000', message: 'algo raro' } } } });
    await guardarBorrador(
      deps(f),
      crear({ destinatario: { modo: 'tercero', nombre: 'Mutua Centinela', tipo: 'juridica', nif: 'B12345674' } }),
    );
    expect(espia).toHaveBeenCalled();
    const registrado = JSON.stringify(espia.mock.calls);
    expect(registrado).toContain('XX000');
    expect(registrado).not.toContain('B12345674');
    expect(registrado).not.toContain('Centinela');
    espia.mockRestore();
  });
});
