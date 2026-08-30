#!/usr/bin/env node
// T-005 · `npm run test:huellas` — corredor de scripts/t005-concurrencia.sql: la única
// prueba de la cadena de huellas que necesita DOS CONEXIONES y por tanto datos
// confirmados, así que no puede vivir en el `begin … rollback` de test-rls.mjs.
//
// Requiere `npx supabase db reset` reciente (usa el profesional y el paciente de
// supabase/seed.sql) y CONFIRMA filas nuevas: no es idempotente, y volver a ejecutarlo
// sin resetear la base falla al repetir los mismos UUID — es la señal correcta.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ejecutarSql, localizarContenedor } from "./psql.mjs";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const guion = readFileSync(path.join(raiz, "t005-concurrencia.sql"), "utf8");

const contenedor = localizarContenedor();
console.log(`Contenedor: ${contenedor}`);

process.exit(ejecutarSql(contenedor, guion));
