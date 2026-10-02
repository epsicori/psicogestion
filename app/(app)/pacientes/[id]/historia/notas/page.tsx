import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';

import { formatearFechaLarga, formatearRango } from '@/lib/fechas';
import { exigirSesion } from '@/lib/supabase/sesion';

import { cargarPaciente } from '../../datos';
import { CabeceraDeNota } from './cabecera-de-nota';
import { EditorDeNota } from './editor-de-nota';
import { EsqueletoEditor } from './esqueleto-editor';

/**
 * La nota clínica de un paciente: `/pacientes/:id/historia/notas` con `?cita=` seguido del uuid (la puerta de
 * creación, desde la agenda) o con `?nota=` seguido del uuid (una nota que ya existe, desde la ficha).
 *
 * Este fichero es **solo el armazón**: no lee la tabla de las notas ni importa nada del
 * servidor de notas. Lo clínico llega cuando alguien pulsa «Abrir el editor» (ADR-058.3), porque cada
 * apertura deja su fila en `accesos_historia`. Por eso el HTML de esta ruta no lleva ni un
 * fragmento del texto, con el candado cerrado o abierto (`page.test.ts` lo comprueba sobre el
 * fuente).
 *
 * `interactiveWidget: 'resizes-content'`: con el teclado del móvil abierto la página se
 * redimensiona y la barra de acciones sigue pegada encima de él, en vez de quedar tapada.
 */
export const viewport: Viewport = { interactiveWidget: 'resizes-content' };

const esquemaDeParametros = z
  .object({
    cita: z.uuid().optional(),
    nota: z.uuid().optional(),
  })
  // Una cosa o la otra: con las dos o con ninguna no se sabe qué nota abrir.
  .refine((p) => (p.cita === undefined) !== (p.nota === undefined));

type Parametros = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function Armazon({ params, searchParams }: Parametros) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const consulta = esquemaDeParametros.safeParse(await searchParams);
  if (!consulta.success) notFound();
  const { cita, nota } = consulta.data;

  const paciente = await cargarPaciente(id);
  if (!paciente) notFound();

  let sesion: string | null = null;
  if (cita !== undefined) {
    const { supabase } = await exigirSesion();
    const { data } = await supabase
      .from('citas')
      .select('inicio, fin, zona_horaria, paciente_id')
      .eq('id', cita)
      .maybeSingle();
    // Una cita de otro paciente, o que no se ve, es un 404: no se confirma que exista.
    if (!data || data.paciente_id !== paciente.id) notFound();
    const inicio = new Date(data.inicio);
    sesion = `${formatearFechaLarga(inicio, data.zona_horaria)} · ${formatearRango(inicio, new Date(data.fin), data.zona_horaria)}`;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4">
      <CabeceraDeNota
        paciente={`${paciente.nombre} ${paciente.apellidos}`}
        sesion={sesion}
        volverHref={`/pacientes/${paciente.id}`}
      />
      <EditorDeNota pacienteId={paciente.id} citaId={cita ?? null} notaId={nota ?? null} />
    </div>
  );
}

export default function PaginaDeNota({ params, searchParams }: Parametros) {
  return (
    <Suspense fallback={<EsqueletoEditor />}>
      <Armazon params={params} searchParams={searchParams} />
    </Suspense>
  );
}
