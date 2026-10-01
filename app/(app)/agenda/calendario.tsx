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
  /** El ancla a la que vuelve el foco, y qué buscar si ya no está en el documento. */
  const devolverA = useRef<{ ancla: HTMLElement; citaId: string | null; fecha: string } | null>(null);
  const enfocarCita = useRef<{ id: string; fecha: string; citas: VistaCalendario['citas'] } | null>(null);
  // Lo abierto ahora mismo. Una acción que vuelve tarde llama a una función de cuando se lanzó;
  // lo que decide si cierra algo es lo que hay abierto cuando vuelve, no lo de entonces (revisión B-1).
  const vigente = useRef({ pila, reprogramando });
  useEffect(() => {
    vigente.current = { pila, reprogramando };
  });

  useEffect(() => {
    // De las dos formas de la semana solo una se ve, y un panel tapado lleva `hidden`: se
    // enfoca lo que tiene caja. La cita si se ve; si no, el número de su día (§8.3, «Éxito»);
    // el día es el de la vista actual, que tras mover puede ser otro (revisión TS H4).
    function enfocarVisible(citaId: string | null, fecha: string) {
      if (!contenedor) return;
      function visibles(selector: string): HTMLElement[] {
        const todos: HTMLElement[] = Array.from(contenedor!.querySelectorAll(selector));
        return todos.filter((e) => e.offsetParent !== null);
      }
      const fechaActual = vista.citas.find((c) => c.id === citaId)?.fechaLocal ?? fecha;
      const destino =
        (citaId === null ? undefined : visibles(`[data-cita-id="${citaId}"]`)[0]) ??
        visibles(`[data-dia="${fechaActual}"]`)[0];
      destino?.focus();
    }

    const vuelta = devolverA.current;
    if (vuelta) {
      devolverA.current = null;
      // El ancla se desmonta si la cita cambió de sitio con el panel abierto (revisión TS H5).
      if (vuelta.ancla.isConnected) vuelta.ancla.focus();
      else enfocarVisible(vuelta.citaId, vuelta.fecha);
    }

    const objetivo = enfocarCita.current;
    if (objetivo) {
      enfocarVisible(objetivo.id, objetivo.fecha);
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
    devolverA.current =
      tope.tipo === 'cita'
        ? { ancla: tope.ancla, citaId: tope.cita.id, fecha: tope.cita.fechaLocal }
        : { ancla: tope.ancla, citaId: null, fecha: tope.dia.fecha };
    setPulso((n) => n + 1);
  }

  /**
   * Dos anuncios iguales seguidos no cambian el DOM y el lector no vuelve a hablar (revisión B-2):
   * el repetido lleva un espacio duro al final, y el siguiente vuelve a quitarlo.
   */
  function anunciar(texto: string) {
    setAnuncio((previo) => (previo === texto ? `${texto}\u00A0` : texto));
  }

  /**
   * Tras mover la cita o resolver su propuesta: se cierra todo, se anuncia y el foco va a ella,
   * pero solo si lo que lanzó la acción sigue siendo lo abierto (revisión B-1). Si el panel o el
   * diálogo ya se cerró, o hay otro encima, el resultado se anuncia y nada más: no cierra lo de
   * ahora ni le quita el foco.
   */
  function resolverCita(cita: CitaVista, texto: string, origen: 'panel' | 'dialogo') {
    const { pila: abiertos, reprogramando: dialogo } = vigente.current;
    const tope = abiertos[abiertos.length - 1];
    const mismo = (otra: CitaVista) => otra.id === cita.id && otra.tramo === cita.tramo;
    const sigueAbierto =
      origen === 'dialogo'
        ? dialogo !== null && mismo(dialogo.cita)
        : dialogo === null && tope?.tipo === 'cita' && mismo(tope.cita);
    anunciar(texto);
    const nadaAbierto = dialogo === null && abiertos.length === 0;
    // Otro panel o diálogo abierto: el foco es suyo. Con nada abierto no hay nada que cerrar,
    // pero el foco sigue a la cita, que puede cambiar de día y desmontar su botón (revisión B2-1).
    if (!sigueAbierto && !nadaAbierto) return;
    enfocarCita.current = { id: cita.id, fecha: cita.fechaLocal, citas: vista.citas };
    if (sigueAbierto) {
      setReprogramando(null);
      setPila([]);
    }
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
        // Solo se pinta la cima (D9). El de debajo sigue montado, oculto e inerte, para que su
        // fila exista cuando se vuelva a él (revisión TS H3).
        const oculto = i < pila.length - 1;
        const pausado = reprogramando !== null;
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
              oculto={oculto}
              alAbrirCita={abrirCita}
            />
          );
        }
        // La pila guarda la cita de cuando se abrió; se pinta la de la vista actual, que tras
        // un recargado trae la propuesta, el rango y el estado al día (revisión TS H5).
        const cita =
          vista.citas.find((c) => c.id === panel.cita.id && c.tramo === panel.cita.tramo) ??
          vista.citas.find((c) => c.id === panel.cita.id) ??
          panel.cita;
        return (
          <PanelCita
            key={`cita-${panel.cita.id}-${panel.cita.tramo}`}
            cita={cita}
            ancla={panel.ancla}
            respaldo={pila[i - 1]?.ancla}
            limites={contenedor}
            alCerrar={cerrarTope}
            pausado={pausado}
            alReprogramar={() =>
              setReprogramando({
                cita,
                inicial: { fecha: cita.fechaLocal, hora: cita.horaLocal },
                desdeArrastre: false,
              })
            }
            alPropuestaResuelta={(texto) => resolverCita(cita, texto, 'panel')}
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
          alMovida={(texto) => resolverCita(reprogramando.cita, texto, 'dialogo')}
        />
      )}
    </div>
  );
}
