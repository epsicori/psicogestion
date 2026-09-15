---
paths:
  - "lib/citas/**"
  - "scripts/rls/**"
  - "supabase/migrations/**"
---

# Fechas y cambios de hora (se cargan al tocar cálculo de fechas)

## Un `date` se ancla al mediodía, nunca a medianoche

Un `date` no lleva hora: formatearlo o compararlo en una zona obliga a elegir un instante
dentro del día. **Medianoche no vale.** Hay zonas IANA que cambian la hora justo a las
00:00 —Cuba, Chile, varias de Brasil—, y ahí medianoche es una hora inexistente o ambigua:
el anclaje se va al día de al lado sin avisar. A las **12:00** no hay hora inexistente ni
ambigua en ninguna zona, porque todos los saltos caen de madrugada.

No se justifica con `Europe/Madrid`: ahí el salto es 02:00 → 03:00 y medianoche existe. Se
justifica con las zonas que sí cambian a medianoche, y por eso la prueba usa dos zonas.
Referencia: `lib/citas/presentacion.ts` y su prueba con el 29 de marzo. (T-011)

## El vocabulario de las anomalías es un contrato entre carriles

`normal` · `inexistente` · `ambigua`, las mismas tres palabras en SQL y en TypeScript.
`lib/fechas/anomalias.ts` **clasifica y no decide**; quién elige qué hacer con una hora
ambigua es el dominio: hueco de marzo → el primer instante válido **hacia delante**;
solape de octubre → **la primera** de las dos. (T-011)
