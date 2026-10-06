# T-043 · revisión combinada, ronda 5 (06-10-2026)

Rama `T-043-aviso-de-hueco-raro`, HEAD eb81753. **ALTA 0 · MEDIA 0 · BAJA 1.**

- **Revisor A (base de datos y banco):** sin cambios en su territorio desde la ronda 3; su único hallazgo de esa ronda (A3-H1, `scripts/rls/README.md:143`) se cerró en la ronda 4 y el verificador comprobó `Y+10 .. +154`. Detalle: `revision-a.ronda3.md`.
- **Revisor B (interfaz):** B3-H1 y B3-H2 cerrados en la ronda 4 (`revision-b.ronda4.md`); B4-H1 y B4-H2 cerrados en la ronda 5. Detalle: `revision-b.ronda5.md`.

## Hallazgos abiertos

- **BAJA · B5-H1** · `app/(app)/agenda/nueva/formulario-alta.tsx:161` y `:181` — El setAviso('') de las dos ramas de fallo del recálculo (:161 y :181) es incondicional. Borra también el «acaba de ocuparse» de hueco_ocupado (:381), cuyo propio setExcluirHuecos (:376) dispara el recálculo que falla. Es una regresión de esta ronda. La variante condicional (vaciar solo si aviso es el texto de la vuelta) pasa 71/71, R15 y R16 incluidas, y conserva el mensaje. Ninguna prueba distingue las dos variantes.
  - *Escenario:* Se elige tipo y el hueco del 06-10 a las 17:00, y se pulsa Guardar. guardarAlta responde hueco_ocupado y el recálculo con excluir falla (!resultado.ok o rechazo). La región pasa de «… | Ese hueco acaba de ocuparse. Elige otro de los que quedan.» a «… | » (sonda Q1, medida en las dos ramas). Quedan la alerta «No se han podido calcular los huecos.» y el resumen «Elige un hueco libre del calendario.», y ningún texto dice que el hueco lo ocupó otro. Con vista: null, las 17:00 siguen pintadas como libres: el usuario las vuelve a elegir y el servidor responde otra vez hueco_ocupado.
  - Pendiente: el documentalista lo anota en `docs/state.md` §Hallazgos al cerrar el ticket (arreglo propuesto: la variante condicional y una prueba negativa en las dos ramas).
