import { z } from 'zod';

import { normalizarCif, validarCif } from './cif';
import { normalizarIban, validarIban } from './iban';
import { normalizarNif, validarNif } from './nif';
import { sanearColegiado, validarColegiado } from './colegiado';
import { validarCodigoPostal } from './codigo-postal';
import { normalizarTelefono, validarTelefono } from './telefono';

// Refinamientos Zod listos para componer en los formularios (`z.object` de las
// pantallas). Cada esquema acepta la entrada tal como la escribe una persona
// —minúsculas, espacios, guiones— y, si valida, la devuelve normalizada.
// No están cableados en ningún formulario: los conectan sus tickets.

export const esquemaNif = z
  .string({ error: 'Introduce el DNI o NIE' })
  .refine(validarNif, 'Revisa el DNI o NIE: la letra no coincide con el número')
  .transform(normalizarNif);

export const esquemaCif = z
  .string({ error: 'Introduce el NIF de la organización' })
  .refine(validarCif, 'Revisa el NIF: el dígito o letra de control no coincide')
  .transform(normalizarCif);

export const esquemaIban = z
  .string({ error: 'Introduce el IBAN' })
  .refine(validarIban, 'Revisa el IBAN: no supera la comprobación de los dígitos de control')
  .transform(normalizarIban);

export const esquemaTelefono = z
  .string({ error: 'Introduce el teléfono' })
  .refine(validarTelefono, 'Introduce un teléfono español válido, por ejemplo 600 123 456')
  // El refine anterior ya garantiza que normaliza; el ?? solo contenta al compilador.
  .transform((valor) => normalizarTelefono(valor) ?? valor);

export const esquemaCodigoPostal = z
  .string({ error: 'Introduce el código postal' })
  .trim()
  .refine(validarCodigoPostal, 'Introduce un código postal válido: cinco dígitos, de 01001 a 52999');

export const esquemaColegiado = z
  .string({ error: 'Introduce el número de colegiado' })
  .refine(validarColegiado, 'Introduce el número de colegiado')
  .transform(sanearColegiado);
