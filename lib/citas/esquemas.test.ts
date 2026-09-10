import { describe, expect, it } from 'vitest';

import {
  esquemaAlcance,
  esquemaCancelarCita,
  esquemaCrearSerie,
  esquemaEditarSerie,
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
});
