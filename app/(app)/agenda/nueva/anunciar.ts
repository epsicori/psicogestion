/**
 * Anuncia un texto a los lectores de pantalla desde una región de estado que no pertenece a ninguna
 * pantalla: vive en `body`, así que sobrevive al cierre del diálogo o a la navegación de la página
 * (la región del formulario desaparece con él y el éxito se quedaría sin decir). Solo en cliente.
 */
export function anunciar(texto: string): void {
  if (typeof document === 'undefined') return;
  let region = document.querySelector<HTMLElement>('[data-anuncio-global]');
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('data-anuncio-global', '');
    region.setAttribute('role', 'status');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  // Dos anuncios iguales seguidos no cambian el DOM y el lector no volvería a hablar.
  region.textContent = region.textContent === texto ? `${texto} ` : texto;
}
