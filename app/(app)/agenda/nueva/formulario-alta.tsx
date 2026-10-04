'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { RolUsuario } from '@/components/armazon/modulos';
import { AreaTexto } from '@/components/ui/area-texto';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { esquemaAltaCita, type DatosAltaCita } from '@/lib/citas/esquemas';
import { t, tCon } from '@/lib/i18n';

import { guardarAlta, previsualizarAltaSerie, recalcularAlta } from './acciones';
import { BuscadorPaciente, type PacienteElegido } from './buscador-paciente';
import { CalendarioSeleccion } from './calendario-seleccion';
import type { VistaAlta } from './estado-alta';
import { PrevisualizacionSerie } from './previsualizacion-serie';
import { TarjetasSugerencia } from './tarjetas-sugerencia';
import { lunesDe, type SesionVista } from './vista-alta';

type Opcion = { id: string; nombre: string };
/** El catálogo que ve quien agenda: el id y el nombre sirven para elegir; no vuelven del servidor. */
export type TipoOfrecido = { id: string; nombre: string; duracionMinutos: number };

type Props = {
  rol: RolUsuario;
  centros: Opcion[];
  profesionales: Opcion[];
  tipos: TipoOfrecido[];
  inicial: { paciente: PacienteElegido | null; centroId: string; profesionalId: string; clave: string | null };
  vista: VistaAlta;
  alTerminar: (resultado: { anuncio: string; fecha: string }) => void;
  alCancelar: () => void;
};

type Elegido = { clave: string; etiqueta: string };
type Serie = { clave: string; firma: string; sesiones: SesionVista[]; excluir: string[]; aceptar: string[] };

const PERIODICIDADES = ['suelta', 'semanal', 'quincenal', 'mensual'] as const;
const SESIONES_POR_DEFECTO = 8;

function vacioANulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/**
 * El alta de cita (T-028 B): paciente, tipo de terapia (obligatorio para todos y es lo que fija la
 * duración), un hueco del calendario y, si se quiere, una serie. Cada cambio que altera los huecos
 * (paciente, profesional, centro, tipo, semana) vuelve a pedirlos al servidor; el que llega tarde
 * se descarta. Sin modalidad ni episodio (ADR-075): esos no son del alta.
 */
export function FormularioAlta({ rol, centros, profesionales, tipos, inicial, vista: vistaInicial, alTerminar, alCancelar }: Props) {
  const prefijo = useId();
  const [paciente, setPaciente] = useState<PacienteElegido | null>(inicial.paciente);
  const [foco, setFoco] = useState<string | null>(null);
  const [excluirHuecos, setExcluirHuecos] = useState<string[]>([]);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<DatosAltaCita>({
    resolver: zodResolver(esquemaAltaCita),
    defaultValues: {
      pacienteId: inicial.paciente?.id,
      profesionalId: inicial.profesionalId,
      centroId: inicial.centroId,
      tipoTerapiaId: undefined,
      fecha: undefined,
      horaLocal: undefined,
      periodicidad: 'suelta',
      sesionesTotales: null,
      sala: null,
      notaOperativa: null,
      excluir: [],
      aceptarAlternativas: [],
      firma: null,
    },
  });

  const profesionalId = useWatch({ control, name: 'profesionalId' });
  const centroId = useWatch({ control, name: 'centroId' });
  const tipoId = useWatch({ control, name: 'tipoTerapiaId' }) as string | undefined;
  const periodicidad = useWatch({ control, name: 'periodicidad' });
  const sesionesTotales = useWatch({ control, name: 'sesionesTotales' });
  const tipo = tipos.find((o) => o.id === tipoId) ?? null;

  // Los huecos: lo último que llegó y la clave de lo que se pidió, para ignorar lo que llega tarde.
  const claveCalculo = [paciente?.id ?? '', profesionalId, centroId, tipoId ?? '', foco ?? '', excluirHuecos.join(',')].join('|');
  const [calculo, setCalculo] = useState<{ clave: string; vista: VistaAlta }>({
    clave: [inicial.paciente?.id ?? '', inicial.profesionalId, inicial.centroId, '', '', ''].join('|'),
    vista: vistaInicial,
  });
  const vista = calculo.vista;

  useEffect(() => {
    if (calculo.clave === claveCalculo) return;
    let vigente = true;
    (async () => {
      try {
        const resultado = await recalcularAlta({
          pacienteId: paciente?.id ?? null,
          profesionalId,
          centroId,
          tipoTerapiaId: tipoId ?? null,
          fechaFoco: foco,
          excluir: excluirHuecos,
        });
        if (!vigente) return;
        if (!resultado.ok) {
          setFallo(resultado.mensaje);
          setCalculo((anterior) => ({ ...anterior, clave: claveCalculo }));
          return;
        }
        setFallo('');
        setCalculo({ clave: claveCalculo, vista: resultado.vista });
        const nuevo = resultado.vista.calendario;
        if (
          elegido &&
          nuevo.dias.some((d) => d.fecha === elegido.clave.slice(0, 10)) &&
          !nuevo.huecos.some((h) => h.clave === elegido.clave && h.estado === 'libre')
        ) {
          setElegido(null);
          setValue('fecha', undefined as unknown as string);
          setValue('horaLocal', undefined as unknown as string);
          setAviso(t('agenda.alta.huecoNoCabe'));
        }
      } catch {
        if (!vigente) return;
        setFallo(t('agenda.alta.error.calcular'));
        setCalculo((anterior) => ({ ...anterior, clave: claveCalculo }));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [calculo.clave, claveCalculo, paciente, profesionalId, centroId, tipoId, foco, excluirHuecos, elegido, setValue]);

  // La serie: se pide cuando hay paciente, tipo, hueco y un número de sesiones válido.
  const fecha = elegido?.clave.slice(0, 10);
  const hora = elegido?.clave.slice(11);
  const piden = periodicidad !== 'suelta' && paciente && tipoId && fecha && hora && typeof sesionesTotales === 'number' && sesionesTotales >= 2 && sesionesTotales <= 52;
  const claveSerie = piden ? [paciente.id, profesionalId, centroId, tipoId, fecha, hora, periodicidad, sesionesTotales].join('|') : null;

  useEffect(() => {
    if (!claveSerie || serie?.clave === claveSerie) return;
    let vigente = true;
    (async () => {
      try {
        const resultado = await previsualizarAltaSerie({
          pacienteId: paciente?.id,
          profesionalId,
          centroId,
          tipoTerapiaId: tipoId,
          fecha,
          horaLocal: hora,
          periodicidad,
          sesionesTotales,
        });
        if (!vigente) return;
        if (!resultado.ok) {
          setSerie(null);
          setFallo(resultado.mensaje);
          return;
        }
        setFallo('');
        setSerie({ clave: claveSerie, firma: resultado.firma, sesiones: resultado.sesiones, excluir: [], aceptar: [] });
        setValue('firma', resultado.firma);
      } catch {
        if (vigente) setFallo(t('agenda.alta.serie.error'));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [claveSerie, serie?.clave, paciente, profesionalId, centroId, tipoId, fecha, hora, periodicidad, sesionesTotales, setValue]);

  const serieVigente = claveSerie !== null && serie?.clave === claveSerie ? serie : null;

  function elegirHueco(clave: string, etiqueta: string) {
    setElegido({ clave, etiqueta });
    setValue('fecha', clave.slice(0, 10), { shouldValidate: false });
    setValue('horaLocal', clave.slice(11), { shouldValidate: false });
    setAviso('');
    if (!vista.calendario.huecos.some((h) => h.clave === clave)) setFoco(lunesDe(clave.slice(0, 10)));
  }

  function elegirTarjeta(clave: string) {
    const tarjeta = vista.tarjetas.find((o) => o.clave === clave);
    elegirHueco(clave, tarjeta ? `${tarjeta.fecha}, ${tarjeta.hora}` : clave);
  }

  function cambiarPeriodicidad(valor: (typeof PERIODICIDADES)[number]) {
    setValue('periodicidad', valor);
    setSerie(null);
    setValue('firma', null);
    setValue('sesionesTotales', valor === 'suelta' ? null : (sesionesTotales ?? SESIONES_POR_DEFECTO));
  }

  function elegirPaciente(nuevo: PacienteElegido | null) {
    setPaciente(nuevo);
    setValue('pacienteId', nuevo?.id as string, { shouldValidate: false });
    setSerie(null);
  }

  async function enviar(datos: DatosAltaCita) {
    setGuardando(true);
    setFallo('');
    setAviso('');
    try {
      const resultado = await guardarAlta({
        ...datos,
        notaOperativa: rol === 'tecnico_administrativo' ? null : datos.notaOperativa,
        excluir: serieVigente?.excluir ?? [],
        aceptarAlternativas: serieVigente?.aceptar ?? [],
      });
      if (resultado.ok) {
        setAviso(resultado.anuncio);
        alTerminar({ anuncio: resultado.anuncio, fecha: resultado.fecha });
        return;
      }
      if (resultado.motivo === 'hueco_ocupado' && 'vista' in resultado) {
        setElegido(null);
        setValue('fecha', undefined as unknown as string);
        setValue('horaLocal', undefined as unknown as string);
        setExcluirHuecos((previos) => (elegido && !previos.includes(elegido.clave) ? [...previos, elegido.clave].slice(-10) : previos));
        if (resultado.vista) {
          const nueva = resultado.vista;
          setCalculo((anterior) => ({ clave: anterior.clave, vista: nueva }));
        }
        setAviso(resultado.mensaje);
        return;
      }
      if (resultado.motivo === 'previsualizacion_caducada' && 'firma' in resultado) {
        setSerie((anterior) =>
          anterior ? { clave: anterior.clave, firma: resultado.firma, sesiones: resultado.sesiones, excluir: [], aceptar: [] } : anterior,
        );
        setValue('firma', resultado.firma);
        setAviso(resultado.mensaje);
        return;
      }
      setFallo(resultado.mensaje);
    } catch {
      setFallo(t('agenda.alta.error.generico'));
    } finally {
      setGuardando(false);
    }
  }

  const sinHueco = errors.fecha !== undefined || errors.horaLocal !== undefined;
  const catalogoVacio = tipos.length === 0;
  const idTipo = `${prefijo}-tipo`;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(enviar)}
      className="flex flex-col gap-5"
      aria-label={t('agenda.alta.titulo')}
    >
      <div className="flex flex-col gap-4">
        <BuscadorPaciente paciente={paciente} alElegir={elegirPaciente} />
        {errors.pacienteId && <p className="text-destructive text-sm">{errors.pacienteId.message}</p>}

        {rol !== 'profesional_sanitario' && (
          <Seleccion
            id={`${prefijo}-profesional`}
            etiqueta={t('agenda.alta.campos.profesional')}
            opciones={profesionales.map((p) => ({ valor: p.id, texto: p.nombre }))}
            textoVacio={t('agenda.alta.campos.profesional')}
            value={profesionalId}
            onChange={(evento) => {
              setValue('profesionalId', evento.target.value);
              setSerie(null);
            }}
          />
        )}

        {centros.length > 1 && (
          <Seleccion
            id={`${prefijo}-centro`}
            etiqueta={t('agenda.alta.campos.centro')}
            opciones={centros.map((c) => ({ valor: c.id, texto: c.nombre }))}
            textoVacio={t('agenda.alta.campos.centro')}
            value={centroId}
            onChange={(evento) => {
              setValue('centroId', evento.target.value);
              setSerie(null);
            }}
          />
        )}

        {catalogoVacio ? (
          <p role="note" className="text-muted-foreground text-sm">
            {t('agenda.alta.campos.tipoVacio')}
          </p>
        ) : (
          <Seleccion
            id={idTipo}
            etiqueta={t('agenda.alta.campos.tipo')}
            opciones={tipos.map((o) => ({ valor: o.id, texto: o.nombre }))}
            textoVacio={t('agenda.alta.campos.tipoElige')}
            value={tipoId ?? ''}
            errores={errors.tipoTerapiaId ? [errors.tipoTerapiaId.message ?? ''] : undefined}
            onChange={(evento) => {
              setValue('tipoTerapiaId', evento.target.value, { shouldValidate: false });
              setSerie(null);
            }}
          />
        )}
        <p className="text-muted-foreground text-sm">
          {tipo ? tCon('agenda.alta.campos.duracion', { minutos: String(tipo.duracionMinutos) }) : t('agenda.alta.campos.duracionPendiente')}
        </p>
      </div>

      <TarjetasSugerencia
        modo={vista.modo}
        tarjetas={vista.tarjetas}
        error={vista.errorSugerencias}
        elegida={elegido?.clave ?? null}
        alElegir={elegirTarjeta}
      />

      <CalendarioSeleccion
        key={vista.calendario.desde}
        calendario={vista.calendario}
        elegido={elegido?.clave ?? null}
        alElegir={elegirHueco}
        alCambiarSemana={setFoco}
      />

      <p className="text-sm">
        <span className="font-medium">{t('agenda.alta.campos.hueco')}: </span>
        {elegido ? elegido.etiqueta : <span className="text-muted-foreground">{t('agenda.alta.sinHueco')}</span>}
      </p>
      {sinHueco && (
        <p role="alert" className="text-destructive text-sm">
          {t('agenda.alta.sinHueco')}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <Seleccion
          id={`${prefijo}-periodicidad`}
          etiqueta={t('agenda.alta.campos.periodicidad')}
          opciones={PERIODICIDADES.map((p) => ({ valor: p, texto: t(`agenda.alta.periodicidad.${p}`) }))}
          textoVacio={t('agenda.alta.periodicidad.suelta')}
          value={periodicidad}
          onChange={(evento) => cambiarPeriodicidad(evento.target.value as (typeof PERIODICIDADES)[number])}
        />
        {periodicidad !== 'suelta' && (
          <div className="flex flex-col gap-1">
            <Field
              id={`${prefijo}-sesiones`}
              etiqueta={t('agenda.alta.campos.sesiones')}
              type="number"
              inputMode="numeric"
              min={2}
              max={52}
              value={typeof sesionesTotales === 'number' ? sesionesTotales : ''}
              errores={errors.sesionesTotales ? [errors.sesionesTotales.message ?? ''] : undefined}
              onChange={(evento) => {
                const valor = evento.target.value;
                setValue('sesionesTotales', valor === '' ? null : Number(valor), { shouldValidate: false });
                setSerie(null);
              }}
            />
            <p className="text-muted-foreground text-sm">{t('agenda.alta.campos.sesionesAyuda')}</p>
          </div>
        )}
      </div>

      {serieVigente && (
        <PrevisualizacionSerie
          sesiones={serieVigente.sesiones}
          excluir={serieVigente.excluir}
          aceptar={serieVigente.aceptar}
          alCambiar={({ excluir, aceptar }) => setSerie({ ...serieVigente, excluir, aceptar })}
        />
      )}
      {errors.firma && <p className="text-destructive text-sm">{errors.firma.message}</p>}

      <div className="flex flex-col gap-4">
        <Field
          id={`${prefijo}-sala`}
          etiqueta={t('agenda.alta.campos.sala')}
          autoComplete="off"
          {...register('sala', { setValueAs: vacioANulo })}
          errores={errors.sala ? [errors.sala.message ?? ''] : undefined}
        />
        {rol !== 'tecnico_administrativo' && (
          <div className="flex flex-col gap-1">
            <AreaTexto
              id={`${prefijo}-nota`}
              etiqueta={t('agenda.alta.campos.notaOperativa')}
              rows={3}
              {...register('notaOperativa', { setValueAs: vacioANulo })}
              errores={errors.notaOperativa ? [errors.notaOperativa.message ?? ''] : undefined}
            />
            <p className="text-muted-foreground text-sm">{t('agenda.alta.campos.notaAyuda')}</p>
          </div>
        )}
      </div>

      <div role="status" className="text-sm">
        {aviso}
      </div>
      {fallo && (
        <p role="alert" className="text-destructive text-sm">
          {fallo}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variante="contorno" onClick={alCancelar}>
          {t('comunes.cancelar')}
        </Button>
        <Button type="submit" disabled={guardando || catalogoVacio}>
          {guardando ? t('agenda.alta.guardando') : t('agenda.alta.guardar')}
        </Button>
      </div>
    </form>
  );
}
