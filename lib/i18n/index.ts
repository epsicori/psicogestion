import { es } from './es';

export type Catalogo = typeof es;

/**
 * La unión de todas las rutas con punto del catálogo: `'marca'`, `'acceso.entrar'`… Se
 * genera del propio objeto, así que pedir una clave que no existe **no compila**, en vez de
 * dejar una cadena vacía en pantalla.
 */
export type ClaveDeCatalogo = JoinKeys<'', Catalogo>;

type JoinKeys<Prefijo extends string, Obj> = Obj extends object
  ? {
      [K in keyof Obj & string]: Obj[K] extends object
        ? JoinKeys<`${Prefijo}${K}.`, Obj[K]>
        : `${Prefijo}${K}`;
    }[keyof Obj & string]
  : never;

export function t(clave: ClaveDeCatalogo): string {
  const partes = clave.split('.');
  let actual: unknown = es;

  for (const parte of partes) {
    if (actual && typeof actual === 'object' && parte in actual) {
      actual = (actual as Record<string, unknown>)[parte];
    } else {
      throw new Error(`Clave no encontrada: ${clave}`);
    }
  }

  // El tipo de la clave garantiza que la ruta existe; que además apunte a una cadena y no
  // a un área entera lo comprueba esto, y no un molde.
  if (typeof actual !== 'string') {
    throw new Error(`La clave ${clave} no apunta a una cadena.`);
  }

  return actual;
}

/**
 * Igual que `t`, sustituyendo los huecos `{nombre}` de la cadena. Existe para que el plural
 * y las fechas no se compongan concatenando trozos: `'Alta el ' + fecha` es una frase
 * partida en dos, y partida así no se puede traducir ni revisar.
 */
export function tCon(clave: ClaveDeCatalogo, valores: Record<string, string | number>): string {
  return t(clave).replace(/\{(\w+)\}/g, (literal, nombre: string) =>
    nombre in valores ? String(valores[nombre]) : literal,
  );
}

export { es };
