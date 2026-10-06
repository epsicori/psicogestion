import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrupoPresentado } from '../pendientes';

const m = vi.hoisted(() => ({ buscarPendientes: vi.fn(), resolverAlerta: vi.fn() }));

vi.mock('./acciones', () => ({ buscarPendientes: m.buscarPendientes }));
vi.mock('../acciones-alertas', () => ({ resolverAlerta: m.resolverAlerta }));

import { MemoriaResolucion, ProveedorResolucion } from '../resolver-alerta';
import { Buscador } from './buscador';
import { ID_TITULO } from './parametros';

function grupo(n: number, nombre = `Paciente ${n}`, resoluble = false): GrupoPresentado {
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
        resoluble,
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
    <Buscador tipo={props.tipo ?? null} nivel={props.nivel ?? null} pagina={1}>
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

// Toda promesa en vuelo se suelta al acabar cada prueba, falle o no: una acción sin resolver retiene
// las transiciones de todo el árbol de React y contagiaría a la prueba siguiente (T-048, ronda 4).
const sueltas: Array<() => void> = [];
function diferido<T>(alSoltar: T) {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  sueltas.push(() => resolver(alSoltar));
  return { promesa, resolver };
}
afterEach(async () => {
  await act(async () => {
    for (const soltar of sueltas.splice(0)) soltar();
  });
});

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
    const d = diferido(resultados([]));
    m.buscarPendientes.mockReturnValue(d.promesa);
    pintar();
    await buscar('ana');
    const boton = screen.getByRole('button', { name: 'Buscar' });
    await waitFor(() => expect(boton.getAttribute('aria-disabled')).toBe('true'));
    fireEvent.click(boton);
    expect(m.buscarPendientes).toHaveBeenCalledTimes(1);
  });

  // D10c: resolver desde los resultados repite la búsqueda, mueve el foco, anuncia y actualiza el recuento.
  it('resolver desde un resultado relanza la búsqueda, mueve el foco, anuncia y actualiza el recuento', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    m.buscarPendientes.mockResolvedValueOnce(
      resultados([grupo(1, 'Paciente 1', true), grupo(2, 'Paciente 2', true)]),
    );
    pintar({ tipo: 'nota_sin_firmar', nivel: 1 });
    await buscar('paciente');
    await waitFor(() => screen.getByRole('link', { name: 'Paciente 1' }));
    expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('2 pacientes coinciden');
    expect(m.buscarPendientes).toHaveBeenCalledTimes(1);

    // La base ya no devuelve al paciente 1 cuando se repite la búsqueda.
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(2, 'Paciente 2', true)]));
    const botones = screen.getAllByRole('button', { name: /Marcar como resuelta/ });
    await userEvent.click(botones[0]);

    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(2));
    const primero = m.buscarPendientes.mock.calls[0][1] as FormData;
    const repetido = m.buscarPendientes.mock.calls[1][1] as FormData;
    expect(repetido.get('termino')).toBe(primero.get('termino'));
    expect(repetido.get('tipo')).toBe('nota_sin_firmar');
    expect(repetido.get('nivel')).toBe('1');

    // El recuento se actualiza, el paciente resuelto desaparece y el foco va al que ocupa su sitio.
    await waitFor(() => expect(document.querySelector('[data-estado-bloque]')?.textContent).toContain('Marcada como resuelta.'));
    expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('1 paciente coincide');
    expect(screen.queryByRole('link', { name: 'Paciente 1' })).toBeNull();
    await waitFor(() => expect(document.activeElement?.id).toBe('busqueda-paciente-p2'));
  });

  // H1 (ronda 2): cambiar de filtro o de página descarta la búsqueda (D10 y la ayuda del campo).
  it.each([
    ['el tipo', { tipo: 'nota_sin_firmar' as const, nivel: null, pagina: 1 }],
    ['el nivel', { tipo: null, nivel: 2 as const, pagina: 1 }],
    ['la página', { tipo: null, nivel: null, pagina: 2 }],
  ])('cambiar %s descarta la búsqueda: campo vacío, lista paginada y sin repetir el término viejo', async (_n, nuevos) => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    m.buscarPendientes.mockResolvedValue(resultados([grupo(1, 'Paciente 1', true)]));
    const { rerender } = render(
      <Buscador tipo={null} nivel={null} pagina={1}>
        <p>LISTA PAGINADA</p>
      </Buscador>,
    );
    await buscar('paciente');
    await waitFor(() => screen.getByRole('link', { name: 'Paciente 1' }));

    rerender(
      <Buscador tipo={nuevos.tipo} nivel={nuevos.nivel} pagina={nuevos.pagina}>
        <p>LISTA PAGINADA</p>
      </Buscador>,
    );
    const campo = screen.getByLabelText('Buscar por nombre o apellidos') as HTMLInputElement;
    expect(campo.value).toBe('');
    expect(screen.getByText('LISTA PAGINADA')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Paciente 1' })).toBeNull();
    expect(document.querySelector('[data-estado-busqueda]')?.textContent).toBe('');
    expect(m.buscarPendientes).toHaveBeenCalledTimes(1);
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

// R3 (ronda 3): la resolución en vuelo no roba el foco del campo que el usuario acaba de elegir.
describe('Buscador: descartar la resolución, ya anotada o en vuelo (R2-H1, R3-H1)', () => {
  beforeEach(() => {
    m.buscarPendientes.mockReset();
    m.resolverAlerta.mockReset();
  });

  /** La página real: título enfocable, la memoria del layout y la lista paginada dentro del buscador. */
  function pintarConMemoria() {
    return render(
      <MemoriaResolucion>
        <h2 id={ID_TITULO} tabIndex={-1}>
          Documentación pendiente
        </h2>
        <Buscador tipo={null} nivel={null} pagina={1}>
          <ProveedorResolucion
            prefijo="pagina"
            encabezadoId={ID_TITULO}
            pacientes={[{ id: 'pQ', alertas: ['aQ'], anuncio: 'Q' }]}
          >
            <p>LISTA PAGINADA</p>
          </ProveedorResolucion>
        </Buscador>
      </MemoriaResolucion>,
    );
  }

  it('«Limpiar búsqueda» con una resolución en vuelo no roba el foco del campo', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(1, 'Paciente 1', true)]));
    // `relanzar` queda en vuelo: la lista que vuelve tras limpiar no contiene al paciente resuelto.
    const d = diferido(resultados([]));
    m.buscarPendientes.mockReturnValue(d.promesa);
    pintarConMemoria();
    const campo = await buscar('paciente');
    await waitFor(() => screen.getByRole('button', { name: /Marcar como resuelta/ }));
    await userEvent.click(screen.getByRole('button', { name: /Marcar como resuelta/ }));
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await act(async () => {});
    expect(screen.getByText('LISTA PAGINADA')).toBeTruthy();
    expect(document.activeElement).toBe(campo);
  });

  it('gemelo con «Buscar»: una búsqueda nueva con una resolución pendiente no manda el foco a un resultado ajeno', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    // 1) la búsqueda; 2) `relanzar`, que aún devuelve la alerta (la base no ha llegado); 3) la nueva
    // búsqueda, sin el paciente 1: sin descartar, el pendiente se cerraría moviendo el foco al paciente 2.
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(1, 'Paciente 1', true), grupo(2, 'Paciente 2', true)]));
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(1, 'Paciente 1', true), grupo(2, 'Paciente 2', true)]));
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(2, 'Paciente 2', true)]));
    pintarConMemoria();
    await buscar('paciente');
    await userEvent.click((await screen.findAllByRole('button', { name: /Marcar como resuelta/ }))[0]);
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(2));

    await buscar('paciente');
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Paciente 1' })).toBeNull());
    await act(async () => {});
    expect(document.activeElement?.id).not.toBe('busqueda-paciente-p2');
    expect(document.activeElement?.id).not.toBe(ID_TITULO);
  });

  it('"Limpiar búsqueda" con la acción aún en vuelo: el ok que llega después no roba el foco del campo ni anuncia', async () => {
    const d = diferido<{ ok: true } | { ok: false; error: string }>({ ok: false, error: 'fallo' });
    m.resolverAlerta.mockReturnValue(d.promesa);
    m.buscarPendientes.mockResolvedValueOnce(resultados([grupo(1, 'Paciente 1', true)]));
    m.buscarPendientes.mockResolvedValue(resultados([]));
    pintarConMemoria();
    const campo = await buscar('paciente');
    await userEvent.click(await screen.findByRole('button', { name: /Marcar como resuelta/ }));
    await screen.findByRole('button', { name: 'Guardando…' });
    expect(m.buscarPendientes).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(document.activeElement).toBe(campo);

    await act(async () => d.resolver({ ok: true }));
    // Señal de que el ok ya se procesó: `relanzar` se llama aunque la época sea vieja.
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(document.activeElement).toBe(campo);
    expect(document.querySelector('[data-estado-bloque]')?.textContent).toBe('');
  });

  it('"Buscar" de nuevo con la acción aún en vuelo: el ok que llega después no lleva el foco a un resultado de la búsqueda nueva', async () => {
    const d = diferido<{ ok: true } | { ok: false; error: string }>({ ok: false, error: 'fallo' });
    m.resolverAlerta.mockReturnValue(d.promesa);
    m.buscarPendientes.mockResolvedValueOnce(
      resultados([grupo(1, 'Paciente 1', true), grupo(2, 'Paciente 2', true)]),
    );
    m.buscarPendientes.mockResolvedValue(resultados([grupo(2, 'Paciente 2', true)]));
    pintarConMemoria();
    await buscar('paciente');
    await userEvent.click((await screen.findAllByRole('button', { name: /Marcar como resuelta/ }))[0]);
    await screen.findByRole('button', { name: 'Guardando…' });

    await buscar('paciente');
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(2));
    const antes = document.activeElement;

    await act(async () => d.resolver({ ok: true }));
    await waitFor(() => expect(m.buscarPendientes).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Paciente 1' })).toBeNull());
    await act(async () => {});
    expect(document.activeElement).toBe(antes);
    expect(document.activeElement?.id).not.toBe('busqueda-paciente-p2');
    expect(document.querySelector('[data-estado-bloque]')?.textContent).toBe('');
  });
});
