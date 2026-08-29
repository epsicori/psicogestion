#!/usr/bin/env node
// T-003 · Banco de pruebas de RLS. Concatena scripts/rls/*.sql en el host —el contenedor
// de la base no tiene el árbol del repositorio montado, así que `\i` dentro de él no
// encontraría los ficheros— y lo manda por stdin a `psql` con -v ON_ERROR_STOP=1, para que
// cualquier aserción rota (`raise exception`) haga que psql salga con código distinto de
// cero. El contenedor se localiza con `docker ps`, nunca de memoria: si el proyecto cambia
// de nombre, el nombre fijo dejaría de encontrarlo sin avisar.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const dirRls = path.join(raiz, "rls");

function localizarContenedor() {
  const salida = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  const candidato = salida
    .split(/\r?\n/)
    .find((nombre) => /^supabase_db_/.test(nombre.trim()));
  if (!candidato) {
    throw new Error(
      "No se encuentra ningún contenedor supabase_db_* en ejecución. " +
        "¿Está la base local levantada (`npx supabase start`)?",
    );
  }
  return candidato.trim();
}

function ficherosSql() {
  return readdirSync(dirRls)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dirRls, f));
}

const contenedor = localizarContenedor();
const ficheros = ficherosSql();

if (ficheros.length === 0) {
  console.error(`No hay ficheros .sql en ${dirRls}`);
  process.exit(1);
}

console.log(`Contenedor: ${contenedor}`);
console.log(`Módulos (${ficheros.length}): ${ficheros.map((f) => path.basename(f)).join(", ")}`);

// Todo el banco corre dentro de UNA transacción con rollback al final: cada módulo confía
// en los datos que fijó 01-fijacion.sql y en las funciones de sesión de pg_temp (00), que
// solo viven dentro de la conexión que las creó. Concatenar y mandarlo todo por el mismo
// `psql -f -` es lo que mantiene una sola conexión, y por tanto un solo `pg_temp`.
const guion =
  "begin;\n" +
  ficheros.map((f) => readFileSync(f, "utf8")).join("\n\n") +
  "\nrollback;\n";

const resultado = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    contenedor,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-",
  ],
  { input: guion, stdio: ["pipe", "inherit", "inherit"], encoding: "utf8" },
);

if (resultado.error) {
  console.error(resultado.error);
  process.exit(1);
}

process.exit(resultado.status ?? 1);
