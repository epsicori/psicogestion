import { redirect } from 'next/navigation';

/**
 * La raíz lleva a Agenda, no a Pacientes (ADR-050): el día de trabajo empieza en
 * la agenda, y ese fue el motivo de reducir los siete módulos del prototipo a
 * cuatro.
 *
 * CONSECUENCIA CONOCIDA, no un descuido: `/agenda` **todavía no existe** —la
 * construyen T-010 y T-014—, así que entrar por `/` da 404 hasta entonces. Se
 * deja así a propósito en vez de apuntar a `/pacientes`: un redirección
 * provisional a otro módulo se queda para siempre y contradice el ADR. El
 * recorrido normal no pasa por aquí, porque el inicio de sesión lleva
 * directamente a `/pacientes`.
 */
export default function Inicio() {
  redirect('/agenda');
}
