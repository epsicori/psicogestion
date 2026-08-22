# Tarifa

Propuesta comercial derivada de `modelo-coste-instancia.md`. **El coste está calculado; el
precio es un juicio sobre disposición a pagar.** Se cierra hablando con clientes, no en una
hoja. Este documento es el punto de partida y el registro de por qué cada número es el que
es.

Decisión 14: base por instancia + tramo por usuario activo. Aquí se le ponen cifras.

## El principio

**La prima va en la base; en el asiento se empata con el mercado.**

El coste está en la instancia (14,36 €/mes de infraestructura más tu tiempo), no en el
profesional número siete, que cuesta cero. Eholo es al revés: su instancia le cuesta
céntimos y su margen entero está en el asiento adicional, que cobra a 20 € sin coste
marginal. Así que se cobra por lo que de verdad cuesta y se empata en lo que no cuesta
nada. La frase de venta sale sola: **el profesional te cuesta lo mismo que allí; la
diferencia está en la base, y la base es una instancia que no compartes con nadie.**

## Tarifa

**Un solo plan. Sin funciones de pago, sin límite de pacientes, sin tramo trampa.**
Tres planes significan tres matrices de funciones, tres interfaces condicionales y tres
discursos de soporte. Eholo tiene equipo para eso; aquí lo simple es también lo vendible.

### Alta — una sola vez

| Concepto | Importe |
|---|---:|
| Implantación de la organización | **350 €** |
| Centro adicional | **120 €** |
| Importación de histórico (Excel/CSV) | **desde 300 €** según volumen y limpieza |

Permanencia de 12 meses, o alta sin bonificar. A tres profesionales el alta tarda 3,4 meses
en amortizarse: sin permanencia, quien se va al cuarto mes ha costado dinero.

### Cuota mensual

| Concepto | Importe |
|---|---:|
| **Base por instancia** | **130 €/mes** |
| **Profesional sanitario adicional** | **+20 €/mes** |
| Recuperación a un punto en el tiempo (RPO ~ 0) | +150 €/mes · recomendada desde 8 profesionales |

**La base incluye**: instancia dedicada · organización · **centros ilimitados** ·
**personal administrativo y de recepción ilimitado y gratuito** · **pacientes ilimitados** ·
primer profesional sanitario · copia diaria con 7 días de retención.

Todos los importes **sin IVA**. Ver la nota fiscal del final: importa más de lo habitual.

## Curva de precio y margen

Coste según `modelo-coste-instancia.csv` con los supuestos por defecto (0,92 · 60 €/h ·
10 clientes · mantenimiento de 0,2 h más 0,05 h por profesional).

| Prof. | Cuota | €/profesional | Coste | Margen | % |
|---:|---:|---:|---:|---:|---:|
| 1 | 130 € | 130 € | 39,36 € | 90,64 € | **70 %** |
| 3 | 170 € | 57 € | 45,36 € | 124,64 € | **73 %** |
| 5 | 210 € | 42 € | 51,36 € | 158,64 € | **76 %** |
| 10 | 310 € | 31 € | 66,36 € | 243,64 € | **79 %** |
| 20 | 510 € | 25,50 € | 96,36 € | 413,64 € | **81 %** |

Con el complemento de PITR: a 10 profesionales, 460 € de cuota y 66 % de margen; a 20,
660 € y 71 %. La línea de PITR por sí sola deja 58 € sobre 150 € — **39 %**, el margen más
flojo del catálogo, porque los 92 € de coste son reales. No regalarla en negociación.

## Comparativa con Eholo

Precios capturados de su web el **20-08-2026**. Son **promocionales**: 29,61 / 49,41 / 71,91
no son cifras diseñadas, son el resultado de aplicar un descuento (un 15 % aproximado, o el
equivalente mensual de un pago anual) sobre una lista redonda que estará en torno a
34,90 / 58,25 / 84,80. **Contra su precio de lista la distancia es un 15 % menor de lo que
muestra esta tabla.** Verificar antes de usarla en una reunión.

Su profesional adicional cuesta **20,00 €/mes en los tres planes** — ese sí es un número
diseñado, y es el que se iguala.

| Prof. | Eholo Estándar | Eholo Avanzado | Eholo Premium | Nosotros | vs Premium |
|---:|---:|---:|---:|---:|---:|
| 1 | 29,61 € | 49,41 € | 71,91 € | 130 € | +81 % |
| 3 | 69,61 € | 89,41 € | 111,91 € | 170 € | +52 % |
| 5 | 109,61 € | 129,41 € | 151,91 € | 210 € | +38 % |
| 10 | 209,61 € | 229,41 € | 251,91 € | 310 € | +23 % |
| 20 | 409,61 € | 429,41 € | 451,91 € | 510 € | **+13 %** |

**La prima se estrecha según crece el cliente**, del 81 % al 13 %. Eso confirma el segmento:
contra el profesional solo se pierde por goleada —consecuencia asumida de la decisión 1— y
en el tramo de 6 a 20 se compite de igual a igual ofreciendo instancia dedicada.

**Su plan Estándar no es un plan, es un embudo**: 20 pacientes activos por profesional es
inutilizable para alguien a jornada completa. Su precio de entrada real son los 49,41 € de
Avanzado. Al comparar, hacerlo contra Avanzado o Premium, nunca contra el escaparate.

### Qué hace bien Eholo y conviene copiar

1. **El asiento cuesta lo mismo en todos los planes.** El plan escala por contenido, no por
   número de personas. Aquí está aplicado llevado al extremo: un solo plan.
2. **Su palanca de segmentación son los pacientes activos por profesional** (20 / 60 /
   ilimitados), no el número de profesionales. Su precio sube cuando al cliente **le va
   bien**, no cuando contrata. Es la mejor idea de su tarifa y hoy no la tenemos — ver
   «Pendiente».
3. **Todo lo caro de construir está en el plan base** (calendario, videollamadas, firma
   digital, pasarela de pago, Veri\*factu) y arriba cobran lo barato de operar
   (almacenamiento, automatismos, IA).

### Qué ya no diferencia

**Veri\*factu y TicketBAI están en su plan más barato.** Es tabla de apuestas, no ventaja.
La diferencia real pasa a ser la **calidad** de la implementación —factura imposible de
editar a nivel de base de datos, cadena de huellas verificable, anulación y reemisión en
lugar de corrección— y eso no se ve en una tabla comparativa: hay que saber contarlo.

Lo que sí diferencia: instancia dedicada · el administrador no lee notas ajenas y hay acceso
de emergencia auditado · firma cualificada eIDAS para informes periciales · CIE-10-ES con
DSM-5-TR en paralelo · series de citas con excepciones · retención ajustable por comunidad
autónoma · importador de histórico.

### Huecos conocidos en la comparativa

Se los van a poner delante. Conviene tener la respuesta preparada, no improvisarla:

- **Videollamadas**: ellos las incluyen en los tres planes; aquí no existen. Integrarlas nos
  convertiría en encargados del contenido de la sesión. Respuesta coherente con el ADR-023:
  integración con un proveedor que **contrate el cliente**, no nosotros.
- **IA** (transcripción de sesiones, resumen de historia clínica, asistente): mismo problema
  y más grave, porque saldría el contenido de la sesión hacia un tercero. Misma respuesta.

## Qué no se cobra, y por qué

- **Centros: 0 €/mes.** Un centro adicional bajo el mismo NIF no cuesta nada de
  infraestructura, y cobrar por sede duplicaría el cobro del crecimiento que el tramo por
  profesional ya captura. Solo el alta de 120 €, que es configuración real. «Los centros no
  se pagan, se pagan los profesionales» cierra reuniones y además es verdad.
  **Frontera**: si el centro tiene NIF propio es otro obligado tributario, y por tanto otra
  instancia y otro cliente — ver `state.md`.
- **Personal administrativo y de recepción**: ilimitado y gratis. Cuesta cero, se dice en una
  frase y elimina la discusión de «esto cuenta como usuario o no».
- **Pacientes**: ilimitados. Es la contraprogramación directa de su tramo de 20.

## Reglas de negociación

- **El primer cliente externo no paga tarifa.** Va a encontrar bugs y su testimonio vale más
  que su cuota: 40-50 % durante doce meses a cambio de referencia y de poder citarlo. Pero el
  precio de catálogo se pone por escrito desde el principio, para que el descuento se vea
  como descuento y subir el año siguiente no sea una negociación nueva.
- **El alta se cobra siempre.** Es donde se recupera la captación.
- **El PITR no se regala**: es el único concepto con coste real detrás.
- **Suelo absoluto: 15 €/mes** cubren la infraestructura. Por debajo se pierde dinero en
  servidores, literalmente. Todo lo demás es negociable; esto no.

## Nota fiscal — importa más de lo habitual

El software va al **21 % de IVA**, pero la actividad del cliente está **exenta** (art.
20.Uno.3.º LIVA), así que **no puede deducirse ese IVA soportado**. Los 510 €/mes son
**617,10 € reales** para la clínica: un 21 % de encarecimiento efectivo que un cliente con
actividad sujeta no tendría. Lo van a sacar en la negociación. Afecta igual a Eholo, así que
no altera la comparativa — pero sí la conversación.

## Pendiente

**El contador de pacientes activos por profesional.** Es la palanca de segmentación de Eholo
y la mejor idea de su tarifa: hace que el precio siga al éxito del cliente en vez de a sus
contrataciones. Si se adopta, **tiene que existir en el esquema desde T-001**: «paciente
activo» es un estado derivado del episodio asistencial y no se retrofita sin migrar datos.
Decisión abierta.
