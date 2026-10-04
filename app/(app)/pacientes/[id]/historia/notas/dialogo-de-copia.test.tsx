import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// T-040 · El diálogo de la copia cifrada (§1.4). Lo que se prueba es el flujo y, sobre todo,
// que la contraseña no sale nunca hacia una acción: se cifra aquí y solo sube la huella.

const pedirCopiaDeNota = vi.fn();
const registrarFicheroDeCopia = vi.fn();
vi.mock('./acciones-copia', () => ({
  pedirCopiaDeNota: (...a: unknown[]) => pedirCopiaDeNota(...a),
  registrarFicheroDeCopia: (...a: unknown[]) => registrarFicheroDeCopia(...a),
}));

const cifrarCopia = vi.fn();
vi.mock('@/lib/exportaciones/cifrar', () => ({ cifrarCopia: (...a: unknown[]) => cifrarCopia(...a) }));
const derivarEnTrabajador = vi.fn();
vi.mock('@/lib/exportaciones/derivar-en-trabajador', () => ({ derivarEnTrabajador }));

const { DialogoDeCopia } = await import('./dialogo-de-copia');
const { BotonDeCopia } = await import('./boton-de-copia');

const P = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const E = '33333333-3333-4333-8333-333333333333';
const CONTRASENA = 'caballo-bateria-grapa';
const HUELLA = 'c'.repeat(64);
const COPIA = { formato: 'marca-de-copia' };

const crearUrl = vi.fn(() => 'blob:copia');
const revocarUrl = vi.fn();
let descargas: { href: string; download: string }[] = [];

function Montaje({ modo }: { modo: 'profesional' | 'motivo' }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <DialogoDeCopia pacienteId={P} notaId={N} modo={modo} abierto={abierto} alCerrar={() => setAbierto(false)} />
    </>
  );
}

async function rellenar(usuario: ReturnType<typeof userEvent.setup>, contrasena = CONTRASENA, repeticion = contrasena) {
  await usuario.type(screen.getByLabelText(t('exportaciones.dialogo.contrasena')), contrasena);
  await usuario.type(screen.getByLabelText(t('exportaciones.dialogo.repeticion')), repeticion);
  await usuario.click(screen.getByLabelText(t('exportaciones.dialogo.entendido')));
}

const enviar = (usuario: ReturnType<typeof userEvent.setup>) =>
  usuario.click(screen.getByRole('button', { name: t('exportaciones.boton.cifrarYDescargar') }));

/** Todo lo que recibió cualquier acción, en una cadena: la contraseña no puede aparecer. */
const loQueSubio = () => JSON.stringify([pedirCopiaDeNota.mock.calls, registrarFicheroDeCopia.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  descargas = [];
  pedirCopiaDeNota.mockResolvedValue({ ok: true, exportacionId: E, copia: COPIA, nombreFichero: 'copia-de-nota-20261002-1015.html' });
  cifrarCopia.mockResolvedValue({ html: '<html>cifrado</html>', huellaHex: HUELLA });
  registrarFicheroDeCopia.mockResolvedValue({ ok: true });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: revocarUrl }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    descargas.push({ href: this.getAttribute('href') ?? '', download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DialogoDeCopia · profesional', () => {
  it('pide la copia sin contraseña, la cifra aquí, registra la huella y solo entonces descarga', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog', { name: t('exportaciones.dialogo.tituloProfesional') })).toBeInTheDocument();
    // En modo profesional no hay motivo.
    expect(screen.queryByRole('group', { name: t('exportaciones.dialogo.motivo') })).not.toBeInTheDocument();

    await rellenar(usuario);
    await enviar(usuario);

    expect(await screen.findByText(t('exportaciones.estado.descargada'))).toBeInTheDocument();
    expect(pedirCopiaDeNota).toHaveBeenCalledWith({ pacienteId: P, notaId: N, motivo: null, referencia: null });
    expect(cifrarCopia).toHaveBeenCalledWith(COPIA, CONTRASENA, derivarEnTrabajador);
    expect(registrarFicheroDeCopia).toHaveBeenCalledWith({ pacienteId: P, exportacionId: E, huellaHex: HUELLA });
    expect(loQueSubio()).not.toContain(CONTRASENA);

    expect(crearUrl).toHaveBeenCalledTimes(1);
    const blob = (crearUrl.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('text/html');
    expect(descargas).toEqual([{ href: 'blob:copia', download: 'copia-de-nota-20261002-1015.html' }]);
    expect(revocarUrl).toHaveBeenCalledWith('blob:copia');
    // El registro va antes que la descarga.
    expect(registrarFicheroDeCopia.mock.invocationCallOrder[0]).toBeLessThan(crearUrl.mock.invocationCallOrder[0]);
  });

  it('tras la descarga la contraseña ya no está en el formulario', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    await screen.findByText(t('exportaciones.estado.descargada'));
    for (const campo of screen.queryAllByLabelText(/contraseña/i)) {
      expect((campo as HTMLInputElement).value).toBe('');
    }
    expect(document.body.innerHTML).not.toContain(CONTRASENA);
  });

  it('los campos de contraseña son de tipo password y piden una nueva', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    for (const etiqueta of [t('exportaciones.dialogo.contrasena'), t('exportaciones.dialogo.repeticion')]) {
      const campo = screen.getByLabelText(etiqueta);
      expect(campo).toHaveAttribute('type', 'password');
      expect(campo).toHaveAttribute('autocomplete', 'new-password');
    }
  });

  it('si las contraseñas no coinciden no llama a ninguna acción', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario, CONTRASENA, 'otra-contrasena-larga');
    await enviar(usuario);
    expect(await screen.findByText(t('exportaciones.validacion.noCoinciden'))).toBeInTheDocument();
    expect(pedirCopiaDeNota).not.toHaveBeenCalled();
  });

  it('si la base rechaza, el error va en role=alert con el foco y no se cifra nada', async () => {
    pedirCopiaDeNota.mockResolvedValue({ ok: false, motivo: 'bloqueada' });
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(t('exportaciones.error.bloqueada'));
    await waitFor(() => expect(alerta).toHaveFocus());
    expect(cifrarCopia).not.toHaveBeenCalled();
    expect(crearUrl).not.toHaveBeenCalled();
  });

  it('si el registro del fichero falla, NO se descarga y se explica', async () => {
    registrarFicheroDeCopia.mockResolvedValue({ ok: false, motivo: 'error' });
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('exportaciones.error.noRegistrada'));
    expect(crearUrl).not.toHaveBeenCalled();
    expect(descargas).toEqual([]);
  });

  it('si la exportación caducó antes del registro, lo dice y no descarga', async () => {
    registrarFicheroDeCopia.mockResolvedValue({ ok: false, motivo: 'caducada' });
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('exportaciones.error.caducada'));
    expect(descargas).toEqual([]);
  });

  it('mientras cifra, un role=status lo dice', async () => {
    let terminar: (v: unknown) => void = () => {};
    cifrarCopia.mockReturnValue(new Promise((r) => (terminar = r)));
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t('exportaciones.estado.cifrando')));
    terminar({ html: '<html></html>', huellaHex: HUELLA });
    expect(await screen.findByText(t('exportaciones.estado.descargada'))).toBeInTheDocument();
  });

  it('si se cierra a medio camino, se descartan los resultados: ni se cifra, ni se registra, ni se descarga', async () => {
    let responder: (v: unknown) => void = () => {};
    pedirCopiaDeNota.mockReturnValue(new Promise((r) => (responder = r)));
    const usuario = userEvent.setup();
    render(<Montaje modo="profesional" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    responder({ ok: true, exportacionId: E, copia: COPIA, nombreFichero: 'x.html' });
    await new Promise((r) => setTimeout(r, 20));
    expect(cifrarCopia).not.toHaveBeenCalled();
    expect(registrarFicheroDeCopia).not.toHaveBeenCalled();
    expect(crearUrl).not.toHaveBeenCalled();
  });
});

describe('DialogoDeCopia · motivo', () => {
  it('pinta el motivo como grupo con tres opciones y la referencia con su ayuda', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="motivo" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog', { name: t('exportaciones.dialogo.tituloMotivo') })).toBeInTheDocument();
    const grupo = screen.getByRole('group', { name: t('exportaciones.dialogo.motivo') });
    expect(grupo.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    const referencia = screen.getByLabelText(t('exportaciones.dialogo.referencia'));
    expect(referencia).toHaveAccessibleDescription(expect.stringContaining('No escribas datos de salud'));
  });

  it('sin motivo no llama a la acción', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="motivo" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await rellenar(usuario);
    await enviar(usuario);
    expect(await screen.findByText(t('exportaciones.validacion.faltaMotivo'))).toBeInTheDocument();
    expect(pedirCopiaDeNota).not.toHaveBeenCalled();
  });

  it('con motivo y referencia los manda, recortados, y nunca la contraseña', async () => {
    const usuario = userEvent.setup();
    render(<Montaje modo="motivo" />);
    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await usuario.click(screen.getByLabelText(t('exportaciones.copia.motivos.traspaso_caso')));
    await usuario.type(screen.getByLabelText(t('exportaciones.dialogo.referencia')), '  EXP-12 ');
    await rellenar(usuario);
    await enviar(usuario);
    await screen.findByText(t('exportaciones.estado.descargada'));
    expect(pedirCopiaDeNota).toHaveBeenCalledWith({ pacienteId: P, notaId: N, motivo: 'traspaso_caso', referencia: 'EXP-12' });
    expect(loQueSubio()).not.toContain(CONTRASENA);
  });
});

describe('BotonDeCopia', () => {
  it('«Descargar copia» abre el diálogo profesional; al cerrar con Escape el foco vuelve al botón', async () => {
    const usuario = userEvent.setup();
    render(<BotonDeCopia pacienteId={P} notaId={N} />);
    const boton = screen.getByRole('button', { name: t('exportaciones.boton.descargar') });
    await usuario.click(boton);
    expect(screen.getByRole('dialog', { name: t('exportaciones.dialogo.tituloProfesional') })).toBeInTheDocument();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});
