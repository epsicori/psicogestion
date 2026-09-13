## Resultado de la enmienda · 29-08-2026

Entra `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql`: la tabla
`perfiles_centros`, dos índices únicos parciales, el disparador de espejo,
`centros_actuales()` y `centro_principal(uuid)` nuevas, `centro_actual()` reescrita, los
cuatro consumidores reescritos, cuatro políticas y la auditoría. Verificado con
`scripts/t002-enmienda-multicentro.sql` —fijación propia, todo en una transacción con
`rollback`—: **ninguna aserción en falso y cinco errores en la salida, que son las cinco
aserciones negativas buscadas**.

**Dos cosas que la enmienda descubrió y no estaban en el ticket:**

1. **`fn_crear_perfil_de_usuario()` había que enmendarla también.** Escribía
   `perfiles.centro_id` desde `raw_user_meta_data`, y con la enmienda esa columna es el
   **espejo**: cada usuario nuevo nacía con el espejo relleno y la fuente de verdad vacía,
   así que `centros_actuales()` devolvía cero y un técnico recién creado no veía nada. El
   relleno de la migración no lo cubre, porque solo corre una vez. Ahora el alta crea
   también la pertenencia, como principal.

2. **«Vigente» tiene que ser exactamente `hasta is null`.** Un índice único parcial no
   puede usar `current_date` en su predicado —no es inmutable—, así que definir la
   vigencia por rango de fechas dejaba el índice y el tiempo de ejecución diciendo cosas
   distintas, con una ventana en la que caben dos principales. Se cierra igualando las dos
   definiciones y prohibiendo con un `check` que el cierre se feche en el futuro. Efecto
   buscado: cerrar surte efecto **en la misma sesión**, que es lo que pide el criterio 1.

**El técnico sin centro se resuelve solo, y conviene saber por dónde**: cerrar su última
pertenencia pone el espejo a nulo y eso viola `perfiles_tecnico_exige_centro`, así que el
cierre **falla desde dentro del disparador de espejo**. Es la tarea «el técnico exige al
menos una pertenencia vigente», y el mensaje de error nombra la restricción, no el
disparador.

**Queda pendiente**: la revisión con Opus del ticket entero —políticas de T-002 más esta
enmienda— y el punto 3 del guion manual en navegador.

---

# Revisión con Opus · 29-08-2026

Pendiente desde el 22-08. Se revisa el ticket **entero**: las políticas originales y la
enmienda del ADR-051.

**Método**: no se leyeron las 1431 líneas de la migración de corrido. Se interrogó el
catálogo —`pg_policies`, `pg_proc`, `information_schema`— buscando clases de fallo, y cada
sospecha se confirmó o descartó **con una prueba contra la base**, no razonando.

## Lo que se comprobó y está bien

| Comprobación | Resultado |
|---|---|
| Tablas sin RLS activo | **ninguna** |
| Políticas `UPDATE` con `USING` y sin `WITH CHECK` | **ninguna** — es el agujero clásico: dejaría convertir una fila visible en otra que no lo sería |
| Políticas `FOR ALL` | **ninguna**; los cuatro verbos van separados |
| Políticas concedidas a `public` o `anon` | **ninguna**; todas a `authenticated` |
| Funciones `security definer` sin `search_path` | **ninguna** |
| Tablas con RLS y cero políticas | `pines_historia` y `desbloqueos_historia` — **correcto y deliberado**: solo se tocan por funciones `definer` |

**Cuatro disparadores `definer` quedan ejecutables por `PUBLIC`** —`fn_crear_perfil_de_usuario`,
`fn_espejar_centro_principal`, `fn_proteger_columnas_reservadas_paciente`,
`fn_rellenar_centro_paciente`—. **No es un hallazgo**, y se comprobó en vez de suponerlo:
Postgres rechaza la invocación directa de una función de disparador con
*«trigger functions can only be called as triggers»*.

## Hallazgo ALTO · el corte por baja tenía dos puertas abiertas

El ADR-032 dice que cuando un profesional causa baja **el acceso se corta entero**. T-002 lo
cerró en las ocho tablas clínicas y en `alertas_documentacion`, y dejó escrita la regla:
*toda política que conceda por `<columna> = auth.uid()` y no lleve candado necesita su propio
`rol_actual() is not null`*. **La regla no se aplicó a otras dos tablas, y las dos guardan
datos de paciente.**

Reproducido con un profesional puesto en `baja`:

```
--- pacientes visibles estando de baja (debe ser 0) ---
 pacientes_visibles = 0          ← el corte funciona donde se aplicó

--- filas de auditoria visibles estando de baja ---
 filas_auditoria = 1
--- de esas, cuantas llevan el nombre del paciente dentro ---
 con_nombre_de_paciente = 1      ← FUGA

--- su registro de ACCESOS a historia ---
 accesos_visibles = 1 · pacientes_delatados = 1   ← FUGA
```

- **`auditoria_lectura_propia`**: `estado_anterior` y `estado_posterior` traen el nombre del
  paciente de cada fila que ese profesional creó o modificó.
- **`accesos_historia_lectura`**: la rama `perfil_id = auth.uid()` no mira el estado, así que
  delata **a qué historias entró y cuándo**. La política sí menciona `rol_actual()`, pero en
  la **otra** rama — por eso una búsqueda por política, y no por rama, no lo habría visto.

**Y T-004 agrandó la primera puerta sin querer**: al colgar la auditoría de las veinticinco
tablas, lo que antes era el rastro de una tabla pasó a ser el de todas. El hallazgo es
anterior a T-004, pero su alcance lo multiplicó ese ticket.

### Cómo se cierra

`supabase/migrations/20260829180000_revision_corte_por_baja.sql` antepone
`rol_actual() is not null` a las dos políticas. Verificado con
`scripts/t002-revision-corte-por-baja.sql`: **nueve aserciones, todas ciertas, cero errores**,
con su gemela positiva —estando activo lo ve todo— y su control —el administrador sigue
viendo los accesos, así que los ceros no son «nadie ve nada»—.

### Lo que se decidió NO tocar, y por qué

- **`accesos_historia_vistas`**: su lectura exige que la fila padre sea visible, así que
  **hereda** el corte. Comprobado en el guion, no supuesto.
- **`preferencias_usuario`**: guarda idioma y densidad de lista, ni un dato de paciente.
  Cortarla obligaría a que la pantalla de «tu cuenta está suspendida» se dibujara sin las
  preferencias de quien la lee: empeora la experiencia sin cerrar ninguna fuga.
- **`perfiles_lectura_propia`**: una política sobre `perfiles` que invoque `rol_actual()`
  —que lee `perfiles`— es recursión. Es la regla permanente que el propio ticket dejó
  escrita, y el motivo por el que existe la vista `directorio_perfiles`.

## Estado

**T-002 queda revisado.** Sigue pendiente el punto 3 del guion manual en navegador: un perfil
puesto en `suspendido` deja de ver `/pacientes`. Es lo único de este ticket que no se ha
ejecutado nunca contra la aplicación de verdad.
