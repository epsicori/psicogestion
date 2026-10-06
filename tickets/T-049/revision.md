Sin hallazgos ALTA (y sin MEDIA): 0 ALTA, 0 MEDIA, 2 BAJA.

# T-049 · Revisión (un revisor, riesgo medio)

Diff revisado: `git diff ab6c959 90f8cf1` (rama `T-049-fechas-del-banco-rls`). Son 11 ficheros, +286/−31, y todos están dentro del territorio (`territorio.mjs T-049` → 0).
Todas las mediciones se hicieron con el lint, que solo lee, o dentro de `begin … rollback`. CA3 se midió sobre una copia en el scratchpad. No he confirmado nada en la base.

## Hallazgos

### BAJA

**H1 · `scripts/rls/fechas-fijas.mjs:69`: el lint solo reconoce el formato `AAAA-MM-DD` con ceros, pero Postgres acepta otras formas de la misma fecha.**
- **Qué pasa:** `reLiteral = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g` no casa con `'2027-1-5'`, `'20270105'` ni `make_date(2027,1,5)`. Lo he medido: Postgres acepta las tres (`select date '2027-1-5', timestamptz '20270105 10:00+01', make_date(2027,1,5)` → `2027-01-05`).
- **Escenario:** un módulo futuro inserta una cita con `timestamptz '2027-1-5 10:00+01'`. El lint da 0, `test:rls` arranca, y el 05-01-2027 el banco vuelve a caer con el 42501 de «Una cita pasada» (la clase de fallo de T-049).
- **Alcance:** hoy no hay ningún caso así en `scripts/rls/`. El README (l.115) es exacto: dice «marca todo literal `AAAA-MM-DD`». Pero el contrato presenta el lint como el cierre «anti-recurrencia» de esta clase de fallo.
- **Qué falta:** una línea en el punto 10 del README que diga qué formas no caza, o ampliar el patrón.

**H2 · `scripts/rls/fechas-fijas.mjs:76-77`: si el argumento es un directorio, el lint sale con código 1 y una traza, en vez de 2.**
- **Qué pasa:** `existsSync` da verdadero para un directorio, y luego `readFileSync` lanza `EISDIR` sin capturar.
- **Escenario:** `node scripts/rls/fechas-fijas.mjs scripts/rls` da una traza de Node y código 1. El código 1 es el de «hay literales sin anotar», mientras que el diseño (§5) reserva el 2 para los errores de uso. Quien lea solo el código ve un fallo de anotación que no existe.
- **Efecto:** menor. `test-rls.mjs` no pasa argumentos y no da un falso 0.

## Repaso de §5 «Qué revisar» y de los puntos del encargo

**Entradas del llamante**
- `--hoy` sin valor → 2. `--hoy 2026-02-30` → 2. Fichero inexistente → 2.
- Ejecutado desde otra carpeta → el mismo resultado (0), porque toma los ficheros de `dirRls` y no del `cwd`.
- `test-rls.mjs` no añade argumentos. El lint corre siempre, sin opción para saltarlo.

**CA3 (gemela con `current_date - 7`, módulos 00-15)**
- Código 3, con `d15=2026-09-29`.
- Cae una sola aserción: «Mover una cita encima de otra por la funcion CHOCA igual», con 42501 en lugar de 23P01 y el mensaje «Una cita pasada no se puede reprogramar ni reatribuir». Es exactamente lo que pide §5.

**CA6**
- Salen exactamente las 15 líneas: 104 107 108 117 118 128 138 152 167 180 209 212 213 215 496. No sobra ni falta ninguna.

**CA7 y los bordes de la anotación**
- Las anotaciones que caen (código 1):
  - `-- fecha-fija:` vacía;
  - con solo espacios;
  - dos líneas antes del literal;
  - en la línea siguiente.
- El código mira solo la misma línea y la anterior, ni más atrás ni más adelante.

**Patrón**
- Casa con `'2026-10-06T10:00'`.
- No casa dentro de un UUID.
- Descarta `2026-02-30` mediante la ida y vuelta por `Date.UTC`, y no descarta las fechas válidas.
- Lo que no ve está en H1.

**Umbral**
- `hoy` sale de `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid'})`, no de `toISOString()`.
- Con `m[0] < hoy` se salta el literal, así que hoy cuenta como futuro.

**Lanzador**
- `spawnSync(process.execPath, [...])` se ejecuta sin `shell: true`.
- `exit(lint.status ?? 1)`: un `status` nulo (señal o error de `spawnSync`) da 1, y un 2 del lint sigue siendo 2.
- El lint corre antes de `localizarContenedor()`.

**CA11**
- Con un `0-trampa.sql` que lleva `2099-01-01` sin anotar: código 1, la lista `0-trampa.sql:1: 2099-01-01` y ningún `Contenedor:`.
- Sin el fichero del lint, el banco también se corta.

**La anotación como coladero (punto 1 del encargo)**
- Revisé las 24 anotaciones con `grep -n -A1 "fecha-fija:"`.
- En `26-economico.sql` hay 15 (l.182, 216, 610, 614, 616, 626, 633, 637, 641, 645, 653, 657, 666, 1456 dentro de `$f$`, y 1650). Todas tocan `bonos`, `bonos_caducidades`, `bonos_consumo` o `tarifas_paciente`, es decir, caducidades y tarifas.
- En `01-fijacion.sql` hay 1, sobre `bonos_caducidades`.
- En `27-exportaciones.sql` hay 8, sobre `creada_en` de `notas_clinicas_versiones` y `sobre_prueba`.
- Ninguna escribe en `citas`, `series_cita`, `propuestas_cita` ni `disponibilidad`, y ninguna llama a `agenda_crear_*` ni a `agenda_actualizar_cita`.

**15-agenda.sql**
- No queda ningún literal: `grep -cE '20[0-9]{2}-…'` → 0, y los comentarios tampoco tienen ninguno.
- Las plantillas `$sql$` y la de la l.504 (antes l.496) conservan su texto; solo cambia el instante.
- `instante15` es `stable`.
- Cada cita conserva su día: la base cae en martes (offset 0), el 1 es miércoles y el 2 jueves.
- Los recuentos de `assert*` y de códigos esperados son idénticos antes y después (diff vacío), lo que respalda CA2.
- No hay franjas de PRO1 entre D+14 y D+22 en los módulos 16-28 (punto 5 del encargo):
  - 16 escribe en D+3, en D+10 y en D+40..68;
  - C6FUT, en D+20, es de PRO2/CB;
  - 14 usa su propio `c_pro1` alrededor de `now()`;
  - 21:429 cae entre D−1 y D+13;
  - 23 cae en Y+4;
  - 18 usa PRO18.

**17, 19 y 26**
- Solo cambian el ancla (Y+7, Y+8 e Y+6, guardadas con `\gset`), las inserciones que la usan y las anotaciones.
- 19 sigue a las 10:00 de Madrid, ahora con `at time zone 'Europe/Madrid'` y sin el `+01` escrito a mano.
- Que las citas de 26 queden detrás de la caducidad 2031-12-31 no altera nada: ninguna migración compara `caducidad` por orden.
- `fn_alta_tarifa` solo aplica la guarda de fecha cuando `v_max` no es nulo, y K13 (TEC1) sigue dando 42501 por RLS.

**CA8 (greps del README)**
- Coinciden con el árbol:
  - ancla de 15: l.26;
  - 16: l.702, 1257 y 1271-1275;
  - 18: l.377;
  - años propios: 16:50 (+1), 17:26 (+7), 19:97 (+8), 21:37 (+3), 23:194/198 (+4) y 26:191 (+6).

**Base compartida**
- No hay ningún `db reset` ni `seed` en el diff ni en la bitácora.
- `docs/state.md` está reescrito (42 líneas). Main no lo tocó después de la base común.

**Gobierno**
- El diff no toca `tickets/`, `.claude/` ni `CLAUDE.md`.
