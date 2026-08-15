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

## Tareas

- [ ] Tarea concreta y acotada
- [ ] Otra

## Criterios de aceptación (verificables)

Cada uno debe poder cerrarse con la salida de un comando o una comprobación observable.
Nada de «funciona bien» o «está pulido».

- [ ] **Automático** — `comando` devuelve X
- [ ] **Automático** — el rol `tecnico_administrativo` obtiene cero filas de `tabla`
- [ ] **Manual** — abre `/ruta`, haz Y, debes ver Z

## Guion de comprobación manual

Los pasos exactos que hará el usuario, en orden, en menos de dos minutos.

1. 
2. 

## Notas para el agente

Restricciones, ficheros que tocar, patrones que seguir, trampas conocidas.
Si el ticket es `sonnet`, aquí va todo lo que en un `opus` decidiría el arquitecto.
