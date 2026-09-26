import { describe, expect, it } from 'vitest';

import {
  esquemaAlcance,
  esquemaCancelarCita,
  esquemaCrearSerie,
  esquemaEditarSerie,
  esquemaReprogramarCita,
} from './esquemas';

describe('esquemaAlcance', () => {
  it('acepta esta y esta_y_siguientes', () => {
    expect(esquemaAlcance.safeParse('esta').success).toBe(true);
    expect(esquemaAlcance.safeParse('esta_y_siguientes').success).toBe(true);
  });

  it('rechaza "todas": no existe ningún valor que destruya el histórico', () => {
    expect(esquemaAlcance.safeParse('todas').success).toBe(false);
  });

  it('no tiene valor por defecto: falta el dato, falla la validación', () => {
    const resultado = esquemaCancelarCita.safeParse({
      citaId: '11111111-1111-4111-8111-111111111111',
    });
    expect(resultado.success).toBe(false);
  });
});

describe('esquemaCrearSerie', () => {
  const base = {
    pacienteId: '11111111-1111-4111-8111-111111111111',
    profesionalId: '22222222-2222-4222-8222-222222222222',
    centroId: '33333333-3333-4333-8333-333333333333',
    tipoTerapiaId: '44444444-4444-4444-8444-444444444444',
    periodicidad: 'semanal' as const,
    diaSemana: 2,
    horaLocal: '12:00',
    duracionMinutos: 50,
    desde: '2027-02-01',
  };

  it('acepta sesionesTotales sin finEl', () => {
    const resultado = esquemaCrearSerie.safeParse({ ...base, sesionesTotales: 8, finEl: null });
    expect(resultado.success).toBe(true);
  });

  it('acepta finEl sin sesionesTotales', () => {
    const resultado = esquemaCrearSerie.safeParse({
      ...base,
      sesionesTotales: null,
      finEl: '2027-06-01',
    });
    expect(resultado.success).toBe(true);
  });

  it('rechaza las dos formas de fin a la vez (igual que series_cita_final_ck en la base)', () => {
    const resultado = esquemaCrearSerie.safeParse({
      ...base,
      sesionesTotales: 8,
      finEl: '2027-06-01',
    });
    expect(resultado.success).toBe(false);
  });

  it('rechaza ninguna de las dos formas de fin', () => {
    const resultado = esquemaCrearSerie.safeParse({ ...base, sesionesTotales: null, finEl: null });
    expect(resultado.success).toBe(false);
  });

  it('rechaza dia_semana fuera de 1-7 (ISODOW)', () => {
    const resultado = esquemaCrearSerie.safeParse({
      ...base,
      diaSemana: 0,
      sesionesTotales: 4,
      finEl: null,
    });
    expect(resultado.success).toBe(false);
  });

  it('GEMELA: dia_semana = 7 (domingo, ISODOW) sí es válido', () => {
    const resultado = esquemaCrearSerie.safeParse({
      ...base,
      diaSemana: 7,
      sesionesTotales: 4,
      finEl: null,
    });
    expect(resultado.success).toBe(true);
  });

  it('rechaza una hora mal formada', () => {
    const resultado = esquemaCrearSerie.safeParse({
      ...base,
      horaLocal: '25:99',
      sesionesTotales: 4,
      finEl: null,
    });
    expect(resultado.success).toBe(false);
  });
});

describe('esquemaEditarSerie', () => {
  const citaId = '11111111-1111-4111-8111-111111111111';

  it('esta: acepta estado/sala/inicio/fin', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta',
      sala: 'Sala 2',
    });
    expect(resultado.success).toBe(true);
  });

  it('esta: rechaza traer también la regla de la serie', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta',
      horaLocal: '10:00',
    });
    expect(resultado.success).toBe(false);
  });

  it('esta_y_siguientes: acepta la regla de la serie', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      horaLocal: '16:00',
    });
    expect(resultado.success).toBe(true);
  });

  it('esta_y_siguientes: rechaza mover la cita directamente (no mueve nada, §6 del diseño)', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      sala: 'Sala 2',
    });
    expect(resultado.success).toBe(false);
  });

  it('esta: rechaza traer una fecha nueva de ancla (T-011b, la fecha va con esta_y_siguientes)', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta',
      fecha: '2027-03-08',
    });
    expect(resultado.success).toBe(false);
  });

  it('esta_y_siguientes: acepta una fecha nueva de ancla sin día de la semana', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-03-08',
    });
    expect(resultado.success).toBe(true);
  });

  it('esta_y_siguientes: fecha y diaSemana que SÍ coinciden (2027-03-08 es lunes, ISODOW 1)', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-03-08',
      diaSemana: 1,
    });
    expect(resultado.success).toBe(true);
  });

  it('esta_y_siguientes: rechaza fecha y diaSemana que NO coinciden, con el error en "fecha"', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-03-08',
      diaSemana: 2,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((i) => i.path[0] === 'fecha')).toBe(true);
    }
  });

  // TS-H2: el domingo es el único día en que getUTCDay() (0) y ISODOW (7) no
  // coinciden; si se quita la traducción 0 → 7, la primera de estas dos falla.
  it('esta_y_siguientes: domingo — fecha 2027-03-07 con diaSemana 7 (ISODOW) SÍ coincide', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-03-07',
      diaSemana: 7,
    });
    expect(resultado.success).toBe(true);
  });

  it('esta_y_siguientes: domingo — fecha 2027-03-07 con diaSemana 6 (sábado) se rechaza en "fecha"', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-03-07',
      diaSemana: 6,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((i) => i.path[0] === 'fecha')).toBe(true);
    }
  });

  it('esta_y_siguientes: rechaza una fecha de calendario inexistente (30 de febrero)', () => {
    const resultado = esquemaEditarSerie.safeParse({
      citaId,
      alcance: 'esta_y_siguientes',
      fecha: '2027-02-30',
    });
    expect(resultado.success).toBe(false);
  });
});

describe('esquemaReprogramarCita (T-014)', () => {
  const base = {
    citaId: '5b2f7a0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
    fecha: '2026-10-01',
    hora: '10:00',
    zona: 'Europe/Madrid',
  };
  const firma = 'a'.repeat(64);

  it('una cita suelta: sin alcance ni firma', () => {
    expect(esquemaReprogramarCita.safeParse(base).success).toBe(true);
  });

  it('rechaza un día que no existe (30 de febrero) en vez de normalizarlo al 2 de marzo', () => {
    const resultado = esquemaReprogramarCita.safeParse({ ...base, fecha: '2027-02-30' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues[0].message).toBe('Ese día no existe.');
  });

  it('rechaza una hora sin forma HH:MM', () => {
    expect(esquemaReprogramarCita.safeParse({ ...base, hora: '9:00' }).success).toBe(false);
    expect(esquemaReprogramarCita.safeParse({ ...base, hora: '24:00' }).success).toBe(false);
  });

  it('solo dos alcances: «todas» no existe', () => {
    expect(esquemaReprogramarCita.safeParse({ ...base, alcance: 'todas' }).success).toBe(false);
  });

  it('esta_y_siguientes exige la firma de la previsualización', () => {
    const sinFirma = esquemaReprogramarCita.safeParse({ ...base, alcance: 'esta_y_siguientes' });
    expect(sinFirma.success).toBe(false);
    if (!sinFirma.success) expect(sinFirma.error.issues[0].path).toEqual(['firma']);
    expect(esquemaReprogramarCita.safeParse({ ...base, alcance: 'esta_y_siguientes', firma }).success).toBe(true);
  });

  it('la firma es SHA-256 hexadecimal en minúsculas, nada más', () => {
    expect(esquemaReprogramarCita.safeParse({ ...base, alcance: 'esta', firma: 'A'.repeat(64) }).success).toBe(false);
    expect(esquemaReprogramarCita.safeParse({ ...base, alcance: 'esta' }).success).toBe(true);
  });
});
