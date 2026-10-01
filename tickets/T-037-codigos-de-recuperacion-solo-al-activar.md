---
id: T-037
titulo: Los códigos de recuperación se generan al activar el segundo factor, no en cada entrada
modelo: opus
riesgo: alto
fase: 1
prioridad: media
depende_de: [T-033]
estado: pendiente
territorio:
  - app/primera-vez/**
  - lib/cuentas/**
---

# Contexto

El diseño de T-033 encontró en `app/primera-vez/segundo-factor.tsx:106` que los códigos de
recuperación se regeneran **en cada entrada con TOTP**, de modo que cada inicio de sesión invalida
el lote anterior. El ADR-039 dice que se generan **al activar** el segundo factor. Esto pasa en
producción: un usuario que guardó sus códigos se queda sin ellos en cuanto vuelve a entrar.

El propietario pidió ticket propio el 01-10-2026.

## Tareas

- [ ] Diseño corto (`tickets/T-037/diseno.md`, arquitecto). Tiene que decir:
  - cómo distingue la pantalla «acabo de activar el factor» de «entro con un factor ya activo», con
    el dato de la base que lo decide y sin heurística;
  - qué pasa si el usuario cierra la pantalla antes de guardar los códigos;
  - si `generar_codigos_recuperacion()` necesita cambiar. Si la respuesta es sí, el territorio se
    amplía con `supabase/` y vuelve al propietario.
- [ ] Prueba que falla primero: una segunda entrada con TOTP no cambia el lote vigente.

## Criterios de aceptación

1. Al activar el factor por primera vez se generan los códigos y se muestran una sola vez.
2. Una entrada posterior con TOTP no genera códigos nuevos: el lote de la base es el mismo antes y
   después, y se comprueba por consulta.
3. `npm test`, `npm run lint`, `npm run build` y `npm run test:rls` limpios, y `territorio.mjs
   T-037` en verde.
