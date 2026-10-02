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
    notasEnPreparacion:
      'Aquí irán las notas de cada sesión, con sus versiones. Se escriben en su propio ticket.',
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
    sello: {
      enSesion: 'Escrita durante la sesión del {fecha} · {desde}–{hasta}',
      fueraDeSesion: 'Escrita fuera de la sesión del {fecha} · {desde}–{hasta}',
      sinCita: 'Escrita el {fecha} · {desde}–{hasta}',
      sinCitaVariosDias: 'Escrita entre el {desde} y el {hasta}',
      ilegible: 'Sello no legible',
    },
    // La etiqueta del episodio en la cabecera de la nota y en el selector «¿en cuál?».
    episodio: '{modalidad} · desde el {fecha}',
    modalidad: {
      individual: 'Individual',
      pareja: 'Pareja',
      familiar: 'Familiar',
      grupo: 'Grupo',
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
      mas24: 'Más de 24 h',
      mas72: 'Más de 72 h',
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
  },
} as const;
