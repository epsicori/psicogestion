---
id: T-006b2
titulo: Candado del PIN, PIN bloqueado por intentos, ajustes de reposición y baja
riesgo: medio
territorio: app/**, components/**
depende_de: [T-006b1]
estado: pendiente
---

# Qué es esto

La **segunda mitad del corte b** de `tickets/T-006-autenticacion-completa.md`. El contrato
entero es `minimax/cortes/T-006.md`. `corte-b1.md` (invitación, primer acceso y guardia)
entra antes: aquí se da por hecho que existe.

## Lo tuyo

Las cuatro últimas tareas de `minimax/cortes/T-006.md` §Tareas:

- [ ] **Candado del PIN**: `desbloquearHistoria()`, `prolongarDesbloqueo()` solo en
      acciones reales, botón de bloquear siempre visible (`bloquearHistoria()`), aviso no
      modal de ventana por caducar (ADR-047: tarde, sin parpadeo).
- [ ] **Pantalla de PIN bloqueado por intentos**, con el tiempo restante hasta
      `bloqueadoHasta`. Sin distinguir «PIN incorrecto» de «ya estabas bloqueado».
- [ ] **Ajustes › reponer TOTP** de OTRO perfil (solo administrador). **Reponer un PIN no
      existe como gesto**: ni botón, ni ruta, ni Server Action. Si lo escribes, es un
      hallazgo.
- [ ] **Ajustes › baja de un perfil** (solo administrador): la pantalla **explica** el
      error que devuelve la base, no lo previene adivinando.
- [ ] **Sesión de 30 minutos de inactividad**, y comprobar que el cierre de sesión de la
      barra lateral sigue funcionando (`app/(app)/acciones.ts:cerrarSesion`).

Y de §Criterios de aceptación, el automático 5: **ninguna Server Action de renderizado
llama a `prolongarDesbloqueo()`**.

# El hecho que cambia la forma de la primera tarea

**No existe `/pacientes/[uuid]`.** La ficha del paciente con sus sub-pestañas es **T-013**,
que está pendiente y cuyo propio título es «pestañas, **candado** y registro de accesos».
Hoy no hay ninguna historia clínica que abrir.

Así que el candado se entrega **como pieza montable, no como pantalla colgada de una ruta
que no existe**:

- El componente de petición de PIN, con el vocabulario de estado vacío de
  `docs/interfaz.md` §Vocabulario (icono en círculo, frase en serif, explicación corta).
- Las Server Actions de desbloquear, bloquear y prolongar, cada una con `exigirSesion()`.
- La pantalla de bloqueo por intentos con su cuenta atrás.
- Sus pruebas, que ejercitan la pieza y las acciones directamente.

**T-013 la monta** sobre la ficha. Tú **no creas `/pacientes/[uuid]`**: es territorio de
otro ticket e inventarlo es salirse del alcance.

`docs/interfaz.md` §11 fija cómo se comporta cuando T-013 la monte, y es vinculante para
la pieza: **nunca se renderiza el contenido y se tapa con una capa encima**. Si no hay
desbloqueo vigente, el componente de servidor no llega a leer la fila.

# Trampas

- `prolongarDesbloqueo()` **jamás en el renderizado** (ADR-026). El criterio 5 se prueba:
  recargar cinco veces no cambia el recuento de `desbloqueos_historia`.
- `desbloquearHistoria()` ya iguala en la base «PIN incorrecto» y «ya estabas bloqueado».
  Que la pantalla no las vuelva a separar.
- La baja: `darDeBajaPerfil()` devuelve `{ok:false, mensaje}` cuando es el último
  administrador activo. Se enseña **ese** mensaje.
- Mismas reglas de repo que `corte-b1.md` §Trampas: `getUser()`, `exigirSesion()` en cada
  acción, `redirect` fuera del `try`, Zod 4, nada de tocar `lib/cuentas/**`.
