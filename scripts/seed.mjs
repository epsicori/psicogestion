#!/usr/bin/env node
// T-008 · `npm run seed` — siembra completa de desarrollo.
//
// Manda supabase/seed-completo.sql por stdin a psql dentro del contenedor, con la misma
// cáscara que test-rls.mjs y verificar-huellas.mjs (scripts/psql.mjs): el contenedor no
// tiene el árbol del repositorio montado, así que `\i` dentro de él no encontraría el
// fichero, y el nombre del contenedor se localiza con `docker ps` en vez de fijarlo.
//
// NO envuelve el guion en una transacción, a diferencia del banco de pruebas: aquí la
// siembra tiene que QUEDARSE. `ON_ERROR_STOP=1` (lo pone ejecutarSql) hace que cualquier
// error corte con código distinto de cero, y el propio SQL es idempotente, así que
// reintentar tras un fallo a medias es seguro.
//
// Exige que `supabase/seed.sql` haya corrido antes —lo hace cada `npx supabase db reset`—:
// la siembra completa cuelga de la organización, del Centro Madrid y de Ana y Bruno. Si
// falta, se avisa aquí con el motivo en vez de dejar que psql escupa una violación de
// clave ajena que no explica nada.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { ejecutarSql, localizarContenedor } from "./psql.mjs";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const fichero = path.join(raiz, "..", "supabase", "seed-completo.sql");

const contenedor = localizarContenedor();

const cuenta = execFileSync(
  "docker",
  [
    "exec", "-i", contenedor,
    "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
    "select count(*) from public.perfiles where id = '11111111-1111-4111-8111-111111111111';",
  ],
  { encoding: "utf8" },
).trim();

if (cuenta !== "1") {
  console.error(
    "La siembra mínima (supabase/seed.sql) no está aplicada: no existe el perfil de Ana.\n" +
      "Corre `npx supabase db reset` antes de `npm run seed`.",
  );
  process.exit(1);
}

console.log(`Contenedor: ${contenedor}`);
console.log(`Sembrando ${path.basename(fichero)}…`);

const salida = ejecutarSql(contenedor, readFileSync(fichero, "utf8"));

if (salida === 0) {
  console.log("seed: completado. Tabla de credenciales en docs/state.md §Siembra de desarrollo.");
}

process.exit(salida);
