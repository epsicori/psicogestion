---
id: T-009
titulo: Migraciones en CI, verificador de accesibilidad y andamiaje de i18n
modelo: sonnet
fase: 0
prioridad: media
depende_de: [T-003]
estado: en_curso
notas: Corte A (i18n y validador de contraste) INTEGRADO en main. Falta el corte B -flujo de CI y verificador de accesibilidad-, que ya NO esta bloqueado: T-003 esta en main.
---

# Contexto

Cierra la fase 0 convirtiendo en **red automática** lo que hasta ahora depende de que
alguien se acuerde de ejecutarlo: las migraciones, el banco de RLS, la cobertura de solo
adición, el verificador de huellas y —lo que el ADR-041 exige— la **accesibilidad
comprobada en cada build**, «no una declaración».

Y deja el andamiaje de i18n: **solo castellano en v1** (decisión 17), pero con las cadenas
fuera del código desde ahora, porque sacarlas después es tocar todas las pantallas.

Referencias: ADR **041** (WCAG 2.2 AA verificado en el pipeline; la herramienta la elige
este ticket, lo que el ADR fija es que **existe y corre**), decisión **17** (i18n).
`docs/interfaz.md` §Accesibilidad.

## Tareas

- [ ] **Flujo de CI** (GitHub Actions, repositorio `epsicori/psicogestion`) que en cada
      empujón y en cada PR: levanta Supabase, aplica migraciones, genera tipos y ejecuta
      `lint`, `build`, `test:rls`, el comprobador de cobertura de T-004 y el verificador de
      huellas de T-005.
- [ ] **Comprobación de migraciones hacia delante**: `db reset` desde cero **y**
      aplicación incremental sobre la base ya migrada. Una migración destructiva en un solo
      paso rompe el flujo (constitución, regla 6).
- [ ] **Deriva de tipos**: si `npm run tipos` produce cambios, el flujo **falla**. Los
      tipos generados no se editan a mano.
- [ ] **Verificador de accesibilidad** (ADR-041), corriendo sobre las rutas ya integradas:
      contraste de los tokens **sobre cada superficie**, foco visible siempre, navegación
      completa por teclado, etiquetas de formulario reales asociadas a su control y
      respeto a `prefers-reduced-motion`. Elige herramienta, justifícala en el PR y
      **déjala anclada de versión**.
- [ ] **Validador de contraste reutilizable**, en `lib/`, que la personalización de color
      de Ajustes usará en fase 1 para **avisar y proponer el tono más cercano que cumple**.
      Aquí entra la función y su prueba, no la pantalla.
- [ ] **Andamiaje de i18n**: catálogo `es`, acceso tipado a las claves, y las cadenas de
      las pantallas existentes movidas al catálogo. **Sin traducir a ningún otro idioma**
      y sin selector de idioma: control sin acción real detrás está prohibido.
- [ ] Comprobación que **falla si aparece texto literal visible** en un componente nuevo
      fuera del catálogo (regla, con la lista de excepciones que haga falta).
- [ ] Documentar en `docs/state.md` cómo se ejecuta el flujo entero **en local** antes de
      empujar.

## Criterios de aceptación (verificables)

- [ ] **Automático** — el flujo de CI pasa entero en verde sobre `main`, y su registro
      nombra las seis comprobaciones (`lint`, `build`, `test:rls`, cobertura, huellas,
      accesibilidad).
- [ ] **Automático** — un PR con una política de RLS rota **falla**, y falla en
      `test:rls`, no en `build`.
- [ ] **Automático** — un PR que añade una tabla de solo adición sin sus tres capas
      **falla** en el comprobador de cobertura.
- [ ] **Automático** — un PR que edita `lib/supabase/tipos-bd.ts` a mano **falla** por
      deriva de tipos.
- [ ] **Automático** — bajar el contraste de un token por debajo de AA hace **fallar** el
      build. Se demuestra cambiándolo, viendo el rojo y revirtiéndolo.
- [ ] **Automático** — el validador de contraste, dado un par que incumple, devuelve el
      tono más cercano que sí cumple, y su prueba lo comprueba con casos conocidos.
- [ ] **Automático** — `grep` de texto visible fuera del catálogo en `app/` y
      `components/` (excluido `app/prototipo/`) devuelve cero resultados.
- [ ] **Manual** — la aplicación se ve y se usa **exactamente igual** que antes del ticket:
      i18n es andamiaje, no un cambio de interfaz.

## Guion de comprobación manual

1. Abre un PR de prueba con un cambio inocuo: el flujo pasa y se ve verde en GitHub.
2. En una rama aparte, rompe una política de RLS y empuja: el flujo falla, y el mensaje
   dice qué rol vio lo que no debía.
3. En otra rama, cambia un token de color a uno de bajo contraste: el flujo falla en el
   verificador de accesibilidad.
4. Borra las dos ramas.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- El repositorio es **privado**; usa los ejecutores por defecto y no publiques nada.
  Ningún secreto real en el flujo: la base es local y efímera, con las claves de
  desarrollo de `.env.example`.
- `next build` **ya no ejecuta lint**: son dos pasos independientes en el flujo, no uno.
- El verificador de accesibilidad **no** puede exigir un navegador que el ejecutor no
  tenga: si necesita uno, instálalo explícitamente en el flujo y ánclalo de versión.
- La declaración formal de accesibilidad y la auditoría externa **siguen aparcadas**
  (decisión 12, ADR-041). Este ticket comprueba; no publica conformidad.
- Nada de traducir. Decisión 17: solo castellano en v1.
- Si el flujo tarda demasiado, se parte en trabajos paralelos; **no se recorta lo que
  comprueba**.
