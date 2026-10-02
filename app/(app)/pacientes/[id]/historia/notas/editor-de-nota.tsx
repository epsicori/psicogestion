'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, LockOpen } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ActionDispatch,
  type FormEvent,
} from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { AreaTexto } from '@/components/ui/area-texto';
import { Button } from '@/components/ui/button';
import { Desplegable } from '@/components/ui/desplegable';
import { Dialogo } from '@/components/ui/dialogo';
import { PanelDePestana, Pestanas } from '@/components/ui/pestanas';
import { AvisoDeError, EstadoVacio } from '@/components/ui/piezas';
import { t, tCon, type ClaveDeCatalogo } from '@/lib/i18n';
import type {
  ModeloDeNota,
  MotivoFallo,
  ResultadoApertura,
  ResultadoDeNota,
  ResultadoGuardado,
  VersionDeVista,
} from '@/lib/notas/servidor';

import { ampliarLaVentana, cerrarHistoriaDelPaciente } from '../../acciones';
import { FormularioPinHistoria } from '../../formulario-pin-historia';
import { minutosRestantes } from '../../presentacion';
import { abrirEditorDeNota, empezarModificacion, firmarNota, fijarCoprofesional, guardarBorrador } from './acciones';
import { AvisoReservadas } from './aviso-reservadas';
import { BarraDeAcciones } from './barra-de-acciones';
import { EsqueletoEditor } from './esqueleto-editor';
import { esquemaFirma } from './esquemas';
import { PildoraDeEstado } from './estado-de-nota';
import { FilaDeVersion } from './fila-de-version';
import { ModificadaPor } from './modificada-por';
import { SelloDeNota } from './sello-de-nota';

/**
 * El editor de la nota clínica (T-012 corte B).
 *
 * Es cliente porque tiene estado, reloj y teclado, pero **no lee nada al montarse**: abrir es un
 * gesto (ADR-058.3) y cada apertura registra un acceso. Mientras no haya modelo, lo que se pinta
 * es el botón de abrir, el candado o un aviso: el HTML del servidor no lleva ni un fragmento
 * clínico.
 *
 * Tres cosas que no son obvias:
 *  - El testigo del borrador es una CADENA opaca; se guarda tal como llegó (§2.9).
 *  - `caducaEn` es siempre una cadena aquí. Un `null` de una acción significa «no se sabe» y
 *    conserva el plazo que había: **nunca** lo amplía ni lo borra (el defecto de la ficha, B0.4).
 *  - Todo lo que escribe pasa por UNA cola: nunca hay dos en vuelo, y lo que se guarda es lo
 *    último escrito, leído de `sesion` (que se actualiza al teclear, no al renderizar).
 */

// ---------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------

type ClaveDeAviso =
  | 'yaFirmada'
  | 'noAutor'
  | 'noDisponible'
  | 'noSeAbrio'
  | 'coprofesionalInvalido'
  | 'yaFirmadaCoprofesional'
  | 'firmadaSinRecargar'
  | 'hechoSinRecargar';

const AVISOS = {
  yaFirmada: 'notas.aviso.yaFirmada',
  noAutor: 'notas.aviso.noAutor',
  noDisponible: 'notas.aviso.noDisponible',
  noSeAbrio: 'notas.aviso.noSeAbrio',
  coprofesionalInvalido: 'notas.aviso.coprofesionalInvalido',
  yaFirmadaCoprofesional: 'notas.aviso.yaFirmadaCoprofesional',
  firmadaSinRecargar: 'notas.aviso.firmadaSinRecargar',
  hechoSinRecargar: 'notas.aviso.hechoSinRecargar',
} as const satisfies Record<ClaveDeAviso, ClaveDeCatalogo>;

/** Avisos tras los que lo que hay en pantalla ya no se puede guardar ni firmar. */
const AVISOS_DE_SOLO_LECTURA: ClaveDeAviso[] = ['yaFirmada', 'noAutor', 'firmadaSinRecargar'];

type Guardado = 'guardado' | 'guardando' | 'sin_guardar' | 'fallo';

type MensajeDeBloqueo = 'ficha.historiaBloqueadaExplicacion' | 'ficha.seCerroSola';

type Abierta = {
  fase: 'abierta';
  modelo: ModeloDeNota;
  caducaEn: string;
  texto: string;
  reservadas: string;
  /** Lo que se ve en el indicador; la verdad de lo guardado está en `sesion`. */
  base: { texto: string; reservadas: string };
  guardado: Guardado;
  aviso: ClaveDeAviso | null;
  conflicto: boolean;
  soloLectura: boolean;
  /** Sube cada vez que la pantalla debe llevar el foco al encabezado de la versión vigente. */
  enfoqueVigente: number;
};

type Estado =
  | { fase: 'inicial' }
  | { fase: 'cargando' }
  | { fase: 'sin_acceso' }
  | { fase: 'no_disponible' }
  | { fase: 'error' }
  | { fase: 'bloqueada'; mensaje: MensajeDeBloqueo }
  | { fase: 'elegir_episodio'; episodios: { id: string; etiqueta: string }[] }
  | Abierta;

type Accion =
  | { tipo: 'cargando' }
  | { tipo: 'apertura'; resultado: ResultadoApertura; trasPin: boolean }
  | { tipo: 'cerrada'; mensaje: MensajeDeBloqueo }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'reservadas'; valor: string }
  | { tipo: 'guardando' }
  | { tipo: 'guardado_ok'; testigo: string; caducaEn: string | null; enviado: { texto: string; reservadas: string } }
  | { tipo: 'guardado_fallo' }
  | { tipo: 'conflicto' }
  | { tipo: 'aviso'; clave: ClaveDeAviso }
  | { tipo: 'caducaEn'; valor: string | null }
  | { tipo: 'modelo'; nota: ModeloDeNota; caducaEn: string | null; enfocar: boolean }
  | { tipo: 'solo_modelo'; nota: ModeloDeNota; caducaEn: string | null }
  | { tipo: 'sin_recargar'; clave: 'firmadaSinRecargar' | 'hechoSinRecargar'; caducaEn: string | null };

const ESTADO_INICIAL: Estado = { fase: 'inicial' };

function textoDeNota(nota: ModeloDeNota): { texto: string; reservadas: string } {
  return { texto: nota.borrador?.texto ?? '', reservadas: nota.borrador?.reservadas ?? '' };
}

function abiertaDesdeNota(nota: ModeloDeNota, caducaEn: string, previo: number): Abierta {
  const cuerpo = textoDeNota(nota);
  return {
    fase: 'abierta',
    modelo: nota,
    caducaEn,
    ...cuerpo,
    base: cuerpo,
    guardado: 'guardado',
    aviso: null,
    conflicto: false,
    soloLectura: false,
    enfoqueVigente: previo,
  };
}

function reducir(estado: Estado, accion: Accion): Estado {
  switch (accion.tipo) {
    case 'cargando':
      return { fase: 'cargando' };
    case 'cerrada':
      // Vacía modelo, texto y reservadas: lo que ya no se puede leer no se queda en memoria.
      return { fase: 'bloqueada', mensaje: accion.mensaje };
    case 'apertura': {
      const r = accion.resultado;
      switch (r.estado) {
        case 'abierta':
          return abiertaDesdeNota(r.nota, r.caducaEn, estado.fase === 'abierta' ? estado.enfoqueVigente : 0);
        case 'bloqueada':
          // Tras un PIN aceptado, «bloqueada» otra vez es un acceso denegado, no un candado: si
          // se pintara el formulario, el usuario entraría en bucle (B.2.1).
          return accion.trasPin
            ? { fase: 'sin_acceso' }
            : { fase: 'bloqueada', mensaje: 'ficha.historiaBloqueadaExplicacion' };
        case 'elegir_episodio':
          return { fase: 'elegir_episodio', episodios: r.episodios };
        case 'no_disponible':
          return estado.fase === 'abierta' ? { ...estado, aviso: 'noDisponible' } : { fase: 'no_disponible' };
        case 'error':
          // Quien recarga para copiar lo suyo no pierde su texto por un fallo de red.
          return estado.fase === 'abierta' ? { ...estado, aviso: 'noSeAbrio' } : { fase: 'error' };
      }
      return estado;
    }
  }

  if (estado.fase !== 'abierta') return estado;

  switch (accion.tipo) {
    case 'texto':
      return { ...estado, texto: accion.valor, guardado: 'sin_guardar' };
    case 'reservadas':
      return { ...estado, reservadas: accion.valor, guardado: 'sin_guardar' };
    case 'guardando':
      return { ...estado, guardado: 'guardando' };
    case 'guardado_ok': {
      const igual = estado.texto === accion.enviado.texto && estado.reservadas === accion.enviado.reservadas;
      return {
        ...estado,
        base: accion.enviado,
        caducaEn: accion.caducaEn ?? estado.caducaEn,
        guardado: igual ? 'guardado' : 'sin_guardar',
        modelo: estado.modelo.borrador
          ? { ...estado.modelo, borrador: { ...estado.modelo.borrador, testigo: accion.testigo } }
          : estado.modelo,
      };
    }
    case 'guardado_fallo':
      return { ...estado, guardado: 'fallo' };
    case 'conflicto':
      return { ...estado, conflicto: true, guardado: 'sin_guardar' };
    case 'aviso':
      return {
        ...estado,
        aviso: accion.clave,
        soloLectura: estado.soloLectura || AVISOS_DE_SOLO_LECTURA.includes(accion.clave),
      };
    case 'caducaEn':
      return { ...estado, caducaEn: accion.valor ?? estado.caducaEn };
    case 'modelo':
      return {
        ...abiertaDesdeNota(accion.nota, accion.caducaEn ?? estado.caducaEn, estado.enfoqueVigente),
        enfoqueVigente: estado.enfoqueVigente + (accion.enfocar ? 1 : 0),
      };
    case 'solo_modelo':
      // El texto que se está tecleando no se pisa: la cabecera y los candidatos sí se refrescan.
      return { ...estado, modelo: accion.nota, caducaEn: accion.caducaEn ?? estado.caducaEn, aviso: null };
    case 'sin_recargar':
      return {
        ...estado,
        caducaEn: accion.caducaEn ?? estado.caducaEn,
        aviso: accion.clave,
        soloLectura: estado.soloLectura || accion.clave === 'firmadaSinRecargar',
      };
  }
}

/**
 * Lo que las funciones asíncronas necesitan saber sin esperar a un renderizado: se actualiza al
 * teclear y al volver cada respuesta, en el mismo momento. Si saliera del estado de React, el
 * guardado que sigue a otro en la cola leería el testigo viejo.
 */
type Sesion = {
  notaId: string;
  testigo: string | null;
  base: { texto: string; reservadas: string };
  texto: string;
  reservadas: string;
  /** Autor, con borrador, sin conflicto ni solo lectura. */
  escribe: boolean;
};

function sesionDesdeNota(nota: ModeloDeNota): Sesion {
  const cuerpo = textoDeNota(nota);
  return {
    notaId: nota.notaId,
    testigo: nota.borrador?.testigo ?? null,
    base: cuerpo,
    ...cuerpo,
    escribe: nota.soyAutor && nota.borrador !== null,
  };
}

/** Qué ve el usuario cuando una operación no se hizo. Nunca lee el estado: solo escribe. */
function aplicarFallo(
  sesion: { current: Sesion | null },
  dispatch: ActionDispatch<[Accion]>,
  motivo: MotivoFallo,
  contexto: 'guardar' | 'otro',
) {
  const s = sesion.current;
  switch (motivo) {
    case 'conflicto':
      if (s) s.escribe = false;
      dispatch({ tipo: 'conflicto' });
      return;
    case 'bloqueada':
      sesion.current = null;
      dispatch({ tipo: 'cerrada', mensaje: 'ficha.seCerroSola' });
      return;
    case 'sin_borrador':
    case 'ya_firmada':
      if (s) s.escribe = false;
      dispatch({ tipo: 'aviso', clave: 'yaFirmada' });
      return;
    case 'no_autor':
      if (s) s.escribe = false;
      dispatch({ tipo: 'aviso', clave: 'noAutor' });
      return;
    case 'no_disponible':
      dispatch({ tipo: 'aviso', clave: 'noDisponible' });
      return;
    case 'coprofesional_invalido':
      dispatch({ tipo: 'aviso', clave: 'coprofesionalInvalido' });
      return;
    default:
      if (contexto === 'guardar') dispatch({ tipo: 'guardado_fallo' });
      else dispatch({ tipo: 'aviso', clave: 'noSeAbrio' });
  }
}

type ResultadoLocal = { ok: true; testigo: string | null } | { ok: false; motivo: MotivoFallo };

type ErrorDeFirma = 'faltaMotivo' | 'vacia' | 'noSeFirmo';

const ESPERA_AUTOGUARDADO_MS = 3000;

// ---------------------------------------------------------------------------------------
// El componente
// ---------------------------------------------------------------------------------------

type Props = {
  pacienteId: string;
  citaId: string | null;
  notaId: string | null;
};

export function EditorDeNota({ pacienteId, citaId, notaId }: Props) {
  const [estado, dispatch] = useReducer(reducir, ESTADO_INICIAL);
  const [dialogo, setDialogo] = useState(false);
  const [errorFirma, setErrorFirma] = useState<ErrorDeFirma | null>(null);
  // `tic` no se lee: repinta los minutos, que se derivan al renderizar.
  const [, setTic] = useState(0);
  const [pendiente, iniciar] = useTransition();
  const [trabajando, iniciarReloj] = useTransition();
  const ancho = useEsAncho();

  const sesion = useRef<Sesion | null>(null);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const abriendo = useRef(false);
  const enVuelo = useRef(false);
  const refConflicto = useRef<HTMLDivElement>(null);
  const refVigente = useRef<HTMLHeadingElement>(null);

  const abierta = estado.fase === 'abierta' ? estado : null;

  const encolar = useCallback(<T,>(tarea: () => Promise<T>): Promise<T> => {
    const siguiente = cola.current.then(tarea);
    cola.current = siguiente.catch(() => undefined);
    return siguiente;
  }, []);

  // ---- abrir ----------------------------------------------------------------------------

  const abrir = useCallback(
    async (opciones: { trasPin?: boolean; episodioId?: string; reabrir?: string } = {}) => {
      if (abriendo.current) return;
      abriendo.current = true;
      if (sesion.current === null) dispatch({ tipo: 'cargando' });
      let resultado: ResultadoApertura;
      try {
        resultado = await abrirEditorDeNota({
          pacienteId,
          citaId: opciones.reabrir ? null : citaId,
          notaId: opciones.reabrir ?? notaId,
          episodioId: opciones.episodioId ?? null,
        });
      } catch {
        resultado = { estado: 'error' };
      } finally {
        abriendo.current = false;
      }
      if (resultado.estado === 'abierta') sesion.current = sesionDesdeNota(resultado.nota);
      else if (resultado.estado !== 'error' && resultado.estado !== 'no_disponible') sesion.current = null;
      else if (!opciones.reabrir) sesion.current = null;
      dispatch({ tipo: 'apertura', resultado, trasPin: opciones.trasPin ?? false });
    },
    [pacienteId, citaId, notaId],
  );

  // ---- guardar --------------------------------------------------------------------------

  /** Solo se llama dentro de la cola. */
  const guardarYa = useCallback(async (): Promise<ResultadoLocal> => {
    const s = sesion.current;
    if (s === null) return { ok: false, motivo: 'bloqueada' };
    if (!s.escribe || s.testigo === null) return { ok: false, motivo: 'conflicto' };
    if (s.texto === s.base.texto && s.reservadas === s.base.reservadas) return { ok: true, testigo: s.testigo };

    const enviado = { texto: s.texto, reservadas: s.reservadas };
    dispatch({ tipo: 'guardando' });
    let r: ResultadoGuardado;
    try {
      r = await guardarBorrador({ pacienteId, notaId: s.notaId, testigo: s.testigo, ...enviado });
    } catch {
      r = { ok: false, motivo: 'error' };
    }
    if (sesion.current !== s) return { ok: false, motivo: 'bloqueada' };

    if (r.ok) {
      s.testigo = r.testigo;
      s.base = enviado;
      dispatch({ tipo: 'guardado_ok', testigo: r.testigo, caducaEn: r.caducaEn, enviado });
      return { ok: true, testigo: r.testigo };
    }
    aplicarFallo(sesion, dispatch, r.motivo, 'guardar');
    return r;
  }, [pacienteId]);

  const guardar = useCallback(() => encolar(guardarYa), [encolar, guardarYa]);

  const guardable = abierta !== null && abierta.modelo.soyAutor && abierta.modelo.borrador !== null && !abierta.conflicto && !abierta.soloLectura;
  const sucio = abierta !== null && (abierta.texto !== abierta.base.texto || abierta.reservadas !== abierta.base.reservadas);
  const textoActual = abierta?.texto;
  const reservadasActuales = abierta?.reservadas;

  // Autoguardado: 3 s tras la última tecla. Si un guardado falla, `sucio` sigue siendo cierto
  // pero el texto no cambia: no hay reintento hasta la tecla siguiente o el blur (B.1.4.a).
  useEffect(() => {
    if (!guardable || !sucio) return;
    const temporizador = setTimeout(() => void guardar(), ESPERA_AUTOGUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [guardable, sucio, textoActual, reservadasActuales, guardar]);

  // ---- reloj ----------------------------------------------------------------------------

  const caducaEn = abierta?.caducaEn ?? null;
  useEffect(() => {
    if (caducaEn === null) return;
    const reloj = setInterval(() => setTic((n) => n + 1), 30_000);
    const cierre = setTimeout(
      () => {
        sesion.current = null;
        setDialogo(false);
        dispatch({ tipo: 'cerrada', mensaje: 'ficha.seCerroSola' });
      },
      Math.max(new Date(caducaEn).getTime() - Date.now(), 0),
    );
    return () => {
      clearInterval(reloj);
      clearTimeout(cierre);
    };
  }, [caducaEn]);

  const cerrar = () =>
    iniciarReloj(async () => {
      // Lo escrito se guarda antes de cerrar: cerrar no es tirar el trabajo.
      await cola.current;
      try {
        await cerrarHistoriaDelPaciente();
      } catch {
        return;
      }
      sesion.current = null;
      setDialogo(false);
      dispatch({ tipo: 'cerrada', mensaje: 'ficha.historiaBloqueadaExplicacion' });
    });

  const ampliar = () =>
    iniciarReloj(async () => {
      try {
        const r = await ampliarLaVentana();
        // Un plazo nulo es «no se sabe»: se conserva el que hay.
        dispatch({ tipo: 'caducaEn', valor: r.caducaEn });
      } catch {
        // Sin respuesta, el plazo sigue siendo el de antes.
      }
    });

  // ---- foco -----------------------------------------------------------------------------

  const conflicto = abierta?.conflicto ?? false;
  useEffect(() => {
    if (conflicto) refConflicto.current?.focus();
  }, [conflicto]);

  const enfoqueVigente = abierta?.enfoqueVigente ?? 0;
  useEffect(() => {
    if (enfoqueVigente > 0) refVigente.current?.focus();
  }, [enfoqueVigente]);

  // ---- teclear --------------------------------------------------------------------------

  const alTexto = (valor: string) => {
    if (sesion.current) sesion.current.texto = valor;
    dispatch({ tipo: 'texto', valor });
  };
  const alReservadas = (valor: string) => {
    if (sesion.current) sesion.current.reservadas = valor;
    dispatch({ tipo: 'reservadas', valor });
  };

  // ---- coprofesional y modificar --------------------------------------------------------

  const aplicarRecarga = (r: ResultadoDeNota, completa: boolean, claveSinRecargar: 'hechoSinRecargar' | 'firmadaSinRecargar') => {
    if (!r.ok) return;
    if (r.nota === null) {
      if (sesion.current) sesion.current.escribe = claveSinRecargar === 'hechoSinRecargar' ? sesion.current.escribe : false;
      dispatch({ tipo: 'sin_recargar', clave: claveSinRecargar, caducaEn: r.caducaEn });
      return;
    }
    if (completa) {
      sesion.current = sesionDesdeNota(r.nota);
      dispatch({ tipo: 'modelo', nota: r.nota, caducaEn: r.caducaEn, enfocar: false });
    } else {
      dispatch({ tipo: 'solo_modelo', nota: r.nota, caducaEn: r.caducaEn });
    }
  };

  const elegirCoprofesional = (valor: string) =>
    iniciar(() =>
      encolar(async () => {
        const s = sesion.current;
        if (s === null) return;
        let r: ResultadoDeNota;
        try {
          r = await fijarCoprofesional({ pacienteId, notaId: s.notaId, coprofesionalId: valor === '' ? null : valor });
        } catch {
          r = { ok: false, motivo: 'error' };
        }
        if (sesion.current !== s) return;
        if (r.ok) {
          aplicarRecarga(r, false, 'hechoSinRecargar');
          return;
        }
        if (r.motivo === 'ya_firmada') {
          dispatch({ tipo: 'aviso', clave: 'yaFirmadaCoprofesional' });
          return;
        }
        aplicarFallo(sesion, dispatch, r.motivo, 'otro');
      }),
    );

  const modificar = () =>
    iniciar(() =>
      encolar(async () => {
        const s = sesion.current;
        if (s === null) return;
        let r: ResultadoDeNota;
        try {
          r = await empezarModificacion({ pacienteId, notaId: s.notaId });
        } catch {
          r = { ok: false, motivo: 'error' };
        }
        if (sesion.current !== s) return;
        if (r.ok) {
          aplicarRecarga(r, true, 'hechoSinRecargar');
          return;
        }
        aplicarFallo(sesion, dispatch, r.motivo, 'otro');
      }),
    );

  // ---- firmar ---------------------------------------------------------------------------

  const confirmarFirma = (valores: { alcance: 'individual' | 'conjunta'; motivo: string | null }) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setErrorFirma(null);
    iniciar(async () => {
      try {
        await encolar(async () => {
          // 1 · Lo que se firma es lo guardado: primero se guarda lo que haya sin guardar.
          const g = await guardarYa();
          if (!g.ok) {
            if (g.motivo === 'error' || g.motivo === 'cita_ilegible') setErrorFirma('noSeFirmo');
            else setDialogo(false);
            return;
          }
          const s = sesion.current;
          if (s === null || g.testigo === null) {
            setErrorFirma('noSeFirmo');
            return;
          }
          // 2 · Con el testigo que acaba de devolver el guardado, no con el de hace un rato.
          let r: ResultadoDeNota;
          try {
            r = await firmarNota({ pacienteId, notaId: s.notaId, testigo: g.testigo, ...valores });
          } catch {
            r = { ok: false, motivo: 'error' };
          }
          if (sesion.current !== s) return;
          if (r.ok) {
            setDialogo(false);
            if (r.nota === null) {
              aplicarRecarga(r, true, 'firmadaSinRecargar');
            } else {
              sesion.current = sesionDesdeNota(r.nota);
              dispatch({ tipo: 'modelo', nota: r.nota, caducaEn: r.caducaEn, enfocar: true });
            }
            return;
          }
          switch (r.motivo) {
            case 'falta_motivo':
              setErrorFirma('faltaMotivo');
              return;
            case 'vacia':
              setErrorFirma('vacia');
              return;
            case 'cita_ilegible':
            case 'error':
              setErrorFirma('noSeFirmo');
              return;
            default:
              setDialogo(false);
              aplicarFallo(sesion, dispatch, r.motivo, 'otro');
          }
        });
      } finally {
        enVuelo.current = false;
      }
    });
  };

  // ---------------------------------------------------------------------------------------
  // Pintura
  // ---------------------------------------------------------------------------------------

  if (estado.fase === 'inicial') {
    return (
      <Contenedor>
        <div>
          <Button onClick={() => void abrir()}>{t('notas.editor.abrir')}</Button>
        </div>
      </Contenedor>
    );
  }

  if (estado.fase === 'cargando') {
    return (
      <Contenedor>
        <EsqueletoEditor />
      </Contenedor>
    );
  }

  if (estado.fase === 'bloqueada') {
    return (
      <Contenedor>
        <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <p className="font-serif text-lg font-semibold">{t('ficha.historiaBloqueada')}</p>
          <p className="text-muted-foreground max-w-sm text-sm">{t(estado.mensaje)}</p>
          <div className="mt-2 w-full">
            <FormularioPinHistoria alAbrirse={() => void abrir({ trasPin: true })} />
          </div>
        </div>
      </Contenedor>
    );
  }

  if (estado.fase === 'sin_acceso') {
    return (
      <Contenedor>
        <AvisoDeError mensaje={t('notas.aviso.sinAcceso')} />
      </Contenedor>
    );
  }

  if (estado.fase === 'no_disponible') {
    return (
      <Contenedor>
        <EstadoVacio frase={t('notas.aviso.noDisponible')} />
      </Contenedor>
    );
  }

  if (estado.fase === 'error') {
    return (
      <Contenedor>
        <AvisoDeError
          mensaje={t('notas.aviso.noSeAbrio')}
          accion={<Button variante="contorno" onClick={() => void abrir()}>{t('notas.aviso.reintentar')}</Button>}
        />
      </Contenedor>
    );
  }

  if (estado.fase === 'elegir_episodio') {
    return (
      <Contenedor>
        <ElegirEpisodio
          episodios={estado.episodios}
          alContinuar={(episodioId) => void abrir({ episodioId })}
        />
      </Contenedor>
    );
  }

  // ---- abierta --------------------------------------------------------------------------

  const { modelo } = estado;
  const minutos = minutosRestantes(estado.caducaEn);
  const porCaducar = minutos <= 2;
  const editable = guardable;
  const puedeModificar =
    modelo.soyAutor && modelo.versiones.length > 0 && modelo.borrador === null && !estado.conflicto && !estado.soloLectura;
  const vigente = modelo.versiones.length > 0 ? modelo.versiones[modelo.versiones.length - 1]! : null;
  const sinLo = modelo.versiones.length === 0;

  const indicador: Record<Guardado, ClaveDeCatalogo> = {
    guardado: 'notas.editor.guardado',
    guardando: 'notas.editor.guardando',
    sin_guardar: 'notas.editor.sinGuardar',
    fallo: 'notas.editor.noSeGuardo',
  };

  return (
    <Contenedor>
      <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
        <p className="flex flex-1 items-center gap-2 text-sm" suppressHydrationWarning>
          <LockOpen className="text-primary size-4" aria-hidden="true" />
          {minutos > 0 ? tCon('ficha.historiaAbiertaMinutos', { minutos }) : t('candado.abierta')}
        </p>
        {porCaducar && (
          <Button variante="contorno" onClick={ampliar} disabled={trabajando}>
            {t('ficha.ampliarElTiempo')}
          </Button>
        )}
        <Button variante="contorno" onClick={cerrar} disabled={trabajando}>
          {t('ficha.cerrarHistoria')}
        </Button>
      </div>

      {porCaducar && (
        // No modal y sin robar el foco (ADR-047): quien escribe no pierde el cursor por un aviso.
        <p role="status" aria-live="polite" className="border-border bg-card rounded-lg border px-4 py-3 text-sm">
          {t('ficha.historiaPorCerrarse')}
        </p>
      )}

      <p className="text-muted-foreground text-sm">
        {[modelo.cabecera.fechaSesion, modelo.cabecera.horario, modelo.cabecera.episodio].filter(Boolean).join(' · ')}
      </p>

      {estado.conflicto && (
        <div ref={refConflicto} tabIndex={-1} className="outline-none">
          <AvisoDeError
            mensaje={t('notas.aviso.conflicto')}
            accion={
              <Button variante="contorno" onClick={() => void abrir({ reabrir: modelo.notaId })}>
                {t('notas.aviso.cargarLoGuardado')}
              </Button>
            }
          />
        </div>
      )}

      {estado.aviso !== null && (
        <AvisoDeError
          mensaje={t(AVISOS[estado.aviso])}
          accion={
            estado.aviso === 'yaFirmada' ? (
              <Button variante="contorno" onClick={() => void abrir({ reabrir: modelo.notaId })}>
                {t('notas.aviso.cargarLoGuardado')}
              </Button>
            ) : estado.aviso === 'firmadaSinRecargar' ? (
              <Button variante="contorno" onClick={() => void abrir({ reabrir: modelo.notaId })}>
                {t('notas.aviso.recargar')}
              </Button>
            ) : undefined
          }
        />
      )}

      {!modelo.soyAutor && (
        <p className="text-muted-foreground text-sm">{t('notas.aviso.noAutor')}</p>
      )}

      {modelo.soyAutor && sinLo && modelo.borrador !== null && !estado.soloLectura && !estado.conflicto && (
        <Desplegable
          etiqueta={t('notas.editor.coprofesional')}
          valor={modelo.cabecera.coprofesional?.id ?? ''}
          opciones={[
            { valor: '', etiqueta: t('notas.editor.sinCoprofesional') },
            ...modelo.candidatosCoprofesional.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
          ]}
          alElegir={elegirCoprofesional}
          marcador={t('notas.editor.sinCoprofesional')}
        />
      )}

      {modelo.borrador !== null && modelo.soyAutor && (
        <>
          <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
            {t(indicador[estado.guardado])}
          </p>
          <Cuerpos
            ancho={ancho}
            texto={estado.texto}
            reservadas={estado.reservadas}
            soloLectura={estado.conflicto || estado.soloLectura}
            alTexto={alTexto}
            alReservadas={alReservadas}
            alSalir={() => void guardar()}
          />
        </>
      )}

      {vigente !== null && (
        <VistaVigente
          estado={modelo.estado}
          versiones={modelo.versiones}
          vigente={vigente}
          refTitulo={refVigente}
        />
      )}

      {modelo.borrador !== null && !modelo.soyAutor && <BorradorAjeno borrador={modelo.borrador} />}

      {modelo.borrador === null && vigente === null && <EstadoVacio frase={t('notas.aviso.noDisponible')} />}

      <div className="flex-1" />

      {(editable || puedeModificar) && (
        <BarraDeAcciones
          puedeGuardar={editable}
          puedeFirmar={editable}
          puedeModificar={puedeModificar}
          pendiente={pendiente}
          alGuardar={() => void guardar()}
          alFirmar={() => {
            setErrorFirma(null);
            setDialogo(true);
          }}
          alModificar={modificar}
        />
      )}

      {dialogo && modelo.borrador !== null && (
        <DialogoDeFirma
          pacienteId={pacienteId}
          notaId={modelo.notaId}
          testigo={modelo.borrador.testigo}
          conVersiones={modelo.versiones.length > 0}
          puedeSerConjunta={modelo.puedeSerConjunta}
          pendiente={pendiente}
          error={errorFirma}
          alCancelar={() => setDialogo(false)}
          alConfirmar={confirmarFirma}
        />
      )}
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col gap-4">{children}</div>;
}

/** `abierta` solo existe tras un gesto, nunca en el HTML del servidor: la consulta es segura. */
function useEsAncho(): boolean {
  const [ancho, setAncho] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia('(min-width: 48rem)');
    const actualizar = () => setAncho(consulta.matches);
    actualizar();
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, []);
  return ancho;
}

// ---------------------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------------------

function ElegirEpisodio({
  episodios,
  alContinuar,
}: {
  episodios: { id: string; etiqueta: string }[];
  alContinuar: (episodioId: string) => void;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  if (episodios.length === 0) return <EstadoVacio frase={t('notas.editor.sinEpisodios')} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t('notas.editor.elegirEpisodio')}</p>
      <Desplegable
        etiqueta={t('notas.editor.episodio')}
        valor={elegido}
        opciones={episodios.map((e) => ({ valor: e.id, etiqueta: e.etiqueta }))}
        alElegir={setElegido}
      />
      <div>
        <Button disabled={elegido === null} onClick={() => elegido !== null && alContinuar(elegido)}>
          {t('notas.editor.continuar')}
        </Button>
      </div>
    </div>
  );
}

function Cuerpos({
  ancho,
  texto,
  reservadas,
  soloLectura,
  alTexto,
  alReservadas,
  alSalir,
}: {
  ancho: boolean;
  texto: string;
  reservadas: string;
  soloLectura: boolean;
  alTexto: (valor: string) => void;
  alReservadas: (valor: string) => void;
  alSalir: () => void;
}) {
  const prefijo = useId();
  const [pestana, setPestana] = useState<'nota' | 'reservadas'>('nota');

  const cuerpoNota = (
    <AreaTexto
      id={`${prefijo}-nota`}
      etiqueta={t('notas.editor.nota')}
      value={texto}
      maxLength={60000}
      readOnly={soloLectura}
      onChange={(e) => alTexto(e.target.value)}
      onBlur={alSalir}
      className="min-h-48 flex-1 scroll-mb-24"
    />
  );
  const cuerpoReservadas = (
    <div className="flex flex-1 flex-col gap-2">
      {/* Siempre encima de la zona reservada (art. 18.3): quien escribe aquí sabe qué implica. */}
      <AvisoReservadas />
      <AreaTexto
        id={`${prefijo}-reservadas`}
        etiqueta={t('notas.editor.reservadas')}
        value={reservadas}
        maxLength={20000}
        readOnly={soloLectura}
        onChange={(e) => alReservadas(e.target.value)}
        onBlur={alSalir}
        className="min-h-32 flex-1 scroll-mb-24"
      />
    </div>
  );

  if (!ancho) {
    return (
      <div className="flex flex-1 flex-col gap-2">
        <Pestanas
          pestanas={[
            { id: 'nota', etiqueta: t('notas.editor.nota') },
            { id: 'reservadas', etiqueta: t('notas.editor.reservadas') },
          ]}
          activa={pestana}
          alCambiar={(id) => setPestana(id as 'nota' | 'reservadas')}
          etiqueta={t('notas.editor.partes')}
          prefijo={prefijo}
        />
        <PanelDePestana id={pestana} prefijo={prefijo}>
          <div className="flex flex-col">{pestana === 'nota' ? cuerpoNota : cuerpoReservadas}</div>
        </PanelDePestana>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col">{cuerpoNota}</div>
      <div className="flex flex-1 flex-col">{cuerpoReservadas}</div>
    </div>
  );
}

function VistaVigente({
  estado,
  versiones,
  vigente,
  refTitulo,
}: {
  estado: ModeloDeNota['estado'];
  versiones: VersionDeVista[];
  vigente: VersionDeVista;
  refTitulo: React.RefObject<HTMLHeadingElement | null>;
}) {
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h2 id={idTitulo} ref={refTitulo} tabIndex={-1} className="font-serif text-lg outline-none">
        {t('notas.editor.vigente')}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <PildoraDeEstado estado={estado} />
      </div>
      <SelloDeNota frase={vigente.sello} enSesion={vigente.enSesion} />
      {vigente.margen !== null && <p className="text-muted-foreground text-sm">{vigente.margen}</p>}
      {vigente.numero > 1 && <ModificadaPor fecha={vigente.firmadaEn} autor={vigente.autor} />}
      <p className="text-sm whitespace-pre-wrap">{vigente.texto}</p>
      {vigente.reservadas !== null && vigente.reservadas !== '' && (
        <div className="flex flex-col gap-2">
          <AvisoReservadas />
          <p className="text-sm whitespace-pre-wrap">{vigente.reservadas}</p>
        </div>
      )}
      <ol className="divide-border divide-y">
        {[...versiones].reverse().map((v) => (
          <FilaDeVersion
            key={v.numero}
            numero={v.numero}
            autor={v.autor}
            firmadaEn={v.firmadaEn}
            motivo={v.motivo}
            conjunta={v.alcance === 'conjunta'}
            sello={v.sello}
            huellaCorta={v.huellaCorta}
            vigente={v.numero === vigente.numero}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * El borrador de otra persona: se lee, marcado como no firmado y aparte de lo firmado. Sin
 * `textarea`, sin botones: nada en esta pieza puede escribir (decisión P-1 del propietario).
 */
function BorradorAjeno({ borrador }: { borrador: { texto: string; reservadas: string } }) {
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <PildoraDeEstado estado="borrador" />
        <h2 id={idTitulo} className="text-sm font-medium">
          {t('notas.editor.borradorAjeno')}
        </h2>
      </div>
      <p className="text-sm whitespace-pre-wrap">{borrador.texto}</p>
      {borrador.reservadas !== '' && (
        <div className="flex flex-col gap-2">
          <AvisoReservadas />
          <p className="text-sm whitespace-pre-wrap">{borrador.reservadas}</p>
        </div>
      )}
    </section>
  );
}

type DatosFirma = z.infer<typeof esquemaFirma>;

function DialogoDeFirma({
  pacienteId,
  notaId,
  testigo,
  conVersiones,
  puedeSerConjunta,
  pendiente,
  error,
  alCancelar,
  alConfirmar,
}: {
  pacienteId: string;
  notaId: string;
  testigo: string;
  conVersiones: boolean;
  puedeSerConjunta: boolean;
  pendiente: boolean;
  error: ErrorDeFirma | null;
  alCancelar: () => void;
  alConfirmar: (valores: { alcance: 'individual' | 'conjunta'; motivo: string | null }) => void;
}) {
  const prefijo = useId();
  const refMotivo = useRef<HTMLTextAreaElement | null>(null);
  const refConfirmar = useRef<HTMLButtonElement | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<DatosFirma>({
    resolver: zodResolver(esquemaFirma),
    defaultValues: { pacienteId, notaId, testigo, alcance: 'individual', motivo: conVersiones ? '' : null },
  });

  const { ref: refRegistroMotivo, ...registroMotivo } = register('motivo', {
    onChange: () => clearErrors('motivo'),
  });

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    // Un motivo vacío es una frase nuestra, no el mensaje de Zod.
    if (conVersiones && (getValues('motivo') ?? '').trim() === '') {
      evento.preventDefault();
      setError('motivo', { type: 'required', message: t('notas.aviso.faltaMotivo') });
      return;
    }
    return handleSubmit((datos) => alConfirmar({ alcance: datos.alcance, motivo: conVersiones ? datos.motivo : null }))(evento);
  };

  const mensajeMotivo = errors.motivo?.message ?? (error === 'faltaMotivo' ? t('notas.aviso.faltaMotivo') : undefined);

  return (
    <Dialogo
      abierto
      alCerrar={() => {
        if (!pendiente) alCancelar();
      }}
      titulo={t('notas.firma.titulo')}
      focoInicial={conVersiones ? refMotivo : refConfirmar}
    >
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <p className="text-sm">{t('notas.firma.loGuardado')}</p>

        {conVersiones && (
          <AreaTexto
            id={`${prefijo}-motivo`}
            etiqueta={t('notas.firma.motivo')}
            maxLength={500}
            errores={mensajeMotivo ? [mensajeMotivo] : undefined}
            {...registroMotivo}
            ref={(nodo: HTMLTextAreaElement | null) => {
              refMotivo.current = nodo;
              refRegistroMotivo(nodo);
            }}
          />
        )}

        {puedeSerConjunta && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('notas.firma.alcance')}</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" value="individual" className="accent-primary size-5" {...register('alcance')} />
              {t('notas.firma.individual')}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" value="conjunta" className="accent-primary size-5" {...register('alcance')} />
              {t('notas.firma.conjunta')}
            </label>
            <ul className="text-muted-foreground list-disc pl-5 text-sm">
              <li>{t('notas.firma.conjuntaLeeran')}</li>
              <li>{t('notas.firma.conjuntaEslabon')}</li>
              <li>{t('notas.firma.conjuntaAcceso')}</li>
            </ul>
          </fieldset>
        )}

        {error === 'vacia' && (
          <p role="alert" className="text-destructive text-sm">
            {t('notas.aviso.vacia')}
          </p>
        )}
        {error === 'noSeFirmo' && (
          <p role="alert" className="text-destructive text-sm">
            {t('notas.aviso.noSeFirmo')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={alCancelar} disabled={pendiente}>
            {t('comunes.cancelar')}
          </Button>
          <Button type="submit" ref={refConfirmar} disabled={pendiente}>
            {pendiente ? t('notas.firma.firmando') : t('notas.firma.confirmar')}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
