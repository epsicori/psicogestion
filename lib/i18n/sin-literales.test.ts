import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// La regla que impide que esto se degrade. Sacar las cadenas del código una vez no sirve de
// nada si la siguiente pantalla vuelve a escribirlas dentro: esta prueba falla en cuanto
// aparece texto visible fuera del catálogo.
//
// No pretende ser un analizador de JSX. Busca los dos sitios por los que el texto se cuela
// de verdad —el contenido de un elemento y los atributos que un lector de pantalla lee— y
// deja una lista de excepciones explícita, que es lo que el ticket permite.

const RAIZ = join(__dirname, '..', '..');
const CARPETAS = ['app', 'components'];

const EXCLUIDAS = [
  join('app', 'prototipo'), // maqueta congelada, exenta a propósito
  join('lib', 'i18n'), // el catálogo es el único sitio donde las cadenas son literales
];

/**
 * Excepciones, cada una con su motivo. Una excepción sin motivo es una regla que alguien
 * apagó; con motivo es una decisión que se puede discutir.
 */
const EXCEPCIONES: { texto: string; motivo: string }[] = [
  { texto: 'Psicogestión', motivo: 'La marca aparece en metadatos de <head>, no en pantalla.' },
  { texto: 'es', motivo: 'Atributo lang del documento, no texto visible.' },
];

const ATRIBUTOS_VISIBLES = ['aria-label', 'title', 'placeholder', 'alt', 'etiqueta'];

function ficherosDe(carpeta: string): string[] {
  const absoluta = join(RAIZ, carpeta);
  const encontrados: string[] = [];

  const recorrer = (ruta: string) => {
    for (const entrada of readdirSync(ruta)) {
      const completa = join(ruta, entrada);
      const relativa = relative(RAIZ, completa);

      if (EXCLUIDAS.some((excluida) => relativa.startsWith(excluida))) continue;
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
      } else if (/\.tsx$/.test(entrada) && !/\.test\.tsx$/.test(entrada)) {
        encontrados.push(completa);
      }
    }
  };

  recorrer(absoluta);
  return encontrados;
}

const exceptuado = (texto: string) =>
  EXCEPCIONES.some((excepcion) => excepcion.texto === texto.trim());

function literalesDe(contenido: string): string[] {
  const hallazgos: string[] = [];

  // 1 · Texto entre etiquetas: <p>Hola</p>. Se descarta lo que solo son símbolos y lo que
  //     ya viene de una expresión, porque eso empieza por `{`.
  for (const [, texto] of contenido.matchAll(/>\s*([^<>{}\n][^<>{}\n]*?)\s*</g)) {
    if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(texto) && !exceptuado(texto)) hallazgos.push(texto.trim());
  }

  // 2 · Atributos que lee un lector de pantalla, con literal en vez de expresión.
  for (const atributo of ATRIBUTOS_VISIBLES) {
    const patron = new RegExp(`${atributo}="([^"]{3,})"`, 'g');
    for (const [, texto] of contenido.matchAll(patron)) {
      if (!exceptuado(texto)) hallazgos.push(`${atributo}="${texto}"`);
    }
  }

  return hallazgos;
}

describe('Ninguna cadena visible vive fuera del catálogo', () => {
  const ficheros = CARPETAS.flatMap(ficherosDe);

  it('encuentra ficheros que revisar, para no pasar por no mirar nada', () => {
    expect(ficheros.length).toBeGreaterThan(3);
  });

  it.each(ficheros.map((f) => [relative(RAIZ, f).split(sep).join('/'), f]))(
    '%s no escribe texto visible',
    (_nombre, ruta) => {
      expect(literalesDe(readFileSync(ruta, 'utf8'))).toEqual([]);
    },
  );
});
