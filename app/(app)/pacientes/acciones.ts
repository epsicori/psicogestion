'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { cifrarIdentificacion } from '@/lib/cifrado/identificacion';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { exigirSesion } from '@/lib/supabase/sesion';

import { esquemaNuevoPaciente } from './esquemas';

/**
 * `ColumnasIdentificacion` (contrato de `lib/cifrado/identificacion.ts`) usa `null` para
 * «sin documento»/«sin domicilio», pero el tipo generado de `alta_paciente` en
 * `lib/supabase/tipos-bd.ts` representa cada parámetro opcional de Postgres como
 * `T | undefined`, nunca `T | null`. Esta función traduce entre los dos sin tocar
 * ninguno de los dos contratos: `null` se convierte en `undefined`, que `JSON.stringify`
 * omite del cuerpo de la petición, y entonces Postgres aplica su propio `default null`.
 */
function sinNulos<T extends Record<string, unknown>>(objeto: T): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(
    Object.entries(objeto).map(([clave, valor]) => [clave, valor === null ? undefined : valor]),
  ) as { [K in keyof T]: Exclude<T[K], null> };
}

/**
 * `datos` es `unknown` a propósito: una Server Action es un punto de entrada
 * público y el formulario de cliente no es la única forma de llamarla. El esquema
 * que valida aquí es EL MISMO que usa el formulario con `zodResolver`.
 */
export async function crearPaciente(datos: unknown): Promise<EstadoFormulario> {
  // 1. La autorización se comprueba dentro de la acción, no se hereda del Proxy.
  const { supabase } = await exigirSesion();

  // 2. Validación.
  const resultado = esquemaNuevoPaciente.safeParse(datos);

  if (!resultado.success) {
    return {
      ...ESTADO_INICIAL,
      errores: z.flattenError(resultado.error).fieldErrors,
    };
  }

  // 3. Cifrado en Node, nunca en la base: el documento y el domicilio se convierten
  // en criptograma aquí, con la clave del Vault, antes de que nada viaje a Postgres.
  const columnas = await cifrarIdentificacion({
    documento: resultado.data.dni,
    domicilio: resultado.data.domicilio,
  });

  // 4. Un único RPC transaccional (T-032, §1.2 §6): `pacientes`, `pacientes_identificacion`
  // y `pacientes_salud_basica` se escriben en la misma transacción, o ninguna. Dos `insert`
  // sueltos dejarían un paciente fantasma si el índice único del DNI rechazara el segundo
  // viaje, y `DELETE` sobre `pacientes` es imposible para cualquier rol. `profesional_id`
  // sale de `auth.uid()` dentro de la función, no de un parámetro: no existe ni la forma de
  // pedir el alta a nombre de otro.
  // Los opcionales sin rellenar se mandan como `undefined`, no `null`: son exactamente
  // los mismos que `resultado.data` ya trae ausentes por el `preprocess` de `esquemas.ts`,
  // y `undefined` es lo que el tipo generado de `alta_paciente` admite para un parámetro
  // con `default null` en la función — `JSON.stringify` la omite y Postgres aplica su
  // propio default, que es el mismo `null` con el que se pensó el RPC.
  const { error } = await supabase.rpc('alta_paciente', {
    p_nombre: resultado.data.nombre,
    p_apellidos: resultado.data.apellidos,
    p_fecha_nacimiento: resultado.data.fechaNacimiento,
    p_sexo: resultado.data.sexo,
    p_telefono: resultado.data.telefono,
    ...sinNulos(columnas),
    p_alergias: resultado.data.alergias,
    p_medicacion_actual: resultado.data.medicacionActual,
  });

  if (error?.code === '23505') {
    // 5. El único código que se traduce, y se traduce a error DE CAMPO, no a mensaje
    // general (ADR-031): el duplicado se vincula, no se duplica, y el mensaje no dice de
    // quién es la ficha existente, que sería filtrar un paciente de otro profesional.
    return { ...ESTADO_INICIAL, errores: { dni: [t('pacientes.eseDocumentoYaEstaDadoDeAlta')] } };
  }

  if (error) {
    // 6. Mensaje genérico siempre, nunca el texto de Postgres (p. ej. 42501 de RLS).
    // El detalle se registra en servidor, para distinguir un 42501 (RLS, esperado)
    // de una base de datos caída u otro fallo real.
    console.error('crearPaciente: fallo al llamar a alta_paciente', error);
    return { ...ESTADO_INICIAL, mensaje: t('pacientes.noSePudoCrearElPaciente') };
  }

  // 7. Sin redirect: la lista se actualiza en el mismo viaje.
  revalidatePath('/pacientes');
  return ESTADO_INICIAL;
}
