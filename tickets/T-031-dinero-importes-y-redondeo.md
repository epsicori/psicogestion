---
id: T-031
titulo: Dinero — importes en céntimos, IVA y redondeo
modelo: sonnet
fase: 2
prioridad: alta
depende_de: [T-016]
estado: pendiente
---

# Contexto

La fase 2 es la económica —T-021 el esquema, T-023 los cobros, T-027 los bonos— y las tres
van a sumar importes, aplicar IVA y repartir cobros parciales. **Si esa aritmética se
escribe suelta dentro de cada pantalla, se escribe tres veces y se redondea distinto en
cada una**, que es exactamente cómo aparece el descuadre de un céntimo que nadie sabe de
dónde sale.

Se corta aquí porque no necesita base de datos, ni pantalla, ni saber qué es un paciente:
entran números, salen números.

## Lo que ya está decidido y NO se decide aquí

- **Hay dos regímenes de IVA, y se llaman así en la base** (enum `regimen_iva`, T-010):
  `exento_sanitario` y `general`. El general es **21 %**.
- **El régimen lo marca el usuario; no se infiere** (ADR-053, apartado j). Terapia y
  evaluación van exentas por el artículo 20.Uno.3.º de la LIVA; el informe pericial o para
  aseguradora, al 21 %. **Este módulo no adivina cuál toca**: recibe el régimen y calcula.
  Una función que mire el tipo de terapia para «deducir» el IVA es un hallazgo, no una
  mejora.
- **Psicogestión no expide facturas** (ADR-053). Esto es aritmética para enseñar importes y
  preparar borradores, no una liquidación de impuestos.

## Tareas

- [ ] **`lib/dinero/importe.ts` · los importes viven en céntimos, como enteros.** Nada de
      `number` con decimales para dinero: `0.1 + 0.2` no es `0.3` y con euros eso es un
      céntimo que aparece o desaparece. El tipo entra y sale en céntimos, y el módulo trae
      las dos conversiones —`aCentimos('12,50')` y `formatearImporte(1250)` → `'12,50 €'`,
      en formato español— para que nadie improvise la suya.
- [ ] **`aCentimos()` acepta lo que un humano teclea**: `'12,50'`, `'12.50'`, `'12'`,
      `' 12,50 € '`. Y **rechaza lo que no es un importe** en vez de devolver `NaN`
      callando: decide cómo —excepción o resultado explícito— y sé coherente en todo el
      módulo.
- [ ] **`lib/dinero/iva.ts` · desglose de un importe según su régimen.** Dado un importe y
      un régimen, devuelve base, cuota y total. Con `exento_sanitario` la cuota es **cero**
      y el total es la base: no es «21 % de cero», es que no hay impuesto — y el desglose
      debe poder decirlo, porque una factura exenta lleva la mención del artículo y una al
      21 % no.
- [ ] **Decide y escribe si el precio que se teclea es CON o SIN IVA**, y ofrece las dos
      operaciones si hacen falta (`desglosarDesdeBase` / `desglosarDesdeTotal`). No lo
      dejes implícito: es la ambigüedad que más cara sale en un módulo de dinero.
- [ ] **Redondeo, una sola vez y escrito.** Al repartir o aplicar porcentajes aparecen
      fracciones de céntimo. Elige la regla —media al alza es lo habitual en importes—,
      **escríbela en el módulo** y aplícala siempre en el mismo sitio. Redondear dos veces
      en dos pasos distintos es como se pierde el céntimo.
- [ ] **`lib/dinero/reparto.ts` · repartir un importe en N partes** sin que se pierda ni
      sobre un céntimo: la suma de las partes es **exactamente** el total. Lo necesitan los
      bonos de sesiones (T-027), donde un bono de 300 € en 7 sesiones no da un número
      redondo.
- [ ] **`pendiente(total, cobrado)`**, con lo que hace falta para que la pantalla de cobros
      (T-023) no invente: nunca negativo por un cobro de más, y distingue **cobrado del
      todo** de **cobrado de más**, que no son lo mismo.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test`, `npm run lint` y `npx tsc --noEmit` limpios. Pega la salida.
- [ ] **Automático** — `aCentimos('12,50')`, `'12.50'`, `'12'` y `' 12,50 € '` dan todos
      `1250`; `'doce'` y `''` **no** dan `NaN` en silencio.
- [ ] **Automático** — un importe con régimen `exento_sanitario` da **cuota cero**, y el
      desglose distingue «exento» de «21 % sobre cero».
- [ ] **Automático** — repartir **30000 céntimos en 7** da siete partes cuya **suma es
      exactamente 30000**, y la prueba enseña el reparto entero, no solo la suma.
- [ ] **Automático** — un caso de redondeo en el filo (algo que caiga en medio céntimo)
      probado **en las dos direcciones**, con la regla escrita en la aserción.
- [ ] **Automático** — `pendiente()` con un cobro mayor que el total **no devuelve un
      número negativo disfrazado**, y hay una prueba que lo fija.
- [ ] **Automático** — **cobertura del módulo por encima del 95 %**
      (`npm run test:cobertura`). Es dinero: la cobertura aquí no es un adorno.

## Notas para el agente

- **Ni una dependencia nueva.** Esto son enteros y una función de formato; no hace falta
  una librería de dinero y no se va a añadir.
- El formato de salida es **español**: coma decimal, punto de millares, y el `€` detrás con
  un espacio. Usa `Intl.NumberFormat` con `'es-ES'`, no un `replace` a mano.
- **No toques `lib/citas/`, ni `supabase/`, ni ninguna pantalla.** Si crees que hace falta
  cambiar algo ahí, párate y escríbelo en `kimi/hallazgos/T-031.md`.
- Nombres en castellano, como el resto de `lib/`.
