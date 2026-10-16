---
paths:
  - "lib/citas/**"
  - "app/(app)/agenda/**"
---

# Agenda y citas — trampas de T-014 en adelante

Lecciones de la vista semanal y el reprogramar. Antes de escribir lógica de citas o calendario, léelas.

## Zona horaria
- La zona se obtiene **siempre** de `zonaDeCentro(sesion, centro_id)` (`lib/citas/agenda.ts`), nunca del navegador. (T-014)
- `agenda_citas_rango` y `agenda_editar_serie` reciben la zona de llamadas anteriores. La función que se las llama (`lib/citas/reprogramar.ts`, `acciones.ts`) la obtiene de `zonaDeCentro` y la valida **antes** de pasar fecha/hora a la base.

## Lectura de citas: técnico aislado
- La RPC `agenda_citas_rango` lleva `union all` de dos ramas: `citas` (administrador y profesional, con el rol exigido por `rol_actual()`: la RLS de `citas` deja pasar `profesional_id = auth.uid()` sin mirar el rol) y `citas_agenda` (técnico). Jamás un `join` entre ellas. El técnico recibe `null` literales en `tipo_terapia_nombre` y `nota_operativa`. (T-014)
- La función es `plpgsql` con `security invoker`: en definer, el técnico leería toda la organización.
- Guarda de rango: 62 días máximo, lanzando `22023`.

## Estado de la cita
- `en_curso` sale **solo** de `estadoParaPunto(estado, enCurso)` mapeando la base. No se reimplementa `now() >= inicio and now() < fin` en cliente. (T-014)
- No hay segundo cálculo; quien llama pasa `enCurso: true` si `cita_en_curso()` lo dice en la base.
- Calcular «en curso» comparando `new Date()` con `inicio`/`fin` en TypeScript es un bug; usar `new Date()` para otras cosas (validar que una hora futura no ha pasado, formatear) no lo es.

## Paneles y foco
- El panel solo se ve **uno a la vez** (cima de una pila mutable). Cerrar con `pop` devuelve el foco a su `ancla` anterior (cita, número de día, fila de propuesta), no a `body`. (T-014)
- Las terceras ramas de la pila (`[día]` abierto con un diálogo o la zona «Por confirmar») quedaron sin prueba: B3-1 a B3-3 en `tickets/T-014/revision.md`. Al tocar la pila, cubrirlas.

## Frase de serie
- La frase de serie («los viernes a las 10:00») sale de `describirPrevisualizacion`, que **solo formatea** lo que da `agenda_previsualizar_edicion_serie`. No calcula ordinal, día de semana, ni fechas nuevas. (T-014 + T-011b)
- Los ordinales (1.º–5.º) son indexar arrays de `diasPlural`, `ordinales`; nunca cálculo.
- «Último» sale solo si `regla.ultimo` de la base.

## Vista anual
- Un filtro de centro o de profesional no admite `or centro_id is null`: deja entrar citas sin centro en cualquier filtro. Las lecturas del año (`agenda_densidad_anual`, `agenda_profesionales_anuales`) usan el oráculo `agenda_citas_rango` mes a mes. (T-047)
