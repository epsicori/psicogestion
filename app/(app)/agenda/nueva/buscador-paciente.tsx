'use client';

import { useEffect, useId, useState } from 'react';

import { t } from '@/lib/i18n';

import { buscarPacientes } from './acciones';

/** `profesionalId`: el asignado, solo para proponerlo por defecto al agendar; no se pinta. */
export type PacienteElegido = { id: string; nombre: string; profesionalId?: string | null };

type Props = {
  paciente: PacienteElegido | null;
  alElegir: (paciente: PacienteElegido | null) => void;
};

/** Cuánto se espera tras la última tecla antes de preguntar. */
const ESPERA_MS = 250;

type Busqueda = { texto: string; pacientes: PacienteElegido[] | null; error: boolean };

/**
 * Elegir paciente por nombre (≥ 2 letras, hasta 10 resultados). El servidor decide a quién ve
 * quien busca (RLS); aquí solo se pinta. El id no sale a la URL: va en el formulario (CLAUDE.md).
 */
export function BuscadorPaciente({ paciente, alElegir }: Props) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);

  const limpio = texto.trim();
  const suficiente = limpio.length >= 2;

  useEffect(() => {
    if (!suficiente) return;
    let vigente = true;
    const temporizador = setTimeout(async () => {
      let resultado: Awaited<ReturnType<typeof buscarPacientes>>;
      try {
        resultado = await buscarPacientes({ texto: limpio });
      } catch {
        resultado = { ok: false, mensaje: t('agenda.alta.error.buscar') };
      }
      if (!vigente) return;
      setBusqueda({ texto: limpio, pacientes: resultado.ok ? resultado.pacientes : null, error: !resultado.ok });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [limpio, suficiente]);

  if (paciente) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('agenda.alta.campos.pacienteElegido')}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">{paciente.nombre}</span>
          <button
            type="button"
            onClick={() => alElegir(null)}
            className="border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
          >
            {t('agenda.alta.campos.pacienteCambiar')}
          </button>
        </div>
      </div>
    );
  }

  const actual = suficiente && busqueda?.texto === limpio ? busqueda : null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t('agenda.alta.campos.pacienteBuscar')}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        aria-describedby={`${id}-ayuda`}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
      />
      <div id={`${id}-ayuda`} role="status" className="text-muted-foreground text-sm">
        {!suficiente && t('agenda.alta.campos.pacienteBuscarAyuda')}
        {actual?.error && t('agenda.alta.error.buscar')}
        {actual?.pacientes?.length === 0 && t('agenda.alta.campos.pacienteSinResultados')}
      </div>
      {actual?.pacientes && actual.pacientes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {actual.pacientes.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => alElegir(p)}
                className="border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 w-full rounded-lg border px-3 text-left text-sm outline-none focus-visible:ring-2"
              >
                {p.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
