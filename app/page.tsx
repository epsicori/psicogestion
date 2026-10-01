import { redirect } from 'next/navigation';

/**
 * La raíz lleva a Agenda, no a Pacientes (ADR-050): el día de trabajo empieza en
 * la agenda, y ese fue el motivo de reducir los siete módulos del prototipo a
 * cuatro. `/agenda` existe desde T-014.
 */
export default function Inicio() {
  redirect('/agenda');
}
