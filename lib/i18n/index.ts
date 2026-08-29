import { es } from './es';

export type Catalogo = typeof es;

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
  // El tipo de la clave garantiza que la ruta existe; que ademas apunte a una cadena y no
  // a un area entera lo comprueba esto, y no un molde.
  if (typeof actual !== 'string') {
    throw new Error(`La clave  no apunta a una cadena.`);
  }
  return actual;
}

export { es };

