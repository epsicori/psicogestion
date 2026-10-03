import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Cache Components (T-007·C). Va en la RAÍZ, **no** bajo `experimental`:
   * verificado en `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`,
   * no de memoria.
   *
   * Lo que cambia, y por qué este corte tuvo que sanear pantallas para activarlo:
   * con Cache Components el renderizado por defecto es **prerenderizado parcial**.
   * Next exige que todo lo que no puede completarse en el prerenderizado esté
   * declarado: o cacheado con `use cache`, o dentro de un `<Suspense>`. Lo que no
   * lo esté bloquea el prerenderizado y aparece como aviso `blocking-prerender-*`.
   *
   * En esta aplicación **nada de lo que depende del usuario se cachea**: la sesión,
   * el perfil, el rol y los pacientes se leen en cada petición y viven detrás de un
   * `<Suspense>`. Un `use cache` sobre datos de paciente compartiría la caché entre
   * usuarios distintos, y `use cache: private` no se usa en ningún sitio.
   */
  cacheComponents: true,
  /**
   * T-038 (decisión Q2 del propietario). En desarrollo, Next imprime en la terminal cada
   * Server Function con SUS ARGUMENTOS (`ƒ regenerarCodigos({contrasena…})`). La
   * contraseña de «Regenerar mis códigos» viaja como argumento: se apaga ese registro.
   * Verificado en `node_modules/next/dist/docs/.../logging.md` («Server Functions»).
   */
  logging: { serverFunctions: false },
};

export default nextConfig;
