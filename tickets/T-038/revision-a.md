Sin hallazgos ALTA. Revisor A, ronda 2: 0 ALTA, 1 MEDIA, 1 BAJA.

## Revisor A · base y seguridad (ronda 2)

- **Diff:** `main...worktree-agent-ac39d19a23cb82596` (HEAD `e25fae0`).
- **Dónde se midió:** en `supabase_db_Psicogestion`, siempre dentro de `begin … rollback`, sin `db reset`, con `max(version) = 20261008120000`.
- **Interrupción:** el verificador reseteó la base a mitad de un mutante. Ese mutante se repitió cuando la migración volvió a estar aplicada.

### Hallazgos de la ronda 1

| Id | Estado | Cómo se comprobó |
|---|---|---|
| A-H1 | **Cerrado** | El paso uno devuelve `void`. Después de `crypt` hay una sola escritura (`insert … on conflict` con `case` sobre `v_ok`) y el aviso, que solo depende de `v_bloqueo`; ningún `return` ni `raise` depende del acierto. La guarda de solo lectura (25006) y el candado van antes del cotejo. El paso dos no recibe la contraseña. El oráculo da la misma respuesta con la buena y con la mala en S1 a S5, y el contador confirma. |
| A-H2 | **Cerrado** | C5 está en la migración (`:166`). El mutante que la quita pone el banco en rojo con «R2-5 C5». |
| A-H3 | **Cerrado** | `registrar_reposicion_totp` rechaza `p_perfil_id = v_actor` y cambia `<>` por `is distinct from`. Por lo demás es una copia fiel del cuerpo anterior. El mutante que quita la guarda pone el banco en rojo con «R2-4». |
| A-H4 | **Cerrado** | C1 a C8, N0 y N1 tienen su negativa y su gemela, también en vivo (L0 a L7b). |
| A-H5 | **Cerrado** | Cada condición lleva su `coalesce(…, true)`. Si falta una clave (N0) o una biblioteca (N1), el resultado es `false`. |
| A-H6 | **Cerrado** | Se cierra con DR7: `alcanzable(u)` usa `st > 0 and st <= u` y L7b lo prueba con el `statement_timeout` de `authenticated`. |
| A-H7 | **Cerrado** | Hay `revoke … from public, anon` y una comprobación que para si `anon` puede ejecutarlas. Queda una ventana de milisegundos entre la creación y el `revoke`, cubierta por el `finally` del corredor. |

### MEDIA

- **A2-H1** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:216` · `registro_postgres_seguro()` no lee los ajustes de `plpgsql_check`. Esa biblioteca está en `shared_preload_libraries`, y su trazador escribe los argumentos de cada función PL/pgSQL, `p_contrasena` incluido.
  - **Escenario:** se midió como `supabase_admin` dentro de `begin … rollback`, con un perfil sembrado con aal2 y una contraseña marcada.
    1. Se fijaron `set local plpgsql_check.enable_tracer = on`, `plpgsql_check.tracer = on` y `plpgsql_check.tracer_errlevel = 'log'`.
    2. `registro_postgres_seguro()` devolvió `t`.
    3. Se llamó a `comprobar_contrasena_para_regenerar('clave-revisor-log-7731')`.
    4. `docker logs supabase_db_Psicogestion` mostró `LOG:  #0  "p_contrasena" => 'clave-revisor-log-7731'`.
  - **Variante:** con el `tracer_errlevel` por defecto (`notice`) y `log_min_messages` en `notice` o por debajo, la línea llega igual al registro.
  - **Por qué importa:** si un operador activa el trazador para depurar, la acción da el registro por seguro (Q1 b) y la contraseña queda escrita en claro. Es la misma familia que A-H2: un ajuste que escribe parámetros y que la lista no enumera.
  - **Arreglo:**
    - añadir una C9: si `plpgsql_check` está cargada, el registro es inseguro cuando `plpgsql_check.enable_tracer = on` y `plpgsql_check.tracer = on`;
    - si la biblioteca está cargada, sus claves pasan a N0;
    - una negativa y una gemela en R2-5 y en vivo.
  - **Más ancho (lo decide el arquitecto):** la lista cerrada de ajustes no protege ante una biblioteca precargada que la lista no conoce. Una alternativa es que N1 tenga una lista de bibliotecas permitidas, de modo que cualquier precargada que no figure en ella cuente como insegura.

### BAJA

- **A2-H2** · `scripts/t038-concurrencia.mjs:198` · La pasada B («sin candado de consejo, el candado de fila del consumo serializa») no exige `b.espero`, a diferencia de la A (`:175`).
  - **Escenario:** las dos conexiones pueden no solaparse, por ejemplo porque la primera confirma antes de que arranque la segunda en una máquina lenta, o porque cambia `dormir`. Entonces las dos regeneraciones van en serie, dan `ok|10`, dejan diez vigentes y dos avisos, y la B sale verde. La medición «el candado de fila basta» queda registrada en `ca4-concurrencia.json` sin que haya habido carrera.
  - **Estado actual:** hoy el JSON registra `espero: true`, así que la medición vale. Lo que falta es que la condición se exija en lugar de solo anotarse.
  - **Arreglo:** `exigir(b.espero, …)`, igual que en la A. La D no lo necesita, porque sin solape la segunda activación lanza 42501 y deja 10 vigentes, y entonces la D sale roja.

### Comprobado sin hallazgo

**Lista R2.7, punto por punto:**
- **Paso uno uniforme:**
  - una sola escritura con `case` y `least(…, 100)`;
  - sin `return` ni `raise` dentro de un `if v_ok`;
  - el aviso depende solo de `v_bloqueo`;
  - si `p_contrasena` es `null`, `v_ok` es falso y cuenta como fallo.
- **Guarda de solo lectura:** va antes del candado y de `crypt`.
- **Paso dos:**
  - no lee `auth.users` ni recibe nada;
  - consume con `> 0 and autorizado_hasta > now()` antes de caducar el lote.
- **Firma antigua:** en la base no queda `regenerar_codigos_recuperacion(text)`. En `tipos-bd.ts` la función figura con `Args: never`, y `p_contrasena` solo aparece en `lib/cuentas/totp.ts:80`, que es la comprobación.
- **Evaluador:**
  - solo lo ejecuta su dueño: se revoca a `public`, `anon`, `authenticated` y `service_role`;
  - normaliza las listas de precarga;
  - `alcanzable` usa `<=`.
- **Tabla `intentos_regenerar_codigos`:**
  - ni `anon` ni `authenticated` tienen `TRUNCATE`, `DELETE`, `UPDATE` ni `SELECT`;
  - `authenticated` no puede insertar en `auditoria`, así que una fila `TOTP_REPUESTO` no se puede fabricar para eludir Q3(B).

**Mutantes del banco**, cada uno aplicado tras el `begin` con el banco completo (`00` a `23`) en `rollback`. El banco sin mutar sale verde: rc 0 y 1139 OK. Los siete ponen el banco en rojo por la aserción esperada:

| Mutante | Aserción que salta |
|---|---|
| La contraseña mala autoriza en el primer insert | «R2-1 · contraseña mala: UN intento fallido …» |
| La mala no anula la autorización | «R2-1 punto 5» |
| El paso dos ignora `autorizado_hasta` | «R2-1 punto 6» |
| Sin guarda 25006 | «R2-1 · la guarda de solo lectura y el candado van ANTES …» |
| Umbral de bloqueo en 6 | «CA2 bis» |
| Sin C5 | «R2-5 C5» |
| Reposición propia permitida | «R2-4 … 42501» |

**Lado TS:**
- los dos pasos van por POST;
- el error del paso uno se registra solo con el `code`;
- el error del paso dos no puede llevar la contraseña, porque el paso dos no la recibe.

**Residuo aceptado:** el tope 2 deja una autorización sobrante tras un doble envío. Durante 60 s, quien tenga la cookie con aal2 reciente puede gastarla y regenerar sin contraseña. Es la decisión P2 del propietario y cada regeneración avisa al titular, así que no se cuenta como hallazgo.
