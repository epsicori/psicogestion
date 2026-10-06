import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrupoPresentado } from '../pendientes';

const m = vi.hoisted(() => ({ buscarPendientes: vi.fn() }));

vi.mock('./acciones', () => ({ buscarPendientes: m.buscarPendientes }));
vi.mock('../acciones-alertas', () => ({ resolverAlerta: vi.fn() }));

import { Buscador } from './buscador';

function grupo(n: number, nombre = `Paciente ${n}`): GrupoPresentado {
  return {
    pacienteId: `p${n}`,
    nombre,
    hrefPaciente: `/pacientes/p${n}`,
    recuento: 1,
    insignia: '1 pendiente',
    urgencia: null,
    textoUrgencia: null,
    textoAccesible: `${nombre}, 1 pendiente`,
    resumen: null,
    anuncio: `${nombre}, 1 pendiente`,
    pendientes: [
      {
        id: `a${n}`,
        etiquetaTipo: 'Informe pendiente',
        textoDesde: 'pendiente desde hoy',
        pildora: null,
        destino: `/pacientes/p${n}`,
        nombreEnlace: `Informe pendiente de ${nombre}: ir a la ficha`,
        resoluble: false,
      },
    ],
    verTodos: null,
  };
}

function resultados(grupos: GrupoPresentado[], extra: Record<string, unknown> = {}) {
  return {
    fase: 'resultados' as const,
    grupos,
    coincidencias: grupos.length,
    recortada: false,
    leidos: 10,
    total: 10,
    ...extra,
  };
}

function pintar(props: { tipo?: 'nota_sin_firmar' | null; nivel?: 1 | 2 | 3 | null } = {}) {
  return render(
    <Buscador tipo={props.tipo ?? null} nivel={props.nivel ?? null}>
      <p>LISTA PAGINADA</p>
    </Buscador>,
  );
}

async function buscar(termino: string) {
  const campo = screen.getByLabelText('Buscar por nombre o apellidos') as HTMLInputElement;
  await userEvent.clear(campo);
  await userEvent.type(campo, termino);
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  return campo;
}

describe('Buscador', () => {
  beforeEach(() => vi.clearAllMocks());

  it('al principio pinta la lista paginada, con la ayuda y el status siempre montado', () => {
    pintar();
    expect(screen.getByText('LISTA PAGINADA')).toBeTruthy();
    const campo = screen.getByLabelText('Buscar por nombre o apellidos');
    expect(campo.getAttribute('type')).toBe('search');
    expect(campo.getAttribute('name')).toBe('termino');
    expect(campo.getAttribute('autocomplete')).toBe('off');
    const ayuda = screen.getByText(/La búsqueda no se guarda/);
    expect(campo.getAttribute('aria-describedby')).toContain(ayuda.id);
    expect(document.querySelectorAll('[role="status"][aria-live="polite"]').length).toBeGreaterThan(0);
  });

  it('el formulario no tiene método ni acción de cadena, y envía tipo y nivel como ocultos', () => {
    pintar({ tipo: 'nota_sin_firmar', nivel: 2 });
    const form = screen.getByRole('button', { name: 'Buscar' }).closest('form')!;
    expect(form.hasAttribute('method')).toBe(false);
    expect((form.querySelector('input[name="tipo"]') as HTMLInputElement).value).toBe('nota_sin_firmar');
    expect((form.querySelector('input[name="nivel"]') as HTMLInputElement).value).toBe('2');
  });

  it('sin filtros no hay campos ocultos', () => {
    pintar();
    expect(document.querySelector('input[type="hidden"]')).toBeNull();
  });

  it('un término demasiado corto muestra el error y no despacha nada', async () => {
    pintar();
    const campo = await buscar('a');
    expect(m.buscarPendientes).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe entre 2 y 100 caracteres.')).toBeTruthy();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('LISTA PAGINADA')).toBeTruthy();
  });

  it('el error desaparece con un término válido', async () => {
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1)]));
    pintar();
    await buscar('a');
    await buscar('an');
    await waitFor(() => expect(screen.queryByText('Escribe entre 2 y 100 caracteres.')).toBeNull());
  });

  it('con un término válido: envía el término, sustituye la lista y anuncia el recuento', async () => {
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1), grupo(2)]));
    pintar({ tipo: 'nota_sin_firmar', nivel: 1 });
    await buscar('  ana  ');

    await waitFor(() => expect(screen.getByRole('link', { name: 'Paciente 1' })).toBeTruthy());
    expect(screen.queryByText('LISTA PAGINADA')).toBeNull();
    const datos = m.buscarPendientes.mock.calls[0][1] as FormData;
    expect(datos.get('termino')).toBe('  ana  ');
    expect(datos.get('tipo')).toBe('nota_sin_firmar');
    expect(datos.get('nivel')).toBe('1');
    expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('2 pacientes coinciden');
    expect(document.getElementById('busqueda-paciente-p1')).not.toBeNull();
  });

  it('1 coincidencia y ninguna coincidencia, en singular y en vacío', async () => {
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(1)]));
    pintar();
    await buscar('ana');
    await waitFor(() => expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('1 paciente coincide'));

    m.buscarPendientes.mockResolvedValueOnce(resultados([]));
    await buscar('zzz');
    await waitFor(() =>
      expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('Ningún paciente coincide'),
    );
  });

  it('más de 20 coincidencias: el aviso con el total', async () => {
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1)], { coincidencias: 34 }));
    pintar();
    await buscar('ana');
    await waitFor(() =>
      expect(screen.getByText('Hay 34 pacientes que coinciden; se muestran los 20 más urgentes. Afina la búsqueda.')).toBeTruthy(),
    );
  });

  it('lectura recortada: lo declara', async () => {
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1)], { recortada: true, leidos: 1000, total: 1500 }));
    pintar();
    await buscar('ana');
    await waitFor(() => expect(screen.getByText('Se muestran los 1000 más urgentes de 1500.')).toBeTruthy());
  });

  it('«Limpiar búsqueda» devuelve la lista, vacía el campo y le da el foco', async () => {
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1)]));
    pintar();
    const campo = await buscar('ana');
    await waitFor(() => screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByText('LISTA PAGINADA')).toBeTruthy();
    expect(campo.value).toBe('');
    expect(document.activeElement).toBe(campo);
  });

  it('fallo: aviso de error y «Limpiar búsqueda»', async () => {
    m.buscarPendientes.mockResolvedValue({ fase: 'fallo' });
    pintar();
    await buscar('ana');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se ha podido buscar.'));
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeTruthy();
  });

  it('una acción que lanza: «fallo» y un registro fijo que no lleva ni el error ni el término', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.buscarPendientes.mockRejectedValue(new Error('cuerpo con secretoXYZ'));
    pintar();
    await buscar('secretoXYZ');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(consola).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consola.mock.calls)).not.toContain('secretoXYZ');
    expect(consola.mock.calls[0]).toHaveLength(1);
    consola.mockRestore();
  });

  it('mientras busca, el botón queda aria-disabled y un segundo clic no despacha', async () => {
    let resolver: (v: unknown) => void = () => {};
    m.buscarPendientes.mockReturnValue(new Promise((r) => (resolver = r)));
    pintar();
    await buscar('ana');
    const boton = screen.getByRole('button', { name: 'Buscar' });
    await waitFor(() => expect(boton.getAttribute('aria-disabled')).toBe('true'));
    fireEvent.click(boton);
    expect(m.buscarPendientes).toHaveBeenCalledTimes(1);
    await act(async () => resolver(resultados([grupo(1)])));
  });

  it('el término no va a ningún sitio: ni URL, ni historial, ni almacenamiento, ni cookies', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1)]));
    pintar();
    await buscar('ana');
    await waitFor(() => screen.getByRole('link', { name: 'Paciente 1' }));
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    for (const e of [setItem, cookie, push, replace]) e.mockRestore();
  });
});
