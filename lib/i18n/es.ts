// Catálogo de cadenas visibles. **Solo castellano en v1** (decisión 17) y sin selector de
// idioma: uno con un solo idioma sería un control sin acción real detrás. Lo que se gana
// ahora es tenerlas fuera del código; sacarlas después obligaría a tocar todas las
// pantallas.
//
// Lo que NO entra aquí: los mensajes de `console.error` y los `throw` internos. No los lee
// un usuario, los lee quien depura, y meterlos en el catálogo solo dificulta buscarlos.
export const es = {
  marca: 'Psicogestión',
  lema: 'Tu práctica, en calma',

  armazon: {
    navegacionPrincipal: 'Navegación principal',
    abrirMenu: 'Abrir menú',
    cerrarMenu: 'Cerrar menú',
    cerrarSesion: 'Cerrar sesión',
    perfilSinAsignar: 'Perfil sin asignar',
    sinPerfil: 'Sin perfil',
    proximamente: 'pronto',
    espacioDeTrabajo: 'Espacio de trabajo',
    centroActivo: 'Centro activo',
    cambiarCentro: 'Cambiar de centro',
    buenosDias: 'Buenos días',
    buenasTardes: 'Buenas tardes',
    buenasNoches: 'Buenas noches',
  },

  modulos: {
    agenda: 'Agenda',
    pacientes: 'Pacientes',
    facturacion: 'Facturación',
    ajustes: 'Ajustes',
    // Los tres que el ADR-050 retira. Siguen aquí porque `modulos.ts` todavía los pinta
    // apagados; quien los borra de los dos sitios a la vez es el corte T-007·C.
    inicio: 'Inicio',
    clinica: 'Clínica',
    usuarios: 'Usuarios',
  },

  // Cadenas de las primitivas y piezas compartidas de components/ui.
  interfaz: {
    cerrar: 'Cerrar',
    cargando: 'Cargando',
    cargandoContenido: 'Cargando contenido',
  },

  roles: {
    administrador: 'Administrador',
    profesionalSanitario: 'Profesional sanitario',
    tecnicoAdministrativo: 'Técnico administrativo',
  },

  acceso: {
    iniciarSesion: 'Iniciar sesión',
    correo: 'Correo',
    contrasena: 'Contraseña',
    entrar: 'Entrar',
    entrando: 'Entrando…',
    credencialesNoValidas: 'Credenciales no válidas',
    introduceUnCorreoValido: 'Introduce un correo válido',
    introduceTuContrasena: 'Introduce tu contraseña',
    laContrasenaEsDemasiadoLarga: 'La contraseña es demasiado larga',
  },

  pacientes: {
    espacioDeTrabajo: 'Espacio de trabajo',
    titulo: 'Pacientes',
    unoATuCargo: '1 paciente a tu cargo',
    variosATuCargo: '{n} pacientes a tu cargo',
    nuevoPaciente: 'Nuevo paciente',
    crearPaciente: 'Crear paciente',
    creando: 'Creando…',
    nombre: 'Nombre',
    apellidos: 'Apellidos',
    altaEl: 'Alta el {fecha}',
    sinPacientes: 'Todavía no hay pacientes',
    sinPacientesExplicacion:
      'Da de alta al primero con el formulario de arriba. Solo tú verás los pacientes que tengas asignados.',
    introduceElNombre: 'Introduce el nombre',
    introduceLosApellidos: 'Introduce los apellidos',
    elNombreEsDemasiadoLargo: 'El nombre es demasiado largo',
    losApellidosSonDemasiadoLargos: 'Los apellidos son demasiado largos',
    noSePudoCrearElPaciente: 'No se pudo crear el paciente',
    noSePudoCargarLaListaDePacientes: 'No se pudo cargar la lista de pacientes',
  },
  // --- T-006b1 · ajustes del administrador -------------------------------

  // Ajustes
  ajustes: {
    titulo: 'Ajustes',
    subtitulo: 'Gestión de la cuenta y del sistema',
    secciones: {
      perfil: 'Mi perfil',
      seguridad: 'Seguridad',
      administracion: 'Administración',
    },
    acciones: {
      cambiarPin: 'Cambiar mi PIN',
      cambiarContrasena: 'Cambiar contraseña',
      totp: 'Verificar TOTP',
      invitaciones: 'Invitar usuarios',
      reponerTotp: 'Reponer TOTP',
      darDeBaja: 'Dar de baja',
    },
    permisos: {
      soloAdministrador: 'Solo disponible para administradores',
    },
    confirmacion: {
      titulo: 'Confirmar acción',
      reponerTotp: '¿Reponer el TOTP de {nombre}? Su dispositivo actual dejará de funcionar.',
      darDeBaja: '¿Dar de baja a {nombre}? Esta acción no se puede deshacer.',
      cancelar: 'Cancelar',
      confirmar: 'Confirmar',
    },
    resultados: {
      invitacionEnviada: 'Invitación enviada correctamente',
      totpRepuesto: 'TOTP repuesto correctamente',
      bajaCompletada: 'Usuario dado de baja',
      error: 'Error al realizar la acción',
    },
  },

  // Invitaciones
  invitar: {
    titulo: 'Invitar usuario',
    descripcion: 'Añadir un nuevo usuario al sistema',
    formulario: {
      nombre: 'Nombre completo',
      correo: 'Correo electrónico',
      rol: 'Rol',
      centro: 'Centro',
      centroAyuda: 'Obligatorio para técnicos administrativos',
      enviar: 'Enviar invitación',
      cancelar: 'Cancelar',
    },
    errores: {
      centroRequerido: 'Debe seleccionar un centro para técnicos administrativos',
      invalidEmail: 'Correo electrónico no válido',
    },
    resultados: {
      exito: 'Invitación enviada a {correo}',
      error: 'No se pudo enviar la invitación: {motivo}',
    },
  },

  // TOTP
  totp: {
    titulo: 'Reponer TOTP',
    descripcion: 'Restablecer la autenticación de doble factor de un usuario',
    formulario: {
      usuario: 'Usuario',
      seleccionarUsuario: 'Seleccionar usuario',
      reponer: 'Reponer TOTP',
      cancelar: 'Cancelar',
    },
    resultados: {
      exito: 'TOTP repuesto para {nombre}',
      error: 'Error al reponer TOTP: {motivo}',
    },
  },

  // Baja
  baja: {
    titulo: 'Dar de baja',
    descripcion: 'Desactivar un usuario del sistema',
    formulario: {
      usuario: 'Usuario',
      motivo: 'Motivo de la baja',
      motivoPlaceholder: 'Motivo opcional...',
      confirmar: 'Dar de baja',
      cancelar: 'Cancelar',
    },
    resultados: {
      exito: 'Usuario dado de baja',
      error: 'No se pudo dar de baja: {mensaje}',
    },
  },

  // Common
  comunes: {
    cargando: 'Cargando...',
    error: 'Error',
    exito: 'Éxito',
    cerrar: 'Cerrar',
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    aceptar: 'Aceptar',
    si: 'Sí',
    no: 'No',
  },
  // --- T-006b2 · primer acceso ---------------------------------------------

  primeraVez: {
    eyebrow: 'Primer acceso',

    totp: {
      titulo: 'Verificación en dos pasos',
      escanea:
        'Escanea el código con tu aplicación de autenticación y escribe el número de seis dígitos que te dé.',
      yaEnrolado: 'Escribe el número de seis dígitos que te dé tu aplicación de autenticación.',
      alt: 'Código QR para configurar la verificación en dos pasos',
      secreto: 'Clave, por si no puedes escanear',
      codigo: 'Código de seis dígitos',
      verificar: 'Verificar',
      codigoNoValido: 'Ese código no es válido. Prueba con el siguiente que te dé la aplicación.',
      noSePudoEnrolar: 'No se pudo preparar la verificación en dos pasos. Vuelve a intentarlo.',
    },

    codigos: {
      titulo: 'Tus códigos de recuperación',
      unaSolaVez:
        'Guárdalos ahora en un sitio seguro: son la única forma de entrar si pierdes el teléfono, y no se pueden volver a consultar.',
      guardados: 'Ya los he guardado',
    },

    pin: {
      titulo: 'Tu PIN de historia',
      explicacion:
        'Con este PIN abres las historias clínicas. Es tuyo y no lo puede reponer nadie, así que elige uno que recuerdes.',
      etiqueta: 'PIN de seis dígitos',
      confirmacion: 'Repite el PIN',
      fijar: 'Guardar el PIN',
      noCoinciden: 'Los dos PIN no coinciden.',
      fijado: 'PIN guardado.',
    },
  },

  // --- T-006b3 · candado de la historia y recuperación -----------------------

  candado: {
    titulo: 'Historia clínica',
    subtitulo: 'Para abrir una historia hace falta tu PIN.',
    explicacion: 'Escribe tu PIN para abrir las historias durante un rato.',
    etiquetaPin: 'PIN',
    abrir: 'Abrir',
    abierta: 'Historias abiertas.',
    abiertaMinutos: 'Historias abiertas. Se cierran solas en {minutos} min.',
    porCaducar: 'Se van a cerrar en breve. Si sigues trabajando, amplía el tiempo.',
    prolongar: 'Ampliar el tiempo',
    cerrar: 'Cerrar ahora',
    cerrada: 'Historias cerradas.',
    pinIncorrecto: 'El PIN no es correcto.',
    pinNoValido: 'El PIN son seis dígitos.',
    bloqueado: 'Demasiados intentos. Prueba de nuevo más tarde.',
    bloqueadoMinutos: 'Demasiados intentos. Prueba de nuevo en {minutos} min.',
  },

  recuperar: {
    eyebrow: 'Recuperar el acceso',
    titulo: '¿Has perdido tu teléfono?',
    explicacion:
      'Escribe uno de los códigos de recuperación que guardaste. Cada código sirve una sola vez, y al usarlo tendrás que volver a configurar la verificación en dos pasos.',
    etiqueta: 'Código de recuperación',
    canjear: 'Usar el código',
    codigoNoValido: 'Ese código no es válido.',
    bloqueado: 'Demasiados intentos. Prueba de nuevo más tarde.',
  },

} as const;
