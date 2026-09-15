#!/usr/bin/env node
// Guard de invariantes del proyecto (plantilla de la fábrica; `init.mjs` lo copia a .claude/guard.mjs).
// Lee .claude/guard.json y comprueba reglas por ruta. Corre como hook tras cada edición, en
// `npm run gate` y en CI. Sin dependencias a propósito: tiene que funcionar antes de que nada
// más funcione. Patrón tomado de pipeline/guard.mjs de Clinicalist.
//
//   node .claude/guard.mjs                 # todos los ficheros rastreados por git
//   node .claude/guard.mjs src/lib/x.ts    # solo esos (modo hook)
//   node .claude/guard.mjs --json
//
// .claude/guard.json:
// { "reglas": [ { "id": "SRV-01", "nivel": "error"|"aviso", "regla": 1,
//                 "donde": "^src/app/api/.*route\\.ts$",      ← regex sobre la ruta relativa (barras /)
//                 "busca": "createAdminClient",                ← si aparece, es violación
//                 "salvo": "// permitido:",                    ← si el fichero casa con esto, se perdona
//                 "exige": "no-store",                         ← al revés: si casa `donde`, DEBE contener esto
//                 "msg": "..." } ] }
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const objetivos = args.filter((a) => !a.startsWith("--"));
const cfgPath = path.join(ROOT, ".claude", "guard.json");
if (!existsSync(cfgPath)) { if (!JSON_OUT) console.log("guard: sin .claude/guard.json, nada que comprobar."); process.exit(0); }
let reglas = [];
try { reglas = JSON.parse(readFileSync(cfgPath, "utf8")).reglas || []; } catch (e) { console.error("guard: .claude/guard.json ilegible: " + e.message); process.exit(1); }
if (reglas.length === 0) process.exit(0);

let ficheros = objetivos;
if (ficheros.length === 0) {
  try { ficheros = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean); }
  catch { console.error("guard: fuera de un repo git y sin ficheros indicados"); process.exit(1); }
}
const hallazgos = [];
for (const f of ficheros) {
  const rel = path.relative(ROOT, path.resolve(ROOT, f)).replace(/\\/g, "/");
  if (!existsSync(path.resolve(ROOT, f))) continue;
  let txt; try { txt = readFileSync(path.resolve(ROOT, f), "utf8"); } catch { continue; }
  for (const r of reglas) {
    if (!new RegExp(r.donde).test(rel)) continue;
    if (r.salvo && new RegExp(r.salvo).test(txt)) continue;
    if (r.busca) {
      const re = new RegExp(r.busca, "g");
      let m; while ((m = re.exec(txt))) {
        const linea = txt.slice(0, m.index).split("\n").length;
        hallazgos.push({ id: r.id, nivel: r.nivel || "error", regla: r.regla, fichero: rel, linea, msg: r.msg });
      }
    }
    if (r.exige && !new RegExp(r.exige).test(txt)) hallazgos.push({ id: r.id, nivel: r.nivel || "error", regla: r.regla, fichero: rel, linea: 1, msg: r.msg });
  }
}
const errores = hallazgos.filter((h) => h.nivel === "error");
if (JSON_OUT) { console.log(JSON.stringify({ errores: errores.length, avisos: hallazgos.length - errores.length, hallazgos }, null, 2)); process.exit(errores.length ? 1 : 0); }
for (const h of hallazgos) console.log(`${h.nivel === "error" ? "✗" : "!"} ${h.fichero}:${h.linea}  [${h.id}${h.regla != null ? " · regla " + h.regla : ""}] ${h.msg}`);
if (hallazgos.length === 0) console.log("guard: sin violaciones.");
process.exit(errores.length ? 1 : 0);
