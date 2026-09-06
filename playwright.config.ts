import { defineConfig, devices } from '@playwright/test';

/**
 * El puerto se puede cambiar con `PUERTO`. No es un adorno: en una máquina de trabajo el
 * 3000 lo tiene ocupado cualquier otra cosa, y sin esto la batería falla con `EADDRINUSE`
 * antes de comprobar nada — que es como se descubrió.
 */
const PUERTO = process.env.PUERTO ?? '3000';
const URL_BASE = process.env.URL_BASE ?? `http://127.0.0.1:${PUERTO}`;

/**
 * T-009·B · Verificador de accesibilidad en navegador de verdad.
 *
 * POR QUÉ HACE FALTA UN NAVEGADOR, habiendo ya 363 pruebas con jsdom: jsdom **no tiene
 * disposición ni consulta de medios**. No sabe cuánto mide un elemento, así que no puede
 * decir si algo se sale a 360 px, y no evalúa `prefers-reduced-motion`, así que no puede
 * decir si una animación respeta la preferencia del sistema. Esas dos cosas son la deuda
 * que arrastran los tres cortes entregados de T-007, y son exactamente las que esta
 * batería cierra.
 *
 * Lo que NO se mide aquí se mide donde es más barato: el contraste de los tokens es
 * aritmética sobre `app/globals.css` y vive en `npm test`
 * (`lib/contraste/tokens.test.ts`). Levantar un navegador para multiplicar dos números
 * sería pagar treinta segundos por cada ejecución.
 *
 * Un solo navegador a propósito: la accesibilidad que se comprueba aquí —tamaño, foco,
 * teclado, nombres accesibles— no depende del motor. Tres navegadores triplicarían el
 * tiempo del flujo para volver a comprobar lo mismo.
 */
export default defineConfig({
  testDir: './accesibilidad',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: URL_BASE,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * `next start` sobre el build de producción, no `next dev`: lo que se verifica tiene que
   * ser lo que se despliega. En desarrollo hay superposiciones y recarga en caliente que
   * cambian el DOM y darían verdes que no valen.
   *
   * `reuseExistingServer` fuera de CI para no esperar un arranque en cada ejecución local.
   */
  webServer: {
    command: `npm run start -- --port ${PUERTO}`,
    /**
     * La sonda apunta a `/pacientes` y NO a `/login`, y la diferencia costó un falso rojo:
     * `/login` es estático y responde antes de que el camino con sesión y base de datos
     * esté en pie, así que Playwright daba el servidor por listo y la primera prueba que
     * entraba con sesión se encontraba un 500 —«A server error occurred»— que no se
     * reproducía con el servidor ya caliente.
     *
     * Sin sesión `/pacientes` responde 307 hacia `/login`, que Playwright acepta como
     * disponible, y de paso obliga a levantar el `layout` del grupo `(app)` y el cliente
     * de Supabase. La sonda tiene que recorrer lo que las pruebas van a usar; si no, mide
     * otra cosa.
     */
    url: `${URL_BASE}/pacientes`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
