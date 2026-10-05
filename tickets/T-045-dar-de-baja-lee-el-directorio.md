---
id: T-045
titulo: Dar de baja (y reponer TOTP) listan a las personas desde directorio_perfiles, no desde perfiles
modelo: sonnet
riesgo: bajo            # lectura de una vista que ya se concede a todo authenticated; sin base, sin RLS, sin acción nueva
fase: 1
prioridad: alta         # hoy el administrador no puede dar de baja a nadie desde la interfaz
depende_de: []          # no reutiliza código de T-041 (ver Notas); se integra antes o después
estado: pendiente
delegable: no
territorio:
  - app/(app)/ajustes/perfiles-activos.ts         # nueva
  - app/(app)/ajustes/perfiles-activos.test.ts    # nueva
  - app/(app)/ajustes/dar-de-baja/page.tsx
  - app/(app)/ajustes/reponer-totp/page.tsx       # salvo que P1 diga que no
  - lib/i18n/es.ts                                # solo la clave de las Notas
  - docs/bitacora/T-045.md
  - docs/state.md
---

# Contexto

Hallazgo de la verificación de T-041 (`docs/state.md`, «`/ajustes/dar-de-baja` lista vacía»).

`app/(app)/ajustes/dar-de-baja/page.tsx:26-30` lee `perfiles`. La única política de lectura de
`perfiles` es `perfiles_lectura_propia`, `using (id = (select auth.uid()))`
(`supabase/migrations/20260815192424_base_perfiles_pacientes_auditoria.sql:165-169`). Ninguna
migración posterior añade otra: `20260822160000_rls_funciones_y_politicas.sql:821-825` lo deja
escrito, y la migración de T-041 tampoco la toca. El administrador se ve solo a sí mismo. La página
lo quita de la lista (`filter(perfil.id !== sesion.usuario.id)`) y el desplegable sale **vacío**.
Si la lectura falla, cae en `data ?? []` y se pinta igual de vacío.

**`app/(app)/ajustes/reponer-totp/page.tsx:27-31` tiene la misma consulta**, línea por línea. Es el
mismo defecto: el administrador no puede reponer el TOTP de nadie (ADR-039, «Reponer el TOTP sí lo
puede hacer el administrador»). Este contrato lo incluye (ver P1). En el resto de `app/`, `lib/` y
`components/`, las lecturas de `perfiles` son de la fila propia (`.eq('id', usuario.id)`) y están
bien: `agenda/datos.ts:40`, `agenda/nueva/estado-alta.ts:47` y `armazon/armazon.tsx:48`.

**Medido el 05-10-2026** en la base local, con `begin … rollback` y las credenciales de
`admin@psicogestion.test` (`b0080001-0000-4000-8000-000000000001`): `perfiles` activos = **1** y
`directorio_perfiles` activos = **5** (Álvaro, Ana, Bruno, Teresa y un «Prueba Verificador» que
dejó la verificación de T-041).

El arreglo es leer `directorio_perfiles`, como `/ajustes/centros` en la ronda 2 de T-041 (commit
`192a4ce` de la rama `worktree-agent-ae6f460142344cc25`, `app/(app)/ajustes/centros/carga.ts:61-68`).
La vista está en `20260822160000_rls_funciones_y_politicas.sql:1390-1405`: definer,
`security_barrier`, filas visibles para todo perfil con `rol_actual()` no nulo y columnas
`id, nombre_completo, rol, estado, centro_id`. No lleva `motivo_estado`. **No se expone nada
nuevo:** la vista ya se concede a `authenticated`, y las dos páginas siguen siendo de administrador
(`estadoDeCuenta` y `redirect`). Lo que manda sigue en las RPC (ADR-032, ADR-039).

No es pantalla nueva ni cambia lo que dibuja: el mismo desplegable, ahora con datos. Sin choque con
la matriz ni con el prototipo.

## Tareas

- [ ] `app/(app)/ajustes/perfiles-activos.ts` (nuevo): `cargarPerfilesActivos`, con la firma de las
      Notas.
- [ ] `dar-de-baja/page.tsx` y `reponer-totp/page.tsx`: sustituir la consulta en línea por
      `cargarPerfilesActivos`. Si devuelve `{ ok: false }`, pintar el error, nunca un desplegable
      vacío.
- [ ] Una clave en `lib/i18n/es.ts`.
- [ ] `perfiles-activos.test.ts` con los casos de las Notas.
- [ ] Al cerrar: quitar de `docs/state.md` el hallazgo «`/ajustes/dar-de-baja` lista vacía» y
      escribir `docs/bitacora/T-045.md`.

## Criterios de aceptación (verificables)

- [ ] **Automático**: `npx vitest run "app/(app)/ajustes/perfiles-activos.test.ts"` pasa con los
      cuatro casos de las Notas (C1 a C4).
- [ ] **Automático, la prueba que falla si se vuelve a leer `perfiles`**: estas cuatro mutaciones,
      aplicadas de una en una y revertidas, hacen caer la prueba nombrada. La salida de cada una va a
      la evidencia:
      - M1: en `cargarPerfilesActivos`, `from('directorio_perfiles')` → `from('perfiles')`. Cae C1,
        con `leidas` = `['perfiles']`.
      - M2: en `dar-de-baja/page.tsx`, volver a la consulta en línea sobre `perfiles` sin llamar al
        cargador. Cae C4 (la misma mutación en `reponer-totp/page.tsx`, también C4).
      - M3: quitar `.eq('estado', 'activo')`. Cae C1.
      - M4: con error, devolver `{ ok: true, perfiles: [] }`. Cae C2.
- [ ] **Automático**: la diferencia que arregla el ticket, medida en la base (`db reset` + `seed`):
      ```bash
      C=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
      printf '%s\n' "begin;" "set local role authenticated;" \
        "select set_config('request.jwt.claims', '{\"sub\":\"b0080001-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}', true);" \
        "select 'perfiles', count(*) from public.perfiles where estado = 'activo';" \
        "select 'directorio', count(*) from public.directorio_perfiles where estado = 'activo';" \
        "rollback;" | docker exec -i "$C" psql -U postgres -d postgres -t -A
      ```
      Sale `perfiles|1` y `directorio|4` sobre la siembra limpia (Álvaro, Ana, Bruno y Teresa;
      Bárbara está de baja). Es una medición, no una prueba nueva del banco.
- [ ] **Automático**: `npm test`, `npm run lint` y `npm run build` verdes, incluido
      `sin-literales.test.ts`.
- [ ] **Automático**: `git diff --stat main -- supabase/ scripts/rls/` vacío.
- [ ] **Manual (navegador, administrador sembrado)**: ver el guion, pasos 1-3.
- [ ] **Manual**: `/ajustes/reponer-totp` igual (guion, paso 4).
- [ ] **Manual**: con otro rol (`ana@psicogestion.test`), `/ajustes/dar-de-baja` y
      `/ajustes/reponer-totp` siguen redirigiendo a `/ajustes` (no cambia).

## Guion de comprobación manual

Con `npx supabase db reset`, `npm run seed` y `npm run dev`. El modo local del segundo factor
(`.env.local`) puede seguir activo.

1. En `/login`, entra con `admin@psicogestion.test` / `psico1234`.
2. Ajustes › «Dar de baja». Abre el desplegable «Usuario». Debes ver **Ana Márquez, Bruno Ferrer y
   Teresa Técnica**, por orden alfabético. **No** deben salir Álvaro Administrador (tú) ni Bárbara
   Baja (ya de baja).
3. **No pulses «Dar de baja» ni «Confirmar»**: la baja no se deshace (ADR-032) y obliga a otro
   `db reset`.
4. Ajustes › «Reponer TOTP»: la misma lista. **No confirmes**: el factor sembrado de esa persona se
   borraría.

## Notas para el agente

**Por qué puede ir solo, sin T-041.** `cargarAltas` (`centros/carga.ts` en la rama de T-041) es
propia de esa pantalla: une `directorio_perfiles` con `perfiles_centros`, `centros` y
`organizacion`, y filtra por dos roles. No exporta nada genérico que importar. De T-041 se copia el
**patrón**, no el código:

- cargador puro que recibe `supabase`;
- `{ ok: false }` ante un error de lectura;
- descartar las filas con columnas nulas, porque la vista las declara todas anulables
  (`lib/supabase/tipos-bd.ts:2803-2810`);
- cliente simulado que apunta las tablas leídas (`centros/carga.test.ts:21-39` en esa rama).

Ese cliente simulado se **copia** en `perfiles-activos.test.ts`, con un comentario que diga de dónde
sale. Unificarlo cuando los dos estén en `main` no entra aquí. Ficheros compartidos con T-041: solo
`lib/i18n/es.ts`, y en otro bloque (ver la clave). T-041 sí toca `ajustes/acciones.ts` y
`ajustes/page.tsx`, y por eso este ticket no los toca.

**Firma** (`app/(app)/ajustes/perfiles-activos.ts`, sin `'use server'` ni `'use client'`):

```ts
import type { OpcionDesplegable } from '@/components/ui/desplegable';
import type { Sesion } from '@/lib/cuentas/tipos';

export type CargaDePerfilesActivos = { ok: true; perfiles: OpcionDesplegable[] } | { ok: false };

/** Personas activas a las que el administrador puede aplicar una acción, sin él mismo. */
export async function cargarPerfilesActivos(
  supabase: Sesion['supabase'],
  propioId: string,
): Promise<CargaDePerfilesActivos>;
```

- Consulta exacta:
  `supabase.from('directorio_perfiles').select('id, nombre_completo').eq('estado', 'activo').order('nombre_completo')`.
  Solo esas dos columnas: `rol` y `centro_id` no se usan, así que no se bajan.
- Con `error`: `console.error('cargarPerfilesActivos: fallo al leer directorio_perfiles', error)`
  y `{ ok: false }`.
- Filas con `id` o `nombre_completo` nulos: fuera. Después, fuera la de `propioId`. El orden es el
  de la consulta, y se mapea a `{ valor: id, etiqueta: nombre_completo }`.
- **No** filtra por rol: hoy se lista a todo activo menos uno mismo, y quien decide si la baja
  procede (por ejemplo, la del último administrador) es la base (comentario de
  `dar-de-baja/page.tsx:12-16`). Ese comportamiento no cambia.

**Páginas**: en las dos, `CargaDelFormulario` conserva `exigirSesion`, `estadoDeCuenta` y el
`redirect` tal cual. Después:

```tsx
const carga = await cargarPerfilesActivos(sesion.supabase, sesion.usuario.id);
if (!carga.ok) {
  return <p role="alert" className="text-destructive text-sm">{t('ajustes.resultados.errorLecturaUsuarios')}</p>;
}
return <FormularioDarDeBaja perfiles={carga.perfiles} />;   // FormularioReponerTotp en la otra
```

El `role="alert"` y sus clases son los de `centros/page.tsx` en T-041. Las comillas dobles de
`t("baja.titulo")` y `t("totp.titulo")` en esas páginas no se tocan: no es parte del ticket.

**Clave**: `ajustes.resultados.errorLecturaUsuarios: 'No se ha podido cargar la lista de usuarios. Recarga la página para intentarlo de nuevo.'`,
detrás de `error` en `ajustes.resultados` (`lib/i18n/es.ts:143`, aprox.). Queda fuera de los dos
tramos que cambia T-041 (líneas 125-131 y 154-172 de `main`).

**Casos de `perfiles-activos.test.ts`**:

- **C1**: con un directorio de tres filas activas (una es `propioId`), `leidas` es **exactamente**
  `['directorio_perfiles']` (`toEqual`, no `toContain`). Además, los filtros incluyen
  `['eq', 'estado', 'activo']`, el resultado es `ok`, salen las dos ajenas en el orden recibido y no
  sale la propia.
- **C2**: con `{ data: null, error: { message: 'caída' } }` en `directorio_perfiles`, el resultado
  es `toEqual({ ok: false })`, con `console.error` espiado y silenciado.
- **C3**: una fila con `id: null` y otra con `nombre_completo: null` no aparecen en `perfiles`.
- **C4** (prueba de fuente, como `lib/i18n/sin-literales.test.ts`): para
  `dar-de-baja/page.tsx` y `reponer-totp/page.tsx`, leídos con `readFileSync`, el texto **no**
  casa con `/\.from\(\s*['"]perfiles['"]\s*\)/` y **sí** contiene `cargarPerfilesActivos(`.
  Prohíbe `perfiles` solo en esas dos páginas, no en todo `app/`: las lecturas de la fila propia son
  legítimas.

C1 es la que falla si alguien vuelve a leer `perfiles` en el cargador. C4 falla si se esquiva el
cargador desde la página. Las dos hacen falta (M1 y M2).

## Preguntas abiertas al propietario (con recomendación)

**Respondidas (05-10-2026)**: P1 **incluir `/ajustes/reponer-totp`** (propietario) · P2 sí, el error de lectura se enseña como error (fábrica: es el patrón de T-041 B-H5; la lista vacía silenciosa escondió el defecto).


- **P1 · ¿Arreglar también `/ajustes/reponer-totp`?** Tiene el defecto idéntico, y no estaba en el
  hallazgo. Recomendación: **sí, en este ticket**: es la misma consulta, el mismo cargador y una
  línea más en C4. Si dices que no: fuera `reponer-totp/page.tsx` del territorio, de C4 y del
  guion, y se anota en `docs/state.md` como hallazgo.
- **P2 · ¿El error de lectura se enseña como error?** Hoy un fallo se pinta como lista vacía, y eso
  es lo que escondió este defecto. Recomendación: **sí**, como hizo T-041 en B-H5. Si dices que no:
  fuera la clave, C2 y M4, y el cargador devuelve la lista vacía.

## Lo que no entra, y por qué

- **Unificar el cliente simulado con el de T-041**: aún no están los dos en `main`. Es un
  refactor, no un arreglo.
- **Filtrar por rol** (por ejemplo, no ofrecer el TOTP del técnico): no lo pide nadie, y cambiaría
  quién aparece.
- **Estado vacío propio** («No hay a quién dar de baja»): con la lectura arreglada solo pasa en una
  organización de una persona. Es pintura aparte.
- **Banco de RLS para `directorio_perfiles`**: la vista no cambia, pero **ningún módulo de
  `scripts/rls/` la nombra** (comprobado: `grep -l directorio_perfiles scripts/rls/*.sql` no da
  nada). Aquí solo se mide (criterio de la consulta). Al cerrar se anota en `docs/state.md` como
  hallazgo: la vista no tiene prueba de quién ve qué, y desde T-041 y este ticket la usan dos
  pantallas de administrador.
