Sin hallazgos ALTA. (Revisión de seguridad, ronda 2, T-023b · `git diff 3b2ea22..f6a2a51`, HEAD `f6a2a51`)

Ronda 2: S1 y S2 están cerrados y no hay hallazgos nuevos (0 ALTA, 0 MEDIA, 0 BAJA).

## Hallazgos de la ronda 1

### S1 (MEDIA): CERRADO
Medido en `begin … rollback` sobre `supabase_db_Psicogestion` (banco completo `scripts/rls/*.sql` con el
mutante metido detrás del `begin`, después del `db reset` que el verificador acababa de hacer):

| Variante | Resultado |
|---|---|
| Original | exit 0, 95 aserciones `OK … 33.` |
| M10: `alter policy cobros_facturas_lectura … using (true)` | exit 3: **`ASERCIÓN FALLIDA: 33.H8 · PRO2 lee la TABLA cobros_facturas`** (H5 y H6, que leen la vista, siguen en OK, como en la ronda 1) |
| Fuga solo para técnicos: `using (exists(… cobros …) or rol_actual() = 'tecnico_administrativo')` | exit 3: H8 OK y **`ASERCIÓN FALLIDA: 33.H9 · TEC2 (centro B) lee la TABLA`** |
| `using (false)` (contraste de las gemelas) | exit 3: cae antes, en 33.H2 |

H8 (PRO2) y H9 (TEC2) leen ya la tabla con sesión, no la vista, y cada una mata su mutante.
`mutantes.json` recoge M10 cayendo en 33.H8.

Nota sin hallazgo: la segunda mitad de 33.H9 (`cobro_id in (select id from cobros where paciente_id = P1)`)
siempre da 0 con la sesión de TEC2, porque `cobros_lectura` ya le oculta los cobros de P1, sea cual sea la
política de `cobros_facturas`. No resta nada: la primera mitad (filas de ESPA) es la que mata el mutante. Pero
esa cláusula no protege nada por sí sola, y no conviene leerla como cobertura de «todas las filas de P1».

### S2 (BAJA): CERRADO
`tickets/T-023b/mutantes.json`: M1 y M2 se describen ya como mutantes del DISPARADOR `fn_validar_cobro_factura`
(sin el paso 1 / pasos 2-3 antes del 1). M1p se añade como mutante equivalente de la POLÍTICA de alta y lo dice
claramente: «NINGUNA … la política de alta es una segunda pared redundante que ninguna prueba distingue». La
bitácora lo repite. Lo medí: `alter policy cobros_facturas_alta … with check (creada_por = (select auth.uid()))`
→ banco exit 0, 95 aserciones `OK … 33.`, igual que declara `mutantes.json`.

## Lo nuevo del delta, revisado sin hallazgos

- **`beforeAll` de `accesibilidad/facturacion.spec.ts`**: inserta como `postgres`, con
  `ejecutarSql(contenedorDelProyecto(), …)`, un borrador, una factura del espejo y un cobro suelto de Lucía. El
  contenedor sale de `config.toml` y no del primer `supabase_db_*` (hay tres stacks levantados). La única
  interpolación es `Date.now()` y las constantes `ADMIN`/`NUMERO_*`, sin entrada externa. Los datos van al
  paciente de siembra, no cruzan centros, y la prueba los usa para ver que el técnico de ese centro tiene
  «Asignar». No toca permisos, políticas ni clave de servicio. Como `facturas_espejo` y `cobros` son de solo
  adición, cada ejecución deja una factura y un cobro más en la base de desarrollo. Eso es higiene de datos, no
  seguridad, y el paso 8 ya pide `db reset + seed` si la precondición no se cumple.
- **POST de `cargarCobrosAsignables` en el paso 10**: `page.route('**/*')` + `ruta.fetch({ maxRedirects: 0 })`
  lee los cuerpos de los documentos, de los `fetch` RSC y de cualquier POST, y los entrega sin cambios. El
  control `c.includes(REFERENCIA_LUCIA) && !c.includes('<html')` tiene sentido: `/facturacion` solo pinta las
  referencias de cobros YA asignados (`fila-factura.tsx:64`), y el cobro de Lucía está suelto. Así, la única
  respuesta que no es HTML y lleva esa referencia es el POST de la acción. La lista de columnas prohibidas se
  comprueba ahora también sobre ese POST. Es más cobertura de la que había y no abre ningún camino nuevo.
- **`AsignarCobro` siempre montado (`disponible`)**: solo se condiciona el botón. El diálogo no carga nada
  hasta `abrir()`, y la región `role="status"` con `tabIndex={-1}` solo muestra el aviso. No llega ningún
  dato nuevo al cliente.
- En el delta no hay migraciones, políticas, grants ni clave de servicio.
