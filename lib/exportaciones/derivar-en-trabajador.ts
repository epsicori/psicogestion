'use client';
// T-040 · Argon2id fuera del hilo principal (D3): 1–5 s de cálculo congelarían la interfaz.
// El Worker se crea desde un Blob con el MISMO núcleo que va en el fichero (`scriptDelNucleo()`)
// y un pegamento mínimo; sin eval ni new Function. En los dos caminos se termina el Worker y se
// revoca la URL del Blob.
import type { Derivar } from './cifrar';
import { scriptDelNucleo } from './nucleo-js';

const PEGAMENTO = `
self.onmessage = function (e) {
  var d = e.data;
  try {
    var clave = Nucleo.argon2id(d.contrasena, d.sal, d.kdf);
    self.postMessage({ ok: true, clave: clave });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
`;

interface Respuesta {
  ok: boolean;
  clave?: Uint8Array;
  error?: string;
}

export const derivarEnTrabajador: Derivar = (contrasena, sal, kdf) =>
  new Promise<Uint8Array>((resolver, rechazar) => {
    const url = URL.createObjectURL(
      new Blob([scriptDelNucleo(), '\n', PEGAMENTO], { type: 'text/javascript' }),
    );
    let trabajador: Worker;
    try {
      trabajador = new Worker(url);
    } catch (e) {
      URL.revokeObjectURL(url);
      rechazar(e);
      return;
    }
    const cerrar = () => {
      trabajador.terminate();
      URL.revokeObjectURL(url);
    };
    trabajador.onmessage = (e: MessageEvent<Respuesta>) => {
      cerrar();
      const r = e.data;
      if (r && r.ok && r.clave) resolver(new Uint8Array(r.clave));
      else rechazar(new Error(r && r.error ? r.error : 'derivarEnTrabajador: respuesta inválida'));
    };
    trabajador.onerror = (e: ErrorEvent) => {
      cerrar();
      rechazar(new Error(e.message || 'derivarEnTrabajador: el trabajador falló'));
    };
    trabajador.postMessage({ contrasena: new Uint8Array(contrasena), sal: new Uint8Array(sal), kdf: { ...kdf } });
  });
