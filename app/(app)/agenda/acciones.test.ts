import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  exigirSesion: vi.fn(async () => ({ supabase: {}, usuario: { id: 'yo' } })),
  reprogramarCita: vi.fn(),
  prepararMovimiento: vi.fn(),
  evaluarModificarSerie: vi.fn(),
  confirmarPropuesta: vi.fn(),
  descartarPropuesta: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }));
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: m.exigirSesion }));
vi.mock('@/lib/citas/reprogramar', () => ({
  reprogramarCita: m.reprogramarCita,
  prepararMovimiento: m.prepararMovimiento,
  evaluarModificarSerie: m.evaluarModificarSerie,
}));
vi.mock('@/lib/citas/propuestas', () => ({
  confirmarPropuesta: m.confirmarPropuesta,
  descartarPropuesta: m.descartarPropuesta,
}));

import { confirmarPropuestaAgenda, descartarPropuestaAgenda, previsualizarMovimiento, reprogramar } from './acciones';

const CITA = '6f1c1b4e-2a1d-4c7e-9a3b-0d2e5f8a9b10';
const PROPUESTA = '7f1c1b4e-2a1d-4c7e-9a3b-0d2e5f8a9b10';
const destino = { citaId: CITA, fecha: '2026-10-01', hora: '10:00', zona: 'Europe/Madrid' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reprogramar', () => {
  it('comprueba la sesión y no llama a la base con una entrada que no vale', async () => {
    const r = await reprogramar({ ...destino, fecha: '2026-02-30' });
    expect(m.exigirSesion).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: 'Ese día no existe.' });
    expect(m.reprogramarCita).not.toHaveBeenCalled();
  });

  it('«esta y las siguientes» sin firma no pasa del esquema', async () => {
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes' });
    expect(r.ok).toBe(false);
    expect(m.reprogramarCita).not.toHaveBeenCalled();
  });

  it('con éxito revalida y anuncia; con fallo no revalida y da el texto del detalle', async () => {
    m.reprogramarCita.mockResolvedValueOnce({ ok: true, movida: true, propuestasPendientes: 0 });
    expect(await reprogramar(destino)).toEqual({ ok: true, anuncio: 'Cita movida al 1 de octubre a las 10:00.' });
    expect(m.revalidatePath).toHaveBeenCalledWith('/agenda');

    m.revalidatePath.mockClear();
    m.reprogramarCita.mockResolvedValueOnce({
      ok: false,
      motivo: 'parametro_invalido',
      mensaje: 'Los datos enviados no son válidos.',
      detalle: 'movidaAMano',
    });
    expect(await reprogramar({ ...destino, alcance: 'esta' })).toEqual({
      ok: false,
      motivo: 'parametro_invalido',
      detalle: 'movidaAMano',
      mensaje: 'La cita se movió a mano y la serie ya no la gobierna.',
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it('la regla cambió pero la ancla no se movió: lo dice con el motivo', async () => {
    m.reprogramarCita.mockResolvedValueOnce({
      ok: true,
      movida: false,
      propuestasPendientes: 3,
      motivoNoMovida: 'hueco_ocupado',
      propuestaAncla: 'pendiente',
    });
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) });
    expect(r).toEqual({
      ok: true,
      anuncio:
        'La serie ha cambiado, pero esta cita no se ha movido: Ese hueco ya está ocupado. Su propuesta sigue en «Por confirmar».',
    });
  });

  // Revisión TS H11: sin motivo no quedan «dos puntos seguidos de nada», y sin propuesta
  // de la ancla el anuncio no afirma que «sigue» en la bandeja.
  it('la ancla con propuesta pero sin motivo: sin dos puntos colgando', async () => {
    m.reprogramarCita.mockResolvedValueOnce({ ok: true, movida: false, propuestasPendientes: 3, propuestaAncla: 'pendiente' });
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) });
    expect(r).toEqual({
      ok: true,
      anuncio: 'La serie ha cambiado, pero esta cita no se ha movido. Su propuesta sigue en «Por confirmar».',
    });
  });

  it('la ancla sin propuesta: no dice que siga en «Por confirmar»', async () => {
    m.reprogramarCita.mockResolvedValueOnce({ ok: true, movida: false, propuestasPendientes: 2, propuestaAncla: 'ninguna' });
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) });
    expect(r).toEqual({ ok: true, anuncio: 'La serie ha cambiado, pero esta cita no se ha movido.' });
  });

  it('si no se pudo leer la bandeja: lo dice, con el motivo, y pide revisarla', async () => {
    m.reprogramarCita.mockResolvedValueOnce({
      ok: true,
      movida: false,
      propuestasPendientes: 2,
      motivoNoMovida: 'no_autorizado',
      propuestaAncla: 'desconocida',
    });
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) });
    expect(r.ok && r.anuncio).toMatch(/^La serie ha cambiado, pero no se ha podido comprobar esta cita: .+ Revisa «Por confirmar»\.$/);
    expect(r.ok && r.anuncio).not.toMatch(/sigue en/);
  });

  it('modificar con varias pendientes usa el plural', async () => {
    m.reprogramarCita.mockResolvedValueOnce({ ok: true, movida: true, propuestasPendientes: 4 });
    const r = await reprogramar({ ...destino, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) });
    expect(r).toEqual({
      ok: true,
      anuncio: 'Cita movida al 1 de octubre a las 10:00. 4 citas de la serie esperan en «Por confirmar».',
    });
  });
});

describe('previsualizarMovimiento', () => {
  it('una cita suelta bloquea las dos opciones y no pide la previsualización', async () => {
    m.prepararMovimiento.mockResolvedValueOnce({ ok: true, cita: { id: CITA, serieId: null }, inicio: new Date(), fin: new Date() });
    const r = await previsualizarMovimiento(destino);
    expect(r).toMatchObject({ ok: true, destino: 'Mover a jueves, 1 de octubre de 2026 · 10:00' });
    expect(r.ok && r.general).toBeTruthy();
    expect(m.evaluarModificarSerie).not.toHaveBeenCalled();
  });

  it('un bloqueo de la serie deja «mantener» y explica por qué no «modificar»', async () => {
    m.prepararMovimiento.mockResolvedValueOnce({ ok: true, cita: { id: CITA, serieId: 'x' }, inicio: new Date(), fin: new Date() });
    m.evaluarModificarSerie.mockResolvedValueOnce({ disponible: false, bloqueo: 'serieOtraZona', mensaje: '' });
    const r = await previsualizarMovimiento(destino);
    expect(r).toMatchObject({
      ok: true,
      general: null,
      modificar: { disponible: false, mensaje: 'La serie está en otra zona horaria que esta cita; mueve solo esta cita.' },
    });
  });

  it('«sin cambio» bloquea las dos', async () => {
    m.prepararMovimiento.mockResolvedValueOnce({ ok: true, cita: { id: CITA, serieId: 'x' }, inicio: new Date(), fin: new Date() });
    m.evaluarModificarSerie.mockResolvedValueOnce({ disponible: false, bloqueo: 'sinCambio', mensaje: '' });
    const r = await previsualizarMovimiento(destino);
    expect(r).toMatchObject({ ok: true, general: 'La cita ya está en ese día y a esa hora.' });
  });

  it('no lleva alcance ni firma, y nunca mueve nada', async () => {
    m.prepararMovimiento.mockResolvedValueOnce({ ok: false, motivo: 'cita_pasada', mensaje: 'pasada' });
    await previsualizarMovimiento({ ...destino, alcance: 'esta' });
    expect(m.reprogramarCita).not.toHaveBeenCalled();
    expect(m.confirmarPropuesta).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('confirmarPropuestaAgenda', () => {
  it('un rechazo permanente vuelve con su detalle y sin revalidar: la fila sigue a la vista', async () => {
    m.confirmarPropuesta.mockResolvedValueOnce({
      ok: false,
      motivo: 'parametro_invalido',
      mensaje: 'x',
      detalle: 'otraRegla',
    });
    const r = await confirmarPropuestaAgenda({ propuestaId: PROPUESTA });
    expect(r).toEqual({ ok: false, motivo: 'parametro_invalido', detalle: 'otraRegla', mensaje: 'La serie ya tiene otra regla.' });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it('con éxito, revalida', async () => {
    m.confirmarPropuesta.mockResolvedValueOnce({ ok: true, citaId: CITA });
    expect((await confirmarPropuestaAgenda({ propuestaId: PROPUESTA })).ok).toBe(true);
    expect(m.revalidatePath).toHaveBeenCalledWith('/agenda');
  });

  // Revisión de cierre N5: confirmar y descartar no pueden devolver el mismo «Hecho.».
  it('confirmar y descartar anuncian cosas distintas', async () => {
    m.confirmarPropuesta.mockResolvedValueOnce({ ok: true, citaId: CITA });
    m.descartarPropuesta.mockResolvedValueOnce({ ok: true });
    const confirmada = await confirmarPropuestaAgenda({ propuestaId: PROPUESTA });
    const descartada = await descartarPropuestaAgenda({ propuestaId: PROPUESTA });
    expect(confirmada).toEqual({ ok: true, anuncio: 'Propuesta confirmada.' });
    expect(descartada).toEqual({ ok: true, anuncio: 'Propuesta descartada.' });
  });
});
