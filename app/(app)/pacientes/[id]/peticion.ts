/**
 * `x-forwarded-for` puede traer una cadena de proxies y cualquier cosa que alguien meta a
 * mano: solo se pasa a la base lo que tiene forma de IP, porque la columna es `inet` y un
 * valor sucio la haría lanzar 22P02 — es decir, dejaría la historia sin abrir por culpa de
 * una cabecera.
 *
 * Sin `'use server'`: la importan las acciones de la ficha y las de la nota.
 */
export function ipDeLaPeticion(cabeceras: Headers): string | null {
  const bruta = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!bruta) return null;
  const esIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(bruta);
  const esIpv6 = /^[0-9a-fA-F:]+$/.test(bruta) && bruta.includes(':');
  return esIpv4 || esIpv6 ? bruta : null;
}
