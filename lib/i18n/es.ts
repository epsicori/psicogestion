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
    miCuenta: 'Mi cuenta',
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

    // T-032 · el resto de los campos del alta
    fechaDeNacimiento: 'Fecha de nacimiento',
    introduceLaFechaDeNacimiento: 'Introduce la fecha de nacimiento',
    fechaDeNacimientoNoValida: 'Esa fecha no es válida',
    fechaDeNacimientoFueraDeRango: 'Fecha de nacimiento fuera de rango',
    masDatos: 'Más datos (opcional)',
    sexo: 'Sexo (opcional)',
    sexoNoValido: 'Elige una opción de la lista',
    sexoHombre: 'Hombre',
    sexoMujer: 'Mujer',
    sexoOtro: 'Otro',
    telefono: 'Teléfono (opcional)',
    telefonoNoValido: 'Introduce un teléfono válido',
    dniONie: 'DNI o NIE (opcional)',
    dniNoValido: 'Introduce un DNI o NIE válido',
    eseDocumentoYaEstaDadoDeAlta: 'Ese documento ya está dado de alta',
    domicilio: 'Domicilio (opcional)',
    elDomicilioEsDemasiadoLargo: 'El domicilio es demasiado largo',
    alergias: 'Alergias (opcional)',
    lasAlergiasSonDemasiadoLargas: 'El texto de alergias es demasiado largo',
    medicacionActual: 'Medicación actual (opcional)',
    laMedicacionEsDemasiadoLarga: 'El texto de medicación es demasiado largo',
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
    // T-032 · texto de la opción vacía de un <select> opcional (components/ui/seleccion.tsx)
    sinIndicar: 'Sin indicar',
  },
  // --- T-033 · modo local del segundo factor ---------------------------------

  modoLocal: {
    aviso:
      'Desarrollo local: el segundo factor se supera solo con las cuentas sembradas. Esto no es un entorno real.',
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
      fallo:
        'No se han podido generar tus códigos de recuperación. No se volverán a ofrecer al entrar: puedes generarlos en Mi cuenta › Seguridad, con tu contraseña.',
      reintentar: 'Reintentar',
      sinRespuesta:
        'No hemos podido contactar con el servidor: revisa tu conexión y vuelve a intentarlo. Si no sale, genera tus códigos en Mi cuenta › Seguridad.',
      reentrar:
        'Tu verificación en dos pasos se hizo hace más de cinco minutos y ya no vale para generar los códigos. Vuelve a entrar y genéralos en Mi cuenta › Seguridad, con tu contraseña.',
      volverAEntrar: 'Volver a entrar',
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

  // --- T-038 · Mi cuenta ------------------------------------------------------

  cuenta: {
    titulo: 'Mi cuenta',
    seguridad: 'Seguridad',
    regenerar: {
      titulo: 'Regenerar mis códigos de recuperación',
      aviso: 'Los códigos que tienes ahora dejarán de valer.',
      contrasena: 'Contraseña',
      codigo: 'Código de la aplicación',
      enviar: 'Regenerar códigos',
    },
    errores: {
      contrasenaIncorrecta: 'La contraseña no es correcta.',
      codigoNoValido: 'Ese código no es válido. Prueba con el siguiente que te dé la aplicación.',
      sinFactor: 'No tienes la verificación en dos pasos activada.',
      bloqueado: 'Demasiados intentos. Prueba de nuevo a las {hora}.',
      generico: 'No se han podido regenerar los códigos. Vuelve a intentarlo.',
      resultadoDesconocido:
        'No hemos recibido respuesta y no sabemos si se han regenerado. Si se regeneraron, la lista que tienes en papel ya no vale y la nueva no se te ha enseñado. Vuelve a regenerarlos en cualquier caso: así tendrás una lista nueva que sí vale.',
      registroInseguro:
        'Ahora mismo no es seguro enviar tu contraseña: avisa al administrador. No se ha cambiado nada.',
    },
    codigos: {
      titulo: 'Tus códigos de recuperación nuevos',
      aviso:
        'Guárdalos ahora en un sitio seguro: solo se enseñan esta vez y los anteriores ya no valen.',
      guardados: 'Ya los he guardado',
    },
    fallo: {
      titulo: 'No se han regenerado los códigos',
      tituloDesconocido: 'No sabemos si se han regenerado los códigos',
      volver: 'Volver',
    },
    avisos: {
      titulo: 'Avisos de seguridad',
      vacio: 'No hay avisos de seguridad.',
      errorLectura: 'No se han podido cargar los avisos. Recarga la página para intentarlo de nuevo.',
      sinLeer: 'Sin leer',
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

  ficha: {
    // Cabecera
    volverALaLista: 'Volver a la lista',
    noSePudoCargarLaFicha: 'No se pudo cargar la ficha de este paciente.',
    centro: 'Centro',
    sinCentro: 'Sin centro asignado',
    alta: 'Alta',
    edad: 'Edad',
    anios: '{n} años',
    sinFechaDeNacimiento: 'Sin fecha de nacimiento',
    motivoDeConsulta: 'Motivo de consulta',
    sinMotivoRegistrado: 'Sin motivo registrado',
    nivelDeRiesgo: 'Nivel de riesgo',
    riesgoBajo: 'Bajo',
    riesgoModerado: 'Moderado',
    riesgoAlto: 'Alto',
    valoradoEl: 'Valorado el {fecha}',
    valoracionAntigua: 'Valorado el {fecha}. Conviene revisarlo.',
    sinValoracion: 'Sin valorar',
    indicadorDeRiesgo: 'Indicador de riesgo',
    conIndicador: 'Activo',
    sinIndicador: 'Sin indicador',
    contactoDeEmergencia: 'Contacto de emergencia',

    // Pestañas de la ficha
    secciones: 'Secciones de la ficha',
    resumen: 'Resumen',
    fichaDelPaciente: 'Ficha del paciente',
    historiaClinica: 'Historia clínica',
    documentos: 'Documentos y consentimientos',
    facturacion: 'Facturación',

    // Sub-pestañas de la historia
    seccionesDeLaHistoria: 'Secciones de la historia clínica',
    historial: 'Historial clínico',
    notas: 'Notas clínicas',
    evaluaciones: 'Evaluaciones',
    informes: 'Informes',

    // Candado
    historiaBloqueada: 'Esta historia está cerrada',
    historiaBloqueadaExplicacion:
      'El contenido clínico se abre con tu PIN y se cierra solo al cabo de un rato. Escríbelo para verlo.',
    cerrarHistoria: 'Cerrar la historia',
    historiaAbiertaMinutos: 'Historia abierta. Se cierra sola en {minutos} min.',
    historiaPorCerrarse: 'Se va a cerrar en breve. Si sigues trabajando, amplía el tiempo.',
    ampliarElTiempo: 'Ampliar el tiempo',
    seCerroSola: 'La historia se ha cerrado sola. Vuelve a escribir tu PIN para seguir.',
    noSePudoAbrir: 'No se pudo abrir esta historia.',
    vecesEnEstaVentana: 'Es la vez {n} que la abres desde que escribiste el PIN.',

    // Historial clínico
    episodios: 'Episodios',
    episodioAbierto: 'Abierto el {fecha}',
    episodioCerrado: 'Del {inicio} al {fin}',
    sinEpisodios: 'Todavía no hay episodios',
    sinEpisodiosExplicacion:
      'Un episodio agrupa el motivo por el que alguien viene y todo lo que se hace mientras dura.',
    modalidadIndividual: 'Individual',
    modalidadPareja: 'Pareja',
    modalidadFamiliar: 'Familiar',
    modalidadGrupo: 'Grupo',
    diagnosticos: 'Diagnósticos',
    diagnosticoPrincipal: 'Principal',
    diagnosticoRetirado: 'Retirado el {fecha}',
    sinDiagnosticos: 'Sin diagnósticos registrados',
    valoracionesDeRiesgo: 'Valoraciones de riesgo',
    planDeSeguridad: 'Plan de seguridad',

    // Lo que todavía no está
    enPreparacion: 'Esta sección todavía no está',
    evaluacionesEnPreparacion:
      'Aquí irán las pruebas pasadas, su corrección y los archivos adjuntos.',
    informesEnPreparacion:
      'Aquí irán los informes de alta, seguimiento y derivación, con su firma.',
    facturacionVacia: 'Aquí no hay nada todavía',
    facturacionVaciaExplicacion:
      'La facturación de este paciente se construye en su propio ticket. Preferimos dejarlo vacío y decirlo a enseñar cifras que no son.',
    // Resumen: la agenda de este paciente, que vive FUERA del candado
    ultimaSesion: 'Última sesión',
    sinSesionesRealizadas: 'Todavía no se ha dado ninguna sesión por realizada',
    proximaCita: 'Próxima cita',
    sinProximaCita: 'No hay ninguna cita por delante',
    actividad: 'Actividad',
    sesionesRealizadas: 'Sesiones realizadas',
    citasNoAsistidas: 'Citas a las que no acudió',
    citasCanceladas: 'Citas canceladas',
    sinCitas: 'Todavía no hay citas de este paciente',
    sinCitasExplicacion:
      'En cuanto se agende la primera, aquí aparecerán la última sesión, la siguiente y el recuento.',
    agendaNoVisible: 'No puedes ver la agenda de este paciente',
    agendaNoVisibleExplicacion:
      'Las citas las ve el profesional que las atiende y, en su centro, quien las gestiona.',
    enLaSala: 'Sala {sala}',
    estadoProgramada: 'Programada',
    estadoConfirmada: 'Confirmada',
    estadoRealizada: 'Realizada',
    estadoCancelada: 'Cancelada',
    estadoNoAsistida: 'No acudió',

    // Estado documental (choque 7): describe los papeles, nunca al paciente
    documentacion: 'Documentación',
    documentacionAlDia: 'Al día',
    documentacionNueva: 'Nuevo',
    documentacionRevisar: 'Revisar',

    // Ficha del paciente
    gestionAsistencial: 'Gestión asistencial',
    profesionalResponsable: 'Profesional responsable',
    sinProfesional: 'Sin profesional asignado',
    titularidad: 'A cargo de',
    titularidadOrganizacion: 'El centro',
    titularidadProfesional: 'El profesional',
    contacto: 'Contacto',
    contactoNoVisible: 'No puedes ver el contacto de este paciente',
    contactoNoVisibleExplicacion:
      'Los datos de contacto los ven el profesional asignado y el administrador.',
    sinRepresentantes: 'No hay ninguna persona de contacto registrada',
    sinRepresentantesExplicacion:
      'Aquí aparecen quienes pueden actuar por el paciente —madre, padre, tutor— con su teléfono.',
    telefono: 'Teléfono',
    correo: 'Correo',
    sinTelefono: 'Sin teléfono',
    sinCorreo: 'Sin correo',
    representanteProgenitor: 'Madre o padre',
    representanteTutor: 'Tutor legal',
    representanteAcogedor: 'Persona acogedora',
    representanteGuardadorDeHecho: 'Guardador de hecho',
    representanteRepresentanteJudicial: 'Nombrado por un juzgado',
    alcancePatriaPotestad: 'Patria potestad',
    alcanceCustodia: 'Custodia',
    alcanceSoloContacto: 'Solo contacto',
    vigenteDesde: 'Desde el {fecha}',
    yaNoVigente: 'Ya no está vigente',

    // T-032 · Corte B: identificación (ADR-060), sexo administrativo (ADR-062) y salud
    // básica (ADR-061) en la ficha.
    identificacion: 'Identificación',
    documento: 'Documento',
    domicilio: 'Domicilio',
    sinDocumento: 'Sin documento registrado',
    sinDomicilio: 'Sin domicilio registrado',
    identificacionNoLegible: 'No se puede mostrar',
    identificacionNoLegibleExplicacion:
      'Hay un documento o un domicilio guardados, pero no se han podido descifrar. Avisa a quien administra la cuenta.',
    sexo: 'Sexo',
    sinSexo: 'Sin especificar',
    sexoHombre: 'Hombre',
    sexoMujer: 'Mujer',
    sexoOtro: 'Otro',
    alergiasYMedicacion: 'Alergias y medicación',
    alergias: 'Alergias',
    medicacionActual: 'Medicación actual',
    sinAlergias: 'Sin alergias registradas',
    sinMedicacion: 'Sin medicación registrada',
    representacionLegal: 'Representación legal',
    sinRepresentacionLegal: 'No hay ninguna persona con representación legal registrada',
    sinContactoDeEmergencia: 'No hay ningún contacto de emergencia registrado',
    contactoDeEmergenciaExplicacion: 'No puede dar el consentimiento ni firmar por el paciente.',

    // Documentos y consentimientos (ADR-048: fuera del candado; ADR-054: lenguaje claro)
    consentimientos: 'Consentimientos',
    sinConsentimientos: 'Todavía no hay ningún consentimiento',
    sinConsentimientosExplicacion:
      'Aquí aparecerá cada permiso que el paciente haya dado, con la fecha y el texto exacto que firmó.',
    consentimientosNoVisibles: 'No puedes ver los consentimientos de este paciente',
    consentimientosNoVisiblesExplicacion:
      'El texto firmado lo ven el profesional asignado y el administrador. Lo que sí ves aquí abajo es si falta alguno por firmar.',
    consentimientoAsistencial: 'Atención psicológica',
    consentimientoAsistencialExplicacion:
      'Permite atenderle y recoger lo que haga falta para el tratamiento.',
    consentimientoTerapiaParejaFamiliar: 'Terapia de pareja o de familia',
    consentimientoTerapiaParejaFamiliarExplicacion:
      'Lo firman todas las personas que acuden, porque lo que se habla es de todas.',
    consentimientoTratamientoDatos: 'Uso de sus datos',
    consentimientoTratamientoDatosExplicacion:
      'Explica qué datos se guardan, para qué y durante cuánto tiempo.',
    consentimientoCesionInformacion: 'Enviar información a otra persona',
    consentimientoCesionInformacionExplicacion:
      'Permite compartir información con quien se indique: otro profesional, un centro o una aseguradora.',
    consentimientoGrabacion: 'Grabar las sesiones',
    consentimientoGrabacionExplicacion:
      'Permite grabar en audio o en vídeo, y dice para qué se usará la grabación.',
    consentimientoOtro: 'Otro permiso',
    consentimientoOtroExplicacion: 'Un permiso que no encaja en los anteriores. Lo explica su texto.',
    consentimientoFirmado: 'Firmado',
    consentimientoRetirado: 'Retirado',
    consentimientoSinFirmar: 'Sin firmar',
    firmadoEl: 'Firmado el {fecha}',
    retiradoEl: 'Retirado el {fecha}',
    pendienteDeFirma: 'Todavía no está firmado',
    firmadoPor: 'Lo firmó {nombre}',
    firmantePendiente: '{nombre}, pendiente de firmar',
    menorOido: 'Se escuchó al menor antes de firmar',
    versionDelTexto: 'Versión {version} del texto',
    verElTexto: 'Ver el texto tal y como se firmó',
    textoNoGuardado: 'El texto firmado no está guardado en la aplicación.',
    copiaArchivada: 'Hay una copia archivada',

    // Lo que falta por hacer, que es lo que puede ver recepción
    pendientes: 'Pendiente',
    sinPendientes: 'No hay nada pendiente',
    sinPendientesExplicacion: 'Cuando falte un papel por firmar o por corregir, aparecerá aquí.',
    alertaNotaSinFirmar: 'Hay una nota de sesión sin firmar',
    alertaBorradorAbandonado: 'Hay un borrador empezado y sin terminar',
    alertaConsentimientoPendiente: 'Falta un consentimiento por firmar',
    alertaInformePendiente: 'Hay un informe pendiente',
    alertaEvaluacionSinCorregir: 'Hay una evaluación sin corregir',
    desdeEl: 'Desde el {fecha}',
  },

  // T-012 · La nota clínica: borrador, firma y versión sellada
  notas: {
    estado: {
      borrador: 'Borrador',
      firmada: 'Firmada',
      modificada: 'Modificada',
      firmadaConCambios: 'Firmada · con cambios sin firmar',
    },
    sello: {
      enSesion: 'Escrita durante la sesión del {fecha} · {desde}–{hasta}',
      fueraDeSesion: 'Escrita fuera de la sesión del {fecha} · {desde}–{hasta}',
      sinCita: 'Escrita el {fecha} · {desde}–{hasta}',
      sinCitaVariosDias: 'Escrita entre el {desde} y el {hasta}',
      ilegible: 'Sello no legible',
      margen: 'Margen aplicado: {minutos} min',
    },
    // La etiqueta del episodio en la cabecera de la nota y en el selector «¿en cuál?».
    episodio: '{modalidad} · desde el {fecha}',
    modalidad: {
      individual: 'Individual',
      pareja: 'Pareja',
      familiar: 'Familiar',
      grupo: 'Grupo',
    },
    version: {
      titulo: 'Versión {numero}',
      vigente: 'vigente',
      firmadaPor: 'Firmada el {fecha} por {autor}',
      motivo: 'Motivo del cambio: {motivo}',
      conjunta: 'Nota conjunta del episodio',
      huella: 'Huella {huella}…',
    },
    modificadaPor: 'Modificada el {fecha} · por {autor}',
    reservadas: {
      titulo: 'Anotaciones reservadas (art. 18.3, Ley 41/2002)',
      excluye: 'Se excluyen de las copias que se entregan al paciente.',
      noOculta: 'No se ocultan al profesional que herede el caso.',
      noOpone: 'No se pueden oponer a un requerimiento judicial.',
    },
    lista: {
      vacia: 'Todavía no hay notas',
      vaciaExplicacion: 'Las notas se escriben desde la cita en la agenda.',
      versiones: '{n} versiones',
      noSePudoLeer: 'No se pudieron leer las notas. Vuelve a abrir la pestaña.',
    },
    cabecera: {
      volver: 'Volver a la ficha',
      titulo: 'Nota de {paciente}',
    },
    editor: {
      abrir: 'Abrir el editor',
      acciones: 'Acciones de la nota',
      partes: 'Partes de la nota',
      nota: 'Nota',
      reservadas: 'Anotaciones reservadas',
      vigente: 'Versión vigente',
      ultimaConjunta: 'Última versión conjunta',
      versionesConjuntas: 'Versiones conjuntas',
      guardado: 'Guardado',
      guardando: 'Guardando…',
      sinGuardar: 'Sin guardar',
      noSeGuardo: 'No se ha podido guardar. Se volverá a intentar al seguir escribiendo.',
      guardar: 'Guardar',
      firmar: 'Firmar',
      modificar: 'Modificar',
      coprofesional: 'Coprofesional',
      sinCoprofesional: 'Sin coprofesional',
      episodio: 'Episodio',
      continuar: 'Continuar',
      elegirEpisodio: 'Esta cita puede ir en más de un episodio. Elige en cuál se escribe la nota.',
      sinEpisodios: 'No tienes ningún episodio abierto con este paciente.',
      borradorAjeno: 'Su autor tiene cambios sin firmar.',
      borradorOculto: 'Hay un borrador en curso.',
    },
    firma: {
      titulo: 'Firmar la nota',
      confirmar: 'Firmar',
      firmando: 'Firmando…',
      loGuardado: 'Se firma lo guardado. Lo firmado no se borra: cada cambio será una versión nueva.',
      motivo: 'Motivo del cambio',
      alcance: 'Alcance',
      individual: 'Nota individual',
      conjunta: 'Nota conjunta del episodio',
      conjuntaLeeran: 'La leerán los profesionales del episodio.',
      conjuntaEslabon: 'Es un solo eslabón de la cadena.',
      conjuntaAcceso: 'No se entregará entera en un acceso individual.',
    },
    comparar: {
      abrir: 'Comparar versiones',
      titulo: 'De la versión {desde} a la {hasta}',
      desde: 'Desde',
      hasta: 'Hasta',
      leyenda: 'Lo añadido va subrayado y con «+»; lo retirado, tachado y con «−».',
      anadido: 'Añadido: ',
      retirado: 'Retirado: ',
      fin: ' Fin del cambio.',
      sinCambios: 'Sin cambios entre estas dos versiones.',
      resumida:
        'Hay demasiados cambios para señalarlos palabra a palabra: se muestra completo lo retirado y lo añadido.',
    },
    aviso: {
      sinAcceso: 'No se puede abrir la historia de este paciente.',
      noDisponible: 'Esta nota no está disponible.',
      noSeAbrio: 'No se pudo abrir la nota. Vuelve a intentarlo.',
      reintentar: 'Volver a intentarlo',
      conflicto:
        'La nota ha cambiado desde otro sitio y no se ha guardado ni firmado lo de esta pantalla. Tu texto sigue aquí para que lo copies; al cargar lo guardado se sustituye.',
      cargarLoGuardado: 'Cargar lo guardado',
      yaFirmada: 'Esta nota ya se ha firmado desde otro sitio.',
      noAutor: 'Esta nota solo la corrige quien la escribió. Si llevas el caso, escribe una nota nueva.',
      vacia: 'No se firma una nota vacía.',
      faltaMotivo: 'Para modificar una nota firmada hace falta un motivo.',
      noSeFirmo: 'No se pudo firmar. Vuelve a intentarlo.',
      coprofesionalInvalido: 'Esa persona no puede figurar como coprofesional en este centro.',
      yaFirmadaCoprofesional: 'Ya está firmada: el coprofesional no se cambia.',
      firmadaSinRecargar: 'Firmada. No se pudo recargar la nota.',
      hechoSinRecargar: 'Hecho. No se pudo recargar la nota.',
      noSeRecargo: 'No se pudo recargar la nota.',
      noSeRecargoOtraVez: 'Tampoco se pudo recargar la nota (intento {intentos}).',
      recargar: 'Recargar',
    },
  },

  agenda: {
    // Los cinco del enum `estado_cita` y «en curso», que se calcula (ADR-045). Las claves
    // son el valor del estado, por eso van con guion bajo.
    estados: {
      programada: 'Programada',
      confirmada: 'Confirmada',
      en_curso: 'En curso',
      realizada: 'Realizada',
      cancelada: 'Cancelada',
      no_asistida: 'No asistió',
    },
    leyendaEstados: 'Leyenda de estados de la cita',

    // T-014 · La pantalla /agenda
    versalita: 'Agenda',
    titulo: 'Calendario de citas',
    esqueletos: {
      calendario: 'Cargando calendario',
      lista: 'Cargando lista de citas',
      cuadro: 'Cargando cuadro de métricas',
    },
    errorBloque: 'No se ha podido cargar este bloque. Vuelve a intentarlo en un momento.',

    barra: {
      semanaAnterior: 'Semana anterior',
      semanaSiguiente: 'Semana siguiente',
      mesAnterior: 'Mes anterior',
      mesSiguiente: 'Mes siguiente',
      hoy: 'Hoy',
      vista: 'Vista del calendario',
      semana: 'Semana',
      mes: 'Mes',
      centro: 'Centro',
      todosLosCentros: 'Todos los centros',
      profesional: 'Profesional',
      todosLosProfesionales: 'Todos los profesionales',
      leyenda: 'Leyenda',
    },
    tituloSemana: '{desde}–{hasta} de {mes} de {anio}',
    tituloSemanaDosMeses: '{desde} de {mesDesde} – {hasta} de {mesHasta} de {anio}',
    tituloSemanaDosAnios: '{desde} de {mesDesde} de {anioDesde} – {hasta} de {mesHasta} de {anioHasta}',
    tituloMes: '{mes} de {anio}',

    cita: {
      paciente: 'Paciente',
      profesional: 'Profesional',
      minutos: '{n} min',
      deSerie: 'Cita de una serie',
      desviada: 'Movida fuera de la serie',
      propuesta: 'Tiene un cambio por confirmar',
      tipoYProfesional: '{tipo} · {profesional}',
      centroYSala: '{centro} · sala {sala}',
      sala: 'Sala {sala}',
      rangoYDuracion: '{rango} · {duracion}',
      horaYNombre: '{hora} {nombre}',
    },
    motivosDesviacion: {
      reprogramada: 'Movida a mano',
      anomalia_horaria: 'Cae en un cambio de hora',
      festivo: 'Movida por un festivo',
      ausencia: 'Movida por una ausencia',
    },
    rejilla: {
      sinCitas: 'Sin citas',
      citas: { una: '1 cita', varias: '{n} citas' },
      masCitas: '+{n} más',
      horas: 'Horas del día',
      diasDeLaSemana: 'Días de la semana',
      citasDelDia: 'Citas del día',
    },
    panelCita: {
      profesional: 'Profesional',
      tipo: 'Tipo de terapia',
      lugar: 'Lugar',
      notaOperativa: 'Nota operativa',
      estado: 'Estado',
      serie: 'Serie',
      propuesta: 'Cambio por confirmar',
      propuestaRango: 'Propuesta: {rango}',
      propuestaSinHorario: 'Sin horario propuesto: decídelo a mano.',
      notaPendiente: {
        hoy: 'La nota de esta sesión es obligatoria · pendiente desde hoy',
        una: 'La nota de esta sesión es obligatoria · pendiente desde hace 1 día',
        varias: 'La nota de esta sesión es obligatoria · pendiente desde hace {n} días',
      },
      notas: 'Notas',
      reprogramar: 'Reprogramar',
    },
    panelDia: {
      sinCitas: 'No hay citas este día.',
    },

    reprogramar: {
      titulo: 'Reprogramar la cita',
      fecha: 'Día',
      hora: 'Hora',
      hechoSuelta: 'Cita movida al {fecha} a las {hora}.',
    },
    moverSerie: {
      titulo: 'Mover una cita de una serie',
      destino: 'Mover a {fecha} · {hora}',
      pregunta: '¿Qué pasa con la serie?',
      mantener: 'Mantener la serie: mover solo esta cita',
      mantenerDetalle: 'La serie no cambia. Esta cita quedará marcada como movida a mano.',
      modificar: 'Modificar la serie desde esta cita: esta y las siguientes',
      ahora: 'Ahora: {regla}.',
      despues: 'Esta y las siguientes pasarán a ser {regla}.',
      afecta: {
        una: 'Afecta a 1 cita, la del {primera}.',
        varias: 'Afecta a {n} citas, del {primera} al {ultima}.',
      },
      confirmacion:
        'Esta cita se moverá ahora. Las demás quedarán en «Por confirmar» para que las confirmes una a una.',
      calculando: 'Calculando en qué se convierte la serie…',
      elige: 'Elige qué pasa con la serie.',
      sinCambio: 'La cita ya está en ese día y a esa hora.',
      serieOtraZona: 'La serie está en otra zona horaria que esta cita; mueve solo esta cita.',
      horaDistintaEnSerie:
        'Esa hora no existe o se repite ese día en la zona horaria de la serie; elige otra.',
      caducada: 'La serie ha cambiado mientras decidías. Revisa el nuevo resumen y vuelve a pulsar Mover.',
      cancelar: 'Cancelar',
      mover: 'Mover',
      moviendo: 'Moviendo…',
      hechoMantener: 'Cita movida al {fecha} a las {hora}.',
      hechoModificar: {
        ninguna: 'Cita movida al {fecha} a las {hora}. La serie ha cambiado.',
        una: 'Cita movida al {fecha} a las {hora}. 1 cita de la serie espera en «Por confirmar».',
        varias:
          'Cita movida al {fecha} a las {hora}. {n} citas de la serie esperan en «Por confirmar».',
      },
      noMovida:
        'La serie ha cambiado, pero esta cita no se ha movido: {motivo} Su propuesta sigue en «Por confirmar».',
      noMovidaSinMotivo: 'La serie ha cambiado, pero esta cita no se ha movido. Su propuesta sigue en «Por confirmar».',
      noMovidaSinPropuesta: 'La serie ha cambiado, pero esta cita no se ha movido.',
      noMovidaSinComprobar:
        'La serie ha cambiado, pero no se ha podido comprobar esta cita: {motivo} Revisa «Por confirmar».',
      avisos: {
        recorte: 'Hay meses sin 5.º {dia}. En ellos la cita irá al último, el 4.º: {fechas}.',
        inexistente:
          'El {fecha} las {hora} no existen por el cambio de hora: esa cita irá a las {horaReal} y quedará marcada al confirmarla.',
        ambigua:
          'El {fecha} las {hora} se repiten por el cambio de hora: esa cita irá a la primera y quedará marcada al confirmarla.',
        sinHora: {
          una: '1 cita quedará sin hora y se decidirá a mano en «Por confirmar».',
          varias: '{n} citas quedarán sin hora y se decidirán a mano en «Por confirmar».',
        },
      },
    },
    regla: {
      semanal: 'los {dias} a las {hora}',
      quincenal: 'los {dias}, cada dos semanas, a las {hora}',
      mensual: 'el {ordinal} {dia} de cada mes a las {hora}',
      mensualUltimo: 'el último {dia} de cada mes a las {hora}',
      mensualSinOrdinal: 'un {dia} de cada mes a las {hora}',
      dias: {
        lunes: 'lunes',
        martes: 'martes',
        miercoles: 'miércoles',
        jueves: 'jueves',
        viernes: 'viernes',
        sabado: 'sábado',
        domingo: 'domingo',
      },
      diasPlural: {
        lunes: 'lunes',
        martes: 'martes',
        miercoles: 'miércoles',
        jueves: 'jueves',
        viernes: 'viernes',
        sabado: 'sábados',
        domingo: 'domingos',
      },
      ordinales: { primero: '1.er', segundo: '2.º', tercero: '3.er', cuarto: '4.º', quinto: '5.º' },
    },
    rechazos: {
      yaEmpezada: 'La cita ya ha empezado o ha pasado.',
      canceladaOCerrada: 'La cita está cancelada o cerrada.',
      movidaAMano: 'La cita se movió a mano y la serie ya no la gobierna.',
      fechaYDiaNoCoinciden: 'La fecha y el día de la semana no coinciden.',
      horarioNuevoPasado: 'El nuevo horario de esta cita ya ha pasado.',
      propuestaPasada: 'La propuesta ha quedado en el pasado.',
      sinEvento: 'Esta propuesta no se puede comprobar.',
      otraRegla: 'La serie ya tiene otra regla.',
      otraZona: 'El centro ya tiene otra zona horaria.',
      citaCambiada: 'La cita cambió desde que se hizo la propuesta.',
      sinHorario: 'La propuesta no tiene horario.',
      yaNoVale: 'Ya no vale',
      noConfirmada: 'No se ha confirmado: {motivo}',
      descartala: 'Descártala para quitarla de la lista.',
      cambioDeHora: 'Cae en un cambio de hora: al confirmarla quedará marcada.',
    },

    proximas: {
      titulo: 'Próximas citas',
      lista: 'Próximas citas de hoy y mañana',
      vacio: 'No hay más citas hasta mañana',
      vacioExplicacion: 'Las próximas citas programadas o confirmadas aparecerán aquí.',
    },
    porConfirmar: {
      titulo: 'Por confirmar',
      explicacion: 'Cambios en citas de una serie que esperan a que alguien los decida.',
      prevista: 'Prevista el {fecha} a las {hora}',
      propuesta: 'Propuesta: {rango}',
      sinPropuesta: 'Sin horario propuesto',
      confirmar: 'Confirmar',
      descartar: 'Descartar',
      enCurso: 'Un momento…',
      hechoConfirmada: 'Propuesta confirmada.',
      hechoDescartada: 'Propuesta descartada.',
      motivos: {
        festivo: 'Cae en un festivo',
        ausencia: 'El profesional tiene una ausencia',
        ocupada: 'El hueco está ocupado',
        zona_cambiada: 'El centro cambió de zona horaria',
        regla_cambiada: 'La serie cambió de regla',
      },
    },
    documentacion: {
      titulo: 'Documentación pendiente',
      tipos: {
        nota_sin_firmar: 'Nota sin firmar',
        borrador_abandonado: 'Borrador sin terminar',
        consentimiento_pendiente: 'Consentimiento por firmar',
        informe_pendiente: 'Informe pendiente',
        evaluacion_sin_corregir: 'Evaluación sin corregir',
      },
      desde: {
        hoy: 'pendiente desde hoy',
        una: 'pendiente desde hace 1 día',
        varias: 'pendiente desde hace {n} días',
        sinFecha: 'pendiente',
      },
      fila: '{tipo} · {desde}',
      nivel2: 'Atrasada',
      nivel3: 'Muy atrasada',
      resolver: 'Marcar como resuelta',
      resolverEtiqueta: 'Marcar como resuelta: {tipo}',
      resolviendo: 'Guardando…',
      errorResolver: 'No se ha podido marcar como resuelta.',
      resuelta: 'Marcada como resuelta.',
      vacio: 'No hay documentación pendiente',
      vacioExplicacion: 'Cuando falte una nota por firmar, aparecerá aquí.',
    },
    cuadro: {
      titulo: 'Este mes',
      asistencia: 'Asistencia',
      ausencia: 'Ausencia sin aviso',
      matiz: 'Del día 1 hasta ahora, sobre {n} citas cerradas',
      porcentaje: '{n} %',
      sinDatos: '—',
    },

    // T-028 · El alta de una cita o de una serie. Sin modalidad (ADR-075); el tipo de terapia
    // lo elige quien agenda y fija la duración (ADR-074).
    alta: {
      cargando: 'Cargando…',
      abrir: 'Nueva cita',
      titulo: 'Nueva cita',
      guardar: 'Guardar',
      guardando: 'Guardando…',
      huecoOcupado: 'Ese hueco acaba de ocuparse. Elige otro de los que quedan.',
      huecoNoCabe: 'Con esta duración el hueco elegido ya no cabe.',
      sinHueco: 'Elige un hueco libre del calendario.',
      guardada: 'Cita guardada.',
      guardadaSerie: 'Serie guardada.',
      propuestasPendientes: 'Quedan fechas por resolver en la bandeja de la agenda.',
      campos: {
        paciente: 'Paciente',
        pacienteBuscar: 'Buscar paciente por nombre',
        pacienteBuscarAyuda: 'Escribe al menos dos letras.',
        pacienteSinResultados: 'Ningún paciente coincide.',
        pacienteElegido: 'Paciente elegido',
        pacienteCambiar: 'Cambiar',
        profesional: 'Profesional',
        centro: 'Centro',
        sala: 'Sala',
        tipo: 'Tipo de terapia',
        tipoElige: 'Elige el tipo',
        tipoVacio: 'No hay tipos de terapia activos. Los da de alta el administrador.',
        duracion: 'Duración: {minutos} min',
        duracionPendiente: 'Duración: elige un tipo',
        periodicidad: 'Periodicidad',
        sesiones: 'Número de sesiones',
        sesionesAyuda: 'Entre 2 y 52.',
        notaOperativa: 'Nota operativa · logística',
        notaAyuda: 'Sala, material o aviso de acceso. Lo clínico va en la historia.',
        hueco: 'Hueco elegido',
      },
      periodicidad: {
        suelta: 'Cita suelta',
        semanal: 'Semanal',
        quincenal: 'Quincenal',
        mensual: 'Mensual',
      },
      seleccion: {
        titulo: 'Calendario de huecos',
        semanaAnterior: 'Semana anterior',
        semanaSiguiente: 'Semana siguiente',
        libre: '{cuando}, libre',
        sugerida: 'sugerida',
        habitual: 'habitual',
        elegida: 'elegida',
        etiquetaSugerida: 'Sugerida {n}',
        etiquetaHabitual: 'Habitual',
        etiquetaElegida: 'Elegida',
        etiquetaOcupado: 'Ocupado',
        vacio: 'No hay huecos libres en esta semana.',
        diasDeLaSemana: 'Días de la semana',
        huecosDelDia: 'Huecos del día',
      },
      error: {
        tipoNoValido: 'Ese tipo de terapia ya no está disponible. Elige otro.',
        previsualizacionCaducada: 'La serie ha cambiado mientras la revisabas. Revisa de nuevo las fechas.',
        generico: 'No se ha podido guardar la cita.',
        buscar: 'No se ha podido buscar pacientes.',
        calcular: 'No se han podido calcular los huecos.',
        sinCentro: 'No tienes ningún centro asignado.',
        sinProfesionales: 'No hay profesionales activos en este centro.',
        cargar: 'No se ha podido preparar el formulario.',
      },
      motivo: {
        comoLasUltimas: 'Como las {n} últimas',
        diaHabitual: '{dia} a las {hora}, su día habitual',
        cadaIntervalo: '{intervalo}, como de costumbre',
        primerHueco: 'Primer hueco libre',
      },
      numeros: {
        '2': 'dos',
        '3': 'tres',
        '4': 'cuatro',
        '5': 'cinco',
        '6': 'seis',
      },
      intervalo: {
        '7': 'Cada semana',
        '14': 'Cada dos semanas',
        '21': 'Cada tres semanas',
        '28': 'Cada cuatro semanas',
        otro: 'Cada {dias} días',
      },
      sugerencias: {
        titulo: 'Sugerencias',
        enFrio: 'Primeros huecos libres',
        enFrioAyuda: 'Aún no hay citas suficientes para saber su hora habitual.',
        vacio: 'Sin huecos libres en las próximas cuatro semanas.',
        error: 'No se han podido calcular las sugerencias.',
      },
      serie: {
        festivo: 'Festivo',
        ausencia: 'Ausencia del profesional',
        ocupada: 'Hueco ocupado',
        cambioDeHora: 'Cambio de hora: queda a las {hora}',
        alternativa: 'Alternativa: {cuando}',
        sinAlternativa: 'Sin alternativa: queda fuera',
        incluir: 'Incluir',
        aceptarAlternativa: 'Aceptar alternativa',
        todas: 'Todas',
        titulo: 'Así quedaría la serie',
        vacio: 'Elige un hueco y una periodicidad para ver la serie.',
        error: 'No se ha podido calcular la serie.',
        incluirSesion: 'Incluir la sesión del {fecha}',
        aceptarAlternativaSesion: 'Aceptar la alternativa de la sesión del {fecha}',
        todasLasSesiones: 'Incluir todas las sesiones',
      },
      leyenda: {
        titulo: 'Leyenda del calendario',
        libre: 'Libre',
        ocupado: 'Ocupado',
        sugerida: 'Sugerida',
        habitual: 'Habitual',
        elegida: 'Elegida',
      },
    },
  },
  // T-040 · La copia cifrada de una nota (ADR-076). `copia.*` va DENTRO de la carga cifrada;
  // `visor.*` son los textos genéricos que van en claro en el fichero: ninguno lleva datos.
  exportaciones: {
    copia: {
      titulo: 'Copia de una nota clínica',
      paciente: 'Paciente',
      fechaSesion: 'Fecha de la sesión',
      modalidad: 'Modalidad',
      proyeccion: 'Tipo de copia',
      motivo: 'Motivo',
      referencia: 'Referencia',
      generadaEn: 'Generada el',
      zona: 'Zona horaria',
      version: 'Versión {numero}',
      alcance: 'Alcance',
      autor: 'Autor',
      firmadaEn: 'Firmada el',
      sello: 'Sello',
      huella: 'Huella (SHA-256)',
      huellaAnterior: 'Huella anterior',
      motivoCambio: 'Motivo del cambio',
      texto: 'Nota',
      textoVacio: 'Sin texto',
      reservadas: 'Anotaciones reservadas (art. 18.3, Ley 41/2002)',
      sinReservadas: 'Sin anotaciones reservadas',
      contenidoCanonico: 'Contenido firmado (canónico)',
      participantes: 'Asistentes',
      formulaTitulo: 'Cómo se comprueba la huella',
      formula: 'huella = SHA-256( UTF-8(contenido_canonico) ‖ huella_anterior )',
      notaHuellaAnterior:
        'La huella anterior es el eslabón anterior de la historia del paciente, no necesariamente la versión anterior de esta nota.',
      exclusion:
        'Esta copia no incluye las anotaciones reservadas del profesional (art. 18.3 de la Ley 41/2002).',
      conjunta:
        'De las sesiones conjuntas se entregan la fecha, los asistentes y el tipo de sesión. Su contenido se refiere también a otras personas y no se incluye.',
      proyecciones: {
        profesional: 'Copia profesional',
        paciente: 'Copia para el paciente',
      },
      motivos: {
        peticion_paciente: 'Petición del paciente',
        requerimiento_judicial_o_inspeccion: 'Requerimiento judicial o inspección',
        traspaso_caso: 'Traspaso del caso',
      },
    },
    marca: {
      copiaProfesional: 'Copia profesional',
    },
    visor: {
      tituloDocumento: 'Copia cifrada de una nota clínica',
      titulo: 'Copia cifrada',
      explicacion:
        'Este fichero está cifrado. Escribe la contraseña que se eligió al descargarlo. Se abre en este ordenador, sin conexión.',
      contrasena: 'Contraseña',
      abrir: 'Abrir',
      abriendo: 'Abriendo… puede tardar unos segundos.',
      error: 'Contraseña incorrecta o fichero dañado.',
      danado: 'El fichero está dañado o no es una copia de Psicogestión.',
      sinCrypto: 'Este navegador no puede abrir la copia.',
      sinMemoria:
        'Este dispositivo no tiene memoria libre suficiente para abrir la copia. Cierra otras pestañas o ábrela en otro ordenador.',
      sinJs: 'Para abrir esta copia hay que activar JavaScript en el navegador.',
      marcaLinea: 'Copia {codigo} · exportada por {quien} ({rol}) el {fecha} · {motivo}',
      avisoImpresion:
        'Lo que se imprima o se guarde desde esta pantalla queda sin cifrar, y es responsabilidad de quien lo haga.',
    },
  },

  // Avisos del armazón (T-015). Los plurales, con la convención del catálogo: `una` / `varias`.
  avisos: {
    sesion: {
      franja: 'Sesión en curso · {paciente} · {desde}–{hasta}',
      notas: 'Notas',
      descartar: 'Descartar aviso',
      ancla: 'En sesión',
    },
    notas: {
      etiqueta: {
        una: '{n} nota sin firmar desde hace más de un día',
        varias: '{n} notas sin firmar desde hace más de un día',
      },
    },
  },

  // Notificaciones (T-015). `tipos` es EL sitio de las etiquetas por tipo: T-038 las reutiliza.
  notificaciones: {
    boton: {
      sinLeer: 'Notificaciones, {n} sin leer',
      todas: 'Notificaciones',
    },
    titulo: 'Notificaciones',
    vacio: 'No tienes notificaciones.',
    marcarLeida: 'Marcar como leída',
    marcarTodas: 'Marcar todas como leídas',
    marcadaLeida: 'Marcada como leída.',
    todasMarcadas: 'Todas las notificaciones están marcadas como leídas.',
    errorMarcar: 'No se ha podido marcar como leída.',
    errorMarcarTodas: 'No se han podido marcar como leídas.',
    tipos: {
      nota_pendiente: 'Falta firmar una nota',
      nota_pendiente_escalada: 'Nota sin firmar',
      acceso_emergencia: 'Acceso de emergencia a una historia',
      pin_bloqueado: 'PIN bloqueado',
      totp_repuesto: 'Segundo factor repuesto',
      codigos_regenerados: 'Códigos de recuperación nuevos',
      regeneracion_codigos_bloqueada: 'Regeneración de códigos bloqueada',
      otro: 'Aviso',
    },
  },
} as const;
