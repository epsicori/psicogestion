# Decisiones (ADR)

Las 22 decisiones fundacionales (tabla) están en `docs/decisions/fundacionales.md`. Los ADR posteriores, uno por fichero.
**Un ticket que contradiga una decisión se para y se escala.** Los ADR se añaden, nunca se editan ni borran.

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| [ADR-023](decisions/ADR-023.md) | La cuenta de WhatsApp Business, si llega, es de la clínica | aceptada | 20-08-2026 |
| [ADR-024](decisions/ADR-024.md) | Los envíos a terceros salen de un outbox en Postgres, no de una cola externa | aceptada | 20-08-2026 |
| [ADR-025](decisions/ADR-025.md) | El sistema de diseño se destila del prototipo, el prototipo no se despliega | aceptada | 21-08-2026 |
| [ADR-026](decisions/ADR-026.md) | La historia clínica se abre con un PIN personal, y el candado vive en RLS | aceptada | 21-08-2026 |
| [ADR-027](decisions/ADR-027.md) | Las anotaciones subjetivas son un campo aparte dentro de la misma versión | aceptada | 21-08-2026 |
| [ADR-028](decisions/ADR-028.md) | Menores: la representación es una relación con vigencia, y lo dudoso lo decide el profesional | aceptada | 21-08-2026 |
| [ADR-029](decisions/ADR-029.md) | El DNI se cifra al azar y se busca por un índice ciego, con dos claves distintas | aceptada | 21-08-2026 |
| [ADR-030](decisions/ADR-030.md) | En pareja y familia, el paciente sigue siendo la persona; lo conjunto cuelga del episodio | aceptada | 21-08-2026 |
| [ADR-031](decisions/ADR-031.md) | Los duplicados no se fusionan: se vinculan | aceptada | 21-08-2026 |
| [ADR-032](decisions/ADR-032.md) | Un profesional que se va pierde el acceso, conserva la autoría y no arrastra a sus pacientes | aceptada | 21-08-2026 |
| [ADR-033](decisions/ADR-033.md) | La retención cuelga del centro; el centro es dimensión de RLS solo para el técnico | aceptada | 21-08-2026 |
| [ADR-034](decisions/ADR-034.md) | La regla se guarda en hora local con zona IANA; el hecho, en instante | aceptada | 21-08-2026 |
| [ADR-035](decisions/ADR-035.md) | Se sella un byte, no un objeto: canonicalización del contenido con huella | aceptada | 22-08-2026 |
| [ADR-036](decisions/ADR-036.md) | El borrador vive en la cabecera mutable; a la cadena solo se entra firmando | aceptada | 22-08-2026 |
| [ADR-037](decisions/ADR-037.md) | La unidad de `accesos_historia` es la apertura de una historia, no la fila leída | aceptada | 22-08-2026 |
| [ADR-038](decisions/ADR-038.md) | El correo saliente es de la clínica o lo envía una persona; nunca contratamos un proveedor | aceptada | 22-08-2026 |
| [ADR-039](decisions/ADR-039.md) | El segundo factor es TOTP, para los tres roles | aceptada | 22-08-2026 |
| [ADR-040](decisions/ADR-040.md) | Todo a mano: sin librería de componentes, con la accesibilidad a nuestro cargo | aceptada | 22-08-2026 |
| [ADR-041](decisions/ADR-041.md) | WCAG 2.2 AA es objetivo verificado en el pipeline, no una declaración | aceptada | 22-08-2026 |
| [ADR-042](decisions/ADR-042.md) | Tema claro en v1, pero sin cerrarle la puerta al oscuro | aceptada | 22-08-2026 |
| [ADR-043](decisions/ADR-043.md) | Cache Components activado, y nada de un paciente se cachea jamás | aceptada | 22-08-2026 |
| [ADR-044](decisions/ADR-044.md) | Todo funciona en todos los anchos, desde 360 px | aceptada | 22-08-2026 |
| [ADR-045](decisions/ADR-045.md) | Los estados de la cita son cinco, y «en curso» lo dice el reloj | aceptada | 26-08-2026 |
| [ADR-046](decisions/ADR-046.md) | La nota sabe si se escribió durante la sesión, y eso va dentro de la huella | aceptada | 26-08-2026 |
| [ADR-047](decisions/ADR-047.md) | El aviso de sesión no interrumpe, y el estado late en lugar de parpadear | aceptada | 26-08-2026 |
| [ADR-048](decisions/ADR-048.md) | Los consentimientos no viven bajo el candado | aceptada | 26-08-2026 |
| [ADR-049](decisions/ADR-049.md) | Psicogestión no es producto sanitario, y esta es la línea que no se cruza | aceptada | 26-08-2026 |
| [ADR-050](decisions/ADR-050.md) | Cuatro módulos, no siete: Inicio y Clínica no son pantallas, son bloques | aceptada | 26-08-2026 |
| [ADR-051](decisions/ADR-051.md) | Un profesional puede pasar consulta en varios centros; uno es el principal | aceptada | 26-08-2026 |
| [ADR-053](decisions/ADR-053.md) | Psicogestión no expide facturas: las expide el proveedor del cliente, y nosotros solo dejamos el borrador | aceptada | 28-08-2026 |
| [ADR-054](decisions/ADR-054.md) | Lenguaje claro en todo texto dirigido al paciente | aceptada | 01-09-2026 |
| [ADR-055](decisions/ADR-055.md) | Citar no crea el vínculo: el profesional agenda solo para sus pacientes | aceptada | 11-09-2026 |
| [ADR-056](decisions/ADR-056.md) | El contenido clínico llega por la acción de apertura, nunca por el renderizado de la ruta | aceptada | 15-09-2026 |
| [ADR-057](decisions/ADR-057.md) | `alcance` entra en el sobre: quién puede leer una versión se sella igual que quién la escribió | aceptada | 15-09-2026 |
| [ADR-058](decisions/ADR-058.md) | La nota de sesión tiene ruta propia, y esa ruta no abre nada al cargarse (enmienda al 056) | aceptada | 15-09-2026 |
| [ADR-059](decisions/ADR-059.md) | Una nota clínica la corrige quien la escribió; quien no estuvo en la sala añade la suya | aceptada | 15-09-2026 |
| [ADR-060](decisions/ADR-060.md) | El técnico administrativo lee DNI y domicilio de sus centros, y cada lectura deja rastro | aceptada | 16-09-2026 |
| [ADR-061](decisions/ADR-061.md) | Alergias y medicación: tabla propia, en claro, fuera del candado, sin el técnico | aceptada | 16-09-2026 |
| [ADR-062](decisions/ADR-062.md) | Un solo campo de sexo, administrativo | aceptada | 16-09-2026 |
