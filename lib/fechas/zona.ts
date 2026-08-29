// Zona horaria: validación contra la plataforma y herencia centro → organización (ADR-034).

/**
 * Valida un nombre de zona IANA contra la lista que expone la plataforma,
 * no contra una lista escrita a mano: así ni `CET` ni `Madrid` pasan.
 */
export function esZonaHorariaValida(zona: string): boolean {
  return Intl.supportedValuesOf('timeZone').includes(zona);
}

/**
 * Herencia del ADR-034: el centro manda y la organización es el valor por
 * defecto. Un nulo en los dos es un error explícito, nunca un UTC silencioso.
 */
export function resolverZona(
  zonaDelCentro: string | null,
  zonaDeLaOrganizacion: string | null,
): string {
  const zona = zonaDelCentro ?? zonaDeLaOrganizacion;
  if (zona === null) {
    throw new Error(
      'Sin zona horaria: ni el centro ni la organización la definen (ADR-034).',
    );
  }
  return zona;
}
