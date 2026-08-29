# Kimi · empieza aquí y no leas nada más todavía

Trabajas en **Psicogestión**, una aplicación de gestión clínica para consultas de
psicología en España. Tú **no** tocas la parte clínica. Se te han cortado cinco tickets de
código puro —sin base de datos, sin pantallas, sin datos de pacientes— precisamente para
que puedas trabajar sin conocer el dominio.

## Lo único que tienes que leer, en este orden

1. **Este fichero**, entero.
2. **`kimi/proyecto.md`** — el contexto mínimo: stack, comandos, convenciones.
3. **`kimi/guion.md`** — los pasos, en orden, sin saltarte ninguno.
4. **Tu ticket**, uno solo: `tickets/T-016-…`, `T-017-…`, `T-018-…`, `T-019-…` o `T-020-…`.

**Nada más.** No abras `docs/`, ni `CLAUDE.md`, ni `PLAN.md`, ni los otros tickets. No los
necesitas y contienen decisiones que no te corresponden.

## Las cinco reglas

1. **Nunca inventes.** Ni APIs, ni columnas, ni tipos, ni funciones de librería. Antes de
   afirmar que algo existe, **abre el fichero y míralo**. Si no lo has leído, no existe.
2. **El ticket es el contrato.** Nada fuera de su alcance, por tentador que sea.
3. **Nada está hecho sin evidencia.** Cada criterio se cierra pegando la **salida real**
   del comando. Un criterio que dice «funciona» y no trae salida, no está cerrado.
4. **Si necesitas salirte, párate.** No lo hagas «solo un momento». Lo escribes en
   `kimi/hallazgos/T-0XX.md` y **sigues con el resto del ticket**.
5. **No integres nada.** No hagas `merge`, ni `push` a `main`, ni cierres el ticket. Tu
   trabajo acaba en una rama con su informe. Lo revisa una persona.

## Fuera de límites — no escribir, y salvo lo dicho, no leer

| Ruta | Por qué |
|---|---|
| `supabase/` | Migraciones y RLS. Hay trabajo en curso ahí; un cambio tuyo lo rompe. **T-019 las lee, y solo lee.** |
| `docs/` | La memoria del proyecto y las decisiones cerradas. Las escribe otro. |
| `app/`, `components/` | Pantallas. Ningún ticket tuyo dibuja nada. **T-016 tiene tres excepciones, y solo tres**: puede **añadir** `app/login/esquemas.test.ts`, `app/(app)/pacientes/esquemas.test.ts` y un fichero de prueba en `components/ui/`. Los ficheros que prueban, no se tocan. |
| `app/prototipo/`, `diseño/` | Maqueta visual congelada. Se mira, no se toca — y tú ni la mires. |
| `tickets/`, `PLAN.md`, `CLAUDE.md`, `AGENTS.md` | El contrato. No se edita el contrato desde dentro. |
| `.claude/`, `kimi/verificar.mjs`, `kimi/alcance.json` | Herramienta y guardarraíl. Cambiarlos es hacer trampa al examen. |

Esto **no** es una recomendación: `node kimi/verificar.mjs T-0XX` lo comprueba y **falla**
si has tocado algo de esa lista. Ejecútalo antes de dar nada por terminado.

## Lo que sí puedes leer para trabajar

`lib/`, `components/ui/`, `app/(app)/`, `scripts/`, `package.json`, `tsconfig.json`,
`eslint.config.mjs`, `next.config.ts` y **tu** ticket. Con eso y `kimi/proyecto.md` tienes
todo lo que tu trabajo necesita.

## Hay otros dos carriles trabajando a la vez

Desde el 29-08 no eres el único: hay otro carril llevando la base de datos y otro llevando
la interfaz. **El reparto es por fichero y el tuyo no cambia** —`lib/identidad/`,
`lib/fechas/`, `lib/agenda/` y `scripts/lint-migraciones.ts` no los quiere nadie más—, pero
sí cambian dos cosas de tu día a día:

- **`main` se mueve mientras trabajas.** Si tu rama se queda atrás, se rebasa **sobre
  `main` y solo sobre `main`**, nunca sobre la rama de otro carril. Después de rebasar,
  `npm install` otra vez.
- **Un conflicto en `package-lock.json` no se resuelve a mano**: te quedas con el de
  `main`, reaplicas tu `package.json` y corres `npm install`. Editar un lock a mano produce
  árboles de dependencias que no existen.

Y una que no cambia pero ahora tiene un motivo más: **`components/ui/` ya no es tuyo**. La
excepción que tenías era de T-016 y está gastada. Ahora hay alguien dentro escribiendo las
primitivas; un cambio tuyo ahí choca de verdad, no en teoría.

## El orden de los tickets

**`T-016` va primero y bloquea a los otros cuatro**: instala el corredor de pruebas, y los
demás entregan pruebas que necesitan dónde correr. Después, `T-017`, `T-018` y `T-019` en
cualquier orden; `T-020` necesita que `T-018` esté hecho.

Uno cada vez. Una rama cada vez. No abras dos.
