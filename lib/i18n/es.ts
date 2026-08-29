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
} as const;
