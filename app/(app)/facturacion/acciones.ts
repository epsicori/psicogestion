'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { aCentimos } from '@/lib/dinero/importe';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { exigirSesion } from '@/lib/supabase/sesion';

import { hoyEn } from '../agenda/bloques';
import { FORMAS_DE_PAGO, crearEsquemaCobro, esquemaAsignacion, importeParaBd } from './esquemas';

/** La clave de envío (R3.1): la genera el formulario y es la clave primaria del cobro. */
const esquemaClave = z.object({ id: z.uuid() });
const esquemaPaciente = z.object({ pacienteId: z.uuid({ error: t('cobros.eligePaciente') }) });

/** Mensaje genérico: el mismo para «no existe», «no es tuyo» y «la base dijo que no». Sin oráculo. */
const fallo = (): EstadoFormulario => ({ ...ESTADO_INICIAL, mensaje: t('cobros.noSePudoRegistrar') });

/**
 * ¿Existe ya un cobro con esta clave, registrado por esta sesión y visible por RLS? Con `registrado_por`
 * un id ajeno no se ve: ni oráculo ni confirmación de un cobro de otro (R4.3).
 */
async function leerCobroPropio(
  supabase: Awaited<ReturnType<typeof exigirSesion>>['supabase'],
  id: string,
  usuarioId: string,
) {
  return supabase.from('cobros').select('id').eq('id', id).eq('registrado_por', usuarioId).maybeSingle();
}

/**
 * Registra un cobro, o una devolución si el importe es negativo (T-023 §1.6).
 *
 * `datos` es `unknown`: una Server Action es un punto de entrada público. Se valida con el MISMO
 * esquema del formulario, pero con el «hoy» del centro del paciente, calculado aquí: el que mande
 * el cliente no se mira. La base lo vuelve a comprobar con `validar_cobro` (D10).
 */
export async function registrarCobro(datos: unknown): Promise<EstadoFormulario> {
  // 1. La autorización, dentro de la acción.
  const { supabase, usuario } = await exigirSesion();

  // 1b. La clave de envío: sin ella un reintento tras un corte de red podría duplicar el cobro.
  const clave = esquemaClave.safeParse(datos);
  if (!clave.success) return fallo();
  const { id } = clave.data;

  // 2. El paciente primero: de él sale la zona con la que se valida la fecha.
  const paciente = esquemaPaciente.safeParse(datos);
  if (!paciente.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(paciente.error).fieldErrors };
  }
  const { pacienteId } = paciente.data;

  // 2b. La clave propia, antes de las guardas (R4.3): si el primer envío ya entró, un reintento no
  // debe caer en una guarda transitoria (paciente fusionado después, zona). La autoridad sigue siendo
  // la clave primaria: un error aquí no corta el flujo.
  const { data: previa, error: errorPrevia } = await leerCobroPropio(supabase, id, usuario.id);
  if (errorPrevia) console.error('registrarCobro: fallo al buscar la clave de envío', errorPrevia.code);
  if (previa && !errorPrevia) {
    revalidatePath('/facturacion');
    return { ...ESTADO_INICIAL, mensaje: t('cobros.cobroYaRegistrado') };
  }

  // 3. Bajo RLS: un paciente que no se ve es el mismo mensaje que un 42501.
  const { data: fila, error: errorPaciente } = await supabase
    .from('pacientes')
    .select('centro_id, fusionado_en')
    .eq('id', pacienteId)
    .maybeSingle();
  if (errorPaciente || !fila) {
    if (errorPaciente) console.error('registrarCobro: fallo al leer el paciente', errorPaciente.code);
    return fallo();
  }
  // Un paciente fusionado ya no recibe cobros: su pendiente vive en el superviviente (ADR-031).
  if (fila.fusionado_en !== null) {
    return { ...ESTADO_INICIAL, errores: { pacienteId: [t('cobros.pacienteFusionado')] } };
  }

  // 4. «Hoy» en la zona del centro del paciente (o la de la organización si no tiene centro).
  const { data: zona, error: errorZona } = await supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `zonaDeCentro`).
    p_centro_id: fila.centro_id as string,
  });
  if (errorZona || typeof zona !== 'string' || zona.length === 0) {
    console.error('registrarCobro: fallo al leer la zona del centro', errorZona?.code);
    return fallo();
  }
  const hoy = hoyEn(new Date(), zona);

  // 5. El esquema entero.
  const resultado = crearEsquemaCobro(hoy).safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }
  const { importe, fecha, formaPago, referencia, motivo, facturaEspejoId } = resultado.data;

  // 6. El `id` es la clave de envío; `registrado_en` lo pone la base y `registrado_por` sale de la sesión.
  const centimos = aCentimos(importe);
  const { error } = await supabase.from('cobros').insert({
    id,
    paciente_id: pacienteId,
    // El generador tipa `numeric` como `number`, pero PostgREST acepta el texto y así el importe
    // no pasa nunca por coma flotante (diseño §1.5, D8). El cast es solo para el tipo.
    importe: importeParaBd(centimos) as unknown as number,
    fecha,
    forma_pago: formaPago,
    referencia: referencia ?? null,
    motivo: centimos < 0 ? (motivo ?? null) : null,
    registrado_por: usuario.id,
    // T-023b · la factura del espejo a la que se enlaza al registrar; la base comprueba que sea del mismo paciente.
    factura_espejo_id: facturaEspejoId ?? null,
  });

  // 7. Los dos 23514 que tienen campo vuelven junto a su campo; el resto, mensaje genérico.
  if (error) {
    if (error.code === '23514' && error.message?.includes('no puede ser posterior a hoy')) {
      return { ...ESTADO_INICIAL, errores: { fecha: [t('cobros.fechaFutura')] } };
    }
    if (error.code === '23514' && error.message?.includes('cobros_devolucion_motivo_ck')) {
      return { ...ESTADO_INICIAL, errores: { motivo: [t('cobros.devolucionNecesitaMotivo')] } };
    }
    if (error.code === '23514' && error.message?.includes('la devolución supera lo cobrado')) {
      return { ...ESTADO_INICIAL, errores: { importe: [t('cobros.facturas.devolucionSuperaLoCobrado')] } };
    }
    // Reintento de un envío que ya entró: la clave primaria repetida. Solo se da por bueno si el
    // cobro existe, es de esta sesión y la RLS lo deja ver; con otra cosa no hay oráculo (R3.1).
    if (error.code === '23505' && error.message?.includes('cobros_pkey')) {
      const { data: propio, error: errorRelectura } = await leerCobroPropio(supabase, id, usuario.id);
      if (errorRelectura) {
        // No sabemos si el cobro entró (R4.2). Un error de lectura no depende de quién sea el dueño: no hay oráculo.
        console.error('registrarCobro: falló la relectura tras 23505', errorRelectura.code);
        return { ...ESTADO_INICIAL, mensaje: t('cobros.resultadoDesconocido') };
      }
      if (propio) {
        revalidatePath('/facturacion');
        return { ...ESTADO_INICIAL, mensaje: t('cobros.cobroYaRegistrado') };
      }
    }
    // Solo el código: ni importe ni paciente en el registro.
    console.error('registrarCobro: la base rechazó el cobro', error.code);
    return fallo();
  }

  // 8. La pantalla se refresca en el mismo viaje.
  revalidatePath('/facturacion');
  return { ...ESTADO_INICIAL, mensaje: t('cobros.cobroRegistrado') };
}

/**
 * Asigna un cobro ya registrado a una factura del espejo (T-023b). Inserta SOLO `{ cobro_id, factura_espejo_id }`:
 * `creada_por` y `creada_en` los pone la base, y sin `.select()` (la política de lectura no es la de alta).
 * La base decide (mismo paciente, rol, cota de las devoluciones, un cobro en una sola factura); aquí solo se traduce.
 */
export async function asignarCobroAFactura(datos: unknown): Promise<EstadoFormulario> {
  const { supabase } = await exigirSesion();

  const resultado = esquemaAsignacion.safeParse(datos);
  if (!resultado.success) {
    const errores = z.flattenError(resultado.error).fieldErrors;
    if (Object.keys(errores).length > 0) return { ...ESTADO_INICIAL, errores };
    return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.noSePudoAsignar') };
  }
  const { cobroId, facturaEspejoId } = resultado.data;

  const { error } = await supabase
    .from('cobros_facturas')
    .insert({ cobro_id: cobroId, factura_espejo_id: facturaEspejoId });

  if (!error) {
    revalidatePath('/facturacion');
    return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.cobroAsignado') };
  }

  // Ya estaba en una factura (dos clics, dos pestañas): se relee por la vista y se dice en qué factura.
  const yaEnlazado =
    (error.code === '23505' && error.message?.includes('cobros_facturas_cobro_unico')) ||
    (error.code === '23514' && error.message?.includes('ya está enlazado'));
  if (yaEnlazado) {
    const { data: fila, error: errorRelectura } = await supabase
      .from('cobros_por_factura')
      .select('factura_espejo_id')
      .eq('cobro_id', cobroId)
      .maybeSingle();
    if (errorRelectura) {
      console.error('asignarCobroAFactura: falló la relectura tras el duplicado', errorRelectura.code);
      return { ...ESTADO_INICIAL, mensaje: t('cobros.resultadoDesconocido') };
    }
    if (fila?.factura_espejo_id === facturaEspejoId) {
      revalidatePath('/facturacion');
      return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.cobroYaEstaba') };
    }
    if (fila) return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.cobroYaEnlazado') };
    // Sin fila visible: nada que confirmar y ningún oráculo; cae en el mensaje genérico.
  } else if (error.code === '23514' && error.message?.includes('supera lo cobrado')) {
    return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.devolucionSuperaLoCobrado') };
  }

  // Solo el código: ni el cobro ni la factura en el registro.
  console.error('asignarCobroAFactura: la base rechazó la asignación', error.code);
  return { ...ESTADO_INICIAL, mensaje: t('cobros.facturas.noSePudoAsignar') };
}

export type CobroAsignable = {
  id: string;
  importeCentimos: number;
  fecha: string;
  formaPago: (typeof FORMAS_DE_PAGO)[number];
  referencia: string | null;
  motivo: string | null;
};

export type ResultadoCobrosAsignables = { ok: true; cobros: CobroAsignable[]; hayMas: boolean } | { ok: false };

const MAXIMO_ASIGNABLES = 200;

const esquemaFilaAsignable = z.object({
  cobro_id: z.uuid(),
  importe_centimos: z.number().int(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forma_pago: z.enum(FORMAS_DE_PAGO),
  referencia: z.string().nullable(),
  motivo: z.string().nullable(),
});

/** Los cobros del paciente de la factura que aún no están en ninguna: los que ofrece el diálogo de asignar. */
export async function cargarCobrosAsignables(entrada: unknown): Promise<ResultadoCobrosAsignables> {
  const { supabase } = await exigirSesion();

  const factura = z.object({ facturaEspejoId: z.uuid() }).safeParse(entrada);
  if (!factura.success) return { ok: false };

  const { data, error } = await supabase.rpc('cobros_asignables', {
    p_factura_espejo_id: factura.data.facturaEspejoId,
  });
  if (error) {
    console.error('cargarCobrosAsignables: falló la lectura', error.code);
    return { ok: false };
  }
  const filas = z.array(esquemaFilaAsignable).safeParse(data ?? []);
  if (!filas.success) {
    console.error('cargarCobrosAsignables: forma inesperada');
    return { ok: false };
  }
  return {
    ok: true,
    hayMas: filas.data.length > MAXIMO_ASIGNABLES,
    cobros: filas.data.slice(0, MAXIMO_ASIGNABLES).map((f) => ({
      id: f.cobro_id,
      importeCentimos: f.importe_centimos,
      fecha: f.fecha,
      formaPago: f.forma_pago,
      referencia: f.referencia,
      motivo: f.motivo,
    })),
  };
}
