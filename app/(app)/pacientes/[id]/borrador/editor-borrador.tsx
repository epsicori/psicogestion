'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Casilla } from '@/components/ui/casilla';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { aCentimos, formatearImporte } from '@/lib/dinero/importe';
import type { DatosEditor, SesionElegible } from '@/lib/economico/borrador';
import type { ResultadoGuardar } from '@/lib/economico/entrada';
import { calcularImportes } from '@/lib/economico/importes';
import { tipoIvaDe } from '@/lib/economico/tipos';
import { t, tCon, type ClaveDeCatalogo } from '@/lib/i18n';

import { descartarBorradorAccion, guardarBorradorAccion } from './acciones';
import { DialogoDescartar } from './dialogo-descartar';
import { esquemaBorrador, type EntradaDelFormulario, type ValoresBorrador } from './esquemas';

type Props = {
  pacienteId: string;
  borrador: DatosEditor['borrador'];
  elegibles: SesionElegible[];
};

type LineaValores = ValoresBorrador['lineas'][number];

/** Céntimos → «60,00», el formato que `aCentimos` vuelve a leer. */
const precioDeCentimos = (c: number | null) => (c === null ? '' : formatearImporte(c).replace(/\s*€$/, ''));

function lineaDeSesion(s: SesionElegible): LineaValores {
  return {
    cita_id: s.citaId,
    concepto: s.concepto,
    cantidad: '1',
    precio: precioDeCentimos(s.precioCentimos),
    regimen_iva: s.regimen ?? '',
  };
}

const LINEA_LIBRE: LineaValores = { cita_id: null, concepto: '', cantidad: '1', precio: '', regimen_iva: '' };

function textoDeError(r: Extract<ResultadoGuardar, { ok: false }>): string {
  if (r.error === 'congelado') {
    return r.programa
      ? tCon('facturacion.borrador.congelado', { programa: r.programa })
      : t('facturacion.borrador.congeladoSinPrograma');
  }
  return t(`facturacion.borrador.errores.${r.error}` as ClaveDeCatalogo);
}

/** Los totales de lo que hay tecleado, o `null` si alguna línea aún no tiene importe o régimen. */
function totales(lineas: LineaValores[]) {
  try {
    return calcularImportes(
      lineas.map((l) => {
        if (l.regimen_iva !== 'general' && l.regimen_iva !== 'exento_sanitario') throw new Error('sin régimen');
        const cantidad = Number.parseInt(l.cantidad, 10);
        return {
          concepto: l.concepto,
          cantidad,
          precio_unitario_centimos: aCentimos(l.precio),
          regimen_iva: l.regimen_iva,
          tipo_iva_centesimas: tipoIvaDe(l.regimen_iva),
          cita_id: l.cita_id,
        };
      }),
    );
  } catch {
    return null;
  }
}

/**
 * El editor del borrador (T-046). Crea la versión 1 o una versión nueva completa a partir de la
 * última. El NIF guardado no llega aquí: solo si lo hay (D11). Sin redirección: al guardar dice
 * «Guardado: versión N», y la siguiente vez que se guarda se corrige desde esa versión.
 */
export function EditorBorrador({ pacienteId, borrador, elegibles }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [descartando, setDescartando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [descartado, setDescartado] = useState(false);
  // Al guardar, el editor pasa a corregir desde la versión recién creada.
  const [actual, setActual] = useState<{ id: string; version: number } | null>(
    borrador ? { id: borrador.id, version: borrador.numeroVersion } : null,
  );
  const noElegibles = new Set(
    (borrador?.lineas ?? []).flatMap((l) => (l.citaNoElegible && l.cita_id ? [l.cita_id] : [])),
  );

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ValoresBorrador, unknown, EntradaDelFormulario>({
    resolver: zodResolver(esquemaBorrador),
    defaultValues: {
      pacienteId,
      borradorId: borrador?.id ?? null,
      partida: borrador?.numeroVersion ?? null,
      destinatario: { modo: borrador ? 'conservar' : 'paciente', nombre: '', tipo: 'fisica', nif: '' },
      lineas: (borrador?.lineas ?? []).map((l) => ({
        cita_id: l.cita_id,
        concepto: l.concepto,
        cantidad: String(l.cantidad),
        precio: precioDeCentimos(l.precio_unitario_centimos),
        regimen_iva: l.regimen_iva,
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });
  const lineas = useWatch({ control, name: 'lineas' }) ?? [];
  const modo = useWatch({ control, name: 'destinatario.modo' });
  const importes = totales(lineas);
  const bloqueadoPorCita = lineas.some((l) => l.cita_id !== null && noElegibles.has(l.cita_id));

  const alternarSesion = (s: SesionElegible, marcada: boolean) => {
    const indice = lineas.findIndex((l) => l.cita_id === s.citaId);
    if (marcada && indice === -1) append(lineaDeSesion(s));
    if (!marcada && indice !== -1) remove(indice);
  };

  const guardar = handleSubmit((datos) => {
    if (enviando || bloqueadoPorCita) return;
    setMensaje('');
    setErrorGeneral('');
    iniciarTransicion(async () => {
      const r = await guardarBorradorAccion(datos);
      if (r.ok) {
        setActual({ id: r.borradorId, version: r.numeroVersion });
        setValue('borradorId', r.borradorId);
        setValue('partida', r.numeroVersion);
        setMensaje(tCon('facturacion.borrador.guardado', { n: r.numeroVersion }));
      } else {
        setErrorGeneral(textoDeError(r));
      }
    });
  });

  const descartar = () => {
    if (!actual) return;
    setErrorDialogo('');
    iniciarTransicion(async () => {
      const r = await descartarBorradorAccion({ pacienteId, borradorId: actual.id, partida: actual.version });
      if (r.ok) {
        setDescartando(false);
        setDescartado(true);
        setMensaje('');
      } else {
        setErrorDialogo(textoDeError(r));
      }
    });
  };

  const enlaceFicha = (
    <a href={`/pacientes/${pacienteId}`} className="text-primary text-sm font-medium underline-offset-2 hover:underline">
      {t('facturacion.borrador.volver')}
    </a>
  );

  if (descartado) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm font-medium">
          {t('facturacion.borrador.descartadoAviso')}
        </p>
        {enlaceFicha}
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={guardar} noValidate className="flex flex-col gap-6">
        {actual && (
          <p className="text-muted-foreground text-sm">{tCon('facturacion.borrador.version', { n: actual.version })}</p>
        )}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-sm font-semibold">{t('facturacion.borrador.sesiones')}</legend>
          {elegibles.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('facturacion.borrador.sinSesiones')}</p>
          ) : (
            elegibles.map((s) => (
              <Casilla
                key={s.citaId}
                etiqueta={s.concepto}
                checked={lineas.some((l) => l.cita_id === s.citaId)}
                onChange={(e) => alternarSesion(s, e.currentTarget.checked)}
              />
            ))
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold">{t('facturacion.borrador.lineas')}</legend>
          <p id="ayuda-regimen" className="text-muted-foreground text-sm">
            {t('facturacion.borrador.ayudaRegimen')}
          </p>
          {fields.map((campo, i) => {
            const errorLinea = errors.lineas?.[i];
            const deSesion = lineas[i]?.cita_id ?? null;
            return (
              <div key={campo.id} className="border-border flex flex-col gap-3 rounded-lg border p-3">
                {deSesion && noElegibles.has(deSesion) && (
                  <p role="alert" className="text-destructive text-sm">
                    {t('facturacion.borrador.citaNoElegible')}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  <Field
                    id={`linea-${i}-concepto`}
                    etiqueta={t('facturacion.borrador.concepto')}
                    aria-describedby={`linea-${i}-ayuda`}
                    errores={errorLinea?.concepto?.message ? [errorLinea.concepto.message] : undefined}
                    {...register(`lineas.${i}.concepto`)}
                  />
                  <p id={`linea-${i}-ayuda`} className="text-muted-foreground text-xs">
                    {t('facturacion.borrador.ayudaConcepto')}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {deSesion === null && (
                    <Field
                      id={`linea-${i}-cantidad`}
                      etiqueta={t('facturacion.borrador.cantidad')}
                      inputMode="numeric"
                      errores={errorLinea?.cantidad?.message ? [errorLinea.cantidad.message] : undefined}
                      {...register(`lineas.${i}.cantidad`)}
                    />
                  )}
                  <Field
                    id={`linea-${i}-precio`}
                    etiqueta={t('facturacion.borrador.precio')}
                    inputMode="decimal"
                    errores={errorLinea?.precio?.message ? [errorLinea.precio.message] : undefined}
                    {...register(`lineas.${i}.precio`)}
                  />
                  <Seleccion
                    id={`linea-${i}-regimen`}
                    etiqueta={t('facturacion.borrador.regimen')}
                    textoVacio={t('facturacion.borrador.regimenElegir')}
                    opciones={[
                      { valor: 'exento_sanitario', texto: t('facturacion.borrador.exento') },
                      { valor: 'general', texto: t('facturacion.borrador.general') },
                    ]}
                    errores={errorLinea?.regimen_iva?.message ? [errorLinea.regimen_iva.message] : undefined}
                    {...register(`lineas.${i}.regimen_iva`)}
                  />
                </div>
                <div>
                  <Button type="button" variante="fantasma" tamano="sm" onClick={() => remove(i)}>
                    {t('facturacion.borrador.quitar')}
                  </Button>
                </div>
              </div>
            );
          })}
          {errors.lineas?.message && (
            <p role="alert" className="text-destructive text-sm">
              {errors.lineas.message}
            </p>
          )}
          <div>
            <Button type="button" variante="contorno" onClick={() => append(LINEA_LIBRE)}>
              {t('facturacion.borrador.anadirLibre')}
            </Button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('facturacion.borrador.destinatario')}</legend>
          <label className="inline-flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" value="paciente" {...register('destinatario.modo')} />
            {t('facturacion.borrador.destinatarioPaciente')}
          </label>
          {borrador && (
            <label className="inline-flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" value="conservar" {...register('destinatario.modo')} />
              {tCon('facturacion.borrador.destinatarioConservar', { nombre: borrador.destinatarioNombre })}
              {borrador.tieneNif ? ` · ${t('facturacion.borrador.destinatarioConservarNif')}` : ''}
            </label>
          )}
          <label className="inline-flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" value="tercero" {...register('destinatario.modo')} />
            {t('facturacion.borrador.destinatarioTercero')}
          </label>
          {modo === 'tercero' && (
            <div className="flex flex-col gap-3 pl-1">
              <Field
                id="tercero-nombre"
                etiqueta={t('facturacion.borrador.terceroNombre')}
                autoComplete="off"
                errores={errors.destinatario?.nombre?.message ? [errors.destinatario.nombre.message] : undefined}
                {...register('destinatario.nombre')}
              />
              <Seleccion
                id="tercero-tipo"
                etiqueta={t('facturacion.borrador.terceroTipo')}
                textoVacio={t('facturacion.borrador.regimenElegir')}
                opciones={[
                  { valor: 'fisica', texto: t('facturacion.borrador.fisica') },
                  { valor: 'juridica', texto: t('facturacion.borrador.juridica') },
                ]}
                {...register('destinatario.tipo')}
              />
              <Field
                id="tercero-nif"
                etiqueta={t('facturacion.borrador.terceroNif')}
                autoComplete="off"
                spellCheck={false}
                errores={errors.destinatario?.nif?.message ? [errors.destinatario.nif.message] : undefined}
                {...register('destinatario.nif')}
              />
            </div>
          )}
        </fieldset>

        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('facturacion.borrador.base')}</dt>
            <dd>{importes ? formatearImporte(importes.base) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('facturacion.borrador.cuota')}</dt>
            <dd>{importes ? formatearImporte(importes.cuota) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('facturacion.borrador.total')}</dt>
            <dd className="font-semibold">{importes ? formatearImporte(importes.total) : '—'}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            aria-disabled={enviando || bloqueadoPorCita || undefined}
            className="aria-disabled:opacity-50"
          >
            {enviando ? t('facturacion.borrador.guardando') : t('facturacion.borrador.guardar')}
          </Button>
          {actual && (
            <Button
              type="button"
              variante="contorno"
              onClick={() => {
                setErrorDialogo('');
                setDescartando(true);
              }}
            >
              {t('facturacion.borrador.descartar')}
            </Button>
          )}
        </div>
      </form>

      {errorGeneral && (
        <p role="alert" className="text-destructive text-sm">
          {errorGeneral}
        </p>
      )}
      {mensaje && (
        <p role="status" className="text-sm">
          {mensaje}
        </p>
      )}
      {enlaceFicha}

      <DialogoDescartar
        abierto={descartando}
        enviando={enviando}
        error={errorDialogo}
        alConfirmar={descartar}
        alCerrar={() => {
          if (enviando) return;
          setDescartando(false);
          setErrorDialogo('');
        }}
      />
    </div>
  );
}
