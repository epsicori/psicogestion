---
id: T-003
titulo: Banco de pruebas de RLS por rol
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-002]
estado: pendiente
---

# Contexto

«Cada política tiene su prueba automatizada. **Una política sin test se considera código
no escrito**» (`docs/architecture.md` §RLS). Este ticket construye ese banco y lo deja
detrás de `npm run test:rls`, para que a partir de aquí cada ticket que toque RLS lo
amplíe en vez de improvisar un guion suelto.

Lo importante no es la herramienta, es la **forma de las pruebas**: cada aserción se
ejecuta con la sesión de un rol concreto y afirma un número de filas, no «que funciona».
Y toda prueba negativa —cero filas— va acompañada de su **gemela positiva** con el rol que
sí debe ver, porque una política que lo deniega todo pasaría la mitad de este banco.

Referencias: `docs/architecture.md` §Roles, §RLS, §Candado. ADR **026** (prueba negativa
sin desbloqueo), **027** (las dos partes entran en la huella), **028** (capacidad por
fecha), **029** (índice único rechaza el alta doble), **030** (nota conjunta en dos
historias), **031** (un solo salto, siempre), **032** (el saliente no lee ni lo suyo),
**033** (herencia de retención resuelve, no da nulo), **037** (la lista no genera acceso).

## Tareas

- [ ] Elegir e instalar el arnés: **pgTAP** dentro de la base, o un runner en TypeScript
      que abra una conexión por rol. Decidir en la etapa de diseño y **dejar escrito el
      porqué**; lo que no es negociable es que corra con un solo comando y falle con
      código de salida distinto de cero.
- [ ] `npm run test:rls` en `package.json`, ejecutable sobre la base local recién
      reseteada.
- [ ] **Fijación de datos** propia del banco, independiente del seed de T-008: dos
      centros, un administrador, dos profesionales, un técnico por centro, pacientes de
      ambas titularidades, un episodio conjunto, un paciente fusionado, un menor con
      representante, notas firmadas y borrador.
- [ ] **Matriz completa**: por cada tabla del esquema y cada uno de los tres roles, una
      aserción de lo que ve y otra de lo que no. La matriz de `architecture.md` §Roles es
      el guion, fila a fila.
- [ ] **Batería del candado** (ADR-026): sin desbloqueo cero filas en las ocho tablas de
      contenido; con desbloqueo, las que le tocan; tras `bloquear`, cero; tras caducar la
      ventana, cero. Y `alertas_documentacion` legible en los cuatro estados.
- [ ] **Batería de la baja** (ADR-032): profesional en `baja` no lee ni sus pacientes ni
      sus notas; su autoría sigue registrada en las versiones.
- [ ] **Batería del vínculo** (ADR-031): un solo salto, siempre; imposible encadenar.
- [ ] **Batería del centro** (ADR-033): el técnico acotado; el profesional no; la herencia
      de `politicas_retencion` **resuelve y nunca da nulo**.
- [ ] **Batería de capacidad** (ADR-028): `capacidad_consentimiento` evaluada en tres
      fechas sobre la misma fila —11, 15 y 16 años— sin ninguna bandera almacenada.
- [ ] **Batería de identificación** (ADR-029): el índice único rechaza el alta doble; el
      técnico no lee la tabla.
- [ ] **Batería de accesos** (ADR-037): listar pacientes **no** crea filas en
      `accesos_historia`; abrir contenido **sí**; dos aperturas dentro de la ventana son
      **una fila con contador 2**.
- [ ] **Batería de solo adición**: `update`, `delete` y **`truncate`** fallan en las cuatro
      tablas del invariante 2, incluido como `postgres`.
- [ ] Documento corto en el propio banco: **cómo se añade una prueba** cuando un ticket
      futuro añade una política.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm run test:rls` sobre base recién reseteada: **todo verde**,
      código de salida 0, y su salida nombra cada rol y cada tabla.
- [ ] **Automático** — cada política de `pg_policies` tiene al menos una prueba que la
      nombra. Un comprobador dentro del banco lista las políticas **sin cobertura** y
      **falla** si la lista no está vacía.
- [ ] **Automático** — comentar una política cualquiera de T-002 hace que el banco
      **falle**. Se demuestra ejecutándolo, no razonándolo.
- [ ] **Automático** — el banco distingue «cero filas por política correcta» de «cero filas
      porque no hay datos»: cada aserción negativa tiene su positiva sobre la misma fila
      con otro rol.
- [ ] **Automático** — `npm run lint` y `npm run build` limpios.

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run test:rls`: verde.
2. Comenta una política de `pacientes` en la migración, `db reset`, y vuelve a ejecutar:
   **rojo**, y el mensaje dice qué rol vio lo que no debía.
3. Descomenta, `db reset`, verde otra vez.

## Notas para el agente

- El banco corre **contra la base local**, no contra mocks. Un mock de RLS no prueba RLS.
- La sesión se simula con `set local role authenticated` y
  `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` dentro de una
  transacción con `rollback`, como ya hace `scripts/t000-rls.sql`.
- El contenedor de la base local es **`supabase_db_Psicogestion`** (verificado en T-000);
  no lo teclees de memoria si el proyecto cambia de nombre: sácalo de `docker ps`.
- Este banco es **el que se ejecuta en CI** desde T-009. Escríbelo pensando en que va a
  correr sin humano delante: sin pausas, sin datos aleatorios, sin dependencia de la hora
  del sistema salvo donde la ventana del PIN lo exija — y ahí se manipula la caducidad
  explícitamente, no se espera quince minutos.
- Si al probar aparece una política que falta, **no se escribe aquí**: se anota en
  `docs/state.md` y se abre el arreglo en T-002. Este ticket prueba, no parchea.
