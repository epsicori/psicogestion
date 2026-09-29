'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { RolUsuario } from '@/components/armazon/modulos';
import { LeyendaEstadosCita } from '@/components/ui/estado-cita';
import { Seleccion } from '@/components/ui/seleccion';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { DialogoReprogramar } from './dialogo-reprogramar';
import { ListaDia } from './lista-dia';
import { PanelCita } from './panel-cita';
import { PanelDia } from './panel-dia';
import { RejillaMes } from './rejilla-mes';
import { RejillaSemana } from './rejilla-semana';
import type { CitaVista, DiaVista, VistaCalendario } from './vista';

type Props = {
  vista: VistaCalendario;
  /** Lo que venía en la URL, para no perderlo al navegar. */
  parametros: { centro: string | null; profesional: string | null };
  centros: { id: string; nombre: string }[];
  /** `'todos'` o el uuid del centro que filtra: lo que dice el selector. */
  centroElegido: string;
  rol: RolUsuario | null;
};

/** La pila de paneles: el día, y encima la cita. Cada uno recuerda a qué volver el foco (D9). */
type Panel = { tipo: 'dia'; dia: DiaVista; ancla: HTMLElement } | { tipo: 'cita'; cita: CitaVista; ancla: HTMLElement };

type Reprogramando = { cita: CitaVista; inicial: { fecha: string; hora: string }; desdeArrastre: boolean };

const ENLACE =
  'border-border bg-background hover:bg-muted focus-visible:ring-ring/50 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2';

/**
 * La isla del calendario (T-014 §1.6.3): la barra, los filtros, la leyenda, la semana o el mes
 * y lo que se abre encima. Recibe la vista ya calculada en servidor (cadenas y números, ningún
 * `Date`) y solo guarda estado de interfaz: el día en foco, la pila de paneles y el diálogo.
 */
export function Calendario({ vista, parametros, centros, centroElegido, rol }: Props) {
  const router = useRouter();
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null);
  const [fechaFoco, setFechaFoco] = useState(vista.fechaFoco);
  const [pila, setPila] = useState<Panel[]>([]);
  const [reprogramando, setReprogramando] = useState<Reprogramando | null>(null);
  const [anuncio, setAnuncio] = useState('');

  // El foco se mueve en un efecto, cuando los paneles ya se han ido del DOM: hacerlo en el
  // manejador lo dejaría a merced de la trampa de foco del panel que se cierra.
  const [pulso, setPulso] = useState(0);
  const devolverA = useRef<HTMLElement | null>(null);
  const enfocarCita = useRef<{ id: string; fecha: string; citas: VistaCalendario['citas'] } | null>(null);

  useEffect(() => {
    const ancla = devolverA.current;
    if (ancla) {
      devolverA.current = null;
      if (ancla.isConnected) ancla.focus();
    }

    const objetivo = enfocarCita.current;
    if (objetivo && contenedor) {
      const candidatas = [...contenedor.querySelectorAll<HTMLElement>(`[data-cita-id="${objetivo.id}"]`)];
      // De las dos formas de la semana solo una se ve: la que tiene caja.
      const cita = candidatas.find((e) => e.offsetParent !== null) ?? candidatas[0];
      const dia = contenedor.querySelector<HTMLElement>(`[data-dia="${objetivo.fecha}"]`);
      (cita ?? dia)?.focus();
      // Al llegar los datos nuevos la cita puede haber cambiado de sitio y de nodo: se enfoca
      // una segunda vez y se olvida.
      if (vista.citas !== objetivo.citas) enfocarCita.current = null;
    }
  }, [pulso, vista.citas, contenedor]);

  function href(cambios: { vista?: 'semana' | 'mes'; fecha?: string | null; centro?: string | null; profesional?: string | null }) {
    const valores = { vista: vista.vista, fecha: null as string | null, ...parametros, ...cambios };
    const p = new URLSearchParams();
    p.set('vista', valores.vista);
    if (valores.fecha) p.set('fecha', valores.fecha);
    if (valores.centro) p.set('centro', valores.centro);
    if (valores.profesional) p.set('profesional', valores.profesional);
    return `/agenda?${p.toString()}`;
  }

  const enMes = vista.vista === 'mes';
  const diaInicial = Math.max(
    0,
    vista.dias.findIndex((d) => d.fecha === vista.fechaFoco),
  );

  function abrirDia(dia: DiaVista, ancla: HTMLElement) {
    setFechaFoco(dia.fecha);
    setPila([{ tipo: 'dia', dia, ancla }]);
  }

  function abrirCita(cita: CitaVista, ancla: HTMLElement) {
    setFechaFoco(cita.fechaLocal);
    setPila((actual) => [...actual, { tipo: 'cita', cita, ancla }]);
  }

  function cerrarTope() {
    const tope = pila[pila.length - 1];
    if (!tope) return;
    setPila(pila.slice(0, -1));
    devolverA.current = tope.ancla;
    setPulso((n) => n + 1);
  }

  function alMovida(texto: string) {
    if (reprogramando) {
      enfocarCita.current = { id: reprogramando.cita.id, fecha: reprogramando.cita.fechaLocal, citas: vista.citas };
    }
    setReprogramando(null);
    setPila([]);
    setAnuncio(texto);
    setPulso((n) => n + 1);
  }

  const opcionesCentro = centros.map((c) => ({ valor: c.id, texto: c.nombre }));
  const opcionesProfesional = vista.profesionales.map((p) => ({ valor: p.id, texto: p.nombre }));
  const mostrarCentro = centros.length >= 2;
  const mostrarProfesional = rol !== 'profesional_sanitario' && vista.profesionales.length >= 2;

  return (
    <div ref={setContenedor} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href({ fecha: vista.anterior })}
          aria-label={enMes ? t('agenda.barra.mesAnterior') : t('agenda.barra.semanaAnterior')}
          className={cn(ENLACE, 'w-11 px-0')}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
        <Link href={href({ fecha: null })} className={ENLACE}>
          {t('agenda.barra.hoy')}
        </Link>
        <Link
          href={href({ fecha: vista.siguiente })}
          aria-label={enMes ? t('agenda.barra.mesSiguiente') : t('agenda.barra.semanaSiguiente')}
          className={cn(ENLACE, 'w-11 px-0')}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>

        <h2 className="font-serif text-lg">{vista.titulo}</h2>

        <div role="group" aria-label={t('agenda.barra.vista')} className="ml-auto flex gap-1">
          <Link
            href={href({ vista: 'semana', fecha: fechaFoco })}
            aria-current={enMes ? undefined : 'page'}
            className={cn(ENLACE, !enMes && 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary')}
          >
            {t('agenda.barra.semana')}
          </Link>
          <Link
            href={href({ vista: 'mes', fecha: fechaFoco })}
            aria-current={enMes ? 'page' : undefined}
            className={cn(ENLACE, enMes && 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary')}
          >
            {t('agenda.barra.mes')}
          </Link>
        </div>
      </div>

      {(mostrarCentro || mostrarProfesional) && (
        <div className="flex flex-wrap gap-3">
          {mostrarCentro && (
            <Seleccion
              id="filtro-centro"
              etiqueta={t('agenda.barra.centro')}
              textoVacio={t('agenda.barra.todosLosCentros')}
              opciones={opcionesCentro}
              value={centroElegido === 'todos' ? '' : centroElegido}
              onChange={(evento) =>
                router.replace(href({ fecha: vista.fechaFoco, centro: evento.target.value || 'todos' }), { scroll: false })
              }
            />
          )}
          {mostrarProfesional && (
            <Seleccion
              id="filtro-profesional"
              etiqueta={t('agenda.barra.profesional')}
              textoVacio={t('agenda.barra.todosLosProfesionales')}
              opciones={opcionesProfesional}
              value={parametros.profesional ?? ''}
              onChange={(evento) =>
                router.replace(href({ fecha: vista.fechaFoco, profesional: evento.target.value || null }), {
                  scroll: false,
                })
              }
            />
          )}
        </div>
      )}

      {enMes ? (
        <RejillaMes
          titulo={vista.titulo}
          dias={vista.dias}
          citas={vista.citas}
          diaInicial={diaInicial}
          alAbrirDia={abrirDia}
          alAbrirCita={abrirCita}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <RejillaSemana
              titulo={vista.titulo}
              dias={vista.dias}
              eje={vista.eje}
              citas={vista.citas}
              diaInicial={diaInicial}
              alAbrirDia={abrirDia}
              alAbrirCita={abrirCita}
              alSoltar={(cita, fecha, hora) =>
                setReprogramando({ cita, inicial: { fecha, hora }, desdeArrastre: true })
              }
            />
          </div>
          <div className="md:hidden">
            <ListaDia dias={vista.dias} citas={vista.citas} diaInicial={diaInicial} alAbrirCita={abrirCita} />
          </div>
        </>
      )}

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('agenda.barra.leyenda')}</summary>
        <LeyendaEstadosCita />
      </details>

      <div role="status" className="sr-only">
        {anuncio}
      </div>

      {pila.map((panel, i) => {
        const pausado = reprogramando !== null || i < pila.length - 1;
        if (panel.tipo === 'dia') {
          const indice = vista.dias.findIndex((d) => d.fecha === panel.dia.fecha);
          return (
            <PanelDia
              key={`dia-${panel.dia.fecha}`}
              dia={panel.dia}
              citas={vista.citas.filter((c) => c.diaIndice === indice)}
              ancla={panel.ancla}
              limites={contenedor}
              alCerrar={cerrarTope}
              pausado={pausado}
              alAbrirCita={abrirCita}
            />
          );
        }
        return (
          <PanelCita
            key={`cita-${panel.cita.id}-${panel.cita.tramo}`}
            cita={panel.cita}
            ancla={panel.ancla}
            limites={contenedor}
            alCerrar={cerrarTope}
            pausado={pausado}
            alReprogramar={() =>
              setReprogramando({
                cita: panel.cita,
                inicial: { fecha: panel.cita.fechaLocal, hora: panel.cita.horaLocal },
                desdeArrastre: false,
              })
            }
          />
        );
      })}

      {reprogramando && (
        <DialogoReprogramar
          cita={reprogramando.cita}
          zona={vista.zona}
          dias={vista.dias}
          inicial={reprogramando.inicial}
          desdeArrastre={reprogramando.desdeArrastre}
          alCerrar={() => setReprogramando(null)}
          alMovida={alMovida}
        />
      )}
    </div>
  );
}
