---
id: T-024
titulo: RETIRADO — Resumen del trimestre y exportación para la asesoría
modelo: sonnet
fase: 2
prioridad: baja
depende_de: [T-021, T-022, T-023, T-018]
estado: pendiente
---

# RETIRADO por el ADR-053 · 28-08-2026

Este ticket agregaba el trimestre —ingresos por régimen, IVA repercutido, gastos, IVA soportado
deducible, cobrado y pendiente— y lo exportaba para la asesoría.

**El ADR-053 (g) lo saca del producto.** Sin `facturas` ni `gastos` en la instancia, la mitad
de los agregados no tienen origen: viven en el proveedor, que además ya emite ese resumen.
Mantenerlo aquí sería reconstruir a mano una contabilidad parcial a partir de un espejo, y una
contabilidad parcial es peor que ninguna.

**Esto tiene coste y conviene no disimularlo**: «que me facilite las trimestrales» era petición
literal de las entrevistas de UX. La respuesta pasa a ser que la trimestral la da el proveedor,
y que Psicogestión aporta la parte que el proveedor no puede saber —qué se ha cobrado en
consulta y qué queda pendiente por paciente—, que es T-023.

**No se implementa. No se reabre sin revertir el ADR-053.**

El fichero se conserva para que el hueco entre T-023 y T-025 esté explicado.
