---
id: T-022
titulo: RETIRADO — Libro de gastos (se va al proveedor de facturación)
modelo: sonnet
fase: 2
prioridad: baja
depende_de: [T-021, T-007, T-017]
estado: pendiente
---

# RETIRADO por el ADR-053 · 28-08-2026

Este ticket construía el libro de gastos dentro de Psicogestión: tabla, alta con justificante
en Storage, deducibilidad marcada por el usuario y cierre de trimestre.

**El ADR-053 (g) lo saca del producto.** Se queda dentro lo que está pegado al paciente y a la
cita —tarifas, bonos, cobros, pendiente—; se va fuera lo puramente fiscal, y el libro de gastos
es lo más puramente fiscal que había. Lo lleva el proveedor de facturación del cliente, que ya
lo hace, lo hace mejor y lo hace con la contabilidad al lado.

La tabla `gastos` **no se crea** (T-021), y con ella caen `proveedor_nif_cifrado`,
`justificante_ruta`, `trimestre_cerrado_en` y la discusión sobre si un gasto es inmutable.

**No se implementa. No se reabre sin revertir el ADR-053.** Si algún día se quisiera recuperar,
el motivo tendría que ser de producto —que el cliente no tenga proveedor y aun así quiera
llevar gastos— y sería un ticket nuevo, no este.

El fichero se conserva para que el hueco entre T-021 y T-023 esté explicado y no parezca un
descuido.
