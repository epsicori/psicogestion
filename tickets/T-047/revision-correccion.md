Sin hallazgos ALTA.

# T-047 · Revisión de corrección · ronda 2

- Rama `T-047-agenda-anual`, HEAD `3847b2985c2dc0aac7bd2ec554fdb177b8ee16df`.
- Delta revisado: `git diff 47abe5f..3847b29` (5 commits). La base del ticket sigue siendo `main` local `91b4df3`.
- Comprobaciones propias (no leídas de la evidencia):
  - Banco 00 + 01 + 34 en un `begin … rollback` sobre la base compartida: código 0, 92 `OK`, 4 min 21 s.
  - Mutante S-H3 medido por mí (sin el filtro de rol en la rama `citas` de `agenda_profesionales_anuales`,
    `create or replace` dentro de la misma transacción): psql sale con código 3 en
    «F7: TEC1 con p_centro_id = CB no recibe ningún profesional». Coincide con `mutantes.json`.
  - `npx supabase gen types typescript --local` en un fichero aparte: idéntico a `lib/supabase/tipos-bd.ts`.
  - `vitest` de `calendario-anio.test.tsx` y `page.test.tsx`: 22/22 en verde. `tsc --noEmit`: limpio.
  - `fechas-fijas.mjs`: limpio. El ancla del año está en `34:45` y el README lo dice ahora.

## Hallazgos de la ronda 1

| Id | Estado | Comprobación |
|---|---|---|
| C-H1 (MEDIA) | **Cerrado** | `page.tsx:88`: `if (!lista.ok) return <AvisoDeError …/>`, como pide D20. La prueba nueva de `page.test.tsx` mata el mutante: sin la guarda, `BloqueAnio` devuelve `CalendarioAnio` y fallan tanto `type` como `props.mensaje`. |
| C-H2 (MEDIA) | **Cerrado** | `tickets/T-047/mutantes.json` está en la rama, con M1–M12, M9L, S-H3, S-H4 y L-CENTRO. Todos mueren por una aserción con nombre y sin supervivientes. Medí S-H3 por mi cuenta y da lo mismo. |
| C-H3 (BAJA) | **Cerrado** | `tipos-bd.ts` regenerado: solo cambia el orden alfabético de `agenda_descartar_propuesta`. Mi `gen types` coincide byte a byte. |
| C-H4 (BAJA) | **Cerrado** | `calendario-anio.test.tsx:209`: en el tope del año exige `tabulables == [dia]`. Con un mutante que lleve `fechaFoco` a 2027-01-01, la lista queda vacía y la prueba falla. |
| C-H5 (BAJA) | **Cerrado** | Dos pruebas nuevas con salto entre cuadrículas: del 28-03 al 4-04 con flecha abajo, y del 31-03 al 1-04 con flecha derecha, con `tabIndex` 0 en el destino. El patrón `/, 4 de abril/` no coincide con el 14 ni con el 24. |

## Lo nuevo de la ronda

- Fijación del banco: `C34TECB` (TEC1 como profesional de una cita de CB) y `PRO34S` con una única cita
  `C34SINPRO`, que no tiene centro. Ninguna aserción anterior se rompe. D1 y D3 («ningún otro día con
  citas de TEC1») también la cubren ahora. El módulo 35 solo consulta citas por id, así que no hereda nada.
- F6 y F7 tienen gemela, y cada negativa nombra al sujeto exacto. F7 incluye además la densidad del 15-03.
- A6 pasa a `assert_lanza_codigo_msg` con `function <nombre>`.
- La spec de Playwright espera a `a[data-dia]` antes de medir. Así evita medir el esqueleto, que mide 0 de alto.

## BAJA

### H1 · `scripts/rls/34-agenda-anual.sql:13` · prueba
La cabecera del banco ya no describe su propia fijación. Dice que los perfiles propios son PRO34A, B, C y N
(falta PRO34S) y que «TEC1 (centro A) solo aparece como profesional en una cita, C34TEC», cuando desde
esta ronda también es profesional de `C34TECB`, en CB.
- Escenario: quien añada una aserción en el bloque del administrador fiándose de la cabecera, por ejemplo
  «como ADM, `total34('Europe/Madrid', null, TEC1) = 1`», la verá fallar con 2. El administrador sí ve la
  cita de CB. Tendrá que descubrir leyendo los `insert` que la cabecera miente. Hoy no hay ninguna
  aserción que dependa de la frase; el riesgo es para la próxima.
