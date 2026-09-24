import 'server-only';

import { crearClienteAdministracion } from '../supabase/administracion';

// T-032, ADR-029. Las claves de cifrado y de índice viven en el Vault de Supabase, cada
// una con su propio nombre, y se leen con `public.clave_de_cifrado(p_nombre)`, que solo
// `service_role` puede ejecutar (la migración lo revoca al resto de roles). Por eso este
// módulo es el único que llama a `crearClienteAdministracion()` para pedir una clave: no
// para la Admin API de Auth, que es el uso documentado allí, sino porque también es «lo
// que la clave anónima + RLS no puede hacer».

export const VERSION_CLAVE = 1;

const CACHE = new Map<string, Buffer>();

async function leerClaveDelVault(nombre: string): Promise<Buffer> {
  const memorizada = CACHE.get(nombre);
  if (memorizada) return memorizada;

  const supabase = crearClienteAdministracion();
  const { data, error } = await supabase.rpc('clave_de_cifrado', { p_nombre: nombre });
  if (error || !data) {
    throw new Error(
      `No se pudo leer el secreto "${nombre}" del Vault: ${error?.message ?? 'sin datos'}. ` +
        'Créalo con vault.create_secret(...) (ver supabase/seed.sql).',
    );
  }

  const clave = Buffer.from(data, 'base64');
  // Sin caducidad: el proceso muere antes de que la clave rote en caliente. Sin fallback:
  // una clave por defecto convertiría un despliegue mal configurado en datos cifrados con
  // una clave pública.
  CACHE.set(nombre, clave);
  return clave;
}

/** La clave AES-256-GCM que cifra `pacientes_identificacion` (ADR-029). */
export async function claveDeCifrado(): Promise<Buffer> {
  return leerClaveDelVault('identificacion_cifrado_v1');
}

/** La clave HMAC-SHA-256 del índice ciego. Distinta de la de cifrado (ADR-029). */
export async function claveDeIndice(): Promise<Buffer> {
  return leerClaveDelVault('identificacion_indice_v1');
}
