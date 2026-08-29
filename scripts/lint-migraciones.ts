// Linter de migraciones: la regla 6 de la constitución («nada clínico ni
// económico se modifica ni se borra») comprobada como comando.
//
// Es ANÁLISIS ESTÁTICO DE TEXTO sobre los .sql de supabase/migrations/: no
// levanta Docker, no se conecta a Postgres, no aplica nada. Lee línea a
// línea, ignora comentarios y cadenas (un `delete from auditoria` dentro de
// un comentario no es una sentencia) y parte el fichero en sentencias para
// que las reglas no dependan de en qué línea cae cada palabra.
//
//   npm run lint:migraciones
//
// Devuelve 1 si hay hallazgos en reglas vigentes, 0 en caso contrario.
// Nunca lanza una excepción sin capturar.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// =========================================================================
// Tablas protegidas (regla 1)
//
// Tablas de SOLO ADICIÓN del invariante 2: un UPDATE, DELETE o TRUNCATE
// dirigido a cualquiera de ellas es un bug, no una optimización. Ampliar la
// lista es una línea; quitar una tabla es una decisión de arquitectura.
// =========================================================================
export const TABLAS_SOLO_ADICION: readonly string[] = [
  'auditoria',
  'notas_clinicas_versiones',
  'accesos_historia',
  'accesos_historia_vistas',
  'facturas',
];

// Reglas degradadas a aviso porque el código existente ya las incumple y su
// limpieza es de otro ticket (guion del ticket: «marca la regla como aviso
// hasta que su ticket la limpie»). Vacío = todas las reglas muerden.
export const REGLAS_EN_AVISO: ReadonlySet<number> = new Set<number>();

export interface Hallazgo {
  fichero: string;
  /** 1-based; 0 cuando el hallazgo no ancla a una línea. */
  linea: number;
  regla: number;
  mensaje: string;
}

// =========================================================================
// Preprocesado: de texto SQL a sentencias sin comentarios ni literales
// =========================================================================

interface Sentencia {
  /** Texto normalizado: minúsculas y espacios colapsados, sin ';' final. */
  texto: string;
  /** Línea (1-based) donde empieza la sentencia en el fichero original. */
  linea: number;
}

// Sustituye por espacios los comentarios y los literales (simples y
// dollar-quoted), conservando los saltos de línea para que el número de
// línea siga siendo el del fichero original.
function limpiarSql(contenido: string): string {
  const salida = contenido.split('');
  const n = contenido.length;
  let i = 0;

  const borrar = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta; k++) {
      if (salida[k] !== '\n') salida[k] = ' ';
    }
  };

  while (i < n) {
    const c = contenido[i];

    // Comentario de línea.
    if (c === '-' && contenido[i + 1] === '-') {
      let j = i;
      while (j < n && contenido[j] !== '\n') j++;
      borrar(i, j);
      i = j;
      continue;
    }

    // Comentario de bloque (Postgres los anida).
    if (c === '/' && contenido[i + 1] === '*') {
      let j = i + 2;
      let profundidad = 1;
      while (j < n && profundidad > 0) {
        if (contenido[j] === '/' && contenido[j + 1] === '*') {
          profundidad++;
          j += 2;
        } else if (contenido[j] === '*' && contenido[j + 1] === '/') {
          profundidad--;
          j += 2;
        } else {
          j++;
        }
      }
      borrar(i, j);
      i = j;
      continue;
    }

    // Cadena simple, con '' como escape.
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (contenido[j] === "'" && contenido[j + 1] === "'") {
          j += 2;
        } else if (contenido[j] === "'") {
          j++;
          break;
        } else {
          j++;
        }
      }
      borrar(i, j);
      i = j;
      continue;
    }

    // Bloque dollar-quoted: $$...$$ o $tag$...$tag$.
    if (c === '$') {
      const apertura = /^\$[A-Za-z_0-9]*\$/.exec(contenido.slice(i));
      if (apertura) {
        const etiqueta = apertura[0];
        const cierre = contenido.indexOf(etiqueta, i + etiqueta.length);
        const j = cierre === -1 ? n : cierre + etiqueta.length;
        borrar(i, j);
        i = j;
        continue;
      }
    }

    i++;
  }

  return salida.join('');
}

// Parte el SQL ya limpio en sentencias por ';', con su línea de inicio.
function extraerSentencias(contenidoLimpio: string): Sentencia[] {
  const sentencias: Sentencia[] = [];
  let inicioLinea = 1;
  let linea = 1;
  let actual = '';

  for (const c of contenidoLimpio) {
    if (c === ';') {
      const texto = actual.trim().toLowerCase().replace(/\s+/g, ' ');
      if (texto) sentencias.push({ texto, linea: inicioLinea });
      actual = '';
      inicioLinea = linea;
      continue;
    }
    if (c === '\n') {
      if (!actual.trim()) inicioLinea = linea + 1;
      linea++;
    }
    actual += c;
  }

  const resto = actual.trim().toLowerCase().replace(/\s+/g, ' ');
  if (resto) sentencias.push({ texto: resto, linea: inicioLinea });

  return sentencias;
}

// La línea anterior no vacía del fichero ORIGINAL: ahí es donde la regla 2
// exige el comentario `-- destructivo: <motivo>`.
function lineaAnteriorNoVacia(lineasOriginales: string[], linea: number): string {
  for (let k = linea - 2; k >= 0; k--) {
    const texto = lineasOriginales[k].trim();
    if (texto) return texto;
  }
  return '';
}

const ANUNCIO_DESTRUCTIVO = /^--\s*destructivo\s*:/i;

// =========================================================================
// Reglas 1-4: por fichero
// =========================================================================

export function analizarFichero(nombre: string, contenido: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const sentencias = extraerSentencias(limpiarSql(contenido));
  const lineasOriginales = contenido.split('\n');

  // --- Regla 1 · Solo adición -------------------------------------------
  const tablaTras = (patron: RegExp, s: Sentencia): string | null => {
    const m = patron.exec(s.texto);
    if (!m) return null;
    // El grupo captura la tabla con o sin `public.`.
    return m[1].replace(/^public\./, '');
  };

  for (const s of sentencias) {
    const tabla =
      tablaTras(/^update\s+(?:only\s+)?((?:public\.)?[a-z0-9_]+)\b/, s) ??
      tablaTras(/^delete\s+from\s+(?:only\s+)?((?:public\.)?[a-z0-9_]+)\b/, s) ??
      tablaTras(/^truncate\s+(?:table\s+)?(?:only\s+)?((?:public\.)?[a-z0-9_]+)\b/, s);

    if (tabla && TABLAS_SOLO_ADICION.includes(tabla)) {
      hallazgos.push({
        fichero: nombre,
        linea: s.linea,
        regla: 1,
        mensaje:
          `Escritura destructiva sobre «${tabla}», tabla de solo adición: una corrección ` +
          'es siempre un registro nuevo, nunca un UPDATE, un DELETE ni un TRUNCATE.',
      });
    }
  }

  // --- Regla 2 · Nada destructivo en un solo paso -------------------------
  const PATRONES_DESTRUCTIVOS: Array<{ patron: RegExp; que: string }> = [
    { patron: /\bdrop\s+table\b/, que: 'drop table' },
    { patron: /\bdrop\s+column\b/, que: 'drop column' },
    { patron: /\bdrop\s+type\b/, que: 'drop type' },
    {
      patron: /\balter\s+column\s+[a-z0-9_]+\s+(?:set\s+data\s+)?type\b/,
      que: 'alter column … type',
    },
  ];

  for (const s of sentencias) {
    let destructivo: string | null = null;
    for (const { patron, que } of PATRONES_DESTRUCTIVOS) {
      if (patron.test(s.texto)) {
        destructivo = que;
        break;
      }
    }
    // `set not null` solo muerde si la sentencia no da valor por defecto.
    if (
      !destructivo &&
      /\balter\s+column\s+[a-z0-9_]+\s+set\s+not\s+null\b/.test(s.texto) &&
      !/\bdefault\b/.test(s.texto)
    ) {
      destructivo = 'alter column … set not null sin valor por defecto';
    }
    if (!destructivo) continue;

    const anuncio = lineaAnteriorNoVacia(lineasOriginales, s.linea);
    if (!ANUNCIO_DESTRUCTIVO.test(anuncio)) {
      hallazgos.push({
        fichero: nombre,
        linea: s.linea,
        regla: 2,
        mensaje:
          `«${destructivo}» sin anunciar. Lo destructivo no se prohíbe: se exige un ` +
          'comentario `-- destructivo: <motivo>` en la línea anterior. Una migración ' +
          'destructiva silenciosa falla; una explicada, pasa.',
      });
    }
  }

  // --- Regla 3 · RLS de origen --------------------------------------------
  const creadas = new Map<string, number>();
  const protegidas = new Set<string>();
  for (const s of sentencias) {
    const creacion = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\b/.exec(
      s.texto,
    );
    if (creacion && !creadas.has(creacion[1])) creadas.set(creacion[1], s.linea);

    const habilitacion =
      /^alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security\b/.exec(
        s.texto,
      );
    if (habilitacion) protegidas.add(habilitacion[1]);
  }
  for (const [tabla, linea] of creadas) {
    if (!protegidas.has(tabla)) {
      hallazgos.push({
        fichero: nombre,
        linea,
        regla: 3,
        mensaje:
          `La tabla «${tabla}» se crea sin su \`alter table … enable row level security\` ` +
          'en el mismo fichero. Una tabla sin RLS en una base con RLS es una puerta ' +
          'abierta que nadie ve.',
      });
    }
  }

  // --- Regla 4 · search_path en security definer ---------------------------
  for (const s of sentencias) {
    if (
      /^create\s+(?:or\s+replace\s+)?function\b/.test(s.texto) &&
      /\bsecurity\s+definer\b/.test(s.texto) &&
      !/\bset\s+search_path\s*=/.test(s.texto)
    ) {
      hallazgos.push({
        fichero: nombre,
        linea: s.linea,
        regla: 4,
        mensaje:
          'Función `security definer` sin `set search_path` explícito: sin él, quien ' +
          'controle el search_path de la sesión elige qué código corre con privilegios ajenos.',
      });
    }
  }

  return hallazgos;
}

// =========================================================================
// Regla 5 · Nombres y orden del listado
// =========================================================================

const PATRON_NOMBRE = /^(\d{14})_[a-z0-9_]+\.sql$/;

export function analizarListado(nombres: string[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const vistos = new Map<string, string>();

  for (const nombre of nombres) {
    const m = PATRON_NOMBRE.exec(nombre);
    if (!m) {
      hallazgos.push({
        fichero: nombre,
        linea: 0,
        regla: 5,
        mensaje:
          'El nombre no sigue `AAAAMMDDHHMMSS_descripcion_en_castellano.sql` ' +
          '(minúsculas, sin acentos ni mayúsculas).',
      });
      continue;
    }

    const sello = m[1];
    const anterior = vistos.get(sello);
    if (anterior) {
      hallazgos.push({
        fichero: nombre,
        linea: 0,
        regla: 5,
        mensaje:
          `Sello temporal ${sello} repetido: también lo usa «${anterior}». Dos migraciones ` +
          'con el mismo sello se aplican en orden indefinido.',
      });
    } else {
      vistos.set(sello, nombre);
    }
  }

  const sellos = [...vistos.keys()];
  const ordenados = [...sellos].sort();
  if (sellos.some((s, i) => s !== ordenados[i])) {
    hallazgos.push({
      fichero: nombres[0] ?? '',
      linea: 0,
      regla: 5,
      mensaje:
        'Los sellos temporales no son estrictamente crecientes en el orden de los ' +
        'ficheros: el orden de aplicación dejaría de ser el orden de lectura.',
    });
  }

  return hallazgos;
}

// =========================================================================
// Regla 6 · Sin ediciones hacia atrás (contra `main`, vía git)
// =========================================================================

/** Devuelve el contenido de la migración en `main`, o null si allí no existe. */
export type LectorEnMain = (nombre: string) => string | null;
export type LectorActual = (nombre: string) => string;

export function analizarEdiciones(
  nombres: string[],
  leerEnMain: LectorEnMain,
  leerActual: LectorActual,
): Hallazgo[] {
  // Se compara con los finales de línea normalizados: en Windows con
  // autocrlf el disco guarda CRLF y git guarda LF del mismo fichero.
  const normalizar = (texto: string) => texto.replace(/\r\n/g, '\n');
  const hallazgos: Hallazgo[] = [];
  for (const nombre of nombres) {
    const enMain = leerEnMain(nombre);
    if (enMain === null) continue; // migración nueva: aún no se ha aplicado en ningún sitio
    if (normalizar(enMain) !== normalizar(leerActual(nombre))) {
      hallazgos.push({
        fichero: nombre,
        linea: 0,
        regla: 6,
        mensaje:
          'La migración ya existe en `main` y su contenido ha cambiado. Una migración ' +
          'aplicada en algún sitio ya no se edita: se enmienda con otra.',
      });
    }
  }
  return hallazgos;
}

// =========================================================================
// El comando
// =========================================================================

const DIRECTORIO_MIGRACIONES = path.join('supabase', 'migrations');

function lectorGit(): LectorEnMain {
  return (nombre) => {
    try {
      // La ruta va con barras SIEMPRE: git no acepta los separadores de Windows
      // en `main:<ruta>`, y un fallo aquí se confundiría con «no existe en main».
      return execFileSync('git', ['show', `main:supabase/migrations/${nombre}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  };
}

function gitDisponible(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'main'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function main(): number {
  let nombres: string[];
  try {
    nombres = readdirSync(DIRECTORIO_MIGRACIONES)
      .filter((n) => n.endsWith('.sql'))
      .sort();
  } catch {
    console.error(`error: no se puede leer ${DIRECTORIO_MIGRACIONES}/`);
    return 1;
  }

  const hallazgos: Hallazgo[] = analizarListado(nombres);

  for (const nombre of nombres) {
    let contenido: string;
    try {
      contenido = readFileSync(path.join(DIRECTORIO_MIGRACIONES, nombre), 'utf8');
    } catch {
      console.error(`error: no se puede leer ${path.join(DIRECTORIO_MIGRACIONES, nombre)}`);
      return 1;
    }
    hallazgos.push(...analizarFichero(nombre, contenido));
  }

  // Regla 6: si git no está disponible, se salta con aviso y no rompe el comando.
  if (gitDisponible()) {
    hallazgos.push(
      ...analizarEdiciones(nombres, lectorGit(), (nombre) =>
        readFileSync(path.join(DIRECTORIO_MIGRACIONES, nombre), 'utf8'),
      ),
    );
  } else {
    console.log('aviso: git no está disponible; la regla 6 (ediciones hacia atrás) se salta.');
  }

  if (hallazgos.length === 0) {
    console.log(`lint-migraciones: ${nombres.length} migración(es) limpias.`);
    return 0;
  }

  let errores = 0;
  for (const h of hallazgos) {
    const esAviso = REGLAS_EN_AVISO.has(h.regla);
    if (!esAviso) errores++;
    const donde = h.linea > 0 ? `${h.fichero}:${h.linea}` : h.fichero;
    console.log(`${esAviso ? 'aviso' : 'error'} · ${donde} · regla ${h.regla} — ${h.mensaje}`);
  }

  console.log(
    errores > 0
      ? `\nlint-migraciones: ${errores} error(es) en reglas de la constitución.`
      : `\nlint-migraciones: solo avisos (${hallazgos.length}).`,
  );
  return errores > 0 ? 1 : 0;
}

// Punto de entrada: solo cuando se ejecuta como comando, no al importarlo
// desde las pruebas.
if (process.argv[1] && /lint-migraciones\.ts$/.test(process.argv[1])) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`error inesperado: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
