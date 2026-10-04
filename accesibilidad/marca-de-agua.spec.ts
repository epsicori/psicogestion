import * as crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { cifrarCopia, type Derivar } from '@/lib/exportaciones/cifrar';
import { respuestaProfesional } from '@/lib/exportaciones/fixtures-de-prueba';
import { proyectar } from '@/lib/exportaciones/formato';
import { t } from '@/lib/i18n';

/**
 * T-040 · A-H3 (R2-H1, R2-H2) · La marca de agua de la copia cubre el contenido.
 *
 * Criterio del diseño: a 1920×1080, 1366×768 y 390×844, al menos el 80 % del área de `<main>` queda
 * bajo alguna fila de la marca. jsdom no maqueta ni gira, así que esto solo se puede medir aquí.
 * Se exige además el 80 % de la ventana entera: la capa es fija sobre toda la página, y una captura de
 * cualquier trozo (también del margen junto a la nota) tiene que llevar el código.
 *
 * Se mide con PÍXELES REALES, no con la fórmula del visor: cada fila pasa a tener de ancho su texto
 * (`max-content`) y fondo negro, la capa opacidad 1 y `<main>` invisible (conserva su caja). Se cuenta
 * qué parte sale negra en una captura. El giro, la fuente y cualquier `transform` que se cuele cuentan
 * tal como los pinta Chromium.
 *
 * La copia se genera aquí, con el código de `lib/exportaciones/`, en un directorio temporal propio, y
 * se abre por `file://`: esta spec no usa el servidor web de `playwright.config.ts`.
 */

const CONTRASENA = 'marca-de-agua-T-040';
const MINIMO = 0.8;

type Argon2Sync = (
  a: 'argon2id',
  p: { message: Uint8Array; nonce: Uint8Array; parallelism: number; tagLength: number; memory: number; passes: number },
) => Buffer;

const derivarNativo: Derivar = async (c, s, k) => {
  const f = (crypto as unknown as { argon2Sync?: Argon2Sync }).argon2Sync;
  if (typeof f !== 'function') throw new Error(`crypto.argon2Sync no existe en Node ${process.version}`);
  return new Uint8Array(
    f('argon2id', { message: c, nonce: s, parallelism: k.p, tagLength: k.longitud, memory: k.m, passes: k.t }),
  );
};

let directorio = '';
let url = '';

test.beforeAll(async () => {
  directorio = mkdtempSync(path.join(os.tmpdir(), 'psicogestion-t040-marca-'));
  const { html } = await cifrarCopia(proyectar(respuestaProfesional()), CONTRASENA, derivarNativo);
  const fichero = path.join(directorio, 'copia.html');
  writeFileSync(fichero, html, 'utf8');
  url = pathToFileURL(fichero).href;
});

test.afterAll(() => {
  if (directorio) rmSync(directorio, { recursive: true, force: true });
});

async function abrir(page: Page) {
  await page.goto(url);
  await page.getByLabel(t('exportaciones.visor.contrasena')).fill(CONTRASENA);
  await page.getByRole('button', { name: t('exportaciones.visor.abrir') }).click();
  await page.locator('.marca-linea').waitFor({ timeout: 120_000 });
}

interface Caja {
  x: number;
  y: number;
  x1: number;
  y1: number;
}

/** Qué fracción de la caja visible de `<main>` y de la ventana queda bajo alguna fila, en píxeles. */
async function cobertura(page: Page): Promise<{ main: number; ventana: number }> {
  const cajas = await page.evaluate(() => {
    const capa = document.querySelector<HTMLElement>('.marca-capa');
    if (!capa || !capa.firstElementChild) throw new Error('no hay capa de marca');
    capa.style.opacity = '1';
    for (const fila of Array.from(capa.firstElementChild.children) as HTMLElement[]) {
      fila.style.width = 'max-content';
      fila.style.background = '#000';
    }
    const main = document.querySelector('main')!;
    main.style.visibility = 'hidden';
    document.documentElement.style.background = '#fff';
    document.body.style.background = '#fff';
    const r = main.getBoundingClientRect();
    return {
      main: {
        x: Math.max(0, r.left),
        y: Math.max(0, r.top),
        x1: Math.min(window.innerWidth, r.right),
        y1: Math.min(window.innerHeight, r.bottom),
      },
      ventana: { x: 0, y: 0, x1: window.innerWidth, y1: window.innerHeight },
    };
  });
  expect(cajas.main.x1 - cajas.main.x, 'la caja visible de <main> no tiene ancho').toBeGreaterThan(0);
  expect(cajas.main.y1 - cajas.main.y, 'la caja visible de <main> no tiene alto').toBeGreaterThan(0);

  const captura = await page.screenshot();
  // La captura se decodifica en una página en blanco, con un canvas: sin dependencias nuevas.
  const lienzo = await page.context().newPage();
  try {
    return await lienzo.evaluate(
      async ({ b64, cajas }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const fraccion = (caja: Caja) => {
          let negros = 0;
          let total = 0;
          for (let y = Math.ceil(caja.y); y < caja.y1; y += 2) {
            for (let x = Math.ceil(caja.x); x < caja.x1; x += 2) {
              const i = (y * c.width + x) * 4;
              total++;
              if (d[i] < 64 && d[i + 1] < 64 && d[i + 2] < 64) negros++;
            }
          }
          return negros / total;
        };
        return { main: fraccion(cajas.main), ventana: fraccion(cajas.ventana) };
      },
      { b64: captura.toString('base64'), cajas },
    );
  } finally {
    await lienzo.close();
  }
}

/** Mide y exige el 80 % en `<main>` y en la ventana entera. */
async function exigirCobertura(page: Page, caso: string) {
  const r = await cobertura(page);
  const pc = (x: number) => (100 * x).toFixed(1) + ' %';
  console.info(`[T-040] marca ${caso}: <main> ${pc(r.main)} · ventana ${pc(r.ventana)}`);
  expect(r.main, `${caso}: ${pc(r.main)} de <main> bajo la marca`).toBeGreaterThanOrEqual(MINIMO);
  expect(r.ventana, `${caso}: ${pc(r.ventana)} de la ventana bajo la marca`).toBeGreaterThanOrEqual(MINIMO);
}

test.describe('T-040 · la marca de agua cubre <main> (píxeles reales)', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const [ancho, alto] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
    [2560, 1440],
  ] as const) {
    test(`a ${ancho}×${alto}, al menos el 80 % de <main> queda bajo la marca`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await abrir(page);
      await exigirCobertura(page, `a ${ancho}×${alto}`);
    });
  }

  test('R2-H2: abierta a 1366×768 y llevada después a 5120×1440, sigue cubriendo el 80 %', async ({ page }) => {
    // La ventana se arrastra a un monitor ultrapanorámico y se maximiza DESPUÉS de abrir la copia.
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrir(page);
    await page.setViewportSize({ width: 5120, height: 1440 });
    await exigirCobertura(page, 'de 1366×768 a 5120×1440');
  });
});

test.describe('T-040 · R3-H1: la opacidad y el color de la marca están fijados', () => {
  test.describe.configure({ timeout: 180_000 });

  test('cada fila tiene una opacidad efectiva entre 0,10 y 0,14 y un color negro propio, no heredado', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrir(page);
    // Se lee el estilo calculado ANTES de tocar nada (la medición de cobertura lo neutraliza).
    const filas = await page.evaluate(() => {
      const capa = document.querySelector<HTMLElement>('.marca-capa');
      if (!capa || !capa.firstElementChild) throw new Error('no hay capa de marca');
      // La opacidad efectiva es el producto de la de cada antecesor: un `opacity` en el bloque
      // girado o en el <body> también la cambia.
      return (Array.from(capa.firstElementChild.children) as HTMLElement[]).map((fila) => {
        let opacidad = 1;
        for (let n: HTMLElement | null = fila; n; n = n.parentElement) {
          opacidad *= Number(getComputedStyle(n).opacity);
        }
        return { opacidad, color: getComputedStyle(fila).color, colorEnLinea: fila.style.color };
      });
    });
    expect(filas.length, 'la capa no tiene filas').toBeGreaterThan(0);
    for (const [i, fila] of filas.entries()) {
      expect(fila.opacidad, `fila ${i}: opacidad efectiva`).toBeGreaterThanOrEqual(0.1);
      expect(fila.opacidad, `fila ${i}: opacidad efectiva`).toBeLessThanOrEqual(0.14);
      expect(fila.color, `fila ${i}: color calculado`).toBe('rgb(0, 0, 0)');
      // Fijado en la propia fila: el <body> del visor es #1f2328 y no puede decidir el color.
      expect(fila.colorEnLinea, `fila ${i}: color en línea`).not.toBe('');
    }
  });
});
