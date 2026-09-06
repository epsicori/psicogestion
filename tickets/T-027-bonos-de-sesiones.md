---
id: T-027
titulo: Bonos de sesiones — alta, saldo y consumo (pantalla)
modelo: sonnet
fase: 2
prioridad: media
depende_de: [T-021, T-023, T-007]
estado: pendiente
---

# Contexto

`T-021` deja la tabla `bonos` (`sesiones_totales`, `sesiones_consumidas` derivada de
`citas.bono_id`, `importe`, `caducidad`) y su RLS, pero **no dibuja ni una pantalla** —es
esquema, no interfaz. Este ticket construye lo que falta encima: dar de alta un bono, verlo
consumirse solo, y saber cuándo queda uno agotado o caducado.

Es paquete/bono de sesiones **estándar en consulta privada española** y no aparece en ningún
otro ticket del bloque económico. `docs/interfaz.md` lo confirma por ausencia: en
§«Lo que el prototipo no cubre» dice literalmente **«Bonos, gastos, tarifas por paciente y el
libro de facturas completo»** — el prototipo no lo enseña, así que la pantalla se diseña aquí
contra la matriz de roles, no copiando nada dibujado.

Es `sonnet` **con revisión de Opus** —toca RLS y dinero, igual que T-023— y va
sobre-especificado.

Referencias: **ADR-053** (un bono es gestión interna, nunca factura; si el cliente quiere
facturarlo, lo hace en su proveedor con el importe que ve aquí, fuera de la app), **033**
(centro acota al técnico), **041**, **043**. Ticket hermano: **T-023** (mismo patrón de
listado, mismo choque 13 de selector solo-administrador).

## Tareas

- [ ] **Alta de un bono**: paciente, `sesiones_totales`, `importe`, `caducidad` (opcional).
      Vive en la ficha del paciente (pestaña Facturación, T-013) y también en el módulo
      Facturación con selector de paciente, igual que «Registrar cobro» en T-023.
- [ ] **El alta no crea un cobro por sí sola.** Un bono se paga como cualquier otra cosa: con
      un registro en `cobros` (T-023), que puede ser en el momento o después. No hay un
      camino especial de «bono pagado»; es un cobro más, con el paciente del bono.
- [ ] **Saldo visible y derivado**: `sesiones_totales − sesiones_consumidas`, nunca
      almacenado. Se lee de la vista de T-021, no de una columna propia de esta pantalla.
- [ ] **Vincular una cita a un bono** es una acción sobre la cita (`citas.bono_id`, T-021),
      no sobre el bono: al crear o editar una cita con paciente que tiene un bono vigente, se
      puede elegir consumirlo. El consumo real solo cuenta cuando la cita pasa a `realizada`
      —una cita `programada` contra un bono **no** descuenta saldo todavía.
- [ ] **Estados derivados, no almacenados**: `vigente`, `agotado` (saldo 0), `caducado`
      (`caducidad` pasada con saldo > 0). Los tres son de lectura; ninguno se escribe.
- [ ] **Listado de bonos** filtrable por estado y paciente. **Selector de paciente/profesional
      solo para el administrador** (choque 13, igual que T-023): el profesional ve los suyos
      sin selector visible.
- [ ] **Vista del técnico administrativo**: los mismos bonos, sin nada clínico que ocultar
      —no es una tabla con columnas sensibles—, acotada por centro (ADR-033) igual que
      `cobros`.
- [ ] **Aviso de bono a punto de agotarse o caducar** (una o dos sesiones restantes, o
      caducidad dentro de 30 días): en la ficha del paciente, discreto, sin campana de
      notificaciones propia — eso es T-015 y no se duplica aquí.
- [ ] **Texto en lenguaje claro** (ADR-054) en el aviso de saldo y en la explicación de qué
      pasa cuando un bono se agota: qué necesita hacer el paciente, sin jerga de facturación.
- [ ] Server Action para el alta, validada con el mismo esquema Zod del formulario. Rechaza
      `sesiones_totales <= 0` e `importe` negativo.

## Criterios de aceptación (verificables)

- [ ] **Automático** — dar de alta un bono de 5 sesiones y marcar tres citas vinculadas como
      `realizada` deja el saldo visible en 2, leído de la vista y no de una columna editada.
- [ ] **Automático** — una cita `programada` vinculada a un bono no cambia el saldo; al
      cancelarla, tampoco.
- [ ] **Automático** — como `tecnico_administrativo`: ve el bono y su saldo, no ve nada fuera
      de su centro.
- [ ] **Automático** — como `profesional_sanitario`: cero bonos de pacientes ajenos.
- [ ] **Manual** — selector de paciente/profesional visible solo como administrador.
- [ ] **Manual** — un bono con saldo 0 se marca «agotado»; uno con `caducidad` pasada y saldo
      > 0, «caducado». Los dos son de lectura: no hay botón que los ponga en ese estado.
- [ ] **Manual** — la pantalla al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. Como administrador, da de alta un bono de 3 sesiones para un paciente del seed.
2. Crea una cita para ese paciente vinculada al bono; el saldo sigue en 3 mientras esté
   `programada`.
3. Márcala `realizada`: el saldo baja a 2, sin tocar ninguna columna a mano en Studio.
4. Repite hasta agotarlo: el bono pasa a «agotado» sin ninguna acción explícita.
5. Como el profesional del paciente, comprueba que ve el bono sin selector; como técnico
   administrativo de otro centro, que no lo ve.

## Notas para el agente

- **No inventes el nombre de la columna ni de la vista de saldo**: son las que T-021 deje
  escritas. Si T-021 todavía no está integrado, este ticket espera.
- **No dibujes «Nueva factura del bono».** Facturar el bono, si el cliente lo quiere, es un
  documento suyo en su proveedor (ADR-053); aquí no hay botón de facturar nada.
- Reutiliza el patrón de T-023 para el listado y el filtro; no se reescribe un segundo
  componente de tabla con paginación.
- Server Components por defecto; `"use client"` solo en el formulario de alta.
