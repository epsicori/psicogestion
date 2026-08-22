# Modelo de coste por instancia

La decisión 14 dice «base por instancia + tramo por usuario activo» pero no dice **cuánto**.
Este documento y su hoja `modelo-coste-instancia.csv` existen para que ese número se
calcule en vez de intuirse. Es la entrada que faltaba para cerrar el debate de topología:
si el margen sale, la instancia dedicada se paga sola y es además el argumento comercial;
si no sale, el problema no es la arquitectura, es el precio o el segmento.

La tarifa que sale de este modelo está en `tarifa.md`, con la comparativa contra Eholo.

**La hoja manda.** Lo que sigue son los números con los supuestos por defecto, para tener
una referencia escrita. En cuanto cambies una celda, este documento está desfasado.

## Cómo se usa

Abre `modelo-coste-instancia.csv` en Excel o LibreOffice. Si aparece todo en una columna,
importa con **punto y coma** como separador. Edita solo:

- **B6, B7** — tipo de cambio y lo que decidas que vale tu hora.
- **B30, B32** — horas de mantenimiento por instancia y horas de alta. Son las celdas más
  sensibles de toda la hoja.
- **B44, C44** — precio de cada tramo. Es la pregunta que hay que contestar.
- **B52, B53** — cuántos clientes en cada tramo.

## Estructura: tres cubos, no uno

El error habitual es sumar «lo que cuesta Supabase» y llamarlo coste. Son tres cosas
distintas y se comportan distinto:

1. **Fijo de plataforma** — no crece con los clientes y se diluye con cada uno.
   Aquí está el hallazgo que corrige la intuición: **Supabase Pro se factura por
   organización, no por proyecto**, y **Vercel Pro por miembro del equipo, no por
   proyecto**. Ninguno de los dos se multiplica por el número de clínicas.
2. **Marginal de infraestructura** — lo que sí se multiplica: el cómputo del proyecto y,
   sobre todo, el PITR.
3. **Tu tiempo** — el cubo que nadie mete y que en el tramo bajo es **más grande que la
   infraestructura entera**.

## Los números con los supuestos por defecto

Cambio 0,92 · hora 60 € · 10 clientes · 0,5 h de mantenimiento al mes por instancia.

| Concepto | Sin PITR | Con PITR |
|---|---:|---:|
| Infraestructura marginal | 11,04 € | 103,04 € |
| Fijo repercutido (a 10 clientes) | 3,32 € | 3,32 € |
| Tu tiempo (0,5 h/mes + alta amortizada) | 40,00 € | 40,00 € |
| **Coste total por instancia** | **54,36 €** | **146,36 €** |
| Precio mínimo para 50 % de margen | 108,72 € | 292,72 € |
| Precio mínimo para 60 % de margen | 135,90 € | 365,90 € |
| Precio mínimo para 70 % de margen | 181,20 € | 487,87 € |

Cartera de ejemplo (7 sin PITR a 90 € + 3 con PITR a 450 €): ingresos 1.980 €/mes, coste
819,60 €/mes, resultado 1.160,40 €/mes — **más** los 400 €/mes de tu tiempo que ya van
pagados dentro del coste. Total para ti: unos 1.560 €/mes con diez clientes.

## Seis lecturas

**1 · El PITR es el 90 % del coste marginal de infraestructura.** 100 $ de 112 $. Todo lo
demás es ruido. Esa es la palanca, y encaja sola con la decisión 14: **la base cubre la
instancia, el tramo por usuario cubre el PITR**. Una consulta de tres profesionales vive
con la copia diaria de 7 días que Pro ya incluye; una de veinte no puede permitirse perder
un día de notas clínicas y puede pagarlo. Documenta el RPO de cada tramo en el contrato.

**2 · Tu tiempo cuesta cuatro veces más que la infraestructura en el tramo bajo.** 40 €
contra 11 €. De ahí que el **plano de control no sea comodidad operativa, sino economía
unitaria**: bajar el mantenimiento de 0,5 h a 0,1 h por instancia mueve el coste de 54 € a
27 € y baja el precio mínimo a la mitad. Es la inversión con más retorno de todo el plan.

**3 · Hay un techo operativo y ahora tiene número.** A media hora por instancia y mes,
**40 clientes consumen 20 h/mes** solo en mantenimiento. Ese es el punto donde o
automatizas o contratas. No es «algún día»: es una división.

**4 · El suelo de precio deja de ser una intuición: ronda los 110 €/mes.** El autónomo
suelto de 50 € está fuera del modelo, y ahora se puede decir con un número en vez de con
una opinión. No es un fallo de la arquitectura: es el segmento.

**5 · Los 90 € del tramo bajo por defecto se quedan cortos** — dan 39,6 % de margen. El
mínimo defendible con estos supuestos está sobre los 110-135 €.

**6 · Y el tramo alto es competitivo.** 450 €/mes en una clínica de 20 profesionales son
22,50 € por profesional y mes, en línea con lo que cobra la competencia — pero con
instancia dedicada, Verifactu propio e inmutabilidad en la base de datos. La decisión 14
funciona: el problema nunca fue el techo, era el suelo.

## Lo que no está en el modelo

Y hay que meterlo antes de fijar precio de verdad:

- **Adquisición de cliente**: lo que cuesta conseguir cada clínica.
- **Certificados cualificados eIDAS** (decisión 9). Pendiente de cotizar con un prestador.
  Puede ser por certificado, por firma o por ambas. Es el hueco más grande del modelo.
- Asesoría legal y, si llega, DPO. Seguro de responsabilidad civil profesional.
- Impagos y bajas.
- IVA e IRPF: el modelo va en cifras antes de impuestos.

## Qué verificar antes de fiarte

Todas las celdas marcadas **VERIFICAR** en la hoja, contra la web del proveedor el día que
decidas — cambian cada pocos meses:

- Supabase: precio del plan Pro, créditos de cómputo incluidos, precio del cómputo Micro y
  **precio y retención del PITR**. Esta última es la que decide.
- Vercel: precio por miembro y franquicias de tráfico e invocaciones.
- Tipo de cambio.

También conviene medir, no estimar, dos cosas en cuanto tengas la consulta propia dentro:
**cuántas horas al mes te lleva de verdad una instancia** y **cuánto disco y tráfico
consume una clínica real al año**.
