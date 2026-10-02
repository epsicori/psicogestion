// @vitest-environment node
// T-040 · El visor dentro del fichero (diseño §1.3, §3 «Vitest, visor» y el contrato de la marca de
// agua). Se compone un fichero real con `cifrarCopia` y se abre en jsdom ejecutando SUS scripts:
// el núcleo en JS deriva la clave y WebCrypto (el de Node, inyectado) descifra.
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { TextDecoder as TD, TextEncoder as TE } from 'node:util';

import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { cifrarCopia, type Derivar } from './cifrar';
import { ID_EXPORTACION, respuestaPacienteQueTraeDeMas, respuestaProfesional } from './fixtures-de-prueba';
import { proyectar, type CopiaV1 } from './formato';
import { VISOR_JS } from './visor-js';

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

// jsdom (ya instalado, lo usa Vitest) no trae tipos y el ticket no admite dependencias nuevas:
// se carga con require y se tipa solo lo que la prueba usa.
interface JSDOM {
  window: Window & typeof globalThis;
}
interface OpcionesJsdom {
  runScripts: 'dangerously';
  pretendToBeVisual: boolean;
  beforeParse(w: Window): void;
}
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, opciones: OpcionesJsdom) => JSDOM;
};

const CONTRASENA = 'contraseña del visor';

function cargar(html: string, { sinSubtle = false } = {}) {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      const ventana = w as unknown as Record<string, unknown>;
      Object.defineProperty(w, 'crypto', {
        value: sinSubtle ? { getRandomValues: crypto.webcrypto.getRandomValues.bind(crypto.webcrypto) } : crypto.webcrypto,
        configurable: true,
      });
      if (typeof ventana.TextEncoder !== 'function') ventana.TextEncoder = TE;
      if (typeof ventana.TextDecoder !== 'function') ventana.TextDecoder = TD;
    },
  });
}

async function esperar(cond: () => boolean, ms = 60_000) {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error('el visor no terminó a tiempo');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Escribe la contraseña, envía el formulario y espera a que pinte la copia o un error. */
async function abrirCon(dom: JSDOM, contrasena: string) {
  const doc = dom.window.document;
  const campo = doc.querySelector<HTMLInputElement>('input[type=password]');
  expect(campo).not.toBeNull();
  campo!.value = contrasena;
  doc.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(() => Boolean(doc.querySelector('[role=alert]')?.textContent) || Boolean(doc.querySelector('.marca-linea')));
  return doc;
}

async function fichero(copia: CopiaV1) {
  return (await cifrarCopia(copia, CONTRASENA, derivarNativo)).html;
}

const textoVisible = (doc: Document) => doc.getElementById('visor')!.textContent ?? '';

describe('VISOR_JS · abrir la copia', () => {
  it('antes de abrir solo hay el formulario con su label, y nada de la copia', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())));
    const doc = dom.window.document;
    const campo = doc.querySelector<HTMLInputElement>('input[type=password]')!;
    expect(doc.querySelector(`label[for="${campo.id}"]`)?.textContent).toBe(t('exportaciones.visor.contrasena'));
    expect(doc.querySelector('[role=status]')).not.toBeNull();
    expect(doc.querySelector('[role=alert]')).not.toBeNull();
    expect(doc.body.textContent).not.toContain('MARCA-CUERPO');
    expect(doc.querySelector('.marca-capa')).toBeNull();
  });

  it('con la contraseña correcta pinta las dos versiones en orden, con reservadas, sello y huellas', async () => {
    const copia = proyectar(respuestaProfesional());
    const dom = cargar(await fichero(copia));
    const doc = await abrirCon(dom, CONTRASENA);
    expect(doc.querySelector('[role=alert]')?.textContent ?? '').toBe(''); // el formulario ya no está
    const titulos = Array.from(doc.querySelectorAll('h2'), (h: Element) => h.textContent);
    expect(titulos.slice(0, 2)).toEqual(['Versión 1', 'Versión 3']);
    const visible = textoVisible(doc);
    for (const dato of [
      'MARCA-CUERPO-1',
      'MARCA-CUERPO-2',
      'MARCA-RESERVADA-1',
      'MARCA-MOTIVO-2',
      copia.versiones[0].sello,
      copia.versiones[0].huella,
      copia.versiones[1].huellaAnterior,
      copia.formula!,
      'Lucía Pérez Gómez',
    ]) {
      expect(visible, dato).toContain(dato);
    }
    expect(visible.indexOf('MARCA-CUERPO-1')).toBeLessThan(visible.indexOf('MARCA-CUERPO-2'));
    // Al terminar, el campo de la contraseña está vacío y el foco en el título de la copia.
    expect(doc.querySelector('input[type=password]')).toBeNull();
    expect(doc.activeElement?.tagName).toBe('H1');
  }, 120_000);

  it('con una contraseña errónea: el mensaje en role="alert", el campo vacío y el foco en él', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())));
    const doc = await abrirCon(dom, CONTRASENA + 'x');
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.error'));
    const campo = doc.querySelector<HTMLInputElement>('input[type=password]')!;
    expect(doc.activeElement).toBe(campo);
    expect(campo.value).toBe('');
    expect(doc.body.textContent).not.toContain('MARCA-CUERPO');
    expect(doc.querySelector('.marca-capa')).toBeNull();
  }, 120_000);

  it('un cuerpo con <img onerror> se pinta como texto: ningún img en el DOM', async () => {
    const r = respuestaProfesional();
    const ataque = '<img src=x onerror="document.title=\'pwned\'">';
    r.versiones[0].cuerpo = JSON.stringify({ texto: ataque });
    r.versiones[0].anotaciones_reservadas = ataque;
    r.paciente.nombre = ataque;
    const dom = cargar(await fichero(proyectar(r)));
    const doc = await abrirCon(dom, CONTRASENA);
    expect(doc.querySelector('.marca-linea')).not.toBeNull();
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(textoVisible(doc)).toContain(ataque);
    expect(doc.title).not.toBe('pwned');
  }, 120_000);

  it('una cabecera alterada (otro m) no abre', async () => {
    const html = await fichero(proyectar(respuestaProfesional()));
    const alterado = html.replace('"m":65536', '"m":65537');
    expect(alterado).not.toBe(html);
    const doc = await abrirCon(cargar(alterado), CONTRASENA);
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.error'));
    expect(doc.body.textContent).not.toContain('MARCA-CUERPO');
  }, 120_000);

  it('una cabecera con solo un espacio de más no abre: los datos asociados son sus bytes exactos', async () => {
    const html = await fichero(proyectar(respuestaProfesional()));
    const alterado = html.replace('","formato_version"', '", "formato_version"');
    expect(alterado).not.toBe(html);
    const doc = await abrirCon(cargar(alterado), CONTRASENA);
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.error'));
    expect(doc.body.textContent).not.toContain('MARCA-CUERPO');
  }, 120_000);

  it('una cabecera ilegible dice que el fichero está dañado', async () => {
    const html = await fichero(proyectar(respuestaProfesional()));
    const doc = await abrirCon(cargar(html.replace('"formato_version":1', '"formato_version":2')), CONTRASENA);
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.danado'));
  }, 120_000);

  it('sin crypto.subtle lo dice, y no intenta abrir', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())), { sinSubtle: true });
    const doc = dom.window.document;
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.sinCrypto'));
    await abrirCon(dom, CONTRASENA);
    expect(doc.querySelector('[role=alert]')!.textContent).toBe(t('exportaciones.visor.sinCrypto'));
    expect(doc.querySelector('.marca-linea')).toBeNull();
  }, 120_000);

  it('la copia del paciente no pinta reservadas, y de la conjunta pinta los asistentes', async () => {
    const dom = cargar(await fichero(proyectar(respuestaPacienteQueTraeDeMas())));
    const doc = await abrirCon(dom, CONTRASENA);
    const visible = textoVisible(doc);
    expect(visible).not.toContain('MARCA-RESERVADA');
    expect(visible).not.toContain(t('exportaciones.copia.reservadas'));
    expect(visible).toContain('Luis Pérez');
    expect(visible).toContain(t('exportaciones.copia.exclusion'));
  }, 120_000);
});

type Derivacion = (c: Uint8Array, s: Uint8Array, k: unknown) => Uint8Array;
interface VentanaDelVisor {
  Nucleo: { argon2id: Derivacion };
  requestAnimationFrame: (f: (t: number) => void) => number;
  RangeError: RangeErrorConstructor;
}
const ventanaDe = (dom: JSDOM) => dom.window as unknown as VentanaDelVisor;
const enviar = (dom: JSDOM, contrasena: string) => {
  const doc = dom.window.document;
  doc.querySelector<HTMLInputElement>('input[type=password]')!.value = contrasena;
  doc.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
};
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('VISOR_JS · revisión del corte A', () => {
  it('A-H4: cifrada con la contraseña en NFC, abre tecleándola en NFD (otro sistema operativo)', async () => {
    const nfc = 'contraseña del año, ñandú';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    const { html } = await cifrarCopia(proyectar(respuestaProfesional()), nfc, derivarNativo);
    const doc = await abrirCon(cargar(html), nfd);
    expect(doc.querySelector('[role=alert]')?.textContent ?? '').toBe('');
    expect(doc.querySelector('.marca-linea')).not.toBeNull();
  }, 120_000);

  it('A-H5: la línea de la marca va justo después del h1, que es donde cae el foco', async () => {
    const doc = await abrirCon(cargar(await fichero(proyectar(respuestaProfesional()))), CONTRASENA);
    const h1 = doc.querySelector('h1')!;
    expect(doc.activeElement).toBe(h1);
    expect(h1.nextElementSibling?.className).toBe('marca-linea');
  }, 120_000);

  it('A-H6: con el visor bloqueado, «Abrir» vacía el aviso y lo vuelve a escribir para que se anuncie', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())), { sinSubtle: true });
    const alerta = dom.window.document.querySelector('[role=alert]')!;
    expect(alerta.textContent).toBe(t('exportaciones.visor.sinCrypto'));
    enviar(dom, CONTRASENA);
    expect(alerta.textContent).toBe('');
    await esperar(() => alerta.textContent !== '');
    expect(alerta.textContent).toBe(t('exportaciones.visor.sinCrypto'));
    expect(dom.window.document.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('');
  });

  it('A-H7: si derivar falla por memoria, no culpa a la contraseña', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())));
    const w = ventanaDe(dom);
    w.Nucleo.argon2id = () => {
      throw new w.RangeError('Array buffer allocation failed');
    };
    const doc = await abrirCon(dom, CONTRASENA);
    const aviso = doc.querySelector('[role=alert]')!.textContent;
    expect(aviso).toBe(t('exportaciones.visor.sinMemoria'));
    expect(aviso).not.toBe(t('exportaciones.visor.error'));
    const campo = doc.querySelector<HTMLInputElement>('input[type=password]')!;
    expect(doc.activeElement).toBe(campo);
    expect(campo.value).toBe('');
  });

  it('B-H3: una cabecera con m o t fuera de cota se da por dañada sin derivar nada', async () => {
    const html = await fichero(proyectar(respuestaProfesional()));
    for (const [de, a] of [
      ['"m":65536', '"m":7'],
      ['"m":65536', '"m":1048577'],
      ['"t":3', '"t":0'],
      ['"t":3', '"t":17'],
    ]) {
      const alterado = html.replace(de, a);
      expect(alterado, a).not.toBe(html);
      const alerta = cargar(alterado).window.document.querySelector('[role=alert]')!;
      expect(alerta.textContent, a).toBe(t('exportaciones.visor.danado'));
    }
  });

  it('B-H5: «Abriendo…» se pinta antes de derivar: la derivación espera a que pase un fotograma', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())));
    const w = ventanaDe(dom);
    const fotogramas: ((t: number) => void)[] = [];
    w.requestAnimationFrame = (f) => fotogramas.push(f);
    const original = w.Nucleo.argon2id;
    let derivaciones = 0;
    w.Nucleo.argon2id = (c, s, k) => {
      derivaciones++;
      return original(c, s, k);
    };
    enviar(dom, CONTRASENA);
    const doc = dom.window.document;
    expect(doc.querySelector('[role=status]')!.textContent).toBe(t('exportaciones.visor.abriendo'));
    await pausa(100);
    expect(derivaciones).toBe(0); // sin fotograma no hay pintado, y sin pintado no se deriva
    for (let n = 0; fotogramas.length > 0 && n < 10; n++) {
      fotogramas.shift()!(n * 16);
      await pausa(10);
    }
    await esperar(() => Boolean(doc.querySelector('.marca-linea')) || Boolean(doc.querySelector('[role=alert]')?.textContent));
    expect(derivaciones).toBe(1);
    expect(doc.querySelector('.marca-linea')).not.toBeNull();
  }, 120_000);
});

describe('VISOR_JS · la marca de agua', () => {
  it('tras descifrar hay una línea visible y una capa, y las dos llevan el código de la copia', async () => {
    const copia = proyectar(respuestaPacienteQueTraeDeMas());
    const dom = cargar(await fichero(copia));
    const doc = await abrirCon(dom, CONTRASENA);

    const linea = doc.querySelector('.marca-linea')!;
    expect(linea.textContent).toBe(
      `Copia ${ID_EXPORTACION} · exportada por Berta Ruiz (${t('roles.administrador')}) el ${copia.marca.fecha} · ${t('exportaciones.copia.motivos.peticion_paciente')}`,
    );
    expect(linea.closest('[aria-hidden]')).toBeNull(); // la línea la leen los lectores de pantalla

    const capa = doc.querySelector<HTMLElement>('.marca-capa')!;
    expect(capa).not.toBeNull();
    expect(capa.textContent).toContain(ID_EXPORTACION);
    expect(capa.textContent).toContain('Berta Ruiz');
    expect(capa.textContent).toContain(copia.marca.fecha);
  }, 120_000);

  it('la capa es aria-hidden, fija sobre toda la página y no captura eventos', async () => {
    const dom = cargar(await fichero(proyectar(respuestaProfesional())));
    const doc = await abrirCon(dom, CONTRASENA);
    const capa = doc.querySelector<HTMLElement>('.marca-capa')!;
    expect(capa.getAttribute('aria-hidden')).toBe('true');
    expect(capa.style.pointerEvents).toBe('none');
    expect(capa.style.position).toBe('fixed');
    expect([capa.style.top, capa.style.right, capa.style.bottom, capa.style.left]).toEqual(['0px', '0px', '0px', '0px']);
    expect(capa.style.overflow).toBe('hidden');
    expect(capa.querySelectorAll('*').length).toBeGreaterThan(10); // filas repetidas
  }, 120_000);

  it('A-H3: las filas cubren el bloque girado de una pantalla de 1920 o más (la cobertura se mide en Chromium)', async () => {
    const copia = proyectar(respuestaProfesional());
    const doc = await abrirCon(cargar(await fichero(copia)), CONTRASENA);
    const filas = Array.from(doc.querySelector('.marca-capa')!.firstElementChild!.children);
    const frase = [copia.marca.codigo, copia.marca.quien, copia.marca.fecha].join(' · ');
    // El bloque mide 2 × 1920 de ancho y de alto como mínimo: filas de 72 px y frases de más de 6 px por carácter.
    expect(filas.length).toBeGreaterThanOrEqual(Math.ceil((2 * 1920) / 72));
    for (const fila of filas) {
      expect(fila.textContent!.split(frase).length - 1).toBeGreaterThanOrEqual(Math.ceil((2 * 1920) / (frase.length * 6)));
    }
  }, 120_000);

  it('al imprimir, la capa sigue fija (sale en cada página)', async () => {
    const html = await fichero(proyectar(respuestaProfesional()));
    expect(html).toMatch(/@media print\{[^}]*\}?[^@]*\.marca-capa\{position:fixed!important;\}/);
  });
});

describe('VISOR_JS · es JavaScript plano y no pinta con HTML', () => {
  it('no usa innerHTML, outerHTML, insertAdjacentHTML ni document.write', () => {
    for (const prohibido of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/]) {
      expect(VISOR_JS, String(prohibido)).not.toMatch(prohibido);
    }
  });

  it('no usa sintaxis que un compilador baje con ayudantes, ni eval', () => {
    for (const prohibido of [
      /\bclass\s/,
      /\basync\b/,
      /\bawait\b/,
      /function\s*\*/,
      /\byield\b/,
      /\?\./,
      /\?\?/,
      /\bimport\b/,
      /\bexport\b/,
      /\beval\b/,
      /new\s+Function/,
      /<\/script/i,
      /<!--/,
    ]) {
      expect(VISOR_JS, String(prohibido)).not.toMatch(prohibido);
    }
  });
});
