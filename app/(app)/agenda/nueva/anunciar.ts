/**
 * Anuncia un texto a los lectores de pantalla desde una región de estado que no pertenece a ninguna
 * pantalla: vive en `body`, así que sobrevive al cierre del diálogo o a la navegación de la página
 * (la región del formulario desaparece con él y el éxito se quedaría sin decir). Solo en cliente.
 */
export function prepararAnuncio(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let region = document.querySelector<HTMLElement>('[data-anuncio-global]');
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('data-anuncio-global', '');
    region.setAttribute('role', 'status');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  return region;
}

/**
 * Los lectores de pantalla no suelen decir una región que nace con su texto: tiene que existir antes
 * del cambio. Por eso el formulario la prepara al montarse (`prepararAnuncio`, vacía) y aquí solo
 * se le cambia el texto. Si por lo que sea no estaba, se crea y el texto entra un instante después.
 */
export function anunciar(texto: string): void {
  if (typeof document === 'undefined') return;
  const existia = document.querySelector('[data-anuncio-global]') !== null;
  const region = prepararAnuncio();
  if (!region) return;
  const poner = () => {
    // Dos anuncios iguales seguidos no cambian el DOM y el lector no volvería a hablar.
    region.textContent = region.textContent === texto ? `${texto} ` : texto;
  };
  if (existia) poner();
  else setTimeout(poner, 100);
}
