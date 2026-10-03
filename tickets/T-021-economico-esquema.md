---
id: T-021
titulo: Dominio Económico — esquema, auditoría y políticas (sin facturación propia)
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-004, T-010]
estado: pendiente
riesgo: alto
# territorio: adenda del diseño (A.6, 03-10-2026); no cambia con P3 (§Adenda P3 aplicada, PA.6)
territorio:
  - supabase/migrations/20261011120000_economico_esquema.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/11-cobertura.sql
  - scripts/rls/26-economico.sql
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts
  - scripts/lint-migraciones.test.ts
  - lib/supabase/tipos-bd.ts
  - tickets/T-021/**
  - docs/bitacora/T-021*.md
  - docs/state.md
---

# Contexto

El dominio Económico **no existe**. `architecture.md` §Dominios lo enumera —`tarifas_paciente`,
`series_facturacion`, `facturas`, `factura_lineas`, `cobros`, `bonos`, `gastos`,
`registro_eventos_sif`— y no hay ni una tabla. **Esa lista es anterior al ADR-053 y ya no
describe el producto.** Este ticket escribe el dominio que queda, con su auditoría y sus
políticas, y **no dibuja ni una pantalla**.

**Lo que el ADR-053 quita de aquí, y es más de la mitad del ticket**: no se modelan `facturas`,
`factura_lineas`, `series_facturacion`, `gastos` ni `registro_eventos_sif`. Psicogestión **no
expide** —ni por sí ni dirigiendo la expedición de nadie, que según la aclaración 4 de la AEAT
es lo mismo—, y el libro de gastos se va al proveedor.

**Lo que el ADR-077 saca además (03-10-2026)**: de una factura del programa, la app guarda solo los
hechos de la expedición, una vez, y ni su estado ni sus cobros. Ese **espejo nace en T-026**, con el
sincronizador, junto con el registro de envíos y las anotaciones de solo adición. **Este ticket no
crea `facturas_espejo`** ni nada que lo nombre. Diseño: `tickets/T-021/diseno.md`, §«Adenda P3
aplicada».

Referencias: **ADR-053** (entero; es el ticket), **077** (qué se copia del programa y dónde nace),
**029** (identificadores españoles, T-017), **024** (outbox), **035** (forma canónica), **033**
(el centro acota al técnico). `architecture.md` §Invariante 1 (cadena de huellas), §Roles (fila
Facturación), §Retención. Choques **9** y **13** de `docs/interfaz.md`.

Sigue siendo el ticket más caro de equivocar de la fase 2, por otro motivo: el **art. 29.2.j
LGT** alcanza a nuestros borradores aunque no seamos SIF (ADR-053 h), y un borrador editable en
sitio es un incumplimiento, no una comodidad.

## Tareas

- [ ] **Enum `regimen_iva`**: `exento_20_uno_3` y `general_21`. Dos, y el motivo consta en su
      `comment on type`: terapia y evaluación diagnóstica exentas (art. 20.Uno.3.º LIVA), el
      informe pericial o para aseguradora al 21 %. **El enum no se amplía sin ADR.** Lo marca
      el usuario, jamás se infiere (ADR-053 j). *(El diseño, §1 y A.1-D1, reutiliza el enum que ya
      existe con `exento_sanitario` y `general`.)*
- [ ] **`tarifas_paciente`**: `paciente_id`, `tipo_terapia_id`, `importe`, `regimen_iva`,
      `vigente_desde`, `vigente_hasta`, `creada_por`. Historificada, **nunca actualizada en
      sitio**: cambiar una tarifa es cerrar la vigente y abrir otra, porque un borrador viejo
      tiene que poder explicarse.
- [ ] **`borradores_factura`** + **`borradores_factura_versiones`**, con el mismo patrón que
      `notas_clinicas_versiones`: la cabecera identifica, las versiones son **solo adición y
      encadenadas por huella SHA-256** con la función de T-005. Corregir un borrador es una
      versión nueva.
      - Versión: `paciente_id`, `profesional_id`, `centro_id`, `destinatario_nombre`,
        `destinatario_nif_cifrado` (ADR-029), líneas en `jsonb` con la forma canónica del
        ADR-035 —`concepto`, `cantidad`, `precio_unitario`, `regimen_iva`, `cita_id`—, `base`,
        `cuota_iva`, `total`, `creada_por`, `creada_en`.
      - **`concepto` no es clínico nunca** (ADR-053 i). No se puede escribir un `check` que lo
        garantice, así que va `comment on column` explícito, la validación Zod del ticket que
        lo use, y aquí la prueba de que el seed no lo viola.
      - Estado de la cabecera **derivado, no almacenado**. En este ticket la vista solo distingue
        `sin_enviar` y `descartado`. **`enviado` y `facturado` los añade T-026** al redefinir la
        vista, porque salen del registro de envíos y del espejo, que nacen allí (P2, ADR-077).
      - **Un borrador descartado no se borra.** Aclaración 11 de la AEAT: los registros
        preparatorios se conservan aunque nunca lleguen a factura.
- [ ] **`cobros`** — solo adición: `paciente_id`, `importe`, `fecha`, `forma_pago` (enum:
      `efectivo`, `transferencia`, `tarjeta`, `bizum`, `otro`), `referencia`, `registrado_por`.
      **Sin columna de factura**: se cobra antes de facturar, y eso es lo normal en consulta, no una
      excepción. El enlace opcional a una factura del espejo lo añade T-026, como columna nula
      (ADR-077). Un cobro parcial es una fila; una devolución es **otra fila con importe negativo**,
      no un borrado.
      - El pendiente se **deriva** —vista, no columna—, **pero no en este ticket**: qué cuenta (lo
        facturado o lo devengado, menos lo cobrado) se decide al diseñar T-023, que crea la vista.
        Ya está decidido que se calcula por paciente.
- [ ] **`bonos`**: `paciente_id`, `sesiones_totales`, `sesiones_consumidas` derivadas de las
      citas realizadas que lo referencian, `importe`, `caducidad`. Sin columna de factura: si
      hiciera falta, la añade T-026. El consumo se deriva; **un contador que se incrementa es un
      `UPDATE`**.
      - **`citas.bono_id`** — columna nueva en `citas` (T-010), nula, `references bonos(id)`.
        Se añade **en la migración de este ticket**, no en T-010, porque `bonos` no existe
        todavía cuando corre T-010: el orden de dependencia va al revés. Es el enlace que hace
        derivable `sesiones_consumidas` — una vista cuenta `citas` con ese `bono_id` y
        `estado = 'realizada'`. Sin esta columna, «derivada de las citas que lo referencian»
        no tiene de qué colgar.
      - **RLS de `bonos`**, que la matriz de roles no cerraba explícito para esta tabla:
        `administrador` todos; `profesional_sanitario` los suyos, vía
        `es_profesional_asignado()` sobre `paciente_id`, igual que sus citas; `tecnico_administrativo`
        los ve —**no es dato clínico**, mismo criterio que `cobros`— acotado por centro
        (ADR-033) a través del paciente.
- [ ] **No se crean**, y que conste en la migración con un comentario que cite el ADR-053:
      `facturas`, `factura_lineas`, `series_facturacion`, `gastos`, `registro_eventos_sif`.
      Y otro que cite el ADR-077: `facturas_espejo`, el registro de envíos y las anotaciones del
      programa los crea T-026. Retirarlas de `architecture.md` §Dominios lo hace el
      documentalista al integrar, no este ticket.
- [ ] **Inmutabilidad en la base de datos, no en la aplicación**, sobre
      `borradores_factura_versiones` y `cobros`: `revoke update, delete on table`, disparadores
      `before update or delete for each row` que lancen excepción, y
      **`before truncate for each statement`** — `TRUNCATE` no lo interceptan ni las políticas
      ni los disparadores de fila (`.claude/rules/supabase.md`).
- [ ] **Auditoría** con `fn_auditar()` en las cinco tablas.
- [ ] **RLS según `architecture.md` §Roles, fila Facturación**:
      - `administrador`: total, con filtro por profesional (choque 13).
      - `profesional_sanitario`: **lo suyo**. Sus borradores, sus cobros, sus tarifas. Sin
        selector de profesional visible.
      - `tecnico_administrativo`: **cobros, sin dato clínico**. Ve `cobros` y `bonos`, y **no** ve
        las líneas del borrador, ni `cita_id`, ni `tarifas_paciente`. Acotado por centro (ADR-033).
        La cabecera de las facturas que verá cuando exista el espejo la da T-026.
- [ ] **Cada política nueva con su prueba en el banco de T-003**, incluida la negativa y su
      gemela positiva sobre la misma fila (`state.md` §79).

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset` aplica la migración sin error.
- [ ] **Automático** — `update borradores_factura_versiones` **falla**; `delete` **falla**;
      `truncate` **falla**. Lo mismo sobre `cobros`.
- [ ] **Automático** — la cadena de huellas de un borrador con tres versiones verifica con la
      función de T-005, y alterar la segunda la rompe.
- [ ] **Automático** — un `cobro` sin factura **entra**: cobrar antes de facturar es el caso
      normal.
- [ ] **Automático** — marcar tres citas con el mismo `bono_id` como `realizada` deja
      `sesiones_consumidas` (vista) en 3, sin ningún `UPDATE` sobre `bonos`. Cancelar una de
      las tres la baja a 2.
- [ ] **Automático** — como `tecnico_administrativo`: filas en `bonos` de su centro (no es
      dato clínico); como `profesional_sanitario`: solo los bonos de sus pacientes.
- [ ] **Automático** — como `tecnico_administrativo`: filas en `cobros`, **cero** en
      `tarifas_paciente`, y **cero** en las versiones del borrador (donde viven las líneas y
      `cita_id`) y en la vista de su estado, cada una con su gemela positiva del administrador.
- [ ] **Automático** — como `profesional_sanitario`: cero borradores de otro profesional, y
      **uno** propio (prueba negativa con su gemela positiva).
- [ ] **Automático** — cada tabla nueva escribe en `auditoria` al insertar.
- [ ] **Automático** — `npm run test:rls` en verde, y `npm run lint && npm run build` limpios.
- [ ] **Automático** — el linter de migraciones de T-019 no señala nada.
- [ ] **Manual** — `grep -riE "serie|numeracion|qr|verifactu|registro_facturacion"` sobre la
      migración no devuelve nada: aquí no se factura.
- [ ] **Manual** — `grep -ciE "espejo|proveedor"` sobre las líneas de la migración que no son
      comentario da `0`: el espejo es de T-026 (ADR-077).

## Guion de comprobación manual

1. `npx supabase db reset` y comprobar que la migración entra.
2. `npm run test:rls` y leer la salida de las pruebas nuevas.
3. Con `psql`, intentar `update`, `delete` y `truncate` sobre las dos tablas inmutables.
4. Insertar un borrador, corregirlo dos veces y verificar la cadena de huellas.

## Notas para el agente

- **No escribas emisión, ni llamada a proveedor, ni pantalla, ni espejo.** Eso es T-026 y está
  bloqueado a propósito hasta tener respuesta de Holded y del asesor (ADR-053 k, ADR-077).
- **No inventes series ni numeración.** El número lo pone el proveedor y llegará por el espejo de
  T-026. Si te tienta escribir `siguiente_numero`, para y relee el ADR-053 a).
- La cadena de huellas de T-005 se **reutiliza** para los borradores; no escribas otra. *(El diseño,
  §2 y A.1-D14, la cumple con una función hermana que copia la forma de la de la nota.)*
- `destinatario_nif_cifrado` sigue el patrón de `dni_cifrado` (ADR-029): AES-256-GCM con nonce
  aleatorio. Reutiliza la función.
- Los importes en `numeric`, nunca en coma flotante. `numeric(12,2)` para importes y
  `numeric(5,2)` para porcentajes.
- Si al modelar aparece algo que arreglar y no está en este ticket, va a la sección
  **§Para `docs/state.md`** de tu informe. En `docs/` solo escribes lo que dice `territorio:`.
