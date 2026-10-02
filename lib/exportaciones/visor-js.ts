// T-040 · El visor que va DENTRO del fichero (diseño §1.3 y contrato de la marca de agua).
//
// JavaScript plano ES2017 en una cadena: no lo toca ningún compilador, así que nada de sintaxis
// que se baje con ayudantes (async/await, clases, `?.`, `??`). Se ejecuta tras el núcleo
// (`var Nucleo = …`), en el mismo <script>, con la CSP del fichero (sin red, sin eval).
//
// Reglas que comprueba `visor-js.test.ts`:
//   - pinta SOLO con createElement + textContent: nada de innerHTML ni document.write (un cuerpo
//     con <img onerror> sale como texto);
//   - los datos asociados son los bytes EXACTOS de la cabecera tal como vienen en el fichero;
//   - tras descifrar, la marca de agua: una línea visible (la leen los lectores de pantalla) y
//     una capa aria-hidden, fija y sin eventos, con el código de la copia repetido.
//     Disuade y rastrea; no impide copiar.
export const VISOR_JS: string = `(function () {
  'use strict';
  var doc = document;
  var raiz = doc.getElementById('visor');

  function leerJson(id) {
    var nodo = doc.getElementById(id);
    if (!nodo) return null;
    try { return { texto: nodo.textContent, valor: JSON.parse(nodo.textContent) }; } catch (e) { return null; }
  }

  var textosLeidos = leerJson('textos');
  var T = textosLeidos && textosLeidos.valor ? textosLeidos.valor : {};
  function tx(clave) { return typeof T[clave] === 'string' ? T[clave] : ''; }

  function el(etiqueta, clase, texto) {
    var n = doc.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    return n;
  }
  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function sustituir(plantilla, valores) {
    return plantilla.replace(/\\{(\\w+)\\}/g, function (todo, clave) {
      return Object.prototype.hasOwnProperty.call(valores, clave) ? String(valores[clave]) : todo;
    });
  }

  function deBase64(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var B64 = /^[A-Za-z0-9+/]*={0,2}$/;

  // La cabecera: se valida antes de derivar nada. Sus bytes son los datos asociados.
  function leerCabecera() {
    var c = leerJson('cabecera');
    var carga = leerJson('carga');
    if (!c || !carga || typeof carga.valor !== 'string' || !B64.test(carga.valor)) return null;
    var v = c.valor;
    if (!v || v.formato !== 'psicogestion.copia-nota' || v.formato_version !== 1) return null;
    if (v.cifrado !== 'argon2id-aes-256-gcm' || !v.kdf) return null;
    var k = v.kdf;
    // R2-H4: la v1 escribe siempre estos parámetros (constantes.ts, y la base los exige como
    // literales). Otros no son de una copia v1: fichero dañado o no admitido, sin derivar nada.
    if (k.m !== 65536 || k.t !== 3 || k.p !== 1 || k.longitud !== 32) return null;
    if (typeof k.sal !== 'string' || typeof v.nonce !== 'string' || !B64.test(k.sal) || !B64.test(v.nonce)) return null;
    var sal, nonce, cifrado;
    try { sal = deBase64(k.sal); nonce = deBase64(v.nonce); cifrado = deBase64(carga.valor); } catch (e) { return null; }
    if (sal.length !== 16 || nonce.length !== 12 || cifrado.length < 16) return null;
    return { bytes: c.texto, kdf: { m: k.m, t: k.t, p: 1, longitud: 32 }, sal: sal, nonce: nonce, cifrado: cifrado };
  }

  // --- La pantalla de apertura -----------------------------------------------------------
  var titulo = el('h1', null, tx('titulo'));
  titulo.tabIndex = -1;
  var explicacion = el('p', null, tx('explicacion'));
  var form = el('form');
  form.setAttribute('novalidate', '');
  var etiqueta = el('label', null, tx('contrasena'));
  etiqueta.htmlFor = 'contrasena-copia';
  var campo = el('input');
  campo.type = 'password';
  campo.id = 'contrasena-copia';
  campo.autocomplete = 'off';
  campo.required = true;
  var boton = el('button', null, tx('abrir'));
  boton.type = 'submit';
  var estado = el('p');
  estado.setAttribute('role', 'status');
  var alerta = el('p');
  alerta.setAttribute('role', 'alert');
  form.appendChild(etiqueta);
  form.appendChild(campo);
  form.appendChild(boton);
  raiz.appendChild(titulo);
  raiz.appendChild(explicacion);
  raiz.appendChild(form);
  raiz.appendChild(estado);
  raiz.appendChild(alerta);

  var sutil = window.crypto && window.crypto.subtle ? window.crypto.subtle : null;
  var cabecera = leerCabecera();
  var bloqueo = !sutil ? tx('sinCrypto') : (!cabecera ? tx('danado') : '');
  if (bloqueo) alerta.textContent = bloqueo;
  var ocupado = false;

  function fallar(mensaje) {
    ocupado = false;
    boton.disabled = false;
    estado.textContent = '';
    alerta.textContent = mensaje;
    campo.value = '';
    campo.focus();
  }

  // Un texto igual al que ya hay en role="alert" no se anuncia: se vacía y se escribe en el
  // siguiente tick.
  function avisarDeNuevo(mensaje) {
    alerta.textContent = '';
    setTimeout(function () { alerta.textContent = mensaje; }, 0);
  }

  // Argon2id bloquea el hilo segundos: primero tiene que pintarse «Abriendo…». Un fotograma
  // y el siguiente garantizan que el navegador ya pintó; sin requestAnimationFrame, un tick.
  function trasPintar(f) {
    if (typeof window.requestAnimationFrame !== 'function') { setTimeout(f, 0); return; }
    window.requestAnimationFrame(function () { window.requestAnimationFrame(f); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ocupado) return;
    if (bloqueo) { campo.value = ''; avisarDeNuevo(bloqueo); return; }
    var contrasena = campo.value;
    campo.value = '';
    ocupado = true;
    boton.disabled = true;
    alerta.textContent = '';
    estado.textContent = tx('abriendo');
    trasPintar(function () {
      // R2-H4: «sin memoria» solo si falla la reserva misma (64 MiB); cualquier otro fallo de
      // Argon2id no es del dispositivo.
      var memoria;
      try {
        memoria = new Uint32Array(4 * Math.floor(cabecera.kdf.m / 4) * 256);
      } catch (e) {
        contrasena = '';
        fallar(tx('sinMemoria'));
        return;
      }
      var bytesClave;
      try {
        bytesClave = Nucleo.argon2id(new TextEncoder().encode(contrasena.normalize('NFC')), cabecera.sal, cabecera.kdf, memoria);
      } catch (e) {
        contrasena = '';
        memoria = null;
        fallar(tx('error'));
        return;
      }
      memoria = null;
      contrasena = '';
      sutil.importKey('raw', bytesClave, { name: 'AES-GCM' }, false, ['decrypt'])
        .then(function (clave) {
          bytesClave.fill(0);
          return sutil.decrypt(
            { name: 'AES-GCM', iv: cabecera.nonce, additionalData: new TextEncoder().encode(cabecera.bytes), tagLength: 128 },
            clave,
            cabecera.cifrado
          );
        })
        .then(function (claro) {
          var copia;
          try { copia = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(claro)); } catch (e) { fallar(tx('danado')); return; }
          if (!copia || copia.formato !== 'psicogestion.copia-nota' || copia.formato_version !== 1 || !copia.marca || !Array.isArray(copia.versiones)) {
            fallar(tx('danado'));
            return;
          }
          pintar(copia);
        }, function () { fallar(tx('error')); });
    });
  });

  // --- La copia ----------------------------------------------------------------------------
  function texto(x) { return typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : ''); }

  function lista(pares) {
    var dl = el('dl');
    for (var i = 0; i < pares.length; i++) {
      if (pares[i][1] === null || pares[i][1] === undefined || pares[i][1] === '') continue;
      dl.appendChild(el('dt', null, pares[i][0]));
      var dd = el('dd', pares[i][2] || null, texto(pares[i][1]));
      dl.appendChild(dd);
    }
    return dl;
  }

  function capaDeMarca(marca) {
    var capa = el('div', 'marca-capa');
    capa.setAttribute('aria-hidden', 'true');
    var s = capa.style;
    s.position = 'fixed';
    s.top = '0px';
    s.right = '0px';
    s.bottom = '0px';
    s.left = '0px';
    s.pointerEvents = 'none';
    s.overflow = 'hidden';
    s.zIndex = '2147483647';
    s.opacity = '0.12';
    s.setProperty('print-color-adjust', 'exact');
    s.setProperty('-webkit-print-color-adjust', 'exact');
    var giro = el('div');
    giro.style.position = 'absolute';
    giro.style.top = '-50%';
    giro.style.left = '-50%';
    giro.style.width = '200%';
    giro.style.height = '200%';
    giro.style.transform = 'rotate(-30deg)';
    // R2-H2: las filas van centradas en el bloque girado (que gira sobre el centro de la ventana),
    // en los dos ejes y desbordando por igual a cada lado. Si después la ventana crece, el centro
    // sigue siendo el mismo y las filas siguen cruzándolo: sin oyente de resize.
    giro.style.display = 'flex';
    giro.style.flexDirection = 'column';
    giro.style.justifyContent = 'center';
    giro.style.alignItems = 'center';
    var frase = [texto(marca.codigo), texto(marca.quien), texto(marca.fecha)].join(' · ');
    // A-H3: el bloque girado mide el doble de la ventana y la contiene girada; cada fila tiene que
    // llegar de un borde a otro de ese bloque, a cualquier ancho. Se dimensiona para el lado mayor
    // de la pantalla (no solo de la ventana: puede agrandarse), con 1920 de suelo, y la frase se
    // estima a 6 px por carácter (a 14 px mide más), así que sobra.
    var lado = Math.max(1920, window.innerWidth || 0, window.innerHeight || 0,
      window.screen ? Math.max(window.screen.width || 0, window.screen.height || 0) : 0);
    var porFila = Math.ceil((2 * lado) / (Math.max(frase.length, 20) * 6)) + 1;
    var filas = Math.ceil((2 * lado) / 72) + 2;
    var trozos = [];
    for (var r = 0; r < porFila; r++) trozos.push(frase);
    var linea = trozos.join('     ');
    for (var i = 0; i < filas; i++) {
      var fila = el('div', null, linea);
      fila.style.whiteSpace = 'nowrap';
      fila.style.fontSize = '14px';
      fila.style.lineHeight = '72px';
      fila.style.color = '#000';
      giro.appendChild(fila);
    }
    capa.appendChild(giro);
    return capa;
  }

  function pintarVersion(v, E) {
    var sec = el('section');
    sec.appendChild(el('h2', null, sustituir(E.version || '', { numero: v.numero })));
    sec.appendChild(lista([
      [E.alcance, v.alcanceEtiqueta],
      [E.autor, v.autor],
      [E.firmadaEn, v.firmadaEn],
      [E.sello, v.sello],
      [E.motivoCambio, v.motivoCambio],
      [E.huella, v.huella, 'huella'],
      [E.huellaAnterior, v.huellaAnterior, 'huella']
    ]));
    if (Array.isArray(v.participantes)) {
      sec.appendChild(el('h3', null, E.participantes));
      var ul = el('ul');
      for (var i = 0; i < v.participantes.length; i++) {
        var p = v.participantes[i] || {};
        ul.appendChild(el('li', null, texto(p.nombre) + (p.papel ? ' (' + texto(p.papel) + ')' : '')));
      }
      sec.appendChild(ul);
    }
    if (Object.prototype.hasOwnProperty.call(v, 'texto')) {
      sec.appendChild(el('h3', null, E.texto));
      sec.appendChild(el('div', 'texto', v.texto ? texto(v.texto) : E.textoVacio));
    }
    if (Object.prototype.hasOwnProperty.call(v, 'reservadas')) {
      sec.appendChild(el('h3', null, E.reservadas));
      sec.appendChild(el('div', 'texto', v.reservadas ? texto(v.reservadas) : E.sinReservadas));
    }
    if (Object.prototype.hasOwnProperty.call(v, 'contenidoCanonico')) {
      sec.appendChild(el('h3', null, E.contenidoCanonico));
      sec.appendChild(el('div', 'canonico', texto(v.contenidoCanonico)));
    }
    return sec;
  }

  function pintar(copia) {
    var E = copia.etiquetas || {};
    var m = copia.marca;
    vaciar(raiz);
    var h1 = el('h1', null, texto(copia.titulo));
    h1.tabIndex = -1;
    raiz.appendChild(h1);
    // Justo después del h1, donde cae el foco: quien lee hacia delante la oye lo primero.
    raiz.appendChild(el('p', 'marca-linea', sustituir(tx('marcaLinea'), {
      codigo: texto(m.codigo), quien: texto(m.quien), rol: texto(m.rol), fecha: texto(m.fecha), motivo: texto(m.motivo)
    })));
    var paciente = copia.paciente || {};
    var nota = copia.nota || {};
    raiz.appendChild(lista([
      [E.paciente, [texto(paciente.nombre), texto(paciente.apellidos)].join(' ').trim()],
      [E.fechaSesion, nota.fechaSesion],
      [E.modalidad, nota.modalidad],
      [E.proyeccion, copia.proyeccionEtiqueta],
      [E.motivo, copia.motivoEtiqueta],
      [E.referencia, copia.referencia],
      [E.generadaEn, copia.generadaEn],
      [E.zona, copia.zona]
    ]));
    if (Array.isArray(copia.avisos) && copia.avisos.length) {
      var avisos = el('div', 'avisos');
      for (var i = 0; i < copia.avisos.length; i++) avisos.appendChild(el('p', null, texto(copia.avisos[i])));
      raiz.appendChild(avisos);
    }
    for (var j = 0; j < copia.versiones.length; j++) raiz.appendChild(pintarVersion(copia.versiones[j] || {}, E));
    if (typeof copia.formula === 'string') {
      raiz.appendChild(el('h2', null, E.formulaTitulo));
      raiz.appendChild(el('p', 'canonico', copia.formula));
    }
    raiz.appendChild(el('p', 'avisos', tx('avisoImpresion')));
    doc.body.appendChild(capaDeMarca(m));
    ocupado = false;
    h1.focus();
  }
})();
`;
