---
id: T-XXX
titulo: 
modelo: sonnet          # opus = pasa por etapa de diseño; sonnet = va sobre-especificado
fase: 0
prioridad: alta         # alta | media | baja
depende_de: []
estado: pendiente       # pendiente | en_curso | hecho
---

# Contexto

Por qué existe este ticket y qué parte del producto toca. Cita las secciones de
`docs/architecture.md` o `docs/decisions.md` que apliquen — **no pegues su contenido**.

**Si el ticket dibuja pantalla**, nombra aquí el módulo del prototipo que implementa y
la sección de `docs/interfaz.md` que lo describe. Si el prototipo choca con la matriz de
roles en algo que toques, cita el choque por su número; si el choque no está en la lista,
resuélvelo y **añádelo allí en este mismo ticket**.

## Tareas

- [ ] Tarea concreta y acotada
- [ ] Otra

## Criterios de aceptación (verificables)

Cada uno debe poder cerrarse con la salida de un comando o una comprobación observable.
Nada de «funciona bien» o «está pulido».

- [ ] **Automático** — `comando` devuelve X
- [ ] **Automático** — el rol `tecnico_administrativo` obtiene cero filas de `tabla`
- [ ] **Manual** — abre `/ruta`, haz Y, debes ver Z

En tickets de pantalla, dos criterios más que no se saltan:

- [ ] **Manual** — `/ruta` al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno (nada sin dato ni acción real detrás)
- [ ] **Manual** — la misma ruta con cada rol que la pueda abrir enseña exactamente lo
      que le concede la matriz de `architecture.md` §Roles, ni un campo más
- [ ] **Automático** — `disponible: true` para el módulo en `components/armazon/modulos.ts`

## Guion de comprobación manual

Los pasos exactos que hará el usuario, en orden, en menos de dos minutos.

1. 
2. 

## Notas para el agente

Restricciones, ficheros que tocar, patrones que seguir, trampas conocidas.
Si el ticket es `sonnet`, aquí va todo lo que en un `opus` decidiría el arquitecto.
