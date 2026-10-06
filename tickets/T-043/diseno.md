# T-043 · Aviso de hueco raro al agendar — diseño

Contrato: `tickets/T-043-aviso-de-hueco-raro.md`. Origen: `tickets/T-028-alta-de-cita.md:173-175`.
ADR que aplican: ADR-049c (la sugerencia es determinista y no se toca), ADR-074 (el técnico agenda
sin ver el tipo) y ADR-033 (el centro es dimensión de RLS solo para el técnico). Ninguno choca con el
criterio, así que no hay BLOQUEO. Lo que tiene que decidir el propietario va en «Preguntas abiertas»,
al final, cada pregunta con una recomendación. El diseño está escrito con las recomendaciones.

## Definiciones (las usa todo el documento)

Para un tramo libre que empieza en `c`, en la franja `[F_ini, F_fin)` de su día:

- `D` es la duración pedida (`p_duracion_minutos`, la del tipo elegido) y `d` el descanso del
  profesional (`alta_descanso`, 0 si `descanso_activo` es falso).
- La cita propuesta ocupa `[c, c+D)` y bloquea `[c, c+D+d)`. Su fin con descanso es `T = c + D + d`.
- `S` es el inicio de la primera cita del profesional, en cualquier centro, con estado `programada`,
  `confirmada` o `realizada`, tal que `T ≤ S < F_fin`.
- **Hueco** `g = S − (c + D)`: los minutos entre el fin de la cita propuesta y el inicio de la
  siguiente. Es lo que entiende quien agenda («acaba a las 09:50 y la siguiente es a las 10:30: 40 minutos»).
- **Raro** cuando `d < g < D + 2d`. Es decir, quedan más minutos que el descanso pero no cabe otra
  sesión con sus dos descansos: el de la propuesta ya está en `T`, y la sesión intermedia necesita
  `[T, T+D+d)` libre. Equivale a `T < S < T + D + d` (pregunta P2).
- **No es raro, y vale `null`**:
  - no hay `S` en la franja (el resto hasta el fin de la franja no cuenta, P3);
  - una ausencia o un festivo parcial del día solapa `[c+D, S)`, porque entonces el hueco lo corta
    la ausencia y no la cita;
  - el tramo es `ocupado`.
- **El hueco anterior al tramo nunca es raro** cuando se elige un tramo de la propia función. El
  cursor llega a `c` desde el inicio de la franja, desde otro libre (`c' + D + d`) o desde el final
  de un bloqueo. En el primer caso no hay cita antes, en el segundo hay un hueco entero antes y en el
  tercero el hueco es 0 (`20261005120000_base_del_alta_de_cita.sql:984-989`). Por eso solo se calcula
  el hueco de después.

## 0 · Hechos verificados contra el código

- **H1.** `supabase/migrations/20260906120000_agenda_esquema.sql`:
  - `perfiles.descanso_activo boolean not null default true` y `descanso_minutos smallint not null default 10`,
    con check 5-20;
  - `tipos_terapia.duracion_minutos`, con check 5-480;
  - `estado_cita` vale `programada, confirmada, realizada, cancelada, no_asistida` (l. 40-46);
  - el comentario de `citas.rango_bloqueante` (l. 216-220) dice que el descanso se aplica **solo por
    detrás**: el rango es `[inicio, fin + descanso)` y queda congelado al crear la cita;
  - el índice `citas_profesional_inicio_idx (profesional_id, inicio)` (l. 225) sirve al `min(inicio)`
    nuevo.
  - **No existe ninguna columna de «duración de sesión» del profesional, ni de umbral de hueco.** La
    única preferencia por profesional que pesa en la agenda es el descanso.
- **H2.** `preferencias_usuario`, en `20260822094547_…:258-265`, solo tiene `idioma` y `densidad_listas`.
  Ninguna preferencia de agenda.
- **H3.** `alta_descanso(uuid)`, en `20261005120000_base_del_alta_de_cita.sql:118-137`, es `sql stable`,
  interna y revocada para `public, anon, authenticated`. Devuelve `descanso_minutos` si está activo y
  0 si no.
- **H4.** `agenda_bloques_profesional`, en el mismo fichero (l. 850-1009), es `plpgsql stable security definer set search_path = ''`.
  - Comprueba los permisos **antes** que los parámetros (l. 883-896): administrador,
    `p_profesional_id = auth.uid()`, o técnico con `p_centro_id in centros_actuales()`. Si no, lanza
    42501 «No autorizado para ver esta agenda.».
  - En el bucle de franja (l. 949-990), un tramo con bloqueo sale `ocupado` y salta a
    `greatest(fin de cita + descanso, fin de ausencia parcial)`. Un tramo libre salta `D + d`.
  - Las ausencias parciales se cotejan contra `[cursor, cursor + D)`, **sin** descanso (l. 958-972).
  - Solo emite tramos futuros (`v_cursor > v_ahora`, l. 976).
  - Termina con `comment on`, `revoke … from public, anon` y `grant … to authenticated` (l. 998-1009).
  - La salida es `table(fecha, hora_local, inicio, fin, estado)`.
- **H5.** El único consumidor de la RPC es `lib/citas/alta.ts:40-68` (`leerBloques`), que recorta
  `hora_local` a `HH:MM` (l. 63). Le llaman `app/(app)/agenda/nueva/estado-alta.ts:108-123`, con una
  sola lectura si semana y ventana caben en 62 días y con dos si no, y
  `acciones.ts:85,152` vía `cargarVistaAlta`. Comprobado con `grep agenda_bloques_profesional` en
  `lib app scripts`.
- **H6.** La clave de un hueco es `${fecha}T${horaLocal}` con `horaLocal` en `HH:MM`
  (`vista-alta.ts:147`). La misma forma usan las tarjetas (`TarjetaVista.clave`, `vista-alta.ts:53`)
  y `Elegido.clave` (`formulario-alta.tsx:38`).
- **H7.** `VistaAlta = { calendario, modo, tarjetas, errorSugerencias }` (`estado-alta.ts:37-43`).
  - Las tarjetas salen de la ventana de 28 días, `bloquesVentana`.
  - El calendario sale de la semana pedida, `bloquesSemana`.
  - `elegirHueco` (`formulario-alta.tsx:199-206`) pide la semana del hueco si no está pintada, así
    que tras recalcular, `calendario.huecos` contiene el elegido.
- **H8.** `formulario-alta.tsx`:
  - `onSubmit` corta con `aria-disabled` y guarda (`guardando || catalogoVacio || esperandoSerie`,
    l. 323-337, H27);
  - `enviar(datos)` está en la l. 272;
  - `hueco_ocupado` desmarca el elegido y pone el mensaje en `role="status"` (l. 290-300, 498);
  - la línea «Hueco elegido» está en las l. 427-430;
  - la fila de botones, en las l. 512-520. Guardar es `type="submit"` con `aria-disabled`.
  - `handleSubmit(fn)` de react-hook-form llama a `fn(datos, evento)`: un segundo parámetro propio
    de `enviar` recibiría el evento.
- **H9.** `lib/supabase/tipos-bd.ts:2863-2878`: las columnas devueltas por una función `table(…)` se
  generan **sin** `| null` (`estado: string`…). `hueco_raro_minutos` saldrá como `number`, aunque en
  ejecución valga `null`.
- **H10.** `components/ui/button.tsx`:
  - extiende `ComponentProps<'button'>`, así que `ref` pasa como prop en React 19;
  - `type="button"` por defecto;
  - `min-h-11` (44 px) y `whitespace-nowrap`;
  - `cn` es `twMerge(clsx(…))` (`lib/utils.ts:5-6`), así que `whitespace-normal` en `className`
    gana a `whitespace-nowrap`.
- **H11.** `scripts/rls/`:
  - existen 00-24 y 27; T-041 trae 28 en su rama y T-021 reserva 26. **El nuevo es 29.**
  - Todo el banco corre en una transacción y el estado se filtra entre módulos (README, punto 7).
  - `21-alta-de-cita.sql:149-152` afirma la forma exacta de salida de la función: hay que enmendarla.
  - `21.C` (l. 231-245) pone una cita de PRO1 en CB, 10:00-11:05. Con el valor nuevo, sus tramos
    darían `null`: 09:00 es adyacente (`g = d`) y en 11:15 y 12:15 no hay `S`. Su aserción no
    selecciona la columna nueva y sigue valiendo.
- **H12.** `scripts/lint-migraciones.ts`: la regla 2 no muerde `drop function` (l. 219-227); hay
  precedente en `20261005120000`, `20261007120000` y `20261009120000`. La regla 4 exige `set search_path`
  en `security definer`. La regla 5 exige sellos crecientes.
- **H13.** `docs/interfaz.md:466-467`: «El aviso de "hueco raro" **no** es de este ticket: va aparte».
- **H14.** ADR-049c: la sugerencia de hora es determinista y explicable, «y se queda así». Las
  alternativas de este ticket no sustituyen ni filtran `sugerirHuecos` (`lib/agenda/sugerencias.ts`).
  Son otra lista, también determinista, que solo aparece dentro del aviso.

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261012120000_hueco_raro.sql`

Sello posterior a `20261010120000` (T-041) y a la reserva `20261011120000` (T-021). Ver R2 sobre el orden.

```sql
-- T-043 · El hueco raro: agenda_bloques_profesional dice, por cada tramo libre, cuántos minutos
-- quedarían hasta la cita siguiente cuando no cabe otra sesión (diseño §Definiciones).
-- La salida cambia de forma: CREATE OR REPLACE no puede, así que se recrea (sin dependientes: H5).
drop function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint);

create function public.agenda_bloques_profesional(
  p_profesional_id uuid, p_centro_id uuid, p_desde date, p_hasta date, p_duracion_minutos smallint
)
returns table (
  fecha date, hora_local time, inicio timestamptz, fin timestamptz, estado text,
  hueco_raro_minutos integer
)
language plpgsql stable security definer set search_path = ''
as $$ … $$;
```

**Cuerpo: copia literal de `20261005120000:869-995`**, con tres añadidos y ningún otro cambio:

1. En `declare`: `v_tras timestamptz;` y `v_sig timestamptz;`.
2. Dentro de `if v_cursor > v_ahora then` (l. 976), tras fijar `estado`, se calcula
   `hueco_raro_minutos`:

```sql
hueco_raro_minutos := null;
if v_limite is null then
  v_tras := v_cursor + v_dur + v_desc;
  select min(c.inicio) into v_sig
    from public.citas c
   where c.profesional_id = p_profesional_id
     and c.estado in ('programada', 'confirmada', 'realizada')
     and c.inicio >= v_tras
     and c.inicio <  v_f_fin;
  if v_sig is not null
     and v_sig > v_tras
     and v_sig < v_tras + v_dur + v_desc
     and not exists (
       select 1 from public.disponibilidad d
        where d.perfil_id = p_profesional_id
          and d.tipo in ('festivo', 'ausencia')
          and d.hora_inicio is not null
          and (d.centro_id is null or d.centro_id = p_centro_id)
          and d.desde <= v_dia
          and (d.hasta is null or d.hasta >= v_dia)
          and tstzrange(v_cursor + v_dur, v_sig, '[)') && tstzrange(
                (v_dia + d.hora_inicio) at time zone d.zona_horaria,
                (v_dia + d.hora_fin)    at time zone d.zona_horaria,
                '[)')
     )
  then
    hueco_raro_minutos := ceil(extract(epoch from (v_sig - (v_cursor + v_dur))) / 60)::integer;
  end if;
end if;
```

3. `comment on function` igual al anterior, más una frase: «`hueco_raro_minutos`: en un tramo libre,
   los minutos entre su fin y la cita siguiente de la misma franja cuando quedan más que el descanso
   y no cabe otra sesión con el suyo; `null` en otro caso, y siempre en un ocupado. No identifica la
   cita.». Después, el mismo `revoke execute … from public, anon;` y `grant execute … to authenticated;`.

Notas para el implementador:

- La comparación se hace con intervalos exactos; solo el valor mostrado se redondea hacia arriba
  (`ceil`). Una cita con segundos no convierte un hueco de 30 s en «0 minutos».
- La condición de la ausencia es la misma de `v_limite2` (l. 958-972), con otro rango. Se copia, no
  se refactoriza a una función nueva: menos superficie de revisión.
- No se añade `order by`. La función ya devuelve en el orden del bucle, y eso no cambia.

### 1.2 Banco `scripts/rls/29-hueco-raro.sql`

Cabecera y convenciones como `21-alta-de-cita.sql`:

- usa los actores de `01-fijacion.sql` (ADM, PRO1 en CA y CB, PRO2, TEC1 de CA, TEC2 de CB, P1);
- anclas en el **año + 4**, en `lunes_29`, el primer lunes de febrero de ese año. Así no pisa a 21
  (año + 3) ni a 26 y 28;
- ids con prefijo `a2900001-` para los tipos y `a2900004-` para las citas, y `motivo` con «T-043» en
  la disponibilidad.

Fijación como postgres:

- un tipo de 50 minutos;
- `update perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1`;
- una franja de PRO1, los lunes de 09:00 a 14:00 en CA, desde `lunes_29` durante doce semanas.

Las citas se insertan como postgres, con la forma de `21.C` (l. 232-236).

Cada aserción compara el array completo
`array_agg(hora_local::text || '/' || estado || '/' || coalesce(hueco_raro_minutos::text, '-') order by inicio)`.
Así fija a la vez que **los tramos no se movieron** y el valor nuevo. Cada caso tiene su propio lunes
(`l000`, `l007`…) y se llama como PRO1 salvo que se diga otra cosa.

| Sección | Lunes | Fijación del día (CA salvo indicación) | Esperado |
|---|---|---|---|
| **A** forma y permisos | — | — | `pg_get_function_result(…) = 'TABLE(fecha date, hora_local time without time zone, inicio timestamp with time zone, fin timestamp with time zone, estado text, hueco_raro_minutos integer)'`; exactamente 1 `pg_proc` con ese nombre; `prosecdef`; `proconfig` con `search_path=""` (leer la forma exacta del catálogo antes de escribirla); `execute` para `authenticated` sí y para `anon` no; y en `aclexplode(proacl)` ninguna fila con `grantee = 0` (public) |
| **B0** línea base | +0 | nada | `09:00:00/libre/-, 10:00:00/libre/-, 11:00:00/libre/-, 12:00:00/libre/-, 13:00:00/libre/-` |
| **B1** raro, dos candidatas | +7 | citas 10:30-11:20 y 11:40-12:30 | `09:00:00/libre/40, 10:00:00/ocupado/-, 11:30:00/ocupado/-, 12:40:00/libre/-` |
| **C** adyacente (g = d) | +14 | cita 10:00-10:50 | `09:00:00/libre/-, 10:00:00/ocupado/-, 11:00:00/libre/-, 12:00:00/libre/-, 13:00:00/libre/-` |
| **D** borde inferior (g = d+1) | +21 | cita 10:01-10:51 | `09:00:00/libre/11, 10:00:00/ocupado/-, 11:01:00/libre/-, 12:01:00/libre/-, 13:01:00/libre/-` |
| **E1** borde superior dentro (g = 69) | +28 | cita 10:59-11:49 | `09:00:00/libre/69, 10:00:00/ocupado/-, 11:59:00/libre/-, 12:59:00/libre/-` |
| **E2** borde superior fuera (g = 70) | +35 | cita 11:00-11:50 | `09:00:00/libre/-, 10:00:00/libre/-, 11:00:00/ocupado/-, 12:00:00/libre/-, 13:00:00/libre/-` |
| **F** descanso 0 | +42 | primero `descanso_activo = false`; luego cita 09:55-10:45 | `09:00:00/libre/5, 09:50:00/ocupado/-, 10:45:00/libre/-, 11:35:00/libre/-, 12:25:00/libre/-`; al acabar, el descanso vuelve a `true` y 10 |
| **G** otro centro, como TEC1 | +49 | cita de PRO1 **en CB** 10:30-11:20 | como TEC1 pidiendo CA: `09:00:00/libre/40, 10:00:00/ocupado/-, 11:30:00/libre/-, 12:30:00/libre/-`. Negativas con fragmento (`assert_lanza_codigo_msg`, 42501, «No autorizado para ver esta agenda»): TEC2 pidiendo CA y PRO2 pidiendo a PRO1. Gemelas: TEC1 (la de arriba) y ADM con el mismo array |
| **H** ausencia parcial en medio | +56 | ausencia de PRO1, `centro_id` null, 10:00-10:20 de ese día (`tipo = 'ausencia'`, `desde = hasta =` el día, `hora_inicio`, `hora_fin`, zona); cita 10:30-11:20 | `09:00:00/libre/-, 10:00:00/ocupado/-, 11:30:00/libre/-, 12:30:00/libre/-` (gemela: G con el mismo hueco da 40) |
| **I** fin de franja | +63 | cita de PRO1 **en CB** 14:10-15:00 | `09:00:00/libre/-, 10:00:00/libre/-, 11:00:00/libre/-, 12:00:00/libre/-, 13:00:00/libre/-` |
| **J** cancelada no cuenta | +70 | cita 10:30-11:20 insertada `programada` y pasada a `cancelada` con `update` como postgres (forma de `15-agenda.sql:175`) | `09:00:00/libre/-, 10:00:00/libre/-, 11:00:00/libre/-, 12:00:00/libre/-, 13:00:00/libre/-` |

Cada fila esperada está calculada a mano con el bucle de H4 y las fórmulas de §Definiciones (D = 50,
d = 10). Si una no sale, se revisa la cuenta **antes** que el código, y la discrepancia se anota en
la evidencia.

Además:

- **`21-alta-de-cita.sql:149-152`**: la cadena pasa a terminar en `estado text, hueco_raro_minutos integer)`,
  y el mensaje dice «(fecha, hora_local, inicio, fin, estado, hueco_raro_minutos)». Nada más de 21 se toca.
- **`scripts/rls/README.md`**: fila `29-hueco-raro.sql`, con las secciones A-J y los mutantes M1-M9
  en una línea, al estilo de la fila de 21.

### 1.3 Datos hasta la pantalla

**`lib/citas/alta.ts` · `leerBloques`.** Cambia el tipo de retorno a
`ResultadoCitas<{ bloques: BloqueAlta[]; huecosRaros: Record<string, number> }>`. `BloqueAlta` **no
cambia**: así no se tocan los ocho ficheros de prueba que lo construyen (D4).

```ts
const huecosRaros: Record<string, number> = {};
for (const fila of data ?? []) {
  // El tipo generado no dice `| null` (tipos-bd.ts: columnas de función `table`), pero la base lo manda.
  const minutos: number | null = fila.hueco_raro_minutos ?? null;
  if (fila.estado === 'libre' && typeof minutos === 'number' && Number.isInteger(minutos) && minutos > 0) {
    huecosRaros[`${fila.fecha}T${fila.hora_local.slice(0, 5)}`] = minutos;
  }
}
```

La clave es la de H6. Un comentario de una línea dice que debe coincidir con `HuecoVista.clave`.

**`app/(app)/agenda/nueva/estado-alta.ts`.**

- `VistaAlta` gana `huecosRaros: Record<string, number>`, con el comentario «hueco raro (minutos)
  por clave de tramo libre, de todo lo leído: semana y ventana. Lo usa solo el aviso (T-043)».
- En la rama de una sola lectura, se toma `lectura.huecosRaros`. En la de dos, se juntan con
  `{ ...ventana.huecosRaros, ...semana.huecosRaros }`.
- Se pasa al objeto `vista` del `return` (l. 162-168).
- `sugerirHuecos` y `construirTarjetas` no cambian.

### 1.4 `app/(app)/agenda/nueva/alternativas-hueco.ts`, función pura

```ts
import type { HuecoVista } from './vista-alta';

type Candidato = Pick<HuecoVista, 'clave' | 'fecha' | 'diaIndice' | 'minutoPared' | 'estado'>;

/**
 * Hasta `maximo` huecos libres de la semana pintada que no dejan hueco raro, para el aviso (T-043).
 * Orden fijo: el mismo día primero; luego por distancia en días (a igual distancia, el anterior);
 * dentro del día, por distancia en minutos a la hora elegida (a igual distancia, el anterior).
 * Si el elegido no está entre `huecos` (su semana aún no se ha pintado), devuelve [].
 */
export function alternativasSinHueco(
  huecos: readonly Candidato[],
  huecosRaros: Readonly<Record<string, number>>,
  claveElegida: string,
  maximo = 3,
): string[];
```

- Candidatos: `estado === 'libre'`, `clave !== claveElegida` y `!(clave in huecosRaros)`. Usar
  `Object.hasOwn` y no `in`, para que una clave como `toString` no se cuele.
- Distancia en días: `Math.abs(c.diaIndice - elegido.diaIndice)`. Es un índice dentro de la semana,
  así que no hace falta ningún `Date` (D7).
- Comparador total, en este orden: (1) `c.fecha !== elegido.fecha`; (2) distancia en días;
  (3) `c.diaIndice`; (4) `Math.abs(c.minutoPared - elegido.minutoPared)`; (5) `c.minutoPared`.
  Devuelve las `clave`.
- Sin `maximo` ≤ 0 especial: `slice(0, maximo)`.

Va junto a la pantalla y no en `lib/agenda/`, para que nadie la confunda con `sugerirHuecos` (ADR-049c).

### 1.5 `app/(app)/agenda/nueva/aviso-hueco-raro.tsx`, cliente

```ts
'use client';
type Alternativa = { clave: string; texto: string; etiqueta: string };
type Props = {
  ref?: Ref<HTMLElement>;          // React 19: ref como prop
  minutos: number;
  alternativas: readonly Alternativa[];
  ocupado: boolean;                // guardando, catálogo vacío o serie en vuelo
  alElegir: (clave: string, etiqueta: string) => void;
  alAgendarIgualmente: () => void;
};
export function AvisoHuecoRaro(props: Props): JSX.Element;
```

Marcado y ARIA:

```
<section ref tabIndex={-1} aria-labelledby={idTitulo} aria-describedby={idTexto}
         className="rounded-lg border border-border bg-muted p-4 flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
  <h3 id={idTitulo} className="font-serif text-base">{t('agenda.alta.huecoRaro.titulo')}</h3>
  <p id={idTexto} className="text-sm">{tCon('agenda.alta.huecoRaro.texto', { minutos: String(minutos) })}</p>
  {alternativas.length > 0 ? (
    <>
      <p id={idAlternativas} className="text-sm font-medium">{t('agenda.alta.huecoRaro.alternativas')}</p>
      <ul aria-labelledby={idAlternativas} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {alternativas.map((a) => (
          <li key={a.clave}>
            <Button variante="contorno" className="h-auto whitespace-normal text-left"
                    onClick={() => alElegir(a.clave, a.etiqueta)}>{a.texto}</Button>
          </li>))}
      </ul>
    </>
  ) : (
    <p className="text-muted-foreground text-sm">{t('agenda.alta.huecoRaro.sinAlternativas')}</p>
  )}
  <div><Button variante="secundario" aria-disabled={ocupado}
               className="aria-disabled:cursor-default aria-disabled:opacity-50"
               onClick={() => { if (!ocupado) alAgendarIgualmente(); }}>
    {t('agenda.alta.huecoRaro.agendarIgualmente')}
  </Button></div>
</section>
```

- `useId()` para los tres ids.
- **Sin `role="status"`, `role="alert"` ni `aria-live`.** El aviso se anuncia porque recibe el foco
  (§1.6). Una región viva lo anunciaría dos veces, y H32 enseña que una región viva que nace llena no
  se lee bien.
- **Sin `role="dialog"` ni trampa de foco.** No es modal: el resto del formulario sigue a mano y Tab
  sale del aviso hacia Cancelar y Guardar.
- **Nunca `disabled`** (H27), tampoco en las alternativas.
- El texto visible de cada alternativa es su nombre accesible: sin `aria-label`.

`lib/i18n/es.ts`, dentro de `agenda.alta` (los textos son la recomendación de P5):

```ts
huecoRaro: {
  titulo: 'Esta cita deja un hueco corto',
  texto: 'Entre esta cita y la siguiente quedarían {minutos} minutos: más que el descanso, pero no cabe otra sesión.',
  alternativas: 'Huecos que no lo dejan',
  sinAlternativas: 'No hay otro hueco esta semana que no lo deje. Puedes elegir otro en el calendario o agendar igualmente.',
  agendarIgualmente: 'Agendar igualmente',
},
```

### 1.6 `app/(app)/agenda/nueva/formulario-alta.tsx`

Estado y derivados:

```ts
const [avisoHueco, setAvisoHueco] = useState<string | null>(null);   // clave para la que se enseñó
const refAviso = useRef<HTMLElement>(null);
const refResumen = useRef<HTMLParagraphElement>(null);
const refGuardar = useRef<HTMLButtonElement>(null);
const focoPendiente = useRef<'aviso' | 'resumen' | null>(null);

const huecoRaroElegido = elegido ? (vista.huecosRaros[elegido.clave] ?? null) : null;
const avisoVisible = avisoHueco !== null && avisoHueco === elegido?.clave && huecoRaroElegido !== null;
```

`avisoVisible` se deriva y no se sincroniza con un efecto. Si un recálculo (otro tipo, otro
profesional) quita la rareza o el elegido, el aviso se va solo.

Foco diferido, que corre tras cada commit:

```ts
useEffect(() => {
  const destino = focoPendiente.current;
  if (!destino) return;
  focoPendiente.current = null;
  (destino === 'aviso' ? refAviso : refResumen).current?.focus();
});
```

Envío partido en dos. `enviar` queda como intercepción y `guardar` es el cuerpo actual de las
l. 272-321, sin otro cambio:

```ts
async function enviar(datos: DatosAltaCita) {          // lo llama onSubmit vía handleSubmit
  if (esperandoSerie) return;
  if (elegido && huecoRaroElegido !== null) {
    if (avisoHueco === elegido.clave) refAviso.current?.focus();   // ya visible: no hay commit nuevo
    else { focoPendiente.current = 'aviso'; setAvisoHueco(elegido.clave); }
    return;
  }
  await guardar(datos);
}

function agendarIgualmente() {
  if (guardando || catalogoVacio || esperandoSerie) return;        // misma guarda que onSubmit (H27)
  if (falloSerie !== null) { setSerieFallida(null); return; }      // mismo reintento que onSubmit
  void handleSubmit(guardar)().then(() => {
    // Si lo que tenía el foco se desmontó (hueco_ocupado desmarca el elegido y el aviso se va),
    // se queda en el formulario, no en body. Si el diálogo se cerró, la ref es null.
    if (document.activeElement === null || document.activeElement === document.body) refGuardar.current?.focus();
  });
}

function elegirAlternativa(clave: string, etiqueta: string) {
  focoPendiente.current = 'resumen';
  elegirHueco(clave, etiqueta);
}
```

- `elegirHueco` (l. 199) gana `setAvisoHueco(null)` como primera línea. Volver más tarde al mismo
  hueco raro no resucita el aviso sin pulsar Guardar.
- `onSubmit` (l. 323-337) **no cambia**: sigue llamando a `handleSubmit(enviar)`.
- La línea «Hueco elegido» (l. 427) pasa a ser
  `<p ref={refResumen} tabIndex={-1} className="text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">`.
- El aviso se monta **entre los mensajes (l. 498-511) y la fila de botones (l. 512)**:

```tsx
{avisoVisible && elegido && (
  <AvisoHuecoRaro
    ref={refAviso}
    minutos={huecoRaroElegido}
    alternativas={alternativasSinHueco(vista.calendario.huecos, vista.huecosRaros, elegido.clave).flatMap((clave) => {
      const h = vista.calendario.huecos.find((x) => x.clave === clave);
      return h ? [{ clave, texto: `${vista.calendario.dias[h.diaIndice].etiquetaLarga}, ${h.horaLocal}`, etiqueta: h.etiqueta }] : [];
    })}
    ocupado={guardando || catalogoVacio || esperandoSerie}
    alElegir={elegirAlternativa}
    alAgendarIgualmente={agendarIgualmente}
  />
)}
```

- El botón Guardar gana `ref={refGuardar}`. Nada más de él cambia.
- `formulario-alta.test.tsx`: `vistaCon(bloques, huecosRaros = {})` (l. 34). En `acciones.test.ts`
  y `contenido-alta.test.tsx`, `huecosRaros: {}` en cada `VistaAlta` literal.

## 2 · Decisiones y alternativas descartadas

- **D1 · El dato sale de `agenda_bloques_profesional`, con una columna nueva.** Es la única función
  que ya sabe dónde están la franja, las ausencias parciales, el descanso y las citas de todos los
  centros.
  - Descartado: una función nueva aparte, porque duplicaría el bucle y podría derivar.
  - Descartado: leer `citas` desde TypeScript. El técnico no ve las citas de otros centros ni el
    descanso, y el alta no hace SQL propio (T-028:165).
  - Descartado: deducirlo en pantalla. El tramo siguiente a un libre no distingue hueco 0 de hueco
    raro (Contexto).
- **D2 · `drop function` + `create`, y no una función `_v2`.** La salida cambia de forma, y no hay
  dependientes en SQL (H5). Mantener dos versiones duplica la puerta de permisos que hay que revisar.
- **D3 · Sesión = la duración pedida; descanso = el del perfil.** No existe otra «duración de sesión»
  del profesional (H1, H2). La que importa es la del tipo que se agenda, y el descanso es la
  preferencia del profesional que el criterio dice que «informa» (P6).
- **D4 · `huecosRaros` como mapa aparte en la vista, no un campo en `BloqueAlta` ni en `HuecoVista`.**
  - Cubre a la vez calendario y tarjetas: el elegido puede venir de una tarjeta de otra semana.
  - No toca los ocho ficheros de prueba que construyen `BloqueAlta`.
  - Descartado: pintar en el calendario los huecos raros antes de elegir, porque no lo pide el criterio.
- **D5 · El aviso aparece al pulsar Guardar, no al elegir el hueco** (P1). «Agendar igualmente» solo
  tiene sentido como acción de guardar, y en ese momento el usuario ya ha decidido. Al elegir sería
  ruido en cada clic del calendario.
- **D6 · Guardar con el aviso visible no guarda: devuelve el foco al aviso.** Con un doble clic en
  Guardar, el segundo clic se saltaría el aviso. «Agendar igualmente» está a un Tab, y eso es lo que
  pide «siempre existe».
- **D7 · Alternativas solo de la semana pintada, ordenadas por cercanía, como mucho 3, y sin `Date`.**
  - Usa lo que ya hay en la vista, sin otra llamada.
  - Es determinista, y no cambia ni filtra las sugerencias (ADR-049c).
  - Si la semana del elegido aún no está pintada, salen 0 alternativas y «Agendar igualmente» sigue
    ahí.
- **D8 · El servidor no comprueba el hueco.** El criterio dice «no bloquea». Una comprobación en
  `guardarAlta` sería una segunda vía de bloqueo y una lectura más por guardado.
  - Coste: el dato puede tener unos segundos, si alguien agenda entre medias. Para un aviso
    informativo se acepta; el índice de exclusión sigue guardando el conflicto real.
- **D9 · El aviso recibe el foco y no es región viva.** Ver §1.5. Se enfoca el contenedor y no
  «Agendar igualmente»: un segundo Intro sobre un `section` no hace nada, y sobre el botón guardaría
  sin querer.
- **D10 · Riesgo alto.** Se recrea una función `security definer` con su puerta de permisos, y el
  técnico recibe un dato nuevo calculado con citas de otros centros (P4). Equivocarse en lo primero
  expone agendas enteras.

## 3 · Cómo se cierra cada criterio de aceptación

- **CA1 · Base.**
  - `npx supabase db reset` y luego `npm run lint:migraciones` → `0 hallazgos`.
  - `psql` con `select pg_get_function_result('public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure)`,
    `count(*)` en `pg_proc` por nombre, `prosecdef`, `proconfig` y `proacl`.
  - La sección 29.A lo deja afirmado.
- **CA2 · Valor.** `npm run test:rls` con exit 0. Se pega la salida con las líneas `29.*` y el
  recuento total de OK.
- **CA3 · Permisos intactos.** Las aserciones 29.G, negativas con fragmento y gemelas, en la misma
  salida.
- **CA4 · Mutantes.** Se aplican a mano sobre la función en la base (`create or replace` en una sesión
  `psql`, que admite el mismo tipo de retorno) y se corre `npm run test:rls`. Hay que restaurar entre
  uno y otro. Debe caer en:

  | Mutante | Cae en |
  |---|---|
  | M1 · `v_sig < v_tras + v_dur + v_desc` → `<=` | E2 |
  | M2 · `v_sig > v_tras` → `>=` | C (daría 10) |
  | M3 · `v_tras := v_cursor + v_dur` (sin descanso) | C (daría 10) |
  | M4 · sin `c.inicio < v_f_fin` | I (daría 20 en 13:00) |
  | M5 · `max(c.inicio)` en vez de `min` | B1 (11:40 queda fuera del umbral: `-` en vez de 40) |
  | M6 · sin el `not exists` de la ausencia | H (daría 40) |
  | M7 · sin el filtro de `estado` | J (daría 40) |
  | M8 · minutos `v_sig - v_tras` en vez de `v_sig - (v_cursor + v_dur)` | B1 (30 en vez de 40) y D (1) |
  | M9 · calcular también en tramos `ocupado` (sin `if v_limite is null`) | B1 (10:00 ocupado daría 50) |

- **CA5 · Unitarias.** `npm test`, con estos ficheros:
  - `lib/citas/alta.test.ts`: el mapeo pasa 30 → `{'2026-10-06T10:00': 30}`. `null`, 0, un
    no entero y un `ocupado` con número no entran. Se actualizan los `toEqual` del resultado de
    `leerBloques`.
  - `estado-alta.test.ts`: con una lectura y con dos, `vista.huecosRaros` junta ambas. Alguna clave
    del mapa coincide con una `calendario.huecos[i].clave` (fija H6).
  - `alternativas-hueco.test.ts`:
    1. mismo día antes que otro día;
    2. a igual distancia en días, el anterior;
    3. dentro del día, el más cercano en minutos y, a igual distancia, el anterior;
    4. excluye el elegido, los ocupados y los raros;
    5. `maximo`;
    6. elegido ausente → `[]`;
    7. al menos un caso con tres candidatas válidas desordenadas en la entrada, contra el mutante de
       «la primera que aparece» (H35).
  - `aviso-hueco-raro.test.tsx`:
    - nombre accesible del `section` (título) y descripción (texto con minutos);
    - `tabIndex=-1`;
    - las alternativas son botones con su texto, y el clic llama a `alElegir(clave, etiqueta)`;
    - con 0 alternativas, «Agendar igualmente» existe y sale el texto `sinAlternativas`;
    - con `ocupado`, `aria-disabled="true"`, sin atributo `disabled`, y el clic no llama;
    - no hay `role="status"` ni `role="alert"` ni `aria-live` dentro.
  - `formulario-alta.test.tsx`, siete casos:
    1. hueco raro + Guardar → `guardarAlta` no se llama, el aviso aparece y `document.activeElement`
       es el `section`;
    2. «Agendar igualmente» → `guardarAlta` se llama **una vez** con los mismos datos que el caso
       sin rareza;
    3. alternativa → el aviso se va, el foco está en la línea «Hueco elegido» y el siguiente Guardar
       llama a `guardarAlta` con la clave de la alternativa;
    4. gemela: hueco sin rareza + Guardar → `guardarAlta` se llama sin aviso;
    5. segundo Guardar con el aviso visible → sigue sin llamar, y el foco vuelve al aviso desde
       Guardar;
    6. «Agendar igualmente» con resultado `hueco_ocupado` → el aviso se va, el mensaje sale en
       `role="status"` y el foco está en Guardar, no en `body`;
    7. en ningún momento Guardar ni «Agendar igualmente» tienen el atributo `disabled`.
  - Mutantes de pantalla, medidos y anotados en la evidencia:
    - quitar la intercepción hace caer 1 y 5;
    - quitar `setAvisoHueco(null)` en `elegirHueco` hace caer un caso de vuelta al mismo hueco
      (añadirlo dentro de 3);
    - quitar el enfoque diferido hace caer 1 y 3;
    - quitar el `then` de `agendarIgualmente` hace caer 6.
- **CA6 · No bloquea.** `grep -rn "huecosRaros\|hueco_raro" app/(app)/agenda/nueva/acciones.ts lib/citas/`
  solo encuentra el mapeo de `leerBloques`. `grep -n "disabled=" app/(app)/agenda/nueva/aviso-hueco-raro.tsx app/(app)/agenda/nueva/formulario-alta.tsx`
  solo da `aria-disabled`. El caso 7 de CA5 lo fija en prueba.
- **CA7 · Manual.** El guion del contrato, en Chromium, con capturas del aviso a ancho completo y a
  360 px, y una nota de qué recibe el foco en cada paso (`document.activeElement` en la consola).
- **CA8.** `npm run lint`, `npm run build` y `node ~/.claude/pipeline/territorio.mjs T-043`, con la
  salida pegada.

## 4 · Riesgos, por probabilidad

1. **R1 · Alta. La copia del cuerpo no es literal.** Una línea cambiada en el bucle mueve huecos para
   todos. Mitigación: los arrays completos de 29 fijan `hora/estado` en diez días distintos, 21.B y
   21.C siguen corriendo, y el revisor hace un `diff` de cuerpos (§5).
2. **R2 · Media. Orden de la cola `supabase/`.** `docs/state.md` pone este ticket **antes** que T-021,
   pero T-021 reserva `20261011120000`, un sello inferior. Si T-043 se integra primero, la migración
   de T-021 quedaría detrás de una ya aplicada. El linter no lo ve (regla 6 solo mira ediciones), y
   `supabase db push` en un remoto la rechazaría. Mitigación: quien integre segundo comprueba el
   orden; si T-021 entra después, re-sella su migración por encima de `20261012120000` antes de
   integrar. Se anota en `state.md` al empezar T-043.
3. **R3 · Media. El tipo generado no dice `null` (H9).** Un `fila.hueco_raro_minutos > 0` sin
   `?? null` funciona por casualidad, porque `null > 0` es falso. Un `Number(fila.hueco_raro_minutos)`
   daría 0 y no entraría, pero un `String(...)` metería «null» como clave. Mitigación: el mapeo de
   §1.3 y su prueba con `null`.
4. **R4 · Media. Base compartida.** T-041 está en verificación con `20261010120000` aplicada en
   local, y un `db reset` desde otra rama pierde migraciones. Mitigación: comprobar `max(version)`
   antes de cada verificación, y que 29 empiece por la línea base B0.
5. **R5 · Baja. Estado filtrado de 26 y 28.** Si uno de ellos sembrara franjas o citas de PRO1 en
   febrero del año + 4, B0 caería primero y diría por qué.
6. **R6 · Baja. Exposición al técnico (P4).** El minuto de inicio de la cita siguiente de otro centro
   se deduce de `c + D + g`. Hoy ya ve que ese tramo está ocupado, y con duración 5 puede sondear casi
   lo mismo. Lo decide el propietario.
7. **R7 · Baja. Rendimiento.** Una consulta más por tramo libre, sobre el índice
   `(profesional_id, inicio)`. Con 62 días y unos diez tramos por día son unas 600 búsquedas
   indexadas.

## 5 · Qué revisar

- **El cuerpo de la función.** Extraer el `create function` de `20261005120000:850-995` y el de
  `20261012120000`, y hacer un `diff`. Solo deben aparecer:
  - la columna de salida;
  - `v_tras` y `v_sig` en `declare`;
  - el bloque de §1.1, dentro de `if v_cursor > v_ahora`;
  - la frase del comentario.

  Cualquier otra diferencia es un hallazgo ALTA.
- **La puerta de permisos sigue antes que los parámetros y es la misma** (l. 883-896). Comprobar el
  `revoke … from public, anon` y el `grant … to authenticated` tras el `create`: un `drop` se lleva
  los grants. Mirar también `set search_path = ''` y `security definer`.
- **Qué elige el llamante.** Las entradas son las mismas cinco y ninguna nueva.
  `p_duracion_minutos` (5-480) mueve el umbral (`D + d`), pero no amplía lo que se ve: el técnico ya
  podía sondear con cualquier duración. Ninguna columna identifica la cita que bloquea: ni id, ni
  paciente, ni centro, ni tipo. `hueco_raro_minutos` es un número y nada más.
- **`null` por otra puerta.**
  - `hueco_raro_minutos` es `null` en todo `ocupado` (M9).
  - El tipo TS no dice `null` (H9): mirar el `?? null` y la guarda `Number.isInteger && > 0`.
  - Una cita con `inicio` exactamente en `F_fin` no cuenta, porque `<` es estricto (I/M4).
- **Los bordes.**
  - `g = d` no es raro (C/M2) y `g = D + 2d` no es raro (E2/M1).
  - `g = d + 1` sí lo es (D) y `g = D + 2d − 1` también (E1).
  - Las dos pruebas de cada borde existen.
- **El descanso en los dos sitios.** `v_desc` entra en `v_tras` y en el umbral superior. F y C cazan
  quitarlo de uno (M3).
- **Duplicados y orden.** Con dos citas candidatas se elige el mínimo (B1/M5). Las alternativas no
  repiten clave ni incluyen el elegido.
- **Concurrencia.** El dato es una foto. Nada en servidor decide con él (CA6), y el conflicto real
  sigue en `citas_sin_solape_profesional`.
- **Que el aviso no bloquee nunca.**
  - «Agendar igualmente» se renderiza siempre que se ve el aviso, también con 0 alternativas.
  - Nunca hay `disabled`.
  - `guardarAlta` no cambia.
  - `onSubmit` no gana guardas nuevas.
- **El foco nunca va a `body`.**
  - Al aparecer el aviso, al elegir una alternativa y tras un fallo de «Agendar igualmente», la
    prueba mira `document.activeElement`.
  - Comprobarlo en Chromium (H27: jsdom no ve la pérdida de foco de un botón que se desmonta).
- **ADR-049c.** `lib/agenda/sugerencias.ts`, `construirTarjetas` y las tarjetas no cambian.
  `alternativasSinHueco` no se usa fuera del aviso.
- **Las pruebas fallan por el motivo correcto.**
  - El caso 1 de CA5 debe fallar por «`guardarAlta` llamado», no por un selector que no encuentra
    el aviso: la aserción de la llamada va primero.
  - Las de 29 comparan arrays completos: un fallo dice qué tramo se movió.
- **Sello y cola.** El sello es `20261012120000` y es mayor que el `max(version)` de `main` y de la
  rama de T-041. R2 está anotado en `state.md`.
- **Territorio.** En `21-alta-de-cita.sql` solo cambian las l. 149-152; en `acciones.test.ts` y
  `contenido-alta.test.tsx`, solo `huecosRaros: {}`.

## 6 · Territorio

El contrato lo declara (`tickets/T-043-aviso-de-hueco-raro.md`, `territorio:`) y coincide con §1:

- `supabase/migrations/20261012120000_hueco_raro.sql`;
- `scripts/rls/29-hueco-raro.sql`, `scripts/rls/21-alta-de-cita.sql` (l. 149-152) y `scripts/rls/README.md`;
- `lib/supabase/tipos-bd.ts`, regenerado;
- `lib/citas/alta.ts` y `lib/citas/alta.test.ts`;
- `lib/i18n/es.ts`;
- en `app/(app)/agenda/nueva/`:
  - `estado-alta.ts` y su prueba;
  - `alternativas-hueco.ts` y su prueba, nuevos;
  - `aviso-hueco-raro.tsx` y su prueba, nuevos;
  - `formulario-alta.tsx` y su prueba;
  - `acciones.test.ts` y `contenido-alta.test.tsx`, solo los literales;
- `docs/interfaz.md` (l. 466-467).

Fuera, aunque tiente:

- `vista-alta.ts`, `lib/agenda/**`, `acciones.ts`, `tarjetas-sugerencia.tsx`;
- `components/ui/**`;
- cualquier otra migración.

## 7 · Delegable

Casi nada, y no compensa encargarlo:

- `huecosRaros: {}` en tres fixtures de prueba;
- las cinco claves de texto.

Lo demás tiene comportamiento, y lo escribe la fábrica (Opus): SQL con permisos, foco, ARIA, la
intercepción del envío y pruebas que deben fallar por un motivo concreto. El marcado de
`AvisoHuecoRaro` parece pintura, pero lleva la ref del foco, `aria-labelledby`/`aria-describedby` y
la regla de no usar `disabled` (lección de T-007a).

## Lo que no entra, y por qué

- **Avisar en cada sesión de una serie.** Solo se mira el primer hueco, que es el que se elige.
  Mirar cada ocurrencia exige cambiar `agenda_previsualizar_alta` y la previsualización, y eso es
  otro ticket (P7).
- **Marcar los huecos raros en el calendario o en las tarjetas antes de elegir.** No lo pide el
  criterio, y tocaría `vista-alta.ts`, la rejilla y la lista del día, con sus pruebas de teclado.
- **Una preferencia nueva del profesional** (activar o desactivar el aviso, o un umbral propio). Hoy
  no existe ninguna columna (H1, H2), y crearla es otro ticket con su pantalla de ajustes (P6).
- **El hueco hasta el fin de la franja o hasta una ausencia** (P3).
- **El hueco anterior al tramo.** Nunca es raro cuando se elige un tramo de la función
  (§Definiciones).
- **Comprobar en servidor al guardar** (D8).
- **Arreglar H34 o H35 de T-028.** H34 ya está arreglado en pantalla y H35 es la prueba de
  `finDeOcupado`. Este ticket no toca `vista-alta.ts`.

## Preguntas abiertas al propietario

**Respondidas (05-10-2026)**: el propietario elige la recomendación en P1 (al pulsar Guardar), P2 (`d < g < D + 2d`), P4 (el técnico recibe el valor) y P7 (solo la primera sesión de la serie). P3, P5 y P6 se cierran con la recomendación (fábrica; el propietario puede revisar los textos de §1.5 en la prueba manual). **Orden en la cola** (R2): T-021 va antes que T-043, para que los sellos queden en orden sin renombrar (`20261011120000` < `20261012120000`).


Cada pregunta trae una recomendación, que es lo que el diseño implementa si no hay respuesta.
También se dice qué cambia si se elige otra cosa.

- **P1 · ¿Cuándo sale el aviso?** (a) Al pulsar Guardar, sobre los botones, con «Agendar igualmente».
  (b) Al elegir el hueco, debajo de «Hueco elegido», sin interceptar Guardar. **Recomendación: (a).**
  Es lo que dice el criterio («Agendar igualmente») y no molesta en cada clic del calendario. Si se
  elige (b): sin intercepción, el aviso se monta bajo la línea del hueco y desaparece el botón
  «Agendar igualmente», porque Guardar ya lo es.
- **P2 · ¿Qué es «menos que una sesión»?** (a) Que no cabe otra sesión con sus descansos:
  `g < D + 2d`, que con 50 y 10 son menos de 70 minutos. (b) Literal, `g < D`: menos de 50.
  **Recomendación: (a).** Con 55 minutos entre dos citas no se puede agendar nada en medio, y eso es
  justo lo raro. Si se elige (b), cambia un umbral en SQL (`v_sig < v_cursor + 2 * v_dur`) y los
  casos E1/E2 pasan a 49/50.
- **P3 · ¿Cuenta lo que sobra hasta el fin de la franja o hasta una ausencia?** **Recomendación: no.**
  Lo que sobra al final de la mañana es inevitable cada vez que la franja no es múltiplo de la
  sesión, y el aviso saltaría en el último hueco de casi cada día. Si se elige sí, se quita la cota
  `< v_f_fin` y se mide también contra el inicio de la ausencia; I y H cambian.
- **P4 · ¿Puede el técnico del centro A recibir un hueco calculado con una cita del mismo
  profesional en el centro B?** Deduciría el minuto en que empieza esa cita, nunca de quién es ni de
  qué. **Recomendación: sí.** Ya ve ese tramo ocupado (T-028a), puede sondear con duración 5, y sin
  esa cita el aviso le mentiría. Si se elige no, la búsqueda de `S` se limita a
  `c.centro_id = p_centro_id` **solo** para el técnico, y G cambia (con su gemela del profesional).
- **P5 · Textos.** Los de §1.5: título «Esta cita deja un hueco corto»; texto «Entre esta cita y la
  siguiente quedarían {minutos} minutos: más que el descanso, pero no cabe otra sesión.»; «Huecos
  que no lo dejan»; el de sin alternativas; «Agendar igualmente», que es el del criterio.
  **Recomendación: aprobarlos tal cual.**
- **P6 · ¿«La preferencia del profesional» es su descanso configurado, o una preferencia nueva?**
  **Recomendación: su descanso** (`perfiles.descanso_*`) más la duración del tipo. Sin columna
  nueva. Si quiere poder apagar el aviso o fijar un umbral, se abre un ticket aparte con ajustes y
  migración.
- **P7 · Series.** **Recomendación: avisar solo por la primera sesión**, que es el hueco que se
  elige. El texto no dice «primera» porque ya habla de «esta cita». Si quiere el aviso por cada
  ocurrencia, es otro ticket sobre `agenda_previsualizar_alta`.

## Ronda 2 (06-10-2026)

Entrada: `tickets/T-043/evidencia.json` (CA2 FALLA), `tickets/T-043/revision.md`, `revision-a.md`
(H1-H5, sondas X1-X7) y `revision-b.md` (B-H1..B-H6). Implementación leída: rama
`worktree-agent-a84f11f89963e2cc9`, HEAD c8759df. Este anexo **sustituye** a lo anterior solo donde lo
dice; todo lo que no nombra sigue en vigor. **La migración `20261012120000_hueco_raro.sql` no cambia en
esta ronda**: todos los hallazgos son de pruebas, de la cabecera del banco o del formulario.

### R2.0 · Hechos verificados contra el código

- **Colisión** (`scripts/rls/29-hueco-raro.sql:31-53` frente a `21-alta-de-cita.sql:37`). El 29 ancla en el
  primer lunes de febrero de `año + 4`; el 21 ancla en el primer lunes de mayo de `año + 3` con offsets hasta
  `l343`, y siembra festivos y ausencias de PRO1 en `l280`-`l300`, que caen en febrero y marzo de `año + 4`.
  La cabecera del 29 (líneas 6-7: «21 usa año + 3» y no llega) es falsa.
- **Alcance de los bancos 00-28**, comprobado con estos greps sobre `scripts/rls/[0-2]*.sql` (`Y` = año en
  curso):

  | Comprobación | Resultado |
  |---|---|
  | `grep -nE "extract\(year from (now\|current_date)" …` | 16 → `Y+1` (último domingo de marzo, offsets hasta ~800 días: julio de `Y+4`); 21 → `Y+3` (mayo, +343: abril de `Y+4`); 23 → `Y+4` (mayo, +70: julio de `Y+4`). |
  | `grep -noE "current_date \+ [0-9]+" … \| sort` | máximo `+1502` (26): como mucho febrero de `Y+5` a final de año. |
  | `grep -ohE "now\(\) \+ interval '[0-9]+ (hours?\|days?…)'" …` | máximo `1488 hours` (18), ~62 días. |
  | `grep -ohE "'20[2-9][0-9]-[0-9]{2}" … \| sort -u` | el mayor literal es `'2033-06'` (26, caducidad de bonos, sin agenda); los de agenda son `2026-10` (15) y `2030-01` (19). |
  | `grep -lE "insert into public.disponibilidad" …` | solo 16, 21 y 23, y todas las filas con `hasta` no nulo: ninguna franja, festivo ni ausencia queda abierta hacia el futuro. |
  | `grep -nE "(now\(\)\|current_date)\s*\+" supabase/migrations/*.sql` | vacío: ninguna función ni restricción limita cuán lejos puede estar una cita o una franja. |

  Conclusión: ningún banco escribe agenda más allá de febrero de `Y+5`. Como todas las anclas relativas se
  mueven con `Y`, la separación es la misma cualquier año; los literales fijos solo pueden quedar más atrás.
- **Formulario** (`app/(app)/agenda/nueva/formulario-alta.tsx`): `claveCalculo` (:115) es la clave de lo
  pedido; `calculo.clave` (:116), la de lo pintado; `vista = calculo.vista` (:120). `enviar` (:298-309)
  decide con `huecoRaroElegido` (:121), que sale de esa vista, **sin mirar si `calculo.clave === claveCalculo`**.
  La única señal de recálculo en vuelo es `cargando` de las tarjetas (:473). Las guardas de envío repiten la
  misma conjunción en cuatro sitios: `agendarIgualmente` (:312), `onSubmit` (:383), `ocupado=` (:576) y
  `aria-disabled=` (:587). `catalogoVacio` se declara en :375, **después** de las funciones que lo usan (vale
  porque se lee al llamarlas, no al pintar).
- **Precedente**: Guardar ya espera a otra petición en vuelo, la serie (`esperandoSerie`, :295; `aria-disabled`
  y corte en `onSubmit`), fijado por la prueba H15 «mientras la serie está en vuelo, Guardar sigue
  desactivado» (`formulario-alta.test.tsx:707`).
- **Prueba de T-028 que choca con el arreglo de B-H1**: `formulario-alta.test.tsx:256` («si el guardado dice
  que el hueco se ocupó mientras se recalcula la duración…») pulsa Guardar **con el recálculo en vuelo** y
  espera que `guardarAlta` se llame.
- **`territorio.mjs`** (`~/.claude/pipeline/territorio.mjs`): el bloque solo se reconoce si `territorio:` va
  solo en su línea (`/^territorio:[ \t]*\r?\n…/m`); con el comentario pegado devuelve «sin territorio
  declarado» y sale en verde. Una línea de comentario **entre** elementos corta la lista (la expresión exige
  que cada línea empiece por `-`); los comentarios al final de un elemento sí se limpian (`limpia`).
  `docs/bitacora/**` y `docs/state.md` ya son rutas comunes siempre permitidas.

### R2.1 · Piezas y contratos

#### R2.1.1 · El ancla del 29 (sustituye §1.2, «anclas»)

En `scripts/rls/29-hueco-raro.sql`:

- `select (extract(year from now())::int + 10) as anio_29 \gset`. `lunes_29` sigue siendo el primer lunes de
  febrero de ese año (misma expresión de la línea 34).
- Offsets: a los actuales (`l007` … `l070`) se añaden, en el mismo `\gset`, `l077`, `l084`, `l091`, `l098`,
  `l105`, `l106` (= `lunes_29 + 106`, el martes de K5), `l112`, `l119`, `l126`, `l133`.
- Franja: `hasta = :'lunes_29'::date + 140` (veinte semanas). El comentario «doce semanas» pasa a «veinte
  semanas».
- Cabecera, líneas 6-8, sustituidas por (mismo sangrado de comentario):

  ```
  -- TEC2 de CB, P1, P2). ANCLA: primer lunes de febrero de año + 10. Ningún banco 00-28 escribe
  -- agenda más allá de febrero de año + 5 (16, 21 y 23 anclan en año + 1, + 3 y + 4 con offsets de
  -- como mucho dos años y medio; 26 llega a current_date + 1502; los literales, a 2033 y sin agenda),
  -- y ninguna `disponibilidad` sembrada queda abierta (todas con `hasta`). Comprobado con grep en
  -- tickets/T-043/diseno.md, Ronda 2, R2.0. Un banco nuevo que siembre agenda de PRO1 más allá de año + 5
  -- tiene que mirar esto. Cada sección tiene su propio lunes (offsets sobre `lunes_29`) porque las
  -- citas de una ocupan el lunes de PRO1 para el resto.
  ```

  (La línea 5, «Reutiliza los actores…», queda igual salvo que la enumeración termina en «P1, P2)».)

#### R2.1.2 · Secciones nuevas K1-K9 (después de J, antes de la lista de mutantes)

Reglas comunes: todas en lunes salvo la ausencia de K5; citas de P1/PRO1/TT29 en CA salvo indicación, ids
`pg_temp.cita29(12…)` consecutivos; llamada como PRO1 (`call pg_temp.como(:PRO1)` … `call
pg_temp.reset_sesion()`) salvo indicación; cada aserción compara el **array completo**. Las ausencias se
insertan con las mismas columnas que H (`perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin,
zona_horaria, motivo`), `tipo = 'ausencia'`, `desde = hasta = el día`, `motivo 'T-043 Kn'`.

| Sección | Día | Fijación | Llamada | Array esperado (HEAD) | Mata, y qué da el mutante |
|---|---|---|---|---|---|
| **K1 · otro profesional** (H1) | `l077` | Solo una cita **de PRO2 con P2 en CB**, 10:30-11:20 (`cita29(12, :CB, :'l077', '10:30', '11:20', :P2, :PRO2, :TT29)`) | como **TEC1** | `{09:00:00/libre/-, 10:00:00/libre/-, 11:00:00/libre/-, 12:00:00/libre/-, 13:00:00/libre/-}` | N3 (sin `c.profesional_id = p_profesional_id`): `09:00:00/libre/40` |
| **K2 · cita anterior al tramo** (H2) | `l084` | Citas 09:00-09:50 y 11:30-12:20 | PRO1 | `{09:00:00/ocupado/-, 10:00:00/libre/40, 11:00:00/ocupado/-, 12:30:00/libre/-}` | N2b (`c.inicio >= v_f_ini`): `10:00:00/libre/-` |
| **K3 · adyacente más una segunda dentro del umbral** (H2) | `l091` | Citas 10:00-10:20 y 10:30-11:20 | PRO1 | `{09:00:00/libre/-, 10:00:00/ocupado/-, 11:30:00/libre/-, 12:30:00/libre/-}` | N1 (`c.inicio > v_tras`): `09:00:00/libre/40` |
| **K4 · cita en `F_fin` exacto** (H3) | `l098` | Cita en CA 09:00-09:20, y cita **de PRO1 en CB** 14:00-14:50 | PRO1 | `{09:00:00/ocupado/-, 09:30:00/libre/-, 10:30:00/libre/-, 11:30:00/libre/-, 12:30:00/libre/-}` | N4 (`c.inicio <= v_f_fin`): `12:30:00/libre/40` |
| **K5 · ausencia de otro día** (H4) | `l105` | Cita 10:30-11:20 el `l105`; ausencia de PRO1, `centro_id null`, **el `l106`** (martes), 10:00-10:20 | PRO1 | `{09:00:00/libre/40, 10:00:00/ocupado/-, 11:30:00/libre/-, 12:30:00/libre/-}` | N5 (ausencia sin `desde/hasta`): `09:00:00/libre/-` |
| **K6 · ausencia en otro centro** (H4) | `l112` | Cita 10:30-11:20; ausencia de PRO1 **en CB**, 10:00-10:20, el `l112` | PRO1 | el mismo array que K5 | N6 (ausencia sin filtro de centro): `09:00:00/libre/-` |
| **K7 · ausencia de otro profesional** (H4) | `l119` | Cita 10:30-11:20; ausencia **de PRO2**, `centro_id null`, 10:00-10:20, el `l119` | PRO1 | el mismo array que K5 | N7 (ausencia sin `d.perfil_id`): `09:00:00/libre/-` |
| **K8 · ausencia dentro del descanso** (H4) | `l126` | Cita 10:30-11:20; ausencia de PRO1, `centro_id null`, **09:52-09:58**, el `l126` | PRO1 | `{09:00:00/libre/-, 10:00:00/ocupado/-, 11:30:00/libre/-, 12:30:00/libre/-}` | N10 (rango de la ausencia desde `v_tras` en vez de `v_cursor + v_dur`): `09:00:00/libre/40` |
| **K9 · segundos y `ceil`** (H5) | `l133` | Cita **10:30:20-11:20:20** (`time '10:30:20'`) | PRO1 | `{09:00:00/libre/41, 10:00:00/ocupado/-, 11:30:20/libre/-, 12:30:20/libre/-}` | N8 (`floor`): 40; también `round` (40) y el cast `::integer` sin `ceil` (40) |

Cuentas que respaldan cada array (tramo libre en `c`: salta 60 min; coteja citas sobre `[c, c+60)` y
ausencias sobre `[c, c+50)`; `T = c + 60`):

- **K1**: PRO1 no tiene citas, todo libre. Con N3, `S = 10:30` para `c = 09:00` → `10:30 − 09:50 = 40`.
- **K2**: 09:00 ocupado → salta a 10:00. 10:00 libre: `T = 11:00`, `S = 11:30` → `11:30 − 10:50 = 40`. 11:00
  ocupado → salta a 12:30, libre sin `S`. Con N2b, `S = 09:00` y `09:00 > 11:00` es falso → null.
- **K3**: 09:00 libre, `T = 10:00`, `S = 10:00` → `S > T` falso → null. 10:00 choca con las dos → salta a
  `max(10:30, 11:30) = 11:30`. Con N1, `S = 10:30` → 40.
- **K4**: 09:00 ocupado (rango hasta 09:30); los tramos se desplazan a :30. En 12:30, `T = 13:30`; la cita de
  las 14:00 no cumple `< 14:00` → null. Con N4, `14:00 − 13:20 = 40`. 13:30 no cabe (`13:30 + 50 > 14:00`).
- **K5-K7**: el caso de G (40); la ausencia está en otro día, otro centro u otro profesional, y `v_limite2`,
  que filtra igual, tampoco la ve, así que ningún tramo cambia.
- **K8**: la ausencia (09:52-09:58) no toca `[09:00, 09:50)`, así que el 09:00 es libre; `[09:50, 10:30)` sí
  solapa → null. Con N10, `[10:00, 10:30)` no solapa → 40.
- **K9**: `ceil(40 min 20 s / 60 s) = 41`; el ocupado salta a `upper(rango) = 11:30:20`; 13:30:20 no cabe.

**Dónde cae primero cada mutante** (aislado, `00 + 01 + 29`; comprobado sección a sección contra B-J y las K
anteriores):

- **N1** cae en K3. C tiene `S = T` con una sola cita: con `>`, `S` es null, igual que en HEAD.
- **N2b** cae en K2. En B-J, el mínimo desde `v_f_ini` es la misma cita que desde `T`, o una anterior con
  `S ≤ T`, que da null como en HEAD.
- **N3** cae en K1.
- **N4** cae en K4; en I la cita está a las 14:10.
- **N5** cae en K5: es el primer día con una ausencia de **otro** día ya sembrada (la de H, `l056` 10:00-10:20,
  basta; la de K5 lo hace explícito). B1 y G corren antes de que exista la de H.
- **N6** cae en K6. **N7** cae en K7.
- **N10** cae en K8. En H la ausencia (10:00-10:20) también solapa con `[10:00, 10:30)`.
- **N8** cae en K9.

Ninguna K va antes de J, así que **M1-M9 siguen cayendo donde caían**. En el banco completo, N5 puede caer
antes (en B1), si otro banco sembró una ausencia parcial de PRO1 a una hora que cruce 09:50-10:30; vale igual:
lo exigido es que caiga.

Anotación de mutantes, al final del fichero: debajo de M9, las líneas N1, N2b, N3, N4, N5, N6, N7, N8 y N10
con el formato de las actuales (`-- N3  sin c.profesional_id = p_profesional_id   cae en K1`).

#### R2.1.3 · El formulario: Guardar espera al cálculo vigente (B-H1 y B-H2)

En `app/(app)/agenda/nueva/formulario-alta.tsx`:

1. Justo **después** de `const catalogoVacio = tipos.length === 0;` (:375), no antes (ahí se declara
   `catalogoVacio`):
   ```ts
   // Los huecos pintados son de otra clave que la pedida: nada decide con ellos (T-043 R2, B-H1).
   const recalculando = calculo.clave !== claveCalculo;
   // Una sola guarda para los cuatro sitios que la repetían (H27, B-H3).
   const bloqueado = guardando || catalogoVacio || esperandoSerie || recalculando;
   ```
2. `bloqueado` sustituye a la conjunción literal en los cuatro sitios, sin otro cambio:
   `agendarIgualmente` (:312, `if (bloqueado) return;`), `onSubmit` (:383, `if (bloqueado) {
   evento.preventDefault(); return; }`), `ocupado={bloqueado}` (:576) y `aria-disabled={bloqueado}` (:587).
3. `TarjetasSugerencia cargando={recalculando}` (:473): el mismo valor, con nombre. Opcional.
4. **Nada más.** `enviar` no cambia: ahora solo se ejecuta con la vista vigente, porque `onSubmit` corta
   antes. No hay textos nuevos; Guardar no cambia de etiqueta (`aria-disabled` lo anuncia como no disponible,
   igual que con la serie en vuelo). No se tocan `guardar`, el efecto de foco ni el del recálculo.

Efecto: un clic en Guardar (o en «Agendar igualmente») con un recálculo en vuelo no hace nada, igual que con
la serie en vuelo; cuando llega la vista, el siguiente clic decide con ella. El aviso ya no puede montarse con
la vista vieja, así que tampoco desmontarse con el foco dentro cuando llega la nueva (B-H1), ni guardarse sin
aviso, ni avisar con los minutos de la duración anterior (B-H2).

`docs/interfaz.md`, en el párrafo de T-043 del alta, una frase: «Mientras se recalculan los huecos, Guardar y
"Agendar igualmente" esperan, como esperan a la serie: no deciden con los huecos de antes».

#### R2.1.4 · Pruebas nuevas y cambiadas del formulario (`formulario-alta.test.tsx`)

**Ayuda**: `elegirTipoYHueco` termina con
`await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('aria-disabled')).not.toBe('true'));`
para que toda prueba que la usa parta de un cálculo vigente.

**Prueba existente que se ajusta (H27, `tras %s, Guardar sigue enfocado y activable`, :794)**: tras
`hueco_ocupado`, `excluirHuecos` cambia y hay un recálculo legítimo en vuelo. Si la aserción `aria-disabled`
cae por eso, **lo único permitido** es envolver esa línea en `waitFor`; `disabled === false` y el foco siguen
inmediatos.

**Prueba de T-028 que se reescribe (:256)**. Ya no se puede pulsar Guardar con el recálculo en vuelo; el orden
nuevo es el único en que esa carrera sigue existiendo:
`recalcularAlta`: 1.ª `VISTA`; 2.ª (tipo B) diferida; resto `SIN_EL_HUECO`. `guardarAlta` diferida.
`elegirTipoYHueco(TIPO_A)` → clic en Guardar → cambio a tipo B (2.ª llamada, en vuelo) → se resuelve
`guardarAlta` con `hueco_ocupado` y `SIN_EL_HUECO` → se resuelve la 2.ª llamada con `SIN_EL_HUECO`. Esperado,
el de ahora: `avisos()` contiene «acaba de ocuparse» y no «ya no cabe». Mutante que debe matar: quitar
`if (!vigente) return;` tras `await recalcularAlta(...)` (:151); la respuesta vieja desmarca y escribe «ya no
cabe». El nombre dice «mientras se guarda, cambia la duración».

**Nuevas, en el `describe` del aviso de hueco raro** (ids para la evidencia):

- **R1 · (B-H1, sonda S5) «con un recálculo en vuelo, Guardar no decide con la vista vieja y el foco no cae a
  body»**. `recalcularAlta`: 1.ª `RARA` (`17:00` raro, 30); 2.ª (tipo B) diferida; resto `SIN_RARA` (bloques
  17, 18 y 19 libres, sin raros). `pinta({ vista: RARA })`; `elegirTipoYHueco(TIPO_A)`; `act` con el cambio a
  `TIPO_B`; `const guardar = getByRole('button', { name: 'Guardar' }); guardar.focus();`;
  `await act(async () => { fireEvent.click(guardar); })`; `await act(async () => {})` para drenar.
  Aserciones, en este orden (la primera discrimina):
  (1) `queryByRole('region', { name: AVISO })` es null; (2) `guardarAlta` no llamada; (3) `guardar` con
  `aria-disabled="true"`. Se resuelve la 2.ª con `SIN_RARA`; se espera `aria-disabled` distinto de `"true"`;
  (4) `document.activeElement === guardar`; (5) el aviso sigue null. Por último, con `guardarAlta` resolviendo
  `ok`: clic en Guardar → una llamada con `objectContaining({ tipoTerapiaId: TIPO_B, horaLocal: '17:00' })`.
  **Contra HEAD** cae en (1): aparece la región del aviso, calculada con `RARA`. Si (1) se comentara, caería en
  (4) con `BODY`, que es la sonda S5.
- **R2 · (B-H2, sonda S6) «con un recálculo en vuelo, Guardar no guarda sin aviso; con la vista nueva,
  avisa»**. 1.ª `VISTA` (sin raros); 2.ª (tipo B) diferida; resto `RARA_40` (como `RARA` con
  `{ '2026-10-06T17:00': 40 }`). `guardarAlta` resuelve `ok`. Tipo A, 17:00; cambio a B; clic en Guardar; se
  resuelve la 2.ª con `RARA_40`; se espera Guardar activo. **Primera aserción**:
  `expect(m.guardarAlta).not.toHaveBeenCalled()`. Contra HEAD cae aquí («called 1 times»: guardó con tipo B y
  sin aviso). Después, clic en Guardar → región del aviso con la descripción `/40 minutos/`, y `guardarAlta`
  sigue sin llamar.
- **R3 · (B-H3, sonda S1, y el caso 7 de §3 en el formulario) «durante el guardado, "Agendar igualmente" no
  lleva disabled y un segundo clic no repite»**. `guardarAlta` diferida; `pintaRara()`; hueco, Guardar, región;
  `const agendar = getByRole('button', { name: 'Agendar igualmente' })`; `act` con un clic; se espera que
  Guardar diga «Guardando…». (1) `agendar.disabled === false` y `agendar.getAttribute('aria-disabled') ===
  'true'`; (2) otro clic con `act` → `expect(m.guardarAlta).toHaveBeenCalledTimes(1)`; se resuelve `ok`;
  (3) sigue `toHaveBeenCalledTimes(1)`. Mutantes: M_M (`ocupado={false}`) cae en (1); M_BM (quitar la guarda de
  `agendarIgualmente` **y** `ocupado={false}`) cae en (1), y si (1) se comentara, en (2) con 2 llamadas. M_B
  solo (quitar la guarda de la función) **sigue siendo equivalente** y se declara así en la evidencia: con
  `ocupado` cableado, el componente no llama a `alAgendarIgualmente` (lo fija `aviso-hueco-raro.test.tsx`), y la
  guarda de la función es una segunda capa sin efecto observable.
- **R4 · (B-H4a, sonda S2) «si "Agendar igualmente" falla sin desmontar el aviso, el foco se queda en
  "Agendar igualmente"»**. `guardarAlta` resuelve `{ ok: false, motivo: 'fallo', mensaje: 'No se pudo
  guardar.' }`; `pintaRara()`; hueco, Guardar, región; `agendar.focus()`; clic con `act`;
  `await screen.findByText('No se pudo guardar.')`; se espera que Guardar ya no diga «Guardando…»;
  `await act(async () => { await new Promise((r) => setTimeout(r, 0)); })` (drena los efectos pasivos).
  (1) La región del aviso sigue en el documento; (2) `document.activeElement === agendar`. Mutante M_E
  (`refGuardar.current?.focus()` sin mirar `body`) cae en (2), con Guardar enfocado. Gemela: la prueba existente
  de `hueco_ocupado` (el aviso se desmonta y el foco va a Guardar).
- **R5 · (B-H4b) «con la serie fallida y el aviso visible, "Agendar igualmente" reintenta la serie y no
  guarda»**. `previsualizarAltaSerie`: 1.ª `ok` con `FIRMA_A`; 2.ª rechaza (`new Error('red')`); resto `ok`.
  `pintaRara()`; hueco; periodicidad «semanal» (8 por defecto); se espera «Así quedaría la serie»; Guardar;
  región; número de sesiones a `9` (2.ª llamada, falla); se espera la alerta «No se ha podido calcular la
  serie»; clic en «Agendar igualmente». **Primera aserción**:
  `await waitFor(() => expect(m.previsualizarAltaSerie).toHaveBeenCalledTimes(3))`; después, `guardarAlta` no
  llamada. Mutante M_F (quitar `if (falloSerie !== null) { setSerieFallida(null); return; }` de
  `agendarIgualmente`): quedan 2 llamadas (la validación corta por la firma y no reintenta).
- **R6 · (B-H5, sonda S4) «las alternativas del aviso excluyen los otros huecos raros»**. `RARA2` = bloques 17,
  18 y 19 libres con `{ '2026-10-06T17:00': 30, '2026-10-06T18:00': 20 }`; `recalcularAlta` resuelve `RARA2`;
  `pinta({ vista: RARA2 })`; 17:00; Guardar. En `getByRole('list', { name: 'Huecos que no lo dejan' })`:
  (1) exactamente un `li`; (2) su texto contiene `19:00`; (3) ningún `li` contiene `18:00`. Mutante M_L
  (`alternativasSinHueco(vista.calendario.huecos, {}, …)`) cae en (1) con 2.
- **R7 · (B-H6) El caso 1 reordenado** («al pulsar Guardar sobre un hueco raro no guarda…», :845). Tras el
  clic, se espera a que el envío termine por cualquiera de los dos caminos:
  `await waitFor(() => expect(m.guardarAlta.mock.calls.length > 0 || screen.queryByRole('region', { name: AVISO }) !== null).toBe(true))`;
  luego, **primero**, `expect(m.guardarAlta).not.toHaveBeenCalled()`, y después `getByRole('region', …)`, la
  descripción y el foco. Mutante M_H (sin intercepción): tiene que caer con «expected "spy" to not be called», no
  con «Unable to find role="region"».

#### R2.1.5 · Bitácora

`docs/bitacora/T-043.md:19` se corrige: «`ocupado` ignorado … matado» y «alternativas con raros … matado» pasan
a decir dónde muere cada uno (la guarda del componente en `aviso-hueco-raro.test.tsx`, la función pura en
`alternativas-hueco.test.ts`, el cableado del formulario en R3 y R6). M_B se declara equivalente solo, con el
porqué de R3. La ronda 2 deja la tabla N1-N10 y M_E, M_F, M_L, M_M y M_BM con su resultado.

### R2.2 · Decisiones y alternativas descartadas

- **Ancla relativa en `año + 10`**: separación constante con todo banco relativo y unos cinco años de margen
  sobre el alcance máximo (febrero de `Y+5`). Descartado un literal (`2100-02-01`): los bancos relativos se
  le acercan un año cada año; es el mismo tipo de defecto que el de 15 y 18. Descartado `año + 6`: cabe, pero
  con un año de margen; bastaría un banco nuevo con offsets largos para repetir la colisión.
- **Secciones nuevas detrás de J, una por mutante, sin modificar ninguna existente**: M1-M9 conservan su
  sección de caída (CA4 no se mueve) y cada mutante nuevo tiene una única sección que lo nombra. Descartado
  llevar I a `F_fin` exacto (H3, la otra opción): I mata hoy M4 con una fijación más simple; K4 añade el borde
  sin perderla.
- **K1 como TEC1**: es el escenario del hallazgo (la fuga es para quien solo ve a PRO1). Como PRO1 también
  mataría N3, pero no fijaría la frontera que importa.
- **K9 con 20 s y no 30 s**: con 10:30:30 da 40,5 y `round` da 41, igual que `ceil`: ese mutante
  sobreviviría. Con 20 s, `ceil` da 41 y `floor`, `round` y el truncado dan 40.
- **B-H1: Guardar espera al cálculo vigente, como espera a la serie**. Es una conjunción más y repite un patrón
  que ya existe y está probado (H15). Arregla B-H1 y B-H2 por construcción. Descartado aplazar el envío y
  decidirlo al llegar la vista: necesita una intención pendiente, un efecto que vuelva a enviar y otro destino
  de foco, y guardaría después de que el usuario viera cambiar la pantalla («ya no cabe»), lo que sorprende y
  tiene más puertas a fallos. Descartado, con un recálculo en vuelo, guardar sin decidir: deja intacta la
  prueba de T-028 pero deja B-H2 tal cual (se pierde el aviso justo al cambiar de tipo). Descartado arreglar
  solo el foco (un efecto que lleve el foco a Guardar cuando el aviso se desmonta): tapa B-H1 y deja la
  decisión vieja.
- **Una sola constante `bloqueado` para las cuatro guardas**: B-H3 nace de cuatro conjunciones copiadas; añadir
  a mano una quinta condición en cuatro sitios repetiría el problema.
- **Todas las BAJA entran**: cada una es una prueba en ficheros que ya son territorio, sin código de producción
  nuevo salvo R2.1.3; anotarlas costaría lo mismo que hacerlas.
- **No se añade una opción de orden a `scripts/test-rls.mjs`**: está fuera del territorio, y la necesidad
  desaparece cuando se arreglen 15 y 18.

### R2.3 · Cómo se cierra cada criterio en la ronda 2

Antes de verificar: `max(version)` de la base = `20261012120000`; si un `db reset` desde `main` la ha quitado,
se aplica la de la rama.

- **CA2, mientras 15 tenga fechas pasadas.** `npm run test:rls` no puede salir con 0 por un fallo ajeno, y el
  contrato no puede cerrarse al pie de la letra (pregunta Q2). Se cierra con tres ejecuciones, todas en la
  evidencia con su salida:
  1. `npm run test:rls` en la rama **y en `main`**: las dos caen en `15-agenda` con el mismo 42501 «cita
     pasada». Demuestra que el fallo es ajeno y anterior.
  2. **El banco completo, con 15 al final y sin tocar 15 ni 18**: concatenación ad hoc en el scratchpad del
     verificador (el mismo `ejecutarSql`/`localizarContenedor` de `scripts/psql.mjs`, `begin;` … `rollback;`), en
     el orden `00 … 14, 16, 17, 18, 19, … 28, 29, 15`. El 18 no tiene literales de fecha
     (`grep -nE "20[0-9]{2}-" scripts/rls/18-*.sql` sale vacío); 21 y 26 encuentran C18TEC; ningún banco 16-29
     nombra ids del 15 (grep vacío). Esperado: `29-hueco-raro: OK` en el log y, después, el mismo fallo de 15;
     el código de salida es distinto de 0 solo por el 15. Es la prueba de convivencia con 16, 21, 23 y 26, que
     siembran agenda de PRO1. **Plan B**, si algún módulo de 16-29 cae porque falta algo que deja el 15: la
     transformación en memoria de la ronda 1 (literales `2026-10-0x` del 15 → `2026-12-0x`) con el orden
     alfabético, anotando que depende de la fecha.
  3. `00 + 01 + 29` aislado: termina en `OK`. Es la base para los mutantes.
- **CA4, ampliado**: M1-M9 y además N1, N2b, N3, N4, N5, N6, N7, N8 y N10, por sustitución de texto sobre una
  copia de la migración (comprobando que el patrón aparece una sola vez), medidos en
  `begin; <migración mutada>; 00; 01; 29; rollback;` (el método del revisor A). Cada uno cae en la sección que
  dice R2.1.2, con la línea del `\echo` o el mensaje del `assert`. Tabla mutante → sección → línea en la
  evidencia.
- **CA3**: G sin cambios; K1 añade el caso de TEC1 con una cita ajena.
- **CA5**: `npm test` en verde; R1-R7 pasan en la rama; cada mutante de interfaz medido en una copia cae en la
  aserción numerada que dice R2.1.4: M_E, M_F, M_L, M_M, M_BM, M_H (por la llamada), quitar `recalculando` de
  `bloqueado`, y quitar `if (!vigente) return;` para la :256 reescrita. Además, **R1 y R2 se ejecutan contra el
  `formulario-alta.tsx` de HEAD c8759df** (con las pruebas nuevas) y caen: demuestra que reproducen la carrera
  de verdad.
- **CA8**: `node ~/.claude/pipeline/territorio.mjs T-043` ya no dice «sin territorio declarado»: enumera el
  territorio y sale con 0. Si dice «sin territorio», la corrección del contrato no está aplicada.
- **CA1, CA6 y CA7**: sin cambios. CA6 sigue: R2.1.3 no añade `disabled`, y `grep -n "disabled=" formulario-alta.tsx`
  solo da `aria-disabled`.

### R2.4 · Riesgos, por probabilidad

1. **Alta.** Pruebas del formulario que hoy pulsan Guardar sin esperar al recálculo pueden caer o volverse
   intermitentes con `recalculando`. Remedio: la ayuda de R2.1.4 y, solo en H27, el `waitFor` sobre
   `aria-disabled`. Prohibido quitar `recalculando` de `bloqueado` o debilitar otra expectativa; toda prueba
   cambiada se lista en la bitácora con su motivo.
2. **Media.** R4 queda verde con M_E si no se drenan los efectos pasivos antes de mirar el foco. El drenaje con
   `setTimeout(0)` de R2.1.4 lo cubre; la prueba solo vale si M_E la pone en rojo.
3. **Media.** El orden «15 al final» puede romperse si algún módulo 16-29 depende en silencio del estado del
   15: para eso está el plan B de R2.3.
4. **Baja.** Un banco futuro que siembre agenda de PRO1 más allá de `año + 5`: la cabecera nueva lo avisa.
5. **Baja.** Cambio de hora en el año + 10: las horas son locales en los dos lados (`cita29` y la franja en
   `Europe/Madrid`), así que el cálculo no depende de en qué semana cae marzo. Ya ocurría con `año + 4`.
6. **Baja.** El sello de la migración no cambia y el banco no nombra su versión. Si la integración la
   renombrara, solo cambia la primera línea del `territorio:`.

### R2.5 · Qué revisar

- **Ancla**: ¿`anio_29` es `+ 10`? ¿La franja llega a `+ 140` y el `\gset` define `l077` … `l133` y `l106`?
  ¿La cabecera ya no dice «21 usa año + 3» y nombra el grep?
- **Cada K compara el array completo**, sin `like` ni `@>`: un array con un tramo de más o de menos tiene que
  fallar.
- **K1 se llama como TEC1** y la cita es de PRO2 con P2 en CB, no de PRO1 (si fuera de PRO1, sería G y no
  mataría N3).
- **K4**: la cita de las 14:00 es de PRO1 en CB, no en CA (en CA haría ocupado el tramo y no mediría la cota).
- **K5**: la ausencia está en `l106`, no en `l105` (en el mismo día, el array sería el de H).
- **K8**: la ausencia (09:52-09:58) no puede tocar `[09:00, 09:50)`; si la tocara, el 09:00 sería ocupado y K8
  no mediría N10.
- **K9**: la cita lleva `:20`, no `:30`, y el array tiene `11:30:20` y `12:30:20`. Comprobar que `round` cae.
- **Mutantes**: cada N cae en su K al medirse aislado; M1-M9 siguen en su sección (tabla de CA4).
- **Formulario**:
  - `bloqueado` va después de `catalogoVacio`. Si va antes, el primer render lanza `ReferenceError` y todas
    las pruebas caen por un motivo equivocado.
  - Las cuatro guardas usan `bloqueado`; ninguna conserva la conjunción vieja. `enviar` no cambia. Ningún
    `disabled=`.
- **R1 y R2 caen contra HEAD c8759df** en la aserción numerada (1), la que discrimina, no en una posterior ni
  por un selector.
- **La :256 reescrita** sigue fallando sin `if (!vigente) return;`. Si ya no falla, la carrera que protegía
  quedó sin prueba.
- **H27**: si se tocó, solo con `waitFor` sobre la línea de `aria-disabled`.
- **Puertas laterales**:
  - Intro en un campo y segundo clic durante el recálculo: los corta `onSubmit`, con `bloqueado`.
  - «Agendar igualmente» con el aviso visible y un recálculo en vuelo: no hace nada (`ocupado` y la guarda de
    la función usan `bloqueado`).
  - Un recálculo que falla (`ok: false` o excepción) pone `calculo.clave = claveCalculo` (:154, :173): Guardar
    no se queda bloqueado para siempre. No añadir nada, pero comprobar que sigue así.
- **CA2**: la evidencia trae las tres ejecuciones de R2.3, con el orden exacto de módulos y la línea
  `29-hueco-raro: OK` antes del fallo del 15.
- **Territorio**: `territorio.mjs T-043` enumera la lista y sale con 0.

### R2.6 · Territorio

No hace falta territorio de código nuevo: el 29, el formulario y su prueba, `docs/interfaz.md` y la bitácora ya
están dentro. Se corrige la forma del bloque en el contrato: los comentarios pasan a líneas `#` **antes** de
`territorio:`, que queda solo en su línea, y ningún elemento lleva comentario. Se añaden `docs/bitacora/T-043.md`
y `docs/state.md`: ya son rutas comunes de `territorio.mjs`, pero se declaran para que el verificador no los
marque como fuera, como en la ronda 1. Aplicado en `tickets/T-043-aviso-de-hueco-raro.md`.

### R2.7 · Delegable

Nada: las secciones del banco y las pruebas de foco y de carrera son comportamiento.

### Lo que no entra en la ronda 2, y por qué

- **Arreglar las fechas fijas de 15 (y revisar 18)**: no es de este ticket; está en `docs/state.md` como
  «requiere ticket».
- **Una opción `--orden`/`--sin` en `scripts/test-rls.mjs`**: fuera del territorio, y sobra en cuanto se arregle
  el 15.
- **Un efecto genérico «si el aviso se desmonta con el foco dentro, foco a Guardar»** para otros caminos: con
  R2.1.3, todo desmontaje del aviso sale de un control fuera del aviso (tipo, semana, profesional), que conserva
  el foco, o de «Agendar igualmente» con `hueco_ocupado`, que ya está resuelto.
- **Anunciar «calculando huecos» al pulsar Guardar con un recálculo en vuelo**: la serie en vuelo tampoco lo
  anuncia. Si se quiere, va en un ticket de textos para las dos esperas a la vez.
- **Cambiar la migración**: ningún hallazgo la toca.

### Preguntas al propietario (ronda 2)

- **Q1 · Guardar espera al recálculo de huecos.** Cambia un comportamiento de T-028: hoy, pulsar Guardar con el
  cálculo en vuelo guarda en el acto; con el arreglo, el clic no hace nada hasta que llegan los huecos
  (normalmente menos de un segundo), igual que con la serie. **Recomendación: aceptarlo.** La alternativa es
  guardar sin mirar la rareza durante esa ventana, y entonces el aviso se pierde justo al cambiar de tipo. Si se
  elige la alternativa, R2.1.3 se reduce a «con `recalculando`, `enviar` llama a `guardar` sin decidir», y B-H2
  se anota como aceptado.
- **Q2 · CA2 con el 15 roto.** El contrato pide que `npm run test:rls` salga con 0, y eso depende de otro
  ticket. **Recomendación**: dar CA2 por PASA con las tres ejecuciones de R2.3, siempre que la (2) muestre
  `29-hueco-raro: OK` después de 16, 21, 23 y 26 y la (1) el mismo fallo en `main`. Y abrir ya el ticket de las
  fechas fijas del 15 (y del 18, si lo confirma), para que `test:rls` en verde vuelva a ser la puerta.

**Respuestas del propietario (06-10-2026):** Q1, «Sí, esperar»: R2.1.3 se aplica entero. Q2, «Con tres
ejecuciones»: CA2 se cierra como dice R2.3. El ticket de las fechas fijas del 15 y del 18 está abierto como T-049.

## Ronda 3 (06-10-2026)

Entrada: la revisión combinada de la ronda 2 (`tickets/T-043/revision.md`: B2-H1 MEDIA; B2-H2, B2-H3 y B2-H4
BAJA; H1 y H2 del revisor A) y la evidencia de la ronda 2 (CA4 NO_VERIFICABLE, CA2 por plan B). Código leído en
la rama `T-043-aviso-de-hueco-raro`, HEAD f2670dc, con `git show`. La migración no cambia en esta ronda.

### R3.0 · Hechos verificados contra el código

- **El aviso sigue montado durante el recálculo** (`formulario-alta.tsx` @ f2670dc):
  - `:121` toma la rareza de `calculo.vista` sin mirar de qué clave es;
  - `:123` deriva `avisoVisible` de ella;
  - `:572` monta el aviso con `ocupado={bloqueado}`.
  Mientras `recalculando` es verdadero, el aviso está en pantalla con un «Agendar igualmente» inerte, y el
  usuario puede entrar en él. Cuando llega la vista, el aviso se desmonta con el foco dentro (B2-H1, sonda S7).
- **Tras un fallo se decide con la vista vieja.** Las ramas de fallo (`:152-155` y `:171-174`) hacen
  `setCalculo((anterior) => ({ ...anterior, clave: claveCalculo }))`, así que la clave queda «al día» con la
  vista de antes, y `:121` decide con ella (B2-H2, sonda S8). Esas dos líneas son lo único que saca a Guardar de
  `recalculando` tras un fallo, porque el efecto `:138-179` no vuelve a correr sin otro cambio de clave. Ninguna
  prueba las fija: M_FA y M_FC sobreviven 75/75 (B2-H3).
- **Todo cambio de clave nace en un control de fuera del aviso**, que conserva el foco:
  - el buscador de paciente (`elegirPaciente`, `:272-289`);
  - los selects de profesional, centro y tipo (`:413`, `:430`, `:438`, `:459`);
  - la navegación de semana (`alCambiarSemana={setFoco}`, `:484`);
  - `excluirHuecos` en la rama `hueco_ocupado` (`:350`), que además deja `elegido = null` y ya pone
    `focoPendiente = 'guardar'` (prueba de `:950`).
- **`huecoRaroElegido` solo se lee en dos sitios**: la intercepción de `enviar` (`:300`) y el montaje del aviso
  (`:572-576`). `vista.huecosRaros` solo se lee en `:121` y en las alternativas del aviso (`:576`), que solo
  existen con el aviso montado.
- **Ya no son verdad**:
  - el comentario de `:376`, «nada decide con ellos»;
  - `docs/interfaz.md:491` @ rama, «no decide con los huecos de antes».
  Las dos frases son falsas por la puerta del fallo (B2-H2).
- **Banco 29 @ f2670dc**:
  - El `\gset` acaba en `l133` (`:60`) y la franja llega a `lunes_29 + 140` (`:66`).
  - Los ids de cita usados van de 1 a 23.
  - Ningún caso tiene una cita confirmada, un festivo parcial ni una ausencia con `hasta` nulo.
  - La cabecera (`:6-12`) afirma que «ningún banco 00-28 escribe agenda más allá de febrero de año + 5». T-049
    la vuelve falsa: según su mapa de franjas (`tickets/T-049-fechas-del-banco-rls.md:115-129`), 26 pasa a
    Y+6, 17 a Y+7 y 19 a Y+8. La conclusión (29 en Y+10 está libre) sigue siendo verdad.
  - `:18` y el bloque de anotaciones (`:466-486`) solo nombran M1-M9 y N1-N10. N9 se mide pero no está
    anotado.
- **README @ rama, fila 29 (`scripts/rls/README.md:53`)**: dice «Anclas en el año + 4» y lista solo A-J y
  M1-M9. Está desfasada desde la ronda 2.
- **Esquema**:
  - `disponibilidad_forma_ck` (`20260906120000_agenda_esquema.sql:343-369`) admite ausencia y festivo con
    `hasta` nulo.
  - `disponibilidad` no es de solo-añadir: borrar una fila de prueba dentro de la transacción del banco es
    legítimo, y la auditoría la deja anotada.
- **Medido por mí** en `begin; <migración de la rama>; 00; 01; 29 con K10-K12; rollback;` contra
  `supabase_db_Psicogestion`, con una copia del 29 en el scratchpad (`r3/arma.js` + `r3/k.sql`) y el
  ejecutor del revisor A (`mut43r2.mjs`):

  | Caso | Resultado |
  |---|---|
  | ORIG | `29-hueco-raro: OK`, con las cinco aserciones K10-K12 en OK |
  | N11 (`estado in ('programada')`) | cae en **K10** |
  | N12 (`tipo in ('ausencia')`) | cae en **K11** |
  | N13 (`d.hasta >= v_dia`) | cae en **K12** |
  | M1-M9, N1-N10, N8_round/trunc/cast, N9_sin_reset_null | cada uno en su sección de siempre (tabla R3.1.6) |
  | X_centro_null y X_aus_fin_tras | caen en H |
  | Sin `'realizada'` en el filtro de estado | **sobrevive**: ver «Lo que no entra» |

  No se ha tocado la base fuera de esas transacciones.
- **T-049**:
  - Su rama existe (`T-049-fechas-del-banco-rls`), sin fusionar; `main` = ab6c959.
  - Su contrato (`:280-289`) fija el orden: T-049 se fusiona antes que T-043, y T-043 rebasa y añade «29 → +10» a
    la tabla del README.
  - Su CA4 espera la base en `max(version) = 20261011140000`.
- **Docker** levanta dos stacks: `supabase_db_Psicogestion` y `supabase_db_cinfa-e2e`.
  `scripts/psql.mjs:13-27` (`localizarContenedor`) toma el primer `supabase_db_*` de `docker ps`. Hoy es el
  de Psicogestión, pero depende del orden de arranque.

### R3.1 · Piezas y contratos

#### R3.1.1 · `app/(app)/agenda/nueva/formulario-alta.tsx`: «la vista solo cuenta si es de la clave pedida» (B2-H1, B2-H2, B2-H4)

Un solo invariante cierra los tres hallazgos: **la rareza del elegido solo se lee de una vista calculada para
la clave vigente, y nada en vuelo es vigente.** El aviso deja de existir durante el recálculo y tras un fallo.

1. **Estado** (sustituye `:116-119`). La clave inicial es la misma expresión de hoy:
   ```ts
   const [calculo, setCalculo] = useState<{ clave: string; claveVista: string; vista: VistaAlta }>(() => {
     const clave = [inicial.paciente?.id ?? '', inicial.profesionalId, inicial.centroId, '', vistaInicial.calendario.desde, ''].join('|');
     return { clave, claveVista: clave, vista: vistaInicial };
   });
   ```
   - `clave` es la última clave pedida que ya contestó, bien o mal.
   - `claveVista` es la clave para la que se calcularon los huecos pintados.
2. **Derivados**, justo después de `const vista = calculo.vista;` (sustituyen `:121`). Se quitan `:376-377`; la
   línea de `bloqueado` (`:379`) no cambia:
   ```ts
   // `clave`: la última pedida que ya contestó (bien o mal). `claveVista`: la de los huecos pintados.
   // Con un recálculo en vuelo, Guardar espera (`bloqueado`). Con una vista de otra clave (en vuelo o
   // tras un fallo), nada decide la rareza y el aviso no se monta (T-043 R3, B2-H1/B2-H2).
   const recalculando = calculo.clave !== claveCalculo;
   const vistaVigente = !recalculando && calculo.claveVista === claveCalculo;
   const huecoRaroElegido = elegido && vistaVigente ? (vista.huecosRaros[elegido.clave] ?? null) : null;
   ```
   `avisoVisible` (`:123`) no cambia: hereda el invariante a través de `huecoRaroElegido`.
3. **Rama `ok`** (`:158`):
   `setCalculo({ clave: claveCalculo, claveVista: claveCalculo, vista: resultado.vista });`
4. **Ramas de fallo** (`:154` y `:173`): **sin cambios**. El spread conserva la `claveVista` vieja, y eso es
   justo lo que impide decidir con ella.
5. **`hueco_ocupado`** (`:353`): `setCalculo((anterior) => ({ ...anterior, vista: nueva }));`
   - Conserva `clave` y `claveVista`, y no inventa vigencia.
   - En esa rama el `elegido` pasa a `null` y `excluirHuecos` cambia la clave, así que llega un recálculo
     de todos modos.
6. **El efecto de foco diferido y `elegirHueco` no cambian.** No se añade ningún efecto de «foco a Guardar
   si el aviso se desmonta» (R3.2, D-R3.2).

**Qué consiguen esas piezas:**
- **B2-H1.** El aviso se desmonta en el mismo commit que el cambio de clave. Ese cambio lo hace siempre un
  control de fuera del aviso, que conserva el foco. **El destino del foco es el control que cambió la clave**, y
  no se mueve. La llegada de la vista ya no desmonta nada, porque el aviso no estaba montado.
- **B2-H4.** «Agendar igualmente» no existe mientras se recalcula, así que la puerta lateral desaparece.
  `ocupado={bloqueado}` y la guarda `if (bloqueado) return;` de `agendarIgualmente` se quedan como cinturón:
  siguen cubriendo `guardando`, `catalogoVacio` y `esperandoSerie`, que sí pueden coincidir con el aviso.
- **B2-H2.** Tras un fallo, Guardar está activo (lo que pidió R2.5) y guarda sin aviso: la rareza es
  desconocida y el servidor no mira el hueco (D8). No decide nunca con la vista vieja, ni para avisar ni para
  callar.
- **Si llega una vista vigente y el elegido sigue raro**, el aviso reaparece sin robar el foco: `avisoHueco` se
  conserva y no se pone `focoPendiente`. Es el mismo comportamiento que la actualización silenciosa de HEAD.

#### R3.1.2 · Textos (B2-H2, B2-H4)

- **`formulario-alta.tsx`**: el comentario de `:376` desaparece con su línea. El nuevo es el del bloque de
  R3.1.1.2.
- **`docs/interfaz.md:491`** (rama). Se sustituye la frase «Mientras se recalculan los huecos (cambio de tipo, de
  profesional o de semana), Guardar espera al cálculo vigente y no decide con los huecos de antes.» por:
  > Mientras se recalculan los huecos (cambio de tipo, de paciente, de profesional, de centro o de semana), el
  > aviso se retira y Guardar espera al cálculo vigente. Si el cálculo falla, Guardar guarda sin aviso (la
  > rareza no se conoce) y nunca decide con los huecos de antes. «Agendar igualmente» solo existe con el aviso.
- **`aviso-hueco-raro.tsx:14`**. Se sustituye el JSDoc de `ocupado` por
  `/** Lo que bloquea Guardar en el formulario (\`bloqueado\`): «Agendar igualmente» no hace nada (H27). */`.
  Sin cambio de comportamiento: el comentario actual omite `recalculando` y miente por omisión.

#### R3.1.3 · `app/(app)/agenda/nueva/formulario-alta.test.tsx`: R8, R9, R9b y R10, y R1 (dentro del `describe` de `:840`)

Usan lo que ya hay: `pinta`, `vistaCon`, `bloque`, `RARA`, `SIN_RARA`, `AVISO`, `guardarActivo`,
`elegirTipoYHueco`, `TIPO_A`, `TIPO_B` y la espera `await act(async () => { await new Promise((r) => setTimeout(r, 0)); })`
de R4. Cada aserción lleva su número en comentario, y la que discrimina un mutante dice cuál.

- **R8 · B2-H1: el recálculo retira el aviso al cambiar la clave y el foco se queda en el control.**
  - **Preparación:**
    - `m.recalcularAlta` responde, por orden: `RARA` (50); una promesa diferida (`resolver2`); `SIN_RARA` (90).
    - `pinta({ vista: RARA })`; `await elegirTipoYHueco(TIPO_A)`.
    - Clic en Guardar; `findByRole('region', { name: AVISO })`; `waitFor` hasta que `activeElement` sea el aviso.
    - `const selector = screen.getByLabelText('Tipo de terapia'); selector.focus();`
    - `await act(async () => { fireEvent.change(selector, { target: { value: TIPO_B } }); });`
  - **Aserciones:**
    - (1) `queryByRole('region', { name: AVISO })` es `null` y `queryByRole('button', { name: 'Agendar igualmente' })`
      es `null`. **Aquí cae HEAD f2670dc y cae M_VV.**
    - (2) `document.activeElement === selector`.
    - Se resuelve `resolver2` con `SIN_RARA` dentro de `act`, `await waitFor(guardarActivo)` y la espera de
      `setTimeout(0)`.
    - (3) La región sigue `null`.
    - (4) `document.activeElement === selector`, y no `document.body`.
    - (5) `m.guardarAlta` no se ha llamado.

- **R9 · B2-H2 y B2-H3: tras un fallo del recálculo, Guardar está activo y no decide con la vista vieja.**
  - **Preparación:**
    - `m.recalcularAlta` responde `RARA` (50) y después
      `{ ok: false, motivo: 'fallo', mensaje: 'No se han podido calcular los huecos.' }`.
    - `m.guardarAlta` responde `{ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' }`.
    - `pinta({ vista: RARA })`; `await elegirTipoYHueco(TIPO_A)`, sin pulsar Guardar.
    - Cambio a `TIPO_B` dentro de `act`; `await screen.findByText('No se han podido calcular los huecos.')`.
  - **Aserciones:**
    - (1) `m.guardarAlta` no se ha llamado: el fallo no guarda nada por sí solo.
    - (2) `guardarActivo()`, inmediatamente y sin `waitFor`. **Aquí cae M_FA.**
    - Clic en Guardar dentro de `act`; `waitFor` hasta que `guardarAlta` tenga llamadas **o** exista la región
      (el patrón R7 de `:859`).
    - (3) `queryByRole('region', { name: AVISO })` es `null`. **Aquí cae HEAD f2670dc, y caen M_VV y M_VV2.**
    - (4) `m.guardarAlta` se ha llamado una vez, con
      `expect.objectContaining({ tipoTerapiaId: TIPO_B, horaLocal: '17:00' })`.

- **R9b · igual que R9, con el recálculo rechazado** (`mockRejectedValueOnce(new Error('red'))` en la segunda
  llamada). El texto de la alerta es `'No se han podido calcular los huecos.'` (`lib/i18n/es.ts:1053`,
  `agenda.alta.error.calcular`). **Aquí cae M_FC, en (2).** Se escribe como un `it` aparte, no como
  `it.each`: así el nombre del caso que cae dice qué rama es.

- **R10 · una vista de otra clave no cuenta, ni tras un fallo ni volviendo a la clave de la vista pintada.**
  - **Preparación:**
    - `m.recalcularAlta` responde, por orden: `RARA` (50); `{ ok: false, motivo: 'fallo', mensaje: 'No se han
      podido calcular los huecos.' }`; una promesa diferida (`resolver3`); `RARA` (50).
    - `pinta({ vista: RARA })`; `await elegirTipoYHueco(TIPO_A)`.
    - Clic en Guardar → aviso. Se enfoca el selector y se cambia a `TIPO_B`; `findByText` del fallo.
  - **Aserciones:**
    - (1) Región `null`. **Aquí cae HEAD f2670dc, y caen M_VV y M_VV2.**
    - Se cambia de vuelta a `TIPO_A` dentro de `act`. La clave pedida vuelve a ser la de la vista pintada,
      pero hay un recálculo en vuelo.
    - (2) Región `null`. **Aquí cae M_VV3.**
    - Se resuelve `resolver3` con `RARA` (50) dentro de `act`; `await waitFor(guardarActivo)`.
    - (3) `await screen.findByRole('region', { name: AVISO })` con la descripción `/30 minutos/`. La vista vigente
      vuelve a avisar.
    - (4) `document.activeElement === selector`: la reaparición no roba el foco.
    - (5) `m.guardarAlta` no se ha llamado.

- **R1 (`:976`), solo comentarios.**
  - (1) deja de discriminar: con el invariante, el aviso no se monta ni con el arreglo ni sin `recalculando` en
    `bloqueado`. Su comentario pasa a `// (1) el aviso no se monta (R3)`.
  - Ahora discrimina (2): `// (2) discrimina M_R y M_R_submit`.
  - Ninguna aserción cambia.

#### R3.1.4 · `scripts/rls/29-hueco-raro.sql`: K10, K11 y K12 (H1 y H2 del revisor A)

Solo el banco; la migración no cambia, porque la función ya filtra bien los tres casos (ORIG en verde).

1. **`\gset` (`:41-60`).** Tras `l133` se añaden `l140`, `l147` y `l154` (`(:'lunes_29'::date + N)::text as lN`).
   La franja de `:62-67` pasa de `+ 140` a `+ 154`, y su comentario de «veinte semanas» a «veintidós semanas».
2. **Tras K9 y antes del bloque de anotaciones**, tres secciones con el mismo patrón que K1-K9: cita con
   `pg_temp.cita29`, `pg_temp.como(:PRO1)`, aserción del array completo de `pg_temp.dia29` y
   `pg_temp.reset_sesion()`. El texto exacto, ya medido, está en el scratchpad de la sesión (`r3/k.sql`):
   - **K10 · cita confirmada (mata N11).**
     - `cita29(24, :CA, :'l140', 10:30, 11:20, …)`.
     - `update public.citas set estado = 'confirmada' where id = 'a2900004-0000-4000-8000-000000000024'`, como
       `postgres` y antes de `como`.
     - Aserción de fijación: el estado leído es `'confirmada'`, con mensaje
       `'K10 · fijación: la cita de las 10:30 está confirmada'`.
     - Esperado:
       `['09:00:00/libre/40','10:00:00/ocupado/-','11:30:00/libre/-','12:30:00/libre/-']`, el mismo array que G.
   - **K11 · festivo parcial (mata N12).**
     - `insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)`
       `values (:PRO1, null, 'festivo', :'l147'::date, :'l147'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K11')`.
     - `cita29(25, :CA, :'l147', 10:30, 11:20, …)`.
     - Esperado: `['09:00:00/libre/-','10:00:00/ocupado/-','11:30:00/libre/-','12:30:00/libre/-']`, el de H.
   - **K12 · ausencia abierta, con `hasta` nulo (mata N13).**
     - Igual que K11, con `'ausencia'`, desde `l154`, `hasta` `null` y motivo `'T-043 K12'`.
     - `cita29(26, :CA, :'l154', …)`.
     - Esperado: el array de H.
     - Al acabar, la ausencia abierta se retira con una aserción de recuento:
       ```sql
       with borrada as (
         delete from public.disponibilidad
          where perfil_id = :PRO1 and motivo = 'T-043 K12' and hasta is null
         returning 1
       )
       select pg_temp.assert((select count(*) from borrada) = 1,
         'K12 · la ausencia abierta se retira al acabar: ningún banco posterior la hereda');
       ```
       Una ausencia sin fin de PRO1 apagaría la agenda de cualquier banco que se añada detrás del 29.
   - **Formato de los mensajes**: id de sección + « · » + frase, como todos los del 29. El ejecutor de
     mutantes captura la sección con `ASERCIÓN FALLIDA: (\S+) ·`.
3. **Cabecera (`:6-12`)**. Se reescribe contra la tabla de T-049, sin cifras que T-049 vaya a mover. Texto:
   > ANCLA: primer lunes de febrero de año + 10. Los años de los demás bancos están en la tabla de
   > `scripts/rls/README.md` (T-049, D5.2): ninguno pasa de año + 8 y el 29 es el único en año + 10. Ninguna
   > `disponibilidad` sembrada antes del 29 queda abierta, y la que abre el 29 (K12) se borra al acabar su
   > sección. Un banco nuevo que siembre agenda de PRO1 en año + 10 tiene que mirar esto.

   La frase de las offsets de 16, 21, 23 y 26 se va: la tabla del README es la fuente.
4. **`:18` y el bloque de anotaciones.**
   - `:18` pasa a «Los mutantes M1-M9 y N1-N13 están al final, anotados.»
   - El bloque añade:
     - `-- N9  sin \`hueco_raro_minutos := null\` al empezar el tramo            cae en B1`
     - `-- N11 \`c.estado in (...)\` del hueco -> \`in ('programada')\`              cae en K10`
     - `-- N12 \`d.tipo in ('festivo', 'ausencia')\` del not exists -> \`in ('ausencia')\`   cae en K11`
     - `-- N13 \`(d.hasta is null or d.hasta >= v_dia)\` del not exists -> \`d.hasta >= v_dia\`   cae en K12`
     - `-- Sobrevive: quitar 'realizada' del filtro de estado del hueco (haría falta una cita realizada en el futuro).`
5. **README, fila 29** (`scripts/rls/README.md:53`). Se reescribe con: año + 10; las secciones A-J y K1-K12,
   cada una con su frase corta (las de K1-K9 salen de sus mensajes); los mutantes M1-M9 y N1-N13 medidos en
   `begin … rollback` con la migración dentro; y el superviviente declarado. La tabla de años de T-049 ya trae
   «29 → +10» (diseño de T-049, punto 10). Si al rebasar no estuviera, se añade.

#### R3.1.5 · CA4: cómo lo mide el verificador (ya no puede quedar NO_VERIFICABLE)

- **Encargo.** El orquestador escribe **CA4 y CA5-mutantes** en el encargo del verificador, con un puntero a
  esta sección. La ronda 2 quedó NO_VERIFICABLE porque el encargo no lo pedía.
- **Ejecutor** (un `.mjs` en el scratchpad del verificador). La referencia es `mut43r2.mjs` del revisor A, en el
  scratchpad de esta sesión: `C:\Users\Usuario\AppData\Local\Temp\claude\C--Users-Usuario-Desktop-01-Proyectos-Psicogestion\54fcd837-7d30-474a-83d1-2bf97ac7852f\scratchpad\mut43r2.mjs`.
  Si ya no existe, se rehace con estas reglas:
  1. Lee la migración `20261012120000_hueco_raro.sql` y `00-ayudantes.sql`, `01-fijacion.sql` y
     `29-hueco-raro.sql` **del árbol verificado**, normalizando CRLF a LF.
  2. Cada mutante es una sustitución de texto sobre la migración. Antes de sustituir, el ejecutor comprueba que
     el patrón aparece **exactamente una vez**; si no, aborta con código 2 y no cuenta el mutante. Los
     patrones del tipo y el estado se repiten en la función: se anclan en varias líneas, como hace
     `mut43r2.mjs`.
  3. Guion por mutante: `begin;` + migración mutada + `00` + `01` + `29` + `rollback;`, enviado por stdin a
     `docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -` con
     `spawnSync` y salida capturada.
     - **Contenedor fijado por nombre**, comprobado antes en `docker ps`. No se usa `localizarContenedor` ni
       `ejecutarSql`: el primero puede elegir `supabase_db_cinfa-e2e` y el segundo no deja capturar la salida.
     - Vale con cualquier `max(version)` de la base, porque la migración va dentro de la transacción. No
       necesita `db reset`.
  4. Base: **ORIG** (sin sustituir) tiene que imprimir `29-hueco-raro: OK` con estado 0. Si no, la medición no
     vale.
  5. De cada mutante se registra el estado, la primera línea con `ASERCIÓN FALLIDA` y la sección capturada con
     `/ASERCIÓN FALLIDA: (\S+) ·/`.
     - Veredicto MUERE si la sección capturada es la esperada.
     - **MUERE EN OTRA** si cae en otra sección: es un hallazgo y no cuenta como PASA.
     - **SOBREVIVE** si sale OK.
- **Tabla de mutantes esperada**. Patrones como en `mut43r2.mjs`; resultado medido el 06-10-2026 sobre el 29 con
  K10-K12:

  | Mutante | Sustitución en la función | Cae en |
  |---|---|---|
  | M1 | `and v_sig < v_tras + v_dur + v_desc` → `<=` | E2 |
  | M2 | `and v_sig > v_tras` → `>=` | C |
  | M3 | `v_tras := v_cursor + v_dur + v_desc;` → `v_tras := v_cursor + v_dur;` | C |
  | M4 | `and c.inicio <  v_f_fin;` → `;` | I |
  | M5 | `select min(c.inicio) into v_sig` → `max` | B1 |
  | M6 | `where d.perfil_id` del `not exists` → `where false and d.perfil_id` | H |
  | M7 | sin `and c.estado in (...)` antes de `and c.inicio >= v_tras` | J |
  | M8 | `(v_sig - (v_cursor + v_dur))` → `(v_sig - v_tras)` | B1 |
  | M9 | `if v_limite is null then` + `v_tras` → `if true then` | B1 |
  | N1 | `and c.inicio >= v_tras` → `>` | K3 |
  | N2b | `and c.inicio >= v_tras` → `>= v_f_ini` | K2 |
  | N3 | `where c.profesional_id = p_profesional_id` (con el estado y `>= v_tras` de ancla) → `where true` | K1 |
  | N4 | `and c.inicio <  v_f_fin;` → `<=` | K4 |
  | N5 | sin `d.desde <= v_dia` ni `d.hasta` en el `not exists` | K5 |
  | N6 | sin el filtro de centro en el `not exists` | K6 |
  | N7 | `where d.perfil_id = p_profesional_id` + tipo → `where true` | K7 |
  | N8, N8_round, N8_trunc, N8_cast | `ceil(` → `floor(` / `round(` / `trunc(` / sin función | K9 |
  | N9 | sin `hueco_raro_minutos := null;` antes de `if v_limite` | B1 |
  | N10 | `tstzrange(v_cursor + v_dur, v_sig, '[)')` → `tstzrange(v_tras, v_sig, '[)')` | K8 |
  | **N11** | estado del hueco (ancla `… 'realizada')\n               and c.inicio >= v_tras`) → `in ('programada')` | **K10** |
  | **N12** | en el bloque `and d.tipo in ('festivo', 'ausencia')\n … and tstzrange(v_cursor + v_dur` → `in ('ausencia')` | **K11** |
  | **N13** | en el mismo bloque, `(d.hasta is null or d.hasta >= v_dia)` → `(d.hasta >= v_dia)` | **K12** |

  En `mut43r2.mjs`, N11, N12 y N13 se llaman `X_estado_solo_prog`, `X_sin_festivo` y `X_hasta_null`. La
  evidencia usa los nombres N11-N13.
- **Evidencia.** Una tabla `mutante | esperado | obtenido | mensaje | veredicto`, la salida de ORIG, la línea de
  `docker ps` y el hash (`git hash-object`) del ejecutor usado.

#### R3.1.6 · CA5, mutantes de interfaz: lista y ejecutor

- **Ejecutor.** `mut-rb2.js` del revisor B, en el mismo scratchpad
  (`…\scratchpad\mut-rb2.js <raizCopia> [ids]`). Trabaja sobre una **copia** del árbol, tiene en cuenta CRLF,
  exige una sola coincidencia, corre
  `npx vitest run formulario-alta aviso-hueco-raro alternativas-hueco estado-alta` y restaura el fichero.
- **Entradas.** Se añaden cuatro con las cadenas exactas del código de R3.1.1. Las demás siguen con sus cadenas,
  porque las líneas que tocan no cambian:

| Mutante | Cambio | Debe caer en |
|---|---|---|
| **M_VV** | `const huecoRaroElegido = elegido && vistaVigente ? ` → `const huecoRaroElegido = elegido ? ` | R8 (1); también R9 (3) y R10 (1) |
| **M_VV2** | `const vistaVigente = !recalculando && calculo.claveVista === claveCalculo;` → `const vistaVigente = !recalculando;` | R9 (3), R10 (1) |
| **M_VV3** | la misma línea → `const vistaVigente = calculo.claveVista === claveCalculo;` | R10 (2) |
| **M_OK** | `setCalculo({ clave: claveCalculo, claveVista: claveCalculo, vista: resultado.vista });` → `setCalculo((anterior) => ({ ...anterior, clave: claveCalculo, vista: resultado.vista }));` | el primer caso del `describe` (`:852`), porque `guardarAlta` se llama: la vista nunca es vigente tras el primer recálculo |
| M_FA | sin `setCalculo(… clave: claveCalculo)` en la rama `!resultado.ok` | **R9 (2)** |
| M_FC | lo mismo en el `catch` | **R9b (2)** |
| M_R | `recalculando` fuera de `bloqueado` | R1 (2) (antes, (1)) |
| M_R_submit | `recalculando` fuera de la guarda de `onSubmit` | R1 (2) |
| M_R_aria | `recalculando` fuera de `aria-disabled` | R1 (3) |
| M_R_aviso | `recalculando` fuera de `ocupado` y de la guarda de `agendarIgualmente` | **equivalente por construcción**: con el aviso montado, `recalculando` es falso (`avisoVisible ⇒ vistaVigente ⇒ !recalculando`). Se mide igual y **debe salir todo verde**; si cae algo, el invariante no está donde se dice |
| M_E, M_F, M_L, M_M, M_BM, M_H, M_V | los de la ronda 2 | donde caían en la ronda 2: R4 (2), R5, R6 (1), R3 (1), R3 (1), `:863` (con otros 11 rojos), y `:256` y `:288`. Si alguno cae en otro sitio, es un hallazgo |
| M_B | solo la guarda de `agendarIgualmente` | equivalente desde la ronda 2 (la cubre `ocupado`): debe seguir todo verde |

- **Contra HEAD f2670dc.** Con las pruebas nuevas, R8, R9 y R10 se ejecutan contra el `formulario-alta.tsx`
  de f2670dc (`git show f2670dc:… > copia`) y caen en R8 (1), R9 (3) y R10 (1). Eso demuestra que reproducen
  B2-H1 y B2-H2 de verdad. R9b no cae contra HEAD, porque HEAD ya libera Guardar tras el fallo: R9b solo
  existe para M_FC.

#### R3.1.7 · CA2: la ejecución (2) de R2.3, reescrita

**La ejecución (2) de R2.3 no se puede hacer.** El orden `00 … 14, 16, … 29, 15` cae en 18, que necesita
citas del centro B que siembra el 15 (evidencia de la ronda 2). Queda sustituida por esta:

- **(2') Banco completo, en orden alfabético, con el 15 desplazado semanas enteras, en memoria.**
  - k es el menor entero ≥ 0 tal que `2026-10-06 + 7k ≥ current_date + 14`. Hoy (06-10-2026), k = 2, y las
    fechas pasan a 20, 21 y 22 de octubre.
  - Es la misma ventana que T-049 da al 15 (martes de D+14..D+20).
  - Al ser semanas enteras se conserva el día de la semana, que es lo que miran las franjas del 15.
  - Se reemplazan los 25 literales `2026-10-0(6|7|8)` del 15 (comprobado: son exactamente 25, todos con
    `+02`). Los desfases `+02` se dejan como están. Son exactos para octubre antes del día 25 (horario de
    verano), y el revisor A midió en verde incluso diciembre (invierno, `+01`): una hora de desfase no rompe
    el 15.
  - Se ejecuta con el mismo método de R3.1.5 (contenedor fijado, `begin … rollback`), con todos los módulos
    del árbol y la migración de la rama dentro de la transacción si la base no la tiene.
  - Esperado: estado 0, `29-hueco-raro: OK` después de 16, 21, 23 y 26, y las líneas K10-K12.
  - La evidencia anota k, las tres fechas y que la prueba depende de la fecha del día.
- **(2') solo hace falta si se verifica antes de que T-049 esté en `main`.** Con T-049 fusionada y la rama
  rebasada (R3.3), CA2 se cierra al pie de la letra: `npm run test:rls` sale con 0, el lint D4 de T-049 corre
  dentro y la salida trae `Contenedor: supabase_db_Psicogestion`. Las ejecuciones (1) y (2') sobran.

### R3.2 · Decisiones y alternativas descartadas

- **D-R3.1 · Una vigencia de la vista (`claveVista`) en lugar de parches por hallazgo.** Un solo invariante
  cierra B2-H1, B2-H2 y B2-H4, y deja equivalente el mutante que B2-H4 no podía matar.
  - Descartado: cerrar `avisoHueco` en cada sitio que cambia la clave. Son seis sitios, y el siguiente que se
    añada lo olvida.
- **D-R3.2 · Sin efecto de foco «si el aviso se desmonta con el foco dentro, foco a Guardar».** Con el
  invariante, ese caso no puede darse: el aviso solo se desmonta por una acción en un control de fuera
  (que conserva el foco) o por `hueco_ocupado`, que ya está resuelto. Un efecto defensivo inalcanzable dejaría
  un mutante superviviente para siempre y movería el foco en casos que hoy no lo necesitan.
- **D-R3.3 · Tras un fallo, Guardar guarda sin aviso.** No se reintenta el cálculo al pulsar Guardar, como hace
  la serie. Reintentar bloquearía guardar por una función informativa (el servidor no mira el hueco, D8), y
  R2.5 pidió no bloquear tras un fallo. La alerta del fallo ya dice que los huecos no se han calculado.
- **D-R3.4 · El aviso reaparece en silencio si la vista vigente lo sigue haciendo raro.** Así se conserva el
  comportamiento de HEAD («actualización silenciosa»).
  - Descartado: cerrarlo del todo al cambiar de clave. Obligaría a pulsar Guardar otra vez para ver un aviso
    que el usuario ya había pedido.
  - Descartado: robar el foco al reaparecer, porque el usuario está en el control que acaba de tocar.
- **D-R3.5 · Y1-Y3 como K10-K12 en el banco, sin tocar la migración.** La función ya es correcta en los tres
  casos (ORIG verde); faltaba fijarlo. Los mutantes N11-N13 caen cada uno en su sección.
- **D-R3.6 · K12 borra la ausencia abierta que siembra.** Es la única fila de `disponibilidad` sin fin del
  banco. Dejarla convertiría la cabecera en mentira y apagaría la agenda de PRO1 desde Y+10 para cualquier
  banco posterior. El borrado lleva una aserción de recuento, para que un cambio del motivo o del perfil no lo
  vuelva mudo.
- **D-R3.7 · Ejecutor de mutantes en `begin … rollback` con la migración dentro y el contenedor fijado.**
  - No obliga a resetear la base y vale con T-049 a medio verificar.
  - Descartado: `create or replace` sobre la base compartida (el método de CA4 en §3). Deja la base mutada si
    algo se interrumpe y choca con la verificación de T-049.

### R3.3 · Cómo se cierra cada criterio en la ronda 3, y el orden con T-049

**Orden con T-049. Recomendación: implementar ya, en paralelo, y verificar en serie, después de que T-049
esté en `main` y la rama se haya rebasado.** Decide el orquestador.

- **Por qué se puede implementar en paralelo:**
  - El implementador de la ronda 3 no necesita `db reset` ni `npm run test:rls`. Mide el 29 y los mutantes con
    el ejecutor de R3.1.5, que lleva la migración dentro de la transacción, y vitest no toca la base.
  - Los ficheros de T-049 que comparten (README y `docs/state.md`) se resuelven conservando ambos, como dice
    el contrato de T-049 (`:285-286`).
  - La cabecera del 29 se escribe contra la tabla del README (R3.1.4.3), sin cifras de otros bancos.
- **Por qué hay que verificar en serie:**
  - La base es una sola. El CA4 de T-049 exige `max(version) = 20261011140000`, y el CA1 y el CA2 de T-043
    exigen `20261012120000`.
  - CA2 al pie de la letra (`test:rls` con 0) solo existe con el 15 de T-049.
  - Verificar T-043 antes obligaría a otra vez al plan B y a una nota de «no se cumple a la letra».
- **Secuencia:**
  1. El implementador de la ronda 3 trabaja sobre la rama de T-043 y no toca la base fuera de
     `begin … rollback`.
  2. T-049 se verifica, se revisa y se fusiona.
  3. La rama T-043 se rebasa sobre `main`. Conflictos previstos: `scripts/rls/README.md` (la tabla de años de
     T-049 y la fila 29) y `docs/state.md`.
  4. Tras rebasar:
     - `grep -noE "extract\(year from (now\(\)|current_date)\)(::int)? *\+ *[0-9]+" scripts/rls/*.sql` da
       como máximo +8 fuera del 29 y +10 en el 29;
     - el lint D4 de T-049 sale limpio con el 29 dentro.
  5. El verificador de T-043 hace `npx supabase db reset` desde el árbol rebasado y comprueba que
     `max(version) = 20261012120000` (memoria «migración de rama antes de verificar»).
- **Si T-049 se atasca**, se verifica antes con (2') de R3.1.7. Se le dice al propietario que CA2 se cierra
  otra vez por el camino de Q2, no al pie de la letra.

**Criterios:**

- **CA1**: sin cambios, porque la migración no cambia.
- **CA2**:
  - con T-049 en `main`: `npm run test:rls` con estado 0, `Contenedor: supabase_db_Psicogestion` en la salida y
    las líneas `OK: K10 ·`, `OK: K11 ·`, `OK: K12 ·` y `29-hueco-raro: OK`;
  - sin T-049: (1) y (3) de R2.3, más (2') de R3.1.7.
- **CA3**: sin cambios (G y K1).
- **CA4**: la tabla completa de R3.1.5, con ORIG en OK y los 25 mutantes (M1-M9, N1-N13 y las variantes de N8)
  cayendo en la sección esperada.
- **CA5**:
  - `npm test` en verde, con R8, R9, R9b y R10;
  - la tabla de R3.1.6 completa;
  - R8, R9 y R10 contra f2670dc, cayendo donde dice R3.1.6.
- **CA6**: `grep -n "disabled=" app/(app)/agenda/nueva/formulario-alta.tsx app/(app)/agenda/nueva/aviso-hueco-raro.tsx`
  solo da `aria-disabled`. La ronda 3 no añade `disabled`.
- **CA7, manual en Chromium.** Se repite el paso del aviso con un cambio de tipo con el aviso abierto, y se
  anota:
  - que el aviso desaparece al instante;
  - que `document.activeElement` es el `select` de tipo;
  - que tras el recálculo el foco no cambia.
- **CA8**: `npm run lint`, `npm run build` y `node ~/.claude/pipeline/territorio.mjs T-043`.

### R3.4 · Riesgos, por probabilidad

1. **Alta. El ejecutor de `test:rls` elige el contenedor equivocado.** `localizarContenedor` toma el primer
   `supabase_db_*`, y hay dos stacks levantados.
   - Mitigación: la evidencia de CA2 tiene que traer `Contenedor: supabase_db_Psicogestion`; si no, no vale.
   - Arreglar `scripts/psql.mjs` no es de T-043: se anota en `docs/state.md` §Hallazgos.
2. **Media. El rebase sobre T-049 deja la cabecera del 29 o la fila del README contra una tabla que T-049
   implementó distinta de su contrato.** Mitigación: el grep de R3.3, paso 4, tras rebasar. El revisor compara
   la cabecera con la tabla del README rebasado, no con el contrato de T-049.
3. **Media. R8 o R10 pasan sin discriminar** por esperar mal: una aserción (1) dentro de `waitFor` que acaba
   pasando cuando llega la vista. Mitigación: las aserciones (1) y (2) de R8 y R10 son **síncronas**, justo
   después del `act` del cambio, y la tabla de R3.1.6 exige medir los mutantes contra HEAD.
4. **Baja. El aviso reaparece sin foco (D-R3.4)** y un lector de pantalla no lo anuncia. Es el comportamiento
   de HEAD tras un recálculo. El usuario lo encuentra al pulsar Guardar, porque Guardar vuelve a llevar el
   foco al aviso (caso 5 de §3).
5. **Baja. Las fechas de (2') tienen un `+02` fijo.** Pasado el 25 de octubre, la hora local se corre una hora.
   Diciembre se midió en verde con ese mismo desfase. Si alguna vez cae, se anota la fecha y se usa la k
   siguiente.

### R3.5 · Qué revisar

**B2-H1 (foco):**
- [ ] No queda ninguna lectura de `vista.huecosRaros` ni de `huecoRaroElegido` que no pase por `vistaVigente`:
  `grep -n "huecosRaros\|huecoRaroElegido" formulario-alta.tsx` da `:121`, la intercepción de `enviar`, el
  montaje y las alternativas del aviso, y nada más.
- [ ] No se ha añadido ningún efecto de foco nuevo, ni un `focoPendiente = 'guardar'` fuera de `hueco_ocupado`.
- [ ] Las aserciones (1) y (2) de R8 son síncronas, no están dentro de `waitFor`, y R8 cae contra f2670dc en
  (1).

**B2-H2, B2-H3 y B2-H4 (fallo y puerta lateral):**
- [ ] Las ramas de fallo **no** tocan `claveVista`; si alguien la pone a `claveCalculo`, B2-H2 vuelve. La rama
  `ok` pone las dos claves, y `hueco_ocupado` las conserva con un spread.
- [ ] R9 (2) se comprueba sin `waitFor` tras ver la alerta. M_FA y M_FC caen donde dice la tabla.
- [ ] M_R_aviso sale todo verde, y la evidencia lo declara equivalente con la implicación
  `avisoVisible ⇒ !recalculando`. Si cae, el invariante tiene una grieta.
- [ ] `docs/interfaz.md` y los comentarios dicen lo que hace el código: el aviso se retira durante el
  recálculo, y tras un fallo Guardar guarda sin aviso.

**Banco (H1 y H2 del revisor A):**
- [ ] K10 tiene su aserción de fijación (`estado = 'confirmada'`); sin ella, un trigger que reescriba el estado
  haría que K10 midiera una programada.
- [ ] K11 usa `festivo` con `centro_id null`, y K12 usa `hasta null`. El esperado de los dos es el array de H
  (09:00 con `-`).
- [ ] El borrado de K12 filtra por perfil, motivo **y** `hasta is null`, y su aserción exige exactamente 1.
- [ ] Ningún literal de fecha ni `current_date` nuevo en el 29: el lint D4 de T-049 tiene que pasar. Los ids
  24-26 no chocan con 1-23.
- [ ] La cabecera y la fila del README cuadran con la tabla de años del README rebasado. La fila 29 dice año
  + 10, K1-K12 y N1-N13.

**CA4 y CA5 (medición):**
- [ ] La evidencia trae ORIG en OK, el contenedor por nombre, la sección capturada de cada mutante y la de
  esperada. «MUERE EN OTRA» es hallazgo, no PASA.
- [ ] Los mutantes de interfaz se midieron sobre una copia, y el fichero de la rama quedó intacto
  (`git status` limpio tras medir).

**Orden:**
- [ ] Si se verificó tras T-049: `max(version) = 20261012120000` antes de `test:rls`, y CA2 por la vía directa.
- [ ] Si se verificó antes: (2') con k y fechas anotadas.

### R3.6 · Territorio

Sin cambios. Todo lo que toca la ronda 3 ya está en el `territorio:` del contrato:
- `app/(app)/agenda/nueva/formulario-alta.tsx` y su `.test.tsx`;
- `app/(app)/agenda/nueva/aviso-hueco-raro.tsx`;
- `scripts/rls/29-hueco-raro.sql`;
- `scripts/rls/README.md`;
- `docs/interfaz.md`;
- `docs/state.md`;
- `docs/bitacora/`.

Los ejecutores de mutantes viven en scratchpads y no se versionan.

### R3.7 · Delegable

Nada. Los cuatro cambios tienen comportamiento: el invariante de vigencia, pruebas de foco, el banco de RLS y
la medición de mutantes.

### Lo que no entra en la ronda 3, y por qué

- **Matar «sin `'realizada'`» en el filtro de estado del hueco.**
  - Para matarlo haría falta una cita `realizada` en el futuro. Ninguna guarda de la base la impide (el trigger
    de `agenda_esquema.sql:462` solo la salta), pero sembrarla sería fijar un estado que la aplicación no
    produce.
  - Ningún hallazgo lo pide.
  - Queda anotado como superviviente en el 29 y en el README.
- **Arreglar `localizarContenedor` en `scripts/psql.mjs`.** Está fuera del territorio y afecta a todos los
  bancos. Se anota en `docs/state.md` §Hallazgos.
- **Reintentar el recálculo tras un fallo**, con un botón o al pulsar Guardar: D-R3.3.
- **Anunciar la reaparición del aviso tras un recálculo**: D-R3.4; si se quiere, irá en el ticket de textos de
  R2.
- **Cambiar la migración**: ningún hallazgo la toca, y K10-K12 pasan con la de la rama.
