import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export type EstadoFormulario = {
  errores?: Record<string, string[] | undefined>;
  mensaje?: string;
};

export const ESTADO_INICIAL: EstadoFormulario = {};

/**
 * Vuelca en el formulario los errores por campo que devolvió la Server Action.
 *
 * Existe porque la validación ocurre DOS veces y las dos cuentan: en cliente con
 * `zodResolver` —para no dar un viaje al servidor por un campo vacío— y en la
 * Server Action con el MISMO esquema, que es la única que manda. La de cliente es
 * comodidad; la de servidor es la que no se puede saltar desactivando JavaScript.
 *
 * Cuando la segunda rechaza algo que la primera dejó pasar, el error tiene que
 * aparecer JUNTO A SU CAMPO y no en un aviso suelto: `setError` lo ata al control,
 * y `Field` ya lo enlaza con `aria-describedby`.
 */
export function aplicarErroresDelServidor<T extends FieldValues>(
  estado: EstadoFormulario,
  setError: UseFormSetError<T>,
) {
  for (const [campo, mensajes] of Object.entries(estado.errores ?? {})) {
    const mensaje = mensajes?.[0];
    if (mensaje) {
      setError(campo as Path<T>, { type: 'server', message: mensaje });
    }
  }
}
