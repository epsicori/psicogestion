// T-040 · El núcleo criptográfico de la copia (diseño §1.3 y D3).
//
// Es UNA CADENA, no código del módulo: el mismo texto que prueba `nucleo-js.test.ts` es el que
// va en línea dentro del `.html` y el que corre en el `Worker` de la aplicación. Si fuera una
// función del módulo, el compilador de Next podría reescribirla con ayudantes externos y lo
// probado no sería lo entregado (D3).
//
// JavaScript ES2017 plano: sin `class`, `async`, generadores, `BigInt` ni nada que un compilador
// baje con ayudantes. La aritmética de 64 bits va en pares de palabras de 32 (baja, alta).
//
// - BLAKE2b (RFC 7693), sin clave, salida de 1 a 64 bytes.
// - Argon2id (RFC 9106), versión 0x13, SOLO p = 1 (D14): con otro `p` lanza. Sin secreto ni
//   datos asociados. Síncrono.
//
// Firma: argon2id(contrasena: Uint8Array, sal: Uint8Array, {m, t, p, longitud}) → Uint8Array.

export const NUCLEO_JS: string = `
'use strict';

var IV32 = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
  0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19
]);

var SIGMA = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
  11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
  7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
  9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
  2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
  12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
  13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
  6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
  10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
];

/* Sin instanceof: el núcleo puede correr en otro reino (Worker, vm). */
function esBytes(x) { return Object.prototype.toString.call(x) === '[object Uint8Array]'; }

var bV = new Uint32Array(32);
var bM = new Uint32Array(32);

/* v[a] += v[b] (64 bits) */
function sumaVV(v, a, b) {
  var lo = v[a] + v[b];
  var hi = v[a + 1] + v[b + 1];
  if (lo >= 0x100000000) hi++;
  v[a] = lo;
  v[a + 1] = hi;
}

/* v[a] += (lo, hi) (64 bits) */
function sumaVC(v, a, lo0, hi0) {
  var lo = v[a] + lo0;
  var hi = v[a + 1] + hi0;
  if (lo >= 0x100000000) hi++;
  v[a] = lo;
  v[a + 1] = hi;
}

function gBlake(a, b, c, d, ix, iy) {
  var v = bV;
  var x0 = bM[ix], x1 = bM[ix + 1], y0 = bM[iy], y1 = bM[iy + 1];
  var o0, o1;
  sumaVV(v, a, b);
  sumaVC(v, a, x0, x1);
  o0 = v[d] ^ v[a]; o1 = v[d + 1] ^ v[a + 1];
  v[d] = o1; v[d + 1] = o0;
  sumaVV(v, c, d);
  o0 = v[b] ^ v[c]; o1 = v[b + 1] ^ v[c + 1];
  v[b] = (o0 >>> 24) ^ (o1 << 8); v[b + 1] = (o1 >>> 24) ^ (o0 << 8);
  sumaVV(v, a, b);
  sumaVC(v, a, y0, y1);
  o0 = v[d] ^ v[a]; o1 = v[d + 1] ^ v[a + 1];
  v[d] = (o0 >>> 16) ^ (o1 << 16); v[d + 1] = (o1 >>> 16) ^ (o0 << 16);
  sumaVV(v, c, d);
  o0 = v[b] ^ v[c]; o1 = v[b + 1] ^ v[c + 1];
  v[b] = (o1 >>> 31) ^ (o0 << 1); v[b + 1] = (o0 >>> 31) ^ (o1 << 1);
}

function comprimirBlake(h, bloque, desde, contador, ultimo) {
  var i, s;
  for (i = 0; i < 16; i++) { bV[i] = h[i]; bV[i + 16] = IV32[i]; }
  bV[24] = bV[24] ^ (contador >>> 0);
  bV[25] = bV[25] ^ Math.floor(contador / 0x100000000);
  if (ultimo) { bV[28] = ~bV[28]; bV[29] = ~bV[29]; }
  for (i = 0; i < 32; i++) {
    s = desde + 4 * i;
    bM[i] = bloque[s] ^ (bloque[s + 1] << 8) ^ (bloque[s + 2] << 16) ^ (bloque[s + 3] << 24);
  }
  for (i = 0; i < 12; i++) {
    s = i * 16;
    gBlake(0, 8, 16, 24, 2 * SIGMA[s], 2 * SIGMA[s + 1]);
    gBlake(2, 10, 18, 26, 2 * SIGMA[s + 2], 2 * SIGMA[s + 3]);
    gBlake(4, 12, 20, 28, 2 * SIGMA[s + 4], 2 * SIGMA[s + 5]);
    gBlake(6, 14, 22, 30, 2 * SIGMA[s + 6], 2 * SIGMA[s + 7]);
    gBlake(0, 10, 20, 30, 2 * SIGMA[s + 8], 2 * SIGMA[s + 9]);
    gBlake(2, 12, 22, 24, 2 * SIGMA[s + 10], 2 * SIGMA[s + 11]);
    gBlake(4, 14, 16, 26, 2 * SIGMA[s + 12], 2 * SIGMA[s + 13]);
    gBlake(6, 8, 18, 28, 2 * SIGMA[s + 14], 2 * SIGMA[s + 15]);
  }
  for (i = 0; i < 16; i++) h[i] = h[i] ^ bV[i] ^ bV[i + 16];
}

/* BLAKE2b sin clave, de una sola vez. longitud en bytes, de 1 a 64 (64 por omisión). */
function blake2b(entrada, longitud) {
  if (longitud === undefined) longitud = 64;
  if (!esBytes(entrada)) throw new Error('blake2b: la entrada tiene que ser Uint8Array');
  if (longitud < 1 || longitud > 64 || longitud !== Math.floor(longitud)) throw new Error('blake2b: longitud fuera de rango');
  var h = new Uint32Array(16);
  var i;
  for (i = 0; i < 16; i++) h[i] = IV32[i];
  h[0] = h[0] ^ 0x01010000 ^ longitud;
  var n = entrada.length;
  var desde = 0;
  var contador = 0;
  while (n - desde > 128) {
    contador += 128;
    comprimirBlake(h, entrada, desde, contador, false);
    desde += 128;
  }
  var ultimo = new Uint8Array(128);
  ultimo.set(entrada.subarray(desde));
  contador += n - desde;
  comprimirBlake(h, ultimo, 0, contador, true);
  var salida = new Uint8Array(longitud);
  for (i = 0; i < longitud; i++) salida[i] = h[i >> 2] >>> (8 * (i & 3));
  return salida;
}

/* ---------------------------------------------------------------- Argon2id (RFC 9106) */

function le32(n) {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concatenar(partes) {
  var total = 0, i, desde = 0;
  for (i = 0; i < partes.length; i++) total += partes[i].length;
  var salida = new Uint8Array(total);
  for (i = 0; i < partes.length; i++) { salida.set(partes[i], desde); desde += partes[i].length; }
  return salida;
}

/* H' de longitud variable (RFC 9106 §3.3). */
function hPrima(x, longitud) {
  var entrada = concatenar([le32(longitud), x]);
  if (longitud <= 64) return blake2b(entrada, longitud);
  var r = Math.ceil(longitud / 32) - 2;
  var salida = new Uint8Array(longitud);
  var v = blake2b(entrada, 64);
  salida.set(v.subarray(0, 32), 0);
  for (var i = 1; i < r; i++) {
    v = blake2b(v, 64);
    salida.set(v.subarray(0, 32), i * 32);
  }
  v = blake2b(v, longitud - 32 * r);
  salida.set(v, r * 32);
  return salida;
}

/* Parte alta (32 bits) del producto de dos enteros sin signo de 32 bits. */
function mulAlta(a, b) {
  var a0 = a & 0xffff, a1 = a >>> 16, b0 = b & 0xffff, b1 = b >>> 16;
  var p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  var medio = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
  return (p11 + (p01 >>> 16) + (p10 >>> 16) + (medio >>> 16)) >>> 0;
}

/* v[x] = v[x] + v[y] + 2 * baja(v[x]) * baja(v[y])  (fBlaMka, 64 bits) */
function blaMka(v, x, y) {
  var xl = v[x], yl = v[y];
  var x0 = xl & 0xffff, x1 = xl >>> 16, y0 = yl & 0xffff, y1 = yl >>> 16;
  var p00 = x0 * y0, p01 = x0 * y1, p10 = x1 * y0, p11 = x1 * y1;
  var medio = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
  var pBaja = ((p00 & 0xffff) | (medio << 16)) >>> 0;
  var pAlta = p11 + (p01 >>> 16) + (p10 >>> 16) + (medio >>> 16);
  var dAlta = ((pAlta << 1) | (pBaja >>> 31)) >>> 0;
  var dBaja = (pBaja << 1) >>> 0;
  var baja = xl + yl + dBaja;
  var acarreo = (baja / 0x100000000) | 0;
  v[x] = baja;
  v[x + 1] = v[x + 1] + v[y + 1] + dAlta + acarreo;
}

function gArgon(v, a, b, c, d) {
  var o0, o1;
  blaMka(v, a, b);
  o0 = v[d] ^ v[a]; o1 = v[d + 1] ^ v[a + 1];
  v[d] = o1; v[d + 1] = o0;
  blaMka(v, c, d);
  o0 = v[b] ^ v[c]; o1 = v[b + 1] ^ v[c + 1];
  v[b] = (o0 >>> 24) ^ (o1 << 8); v[b + 1] = (o1 >>> 24) ^ (o0 << 8);
  blaMka(v, a, b);
  o0 = v[d] ^ v[a]; o1 = v[d + 1] ^ v[a + 1];
  v[d] = (o0 >>> 16) ^ (o1 << 16); v[d + 1] = (o1 >>> 16) ^ (o0 << 16);
  blaMka(v, c, d);
  o0 = v[b] ^ v[c]; o1 = v[b + 1] ^ v[c + 1];
  v[b] = (o1 >>> 31) ^ (o0 << 1); v[b + 1] = (o0 >>> 31) ^ (o1 << 1);
}

/* La ronda de BLAKE2b sin mensaje sobre 16 palabras de 64 bits (índices de Uint32 ya dobles). */
function ronda(v, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15) {
  gArgon(v, a0, a4, a8, a12);
  gArgon(v, a1, a5, a9, a13);
  gArgon(v, a2, a6, a10, a14);
  gArgon(v, a3, a7, a11, a15);
  gArgon(v, a0, a5, a10, a15);
  gArgon(v, a1, a6, a11, a12);
  gArgon(v, a2, a7, a8, a13);
  gArgon(v, a3, a4, a9, a14);
}

var R = new Uint32Array(256);
var Z = new Uint32Array(256);

/* Out[oo..] = G(X[xo..], Y[yo..]), y con conXor además XOR del valor anterior de Out. */
function compresionG(X, xo, Y, yo, Out, oo, conXor) {
  var j, b;
  for (j = 0; j < 256; j++) R[j] = X[xo + j] ^ Y[yo + j];
  if (conXor) { for (j = 0; j < 256; j++) Z[j] = R[j] ^ Out[oo + j]; }
  else { for (j = 0; j < 256; j++) Z[j] = R[j]; }
  for (j = 0; j < 8; j++) {
    b = 32 * j;
    ronda(R, b, b + 2, b + 4, b + 6, b + 8, b + 10, b + 12, b + 14,
      b + 16, b + 18, b + 20, b + 22, b + 24, b + 26, b + 28, b + 30);
  }
  for (j = 0; j < 8; j++) {
    b = 4 * j;
    ronda(R, b, b + 2, b + 32, b + 34, b + 64, b + 66, b + 96, b + 98,
      b + 128, b + 130, b + 160, b + 162, b + 192, b + 194, b + 224, b + 226);
  }
  for (j = 0; j < 256; j++) Out[oo + j] = Z[j] ^ R[j];
}

function aBloque(bytes, memoria, indice) {
  var base = indice * 256;
  for (var j = 0; j < 256; j++) {
    var s = 4 * j;
    memoria[base + j] = bytes[s] ^ (bytes[s + 1] << 8) ^ (bytes[s + 2] << 16) ^ (bytes[s + 3] << 24);
  }
}

function deBloque(memoria, indice) {
  var base = indice * 256;
  var bytes = new Uint8Array(1024);
  for (var j = 0; j < 1024; j++) bytes[j] = memoria[base + (j >> 2)] >>> (8 * (j & 3));
  return bytes;
}

function entero(n, min, max) {
  return typeof n === 'number' && n === Math.floor(n) && n >= min && n <= max;
}

function argon2id(contrasena, sal, k) {
  if (!esBytes(contrasena) || !esBytes(sal)) {
    throw new Error('argon2id: la contraseña y la sal tienen que ser Uint8Array');
  }
  if (!k || k.p !== 1) throw new Error('argon2id: este núcleo solo admite p = 1');
  var m = k.m, t = k.t, longitud = k.longitud;
  if (!entero(m, 8, 4194304)) throw new Error('argon2id: m fuera de rango');
  if (!entero(t, 1, 64)) throw new Error('argon2id: t fuera de rango');
  if (!entero(longitud, 4, 1024)) throw new Error('argon2id: longitud fuera de rango');
  if (sal.length < 8) throw new Error('argon2id: la sal es demasiado corta');

  var h0 = blake2b(concatenar([
    le32(1), le32(longitud), le32(m), le32(t), le32(0x13), le32(2),
    le32(contrasena.length), contrasena,
    le32(sal.length), sal,
    le32(0), le32(0)
  ]), 64);

  var columnas = 4 * Math.floor(m / 4);
  var segmento = columnas / 4;
  var memoria = new Uint32Array(columnas * 256);

  var semilla = new Uint8Array(72);
  semilla.set(h0, 0);
  aBloque(hPrima(semilla, 1024), memoria, 0);
  semilla[64] = 1;
  aBloque(hPrima(semilla, 1024), memoria, 1);

  var cero = new Uint32Array(256);
  var entrada = new Uint32Array(256);
  var direcciones = new Uint32Array(256);

  function siguientesDirecciones() {
    entrada[12] = entrada[12] + 1;
    if (entrada[12] === 0) entrada[13] = entrada[13] + 1;
    compresionG(cero, 0, entrada, 0, direcciones, 0, false);
    compresionG(cero, 0, direcciones, 0, direcciones, 0, false);
  }

  for (var pasada = 0; pasada < t; pasada++) {
    for (var corte = 0; corte < 4; corte++) {
      var independiente = pasada === 0 && corte < 2;
      if (independiente) {
        entrada.fill(0);
        entrada[0] = pasada;
        entrada[2] = 0;
        entrada[4] = corte;
        entrada[6] = columnas;
        entrada[8] = t;
        entrada[10] = 2;
      }
      var inicio = 0;
      if (pasada === 0 && corte === 0) {
        inicio = 2;
        if (independiente) siguientesDirecciones();
      }
      for (var i = inicio; i < segmento; i++) {
        var actual = corte * segmento + i;
        var anterior = actual === 0 ? columnas - 1 : actual - 1;
        var j1;
        if (independiente) {
          if (i % 128 === 0) siguientesDirecciones();
          j1 = direcciones[2 * (i % 128)];
        } else {
          j1 = memoria[anterior * 256];
        }
        var area = pasada === 0 ? corte * segmento + i - 1 : columnas - segmento + i - 1;
        var relativa = area - 1 - mulAlta(area, mulAlta(j1, j1));
        var desde = (pasada === 0 || corte === 3) ? 0 : (corte + 1) * segmento;
        var referencia = (desde + relativa) % columnas;
        compresionG(memoria, anterior * 256, memoria, referencia * 256, memoria, actual * 256, pasada !== 0);
      }
    }
  }

  var final = deBloque(memoria, columnas - 1);
  memoria.fill(0);
  var clave = hPrima(final, longitud);
  final.fill(0);
  return clave;
}

return { argon2id: argon2id, blake2b: blake2b };
`;

/** El núcleo listo para ir en línea: define la variable global `Nucleo`. */
export function scriptDelNucleo(): string {
  return 'var Nucleo = (function(){' + NUCLEO_JS + '})();';
}
