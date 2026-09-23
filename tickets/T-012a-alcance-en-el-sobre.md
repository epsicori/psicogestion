---
id: T-012a
titulo: El alcance entra en el sobre canonico, antes de la primera firma
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-005]
bloquea: [T-012]
estado: hecho
territorio:
  - lib/huella/sobre.ts
  - lib/huella/sobre.test.ts
  - lib/huella/vectores-congelados.json
  - supabase/migrations/**
  - supabase/seed-completo.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/14-cadena-huellas.sql
  - scripts/t005-concurrencia.sql
---

# Contexto

El ADR-057 ya esta aceptado y este ticket es **solo su codigo**. El commit que lo escribio
(`2fddabd`) toca unicamente `docs/` y lo deja dicho con esas palabras: «Solo la decision: el
codigo y la migracion van con su ticket».

`notas_clinicas_versiones.alcance` decide **quien puede leer esa version** —la politica
`notas_clinicas_versiones_lectura` la abre a todos los profesionales del episodio cuando vale
`conjunta` (ADR-030)— y hoy no esta entre las once claves del sobre. Cambiarlo no rompe la huella
y `npm run verificar:huellas` sigue diciendo que la cadena esta sana.

**Esto se paga ahora o no se paga nunca.** `notas_clinicas_versiones` esta vacia en todas las
bases —la migracion de T-005 aborta si encuentra una sola fila—, asi que la version 2 del esquema
no ha existido jamas en ningun sitio y no hay nada que convivir ni que recalcular. El ticket
T-012 escribe la primera firma real: despues de el, esto cuesta una era de esquema para siempre.

Va separado de T-012 por el mismo motivo por el que se separo T-013a: **para que una revision
mire una sola cosa**. Aqui no hay ni una linea de interfaz.

El diseno completo, con la forma exacta del sobre y el fichero a fichero, esta en
`tickets/T-012/diseno.md` §1.1. Leelo antes de tocar `lib/huella/`.

# Tareas

- [ ] **El sobre pasa a doce claves.** En `lib/huella/sobre.ts`: `ESQUEMA_VERSION = 3`, una clave
      mas en `esquemaSobre` (`alcance: z.enum(['individual','conjunta'])`) y `alcance` dentro de
      `sinNormalizar` en `construirSobre()`. **`ALGORITMO_VERSION` no se toca**: no cambia como se
      calcula la huella, cambia que se mete dentro.
- [ ] **La entrada ya lo trae.** `EntradaFirma` recibe `alcance` desde antes de este ticket y
      nunca llegaba al sobre. Comprobarlo antes de anadir nada.
- [ ] **Migracion con guarda de era.** `create or replace function public.fn_sellar_version_nota()`
      con el cuerpo actual mas `v_esperadas` de doce literales y la comprobacion **6.10**. La
      migracion **empieza abortando si existe una sola fila** en `notas_clinicas_versiones`, con el
      mismo patron que T-005: si alguien ya firmo, esta migracion debe fallar en voz alta.
- [ ] **La 6.10 se escribe como la 6.2**, con `is distinct from` sobre el jsonb completo y no con
      `->>` y `<>`: un `"alcance":null` da SQL NULL, y `NULL <> x` es NULL, que en un `if` es falso
      y desactiva la comprobacion en silencio.
- [ ] **Vectores congelados regenerados.** Los ocho ganan `alcance` y `esquema_version: 3`, y su
      `canonico` y su `huella_hex` se recalculan con un guion de un solo uso que **no se comitea**.
      Se anade un noveno vector con `alcance: 'conjunta'`.
- [ ] **Las tres copias del generador de sobres** —`scripts/rls/00-ayudantes.sql`,
      `supabase/seed-completo.sql`, `scripts/t005-concurrencia.sql`— suben a doce claves. En el
      banco, `sobre_prueba()` gana `p_alcance text default 'individual'`.
- [ ] **`01-fijacion.sql` pasa `'conjunta'` para NCONJ**, cuya columna `alcance` lo es: si no, la
      6.10 la rechaza y deja de sembrar **el banco entero**.
- [ ] **Negativas nuevas en `scripts/rls/14-cadena-huellas.sql`**, seccion C: sobre con `alcance`
      que no coincide con la columna, y sobre con `"alcance":null`. Las dos con
      `assert_lanza_codigo(..., '23514')`, nunca con `assert_lanza` a secas (hallazgo MEDIA-1 de
      T-005: una prueba que pasa por el motivo equivocado no prueba nada).
- [ ] **Comentario de columna al dia**: `comment on column ...esquema_version` dice 3.

# Criterios de aceptacion

1. `npx supabase db reset` aplica la migracion limpia y el banco entero siembra.
2. `npm run test:rls` pasa, con las tres aserciones nuevas de la seccion C entre ellas.
3. `npm run verificar:huellas` devuelve la cadena sana.
4. `npm test` pasa; `sobre.test.ts` enumera **doce** claves literales y afirma
   `esquema_version === 3`.
5. **Sensibilidad**: cambiar `alcance` de `individual` a `conjunta` produce otro canonico y otra
   huella. Prueba nueva en el bloque de sensibilidad de `sobre.test.ts`.
6. **Acentos**: los vectores `acentos-nfd` y `acentos-nfc` siguen dando **la misma** huella
   despues de regenerar. Si la normalizacion se rompio al regenerar, se ve aqui.
7. `vectores-sql.test.ts` sigue verde: los `$vec$` del banco son byte a byte los del JSON.
8. Insertar una version cuyo sobre lleve `"alcance":null` falla con `23514`.
9. Aplicar esta migracion sobre una base **con una fila firmada** aborta con mensaje propio.
   Se demuestra sembrando una firma por el camino de la aplicacion y reaplicando.
10. `npm run lint`, `npm run lint:migraciones` y `npm run build` limpios.

# Fuera de alcance

- `ALGORITMO_VERSION`, que sigue en 1.
- Cualquier pieza de T-012: editor, borrador, `abierta_en`, Server Actions, pantalla.
- La migracion de T-012 (`borrador_abierta_en`, margen de sesion), que va en su corte A.
