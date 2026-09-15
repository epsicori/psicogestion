<!-- T-006b · MiniMax-M2 · api.minimaxi.chat · 2026-09-11T16:28:36.172Z -->

Voy a leer los fichecos existentes que necesito como referencia para seguir los patrones correctos.

=== RUTA: lib/i18n/es.ts ===
```ts
// Catálogo de traducciones al castellano.
// Las claves se organizan por ámbitos funcionales.

export const traducciones = {
  // === AUTENTICACIÓN Y SESIÓN ===
  acceso: {
    titulo: 'Iniciar sesión',
    correo: 'Correo electrónico',
    contrasena: 'Contraseña',
    boton: 'Entrar',
    errorCredenciales: 'Correo o contraseña incorrectos',
    errorGenerico: 'Error al iniciar sesión',
  },

  // === ARMazón (barra lateral) ===
  armazon: {
    cerrarSesion: 'Cerrar sesión',
    cerrarSesionConfirmacion: '¿Cerrar sesión?',
  },

  // === PACIENTES ===
  pacientes: {
    titulo: 'Pacientes',
    nuevo: 'Nuevo paciente',
    buscar: 'Buscar pacientes...',
    sinResultados: 'No hay pacientes que mostrar',
    columnas: {
      nombre: 'Nombre',
      nif: 'NIF',
      telefono:Teléfono',
      ultimaCita: 'Última cita',
      estado: 'Estado',
    },
    estados: {
      activo: 'Activo',
      inactivo: 'Inactivo',
      baja: 'De baja',
    },
    formulario: {
      tituloNuevo: 'Nuevo paciente',
      tituloEditar: 'Editar paciente',
      nombreCompleto: 'Nombre completo',
      nif: 'NIF',
      fechaNacimiento: 'Fecha de nacimiento',
      telefono: 'Teléfono',
      correo: 'Correo electrónico',
      direccion: 'Dirección',
      observaciones: 'Observaciones',
      guardar: 'Guardar',
      cancelar: 'Cancelar',
      confirmacionBaja: '¿Dar de baja a este paciente?',
    },
    errores: {
      nombreRequerido: 'El nombre es obligatorio',
      nifInvalido: 'El NIF no es válido',
    },
  },

  // === CITAS ===
  citas: {
    titulo: 'Citas',
    nueva: 'Nueva cita',
    buscar: 'Buscar citas...',
    sinResultados: 'No hay citas que mostrar',
    columnas: {
      fecha: 'Fecha',
      hora: 'Hora',
      paciente: 'Paciente',
      profesional: 'Profesional',
      tipo: 'Tipo',
      estado: 'Estado',
    },
    tipos: {
      primera: 'Primera consulta',
      seguimiento: 'Seguimiento',
      evaluacion: 'Evaluación',
      emergencia: 'Emergencia',
    },
    estados: {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      cancelada: 'Cancelada',
      realizada: 'Realizada',
      noAsistio: 'No asistió',
    },
    formulario: {
      tituloNueva: 'Nueva cita',
      tituloEditar: 'Editar cita',
      fecha: 'Fecha',
      hora: 'Hora',
      paciente: 'Paciente',
      profesional: 'Profesional',
      tipo: 'Tipo',
      duracion: 'Duración (minutos)',
      observaciones: 'Observaciones',
      guardar: 'Guardar',
      cancelar: 'Cancelar',
    },
  },

  // === CENTROS ===
  centros: {
    titulo: 'Centros',
    selector: 'Centro de trabajo',
    sinCentros: 'No hay centros asignados',
  },

  // === ERRORES GENÉRICOS ===
  errores: {
    noAutorizado: 'No autorizado',
    sesionExpirada: 'Sesión expirada',
    errorDesconocido: 'Ha ocurrido un error',
    requerido: 'Este campo es obligatorio',
  },

  // === UI COMUNES ===
  ui: {
    cargar: 'Cargando...',
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    confirmar: 'Confirmar',
    eliminar: 'Eliminar',
    editar: 'Editar',
    buscar: 'Buscar',
    sinDatos: 'No hay datos',
    sigma: 'Σ',
  },
};

export type ClaveDeCatalogo = typeof traducciones;
```

=== RUTA: lib/i18n/index.ts ===
```ts
import { traducciones, type ClaveDeCatalogo } from './es';

/**
 * Obtiene una traducción del catálogo.
 * @param clave - Clave con notación de puntos (ej: 'pacientes.titulo')
 * @returns La cadena traducida
 */
export function t(clave: string): string {
  const partes = clave.split('.');
  let actual: unknown = traducciones;

  for (const parte of partes) {
    if (actual && typeof actual === 'object' && parte in actual) {
      actual = (actual as Record<string, unknown>)[parte];
    } else {
      console.error(`[i18n] Clave no encontrada: ${clave}`);
      return clave;
    }
  }

  return typeof actual === 'string' ? actual : clave;
}

/**
 * Obtiene una traducción con interpolación de variables.
 * @param clave - Clave con notación de puntos
 * @param vars - Objeto con las variables a interpoladar
 * @returns La cadena traducida con las variables reemplazadas
 */
export function tCon(clave: string, vars: Record<string, string | number>): string {
  let cadena = t(clave);

  for (const [claveVar, valor] of Object.entries(vars)) {
    cadena = cadena.replace(new RegExp(`\\{${claveVar}\\}`, 'g'), String(valor));
  }

  return cadena;
}

export type { ClaveDeCatalogo };
```

=== RUTA: lib/supabase/sesion.ts ===
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente para el navegador (autenticación)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Obtiene el usuario actual sin exigir autenticación.
 * Útil para comprobar estado antes de acciones protegidas.
 */
export async function obtenerUsuario(): Promise<{
  supabase: typeof supabase;
  usuario: User | null;
}> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('[sesion] Error obteniendo usuario:', error);
    return { supabase, usuario: null };
  }

  return { supabase, usuario: user };
}

/**
 * Exige una sesión activa. Si no la hay, redirige a /login.
 * Todas las Server Actions deben llamar esto primero.
 */
export async function exigirSesion(): Promise<{
  supabase: typeof supabase;
  usuario: User;
}> {
  const { supabase: supabaseClient, usuario } = await obtenerUsuario();

  if (!usuario) {
    // Redirigir al login - Next.js captura la excepción
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  return { supabase: supabaseClient, usuario };
}
```

=== RUTA: app/(app)/layout.tsx ===
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { crearClienteServer } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export default async function ArmazonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = crearClienteServer(cookieStore);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  // Obtener perfil para la barra lateral
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Barra lateral */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Psicogestión</h1>
          <p className="text-sm text-gray-500">{perfil?.nombre_completo}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            {perfil?.rol === 'profesional_sanitario' ? 'Profesional' : perfil?.rol}
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <a
            href="/pacientes"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Pacientes
          </a>
          <a
            href="/agenda"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Agenda
          </a>
          <a
            href="/facturas"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Facturación
          </a>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 text-sm font-medium text-red-600 rounded-md hover:bg-red-50"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
```

=== RUTA: lib/cuentas/esquemas.ts ===
```ts
import { z } from 'zod/v4';

export const ROLES_USUARIO = [
  'administrador',
  'profesional_sanitario',
  'tecnico_administrativo',
] as const;

export const esquemaInvitacion = z.object({
  correo: z.email('Correo electrónico no válido'),
  nombreCompleto: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(200, 'El nombre no puede exceder 200 caracteres'),
  rol: z.enum(ROLES_USUARIO, {
    errorMap: () => ({ message: 'Selecciona un rol válido' }),
  }),
  centroId: z.string().uuid('ID de centro no válido').nullable(),
}).refine(
  (data) => {
    if (data.rol === 'tecnico_administrativo' && !data.centroId) {
      return false;
    }
    return true;
  },
  {
    message: 'El centro es obligatorio para técnicos administrativos',
    path: ['centroId'],
  }
);

export const esquemaPin = z.object({
  pin: z
    .string()
    .regex(/^\d{6}$/, 'El PIN debe tener exactamente 6 dígitos'),
});

export const esquemaBaja = z.object({
  perfilId: z.uuid('ID de perfil no válido'),
  motivo: z.string().max(500).optional(),
});

export const esquemaCodigoRecuperacion = z.object({
  codigo: z.string().min(1).max(64).transform((v) => v.trim()),
});

export type DatosInvitacion = z.infer<typeof esquemaInvitacion>;
export type DatosBaja = z.infer<typeof esquemaBaja>;
```

=== RUTA: lib/cuentas/tipos.ts ===
```ts
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type Sesion = {
  supabase: SupabaseClient<Database>;
  usuario: User;
};

export type EstadoCuenta = {
  rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo';
  estado: 'activo' | 'suspendido' | 'baja';
  requierePin: boolean;
  tienePin: boolean;
  desbloqueoCaducaEn: string | null;
};

export type ResultadoDesbloqueo = {
  desbloqueado: boolean;
  motivo: string;
  caducaEn: string | null;
  bloqueadoHasta: string | null;
};

export type ResultadoInvitacion =
  | { ok: true; perfilId: string }
  | { ok: false; motivo: string; mensaje: string };

export type ResultadoBaja =
  | { ok: true; desbloqueosRevocados: number; pinBorrado: boolean }
  | { ok: false; motivo: string; mensaje: string };
```

=== RUTA: components/ui/button.tsx ===
```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'peligro' | 'ghost';
  tamanho?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variante = 'primario', tamanho = 'md', className = '', children, disabled, ...props }, ref) => {
    const bases = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantes = {
      primario: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secundario: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
      peligro: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    };

    const tamanhos = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${bases} ${variantes[variante]} ${tamanhos[tamanho]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

=== RUTA: components/ui/field.tsx ===
```tsx
import { type InputHTMLAttributes, forwardRef } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  etiqueta: string;
  errores?: string[];
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ id, etiqueta, errores = [], className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {etiqueta}
        </label>
        <input
          ref={ref}
          id={id}
          className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border ${
            errores.length > 0 ? 'border-red-300' : ''
          } ${className}`}
          aria-invalid={errores.length > 0}
          aria-describedby={errores.length > 0 ? `${id}-error` : undefined}
          {...props}
        />
        {errores.length > 0 && (
          <p id={`${id}-error`} className="text-sm text-red-600">
            {errores[0]}
          </p>
        )}
      </div>
    );
  }
);

Field.displayName = 'Field';
```

=== RUTA: components/ui/desplegable.tsx ===
```tsx
'use client';

import { useId, type SelectHTMLAttributes } from 'react';

export interface DesplegableProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  etiqueta: string;
  errores?: string[];
  opciones: { valor: string; etiqueta: string }[];
}

export function Desplegable({
  id,
  etiqueta,
  errores = [],
  opciones,
  className = '',
  ...props
}: DesplegableProps) {
  const idUnico = useId();
  const selectId = id || idUnico;

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-gray-700">
        {etiqueta}
      </label>
      <select
        id={selectId}
        className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border ${
          errores.length > 0 ? 'border-red-300' : ''
        } ${className}`}
        aria-invalid={errores.length > 0}
        aria-describedby={errores.length > 0 ? `${selectId}-error` : undefined}
        {...props}
      >
        <option value="">Selecciona...</option>
        {opciones.map((op) => (
          <option key={op.valor} value={op.valor}>
            {op.etiqueta}
          </option>
        ))}
      </select>
      {errores.length > 0 && (
        <p id={`${selectId}-error`} className="text-sm text-red-600">
          {errores[0]}
        </p>
      )}
    </div>
  );
}
```

=== RUTA: components/ui/dialogo.tsx ===
```tsx
'use client';

import { useId, type ReactNode } from 'react';

export interface DialogoProps {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
}

export function Dialogo({ abierto, alCerrar, titulo, children, pie }: DialogoProps) {
  const id = useId();

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 transition-opacity"
          onClick={alCerrar}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
        >
          <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900 mb-4">
            {titulo}
          </h2>
          <div className="text-gray-600">{children}</div>
          {pie && <div className="mt-6 flex justify-end gap-3">{pie}</div>}
        </div>
      </div>
    </div>
  );
}
```

=== RUTA: components/ui/emergente.tsx ===
```tsx
'use client';

import { useId, type ReactNode } from 'react';

export interface EmergenteProps {
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
}

export function Emergente({ titulo, children, pie }: EmergenteProps) {
  const id = useId();

  return (
    <div
      className="bg-yellow-50 border-l-4 border-yellow-400 p-4"
      role="alert"
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">{titulo}</h3>
          <div className="mt-2 text-sm text-yellow-700">{children}</div>
          {pie && <div className="mt-4">{pie}</div>}
        </div>
      </div>
    </div>
  );
}
```

=== RUTA: app/(app)/acciones.ts ===
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';

export async function cerrarSesion() {
  const { supabase } = await exigirSesion();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[cerrarSesion] Error al cerrar sesión:', error);
    // Aunque haya error, redirigimos al login
  }

  redirect('/login');
}
```

Ahora voy a escribir las pantallas nuevas siguiendo estos patrones:

=== RUTA: lib/i18n/es.ts ===
```ts
// Catálogo de traducciones al castellano.
// Las claves se organizan por ámbitos funcionales.

export const traducciones = {
  // === AUTENTICACIÓN Y SESIÓN ===
  acceso: {
    titulo: 'Iniciar sesión',
    correo: 'Correo electrónico',
    contrasena: 'Contraseña',
    boton: 'Entrar',
    errorCredenciales: 'Correo o contraseña incorrectos',
    errorGenerico: 'Error al iniciar sesión',
  },

  // === ARMazón (barra lateral) ===
  armazon: {
    cerrarSesion: 'Cerrar sesión',
    cerrarSesionConfirmacion: '¿Cerrar sesión?',
  },

  // === PACIENTES ===
  pacientes: {
    titulo: 'Pacientes',
    nuevo: 'Nuevo paciente',
    buscar: 'Buscar pacientes...',
    sinResultados: 'No hay pacientes que mostrar',
    columnas: {
      nombre: 'Nombre',
      nif: 'NIF',
      telefono: 'Teléfono',
      ultimaCita: 'Última cita',
      estado: 'Estado',
    },
    estados: {
      activo: 'Activo',
      inactivo: 'Inactivo',
      baja: 'De baja',
    },
    formulario: {
      tituloNuevo: 'Nuevo paciente',
      tituloEditar: 'Editar paciente',
      nombreCompleto: 'Nombre completo',
      nif: 'NIF',
      fechaNacimiento: 'Fecha de nacimiento',
      telefono: 'Teléfono',
      correo: 'Correo electrónico',
      direccion: 'Dirección',
      observaciones: 'Observaciones',
      guardar: 'Guardar',
      cancelar: 'Cancelar',
      confirmacionBaja: '¿Dar de baja a este paciente?',
    },
    errores: {
      nombreRequerido: 'El nombre es obligatorio',
      nifInvalido: 'El NIF no es válido',
    },
  },

  // === CITAS ===
  citas: {
    titulo: 'Citas',
    nueva: 'Nueva cita',
    buscar: 'Buscar citas...',
    sinResultados: 'No hay citas que mostrar',
    columnas: {
      fecha: 'Fecha',
      hora: 'Hora',
      paciente: 'Paciente',
      profesional: 'Profesional',
      tipo: 'Tipo',
      estado: 'Estado',
    },
    tipos: {
      primera: 'Primera consulta',
      seguimiento: 'Seguimiento',
      evaluacion: 'Evaluación',
      emergencia: 'Emergencia',
    },
    estados: {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      cancelada: 'Cancelada',
      realizada: 'Realizada',
      noAsistio: 'No asistió',
    },
    formulario: {
      tituloNueva: 'Nueva cita',
      tituloEditar: 'Editar cita',
      fecha: 'Fecha',
      hora: 'Hora',
      paciente: 'Paciente',
      profesional: 'Profesional',
      tipo: 'Tipo',
      duracion: 'Duración (minutos)',
      observaciones: 'Observaciones',
      guardar: 'Guardar',
      cancelar: 'Cancelar',
    },
  },

  // === CENTROS ===
  centros: {
    titulo: 'Centros',
    selector: 'Centro de trabajo',
    sinCentros: 'No hay centros asignados',
  },

  // === ERRORES GENÉRICOS ===
  errores: {
    noAutorizado: 'No autorizado',
    sesionExpirada: 'Sesión expirada',
    errorDesconocido: 'Ha ocurrido un error',
    requerido: 'Este campo es obligatorio',
  },

  // === UI COMUNES ===
  ui: {
    cargar: 'Cargando...',
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    confirmar: 'Confirmar',
    eliminar: 'Eliminar',
    editar: 'Editar',
    buscar: 'Buscar',
    sinDatos: 'No hay datos',
    sigma: 'Σ',
  },

  // === PRIMER ACCESO ===
  primeraVez: {
    titulo: 'Configuración de seguridad',
    subtitulo: 'Completa los siguientes pasos para acceder al sistema',
    pasos: {
      totp: 'Verificar identidad',
      pin: 'Establecer PIN',
    },
    totp: {
      titulo: 'Verifica tu identidad',
      descripcion: 'Escanea el código QR con tu aplicación de autenticación o introduce el código secreto manualmente.',
      qrAlt: 'Código QR para configurar TOTP',
      codigoSecreto: 'Código secreto',
      codigoSecretoAyuda: 'Si no puedes escanear el código, introduce este código en tu aplicación.',
      verificar: 'Verificar código',
      codigoPlaceholder: 'Código de 6 dígitos',
      errorVerificacion: 'El código no es correcto. Inténtalo de nuevo.',
      errores: {
        requerido: 'El código es obligatorio',
        invalido: 'El código debe tener 6 dígitos',
      },
    },
    codigosRecuperacion: {
      titulo: 'Códigos de recuperación',
      descripcion: 'Guarda estos códigos en un lugar seguro. Cada código solo se puede usar una vez.',
      advertencia: 'No podrás ver estos códigos de nuevo.',
      confirmar: 'He guardado los códigos',
    },
    pin: {
      titulo: 'Establece tu PIN',
      descripcion: 'El PIN protege el acceso a la información clínica. Debe tener exactamente 6 dígitos.',
      placeholder: 'PIN de 6 dígitos',
      confirmarPlaceholder: 'Repite el PIN',
      boton: 'Establecer PIN',
      errorNoCoincide: 'Los PINs no coinciden',
      errores: {
        requerido: 'El PIN es obligatorio',
        invalido: 'El PIN debe tener exactamente 6 dígitos',
      },
    },
    completado: {
      titulo: 'Configuración completada',
      mensaje: 'Ya puedes acceder al sistema.',
      boton: 'Ir al inicio',
    },
  },

  // === CANDADO ===
  candado: {
    titulo: 'Acceso protegido',
    descripcion: 'Introduce tu PIN para acceder a la información clínica.',
    placeholder: 'PIN de 6 dígitos',
    boton: 'Desbloquear',
    error: 'PIN incorrecto',
    bloqueado: {
      titulo: 'Demasiados intentos',
      mensaje: 'Has excedido el número máximo de intentos. Inténtalo de nuevo en {minutos} minutos.',
    },
    caduca: {
      mensaje: 'Tu sesión de trabajocaduca en {minutos} minutos. ¿quieres continuar?',
      boton: 'Continuar trabajando',
    },
    botonBloquear: 'Bloquear',
    errores: {
      requerido: 'El PIN es obligatorio',
      invalido: 'El PIN debe tener 6 dígitos',
    },
  },

  // === AJUSTES ===
  ajustes: {
    titulo: 'Ajustes',
    perfil: {
      titulo: 'Perfil',
      nombre: 'Nombre',
      correo: 'Correo',
      rol: 'Rol',
      estado: 'Estado',
    },
    seguridad: {
      titulo: 'Seguridad',
      cambiarPin: 'Cambiar PIN',
      reponerTotp: 'Restablecer verificación en dos pasos',
      reponerPin: 'Restablecer PIN',
    },
    administracion: {
      titulo: 'Administración',
      invitar: 'Invitar usuario',
      baja: 'Dar de baja usuario',
    },
    reiniciarPin: {
      titulo: 'Restablecer PIN',
      descripcion: 'El usuario deberá establecer un nuevo PIN la próxima vez que acceda.',
      boton: 'Restablecer',
      confirmacion: '¿Restablecer el PIN de este usuario?',
    },
  },

  // === INVITAR USUARIO ===
  invitar: {
    titulo: 'Invitar usuario',
    descripcion: 'Envía una invitación a un nuevo usuario para que cree su cuenta.',
    formulario: {
      nombreCompleto: 'Nombre completo',
      correo: 'Correo electrónico',
      rol: 'Rol',
      centro: 'Centro de trabajo',
      centroAyuda: 'Obligatorio para técnicos administrativos',
      boton: 'Enviar invitación',
    },
    resultado: {
      exito: 'Invitación enviada correctamente',
      error: 'No se pudo enviar la invitación',
    },
    errores: {
      requerido: 'Este campo es obligatorio',
      correoInvalido: 'Correo electrónico no válido',
      centroRequerido: 'El centro es obligatorio para técnicos administrativos',
    },
  },

  // === BAJA DE USUARIO ===
  baja: {
    titulo: 'Dar de baja usuario',
    descripcion: 'El usuario perderá el acceso al sistema.',
    formulario: {
      usuario: 'Usuario',
      motivo: 'Motivo de la baja',
      motivoPlaceholder: 'Motivo opcional...',
      boton: 'Dar de baja',
    },
    confirmacion: '¿Estás seguro de que quieres dar de baja a este usuario?',
    resultado: {
      exito: 'Usuario dado de baja correctamente',
      error: 'No se pudo dar de baja al usuario',
      ultimoAdmin: 'No puedes dar de baja al último administrador activo',
    },
  },

  // === RECUPERAR CUENTA ===
  recuperar: {
    titulo: 'Recuperar cuenta',
    descripcion: 'Introduce uno de tus códigos de recuperación para restablecer el acceso.',
    formulario: {
      codigo: 'Código de recuperación',
      codigoPlaceholder: 'Código de 8 caracteres',
      boton: 'Usar código',
    },
    resultado: {
      exito: 'Código válido. Ahora debes configurar un nuevo método de verificación.',
      error: 'Código no válido o ya utilizado',
      bloqueado: 'Demasiados intentos. Inténtalo más tarde.',
    },
    errores: {
      requerido: 'El código es obligatorio',
    },
  },

  // === ROLES ===
  roles: {
    administrador: 'Administrador',
    profesional_sanitario: 'Profesional sanitario',
    tecnico_administrativo: 'Técnico administrativo',
  },
};

export type ClaveDeCatalogo = typeof traducciones;
```

=== RUTA: app/(app)/layout.tsx ===
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { crearClienteServer } from '@/lib/supabase/server';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import type { Database } from '@/types/database';

export default async function ArmazonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = crearClienteServer(cookieStore);

  const {
    data: { user },
    error: errorAuth,
  } = await supabase.auth.getUser();

  if (errorAuth || !user) {
    redirect('/login');
  }

  // Obtener perfil para la barra lateral
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol')
    .eq('id', user.id)
    .single();

  // Obtener estado de cuenta para verificar pasos pendientes
  const { supabase: supabaseClient } = await import('@/lib/supabase/sesion');
  const { supabase: supabaseSesion } = await supabaseClient.obtenerUsuario();
  
  // Verificar nivel de autenticación (MFA)
  const { data: nivelAuth } = await supabaseSesion.auth.mfa.getAuthenticatorAssuranceLevel();
  const tieneAal2 = nivelAuth?.currentLevel === 'aal2';

  // Obtener estado de cuenta
  const estado = await estadoDeCuenta({ supabase: supabaseSesion, usuario: user });

  // Si no tiene AAL2 (no pasó TOTP), redirigir a primera-vez
  if (!tieneAal2 && estado?.rol !== 'tecnico_administrativo') {
    redirect('/primera-vez');
  }

  // Si tiene AAL2 pero falta el PIN (profesional sanitario), redirigir a establecer PIN
  if (tieneAal2 && estado?.rol === 'profesional_sanitario' && !estado.tienePin) {
    redirect('/primera-vez?paso=pin');
  }

  // Si tiene AAL2 pero no ha completado configuración inicial
  if (tieneAal2 && !estado) {
    // El usuario existe pero no tiene estado de cuenta - primera vez
    redirect('/primera-vez');
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Barra lateral */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Psicogestión</h1>
          <p className="text-sm text-gray-500">{perfil?.nombre_completo}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            {perfil?.rol === 'profesional_sanitario' ? 'Profesional' : perfil?.rol}
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <a
            href="/pacientes"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Pacientes
          </a>
          <a
            href="/agenda"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Agenda
          </a>
          <a
            href="/facturas"
            className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Facturación
          </a>
          {/* Solo administradores ven Ajustes */}
          {perfil?.rol === 'administrador' && (
            <a
              href="/ajustes"
              className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
            >
              Ajustes
            </a>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <form action={async () => {
            'use server';
            const { cerrarSesion } = await import('@/app/(app)/acciones');
            await cerrarSesion();
          }} method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 text-sm font-medium text-red-600 rounded-md hover:bg-red-50"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
```

=== RUTA: app/(app)/primera-vez/page.tsx ===
```tsx
import { cookies } from 'next/headers';
import { crearClienteServer } from '@/lib/supabase/server';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { obtenerUsuario } from '@/lib/supabase/sesion';
import { redirect } from 'next/navigation';
import { FormularioPrimeraVez } from './formulario-primera-vez';

export default async function PrimeraVezPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const supabase = crearClienteServer(cookieStore);

  // Obtener usuario
  const { usuario } = await obtenerUsuario();
  if (!usuario) {
    redirect('/login');
  }

  // Obtener estado de cuenta
  const { supabase: supabaseSesion } = await obtenerUsuario();
  const estado = await estadoDeCuenta({ supabase: supabaseSesion, usuario });

  // Obtener nivel de autenticación
  const { data: nivelAuth } = await supabaseSesion.auth.mfa.getAuthenticatorAssuranceLevel();
  const tieneAal2 = nivelAuth?.currentLevel === 'aal2';

  // Determinar el paso actual
  let pasoActual: 'totp' | 'codigos' | 'pin' = 'totp';

  if (tieneAal2 && estado?.rol === 'profesional_sanitario' && !estado.tienePin) {
    pasoActual = 'pin';
  } else if (tieneAal2 && estado?.tienePin) {
    // Ya completó todo, redirigir al inicio
    redirect('/pacientes');
  }

  // Si hay un parámetro de paso y es válido, usarlo
  if (params.paso === 'pin' && estado?.rol === 'profesional_sanitario') {
    pasoActual = 'pin';
  }

  // Si es técnico administrativo, no necesita PIN
  if (estado?.rol === 'tecnico_administrativo' && tieneAal2) {
    redirect('/pacientes');
  }

  return <FormularioPrimeraVez paso={pasoActual} />;
}
```

=== RUTA: app/(app)/primera-vez/acciones.ts ===
```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion, obtenerUsuario } from '@/lib/supabase/sesion';
import { estadoDeCuenta,fixarPinHistoria } from '@/lib/cuentas/candado';
import { generarCodigosRecuperacion } from '@/lib/cuentas/totp';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

export async function obtenerConfiguracionTOTP() {
  const { supabase, usuario } = await exigirSesion();

  // Enrolar TOTP
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Psicogestión',
  });

  if (error || !data) {
    console.error('[primeraVez] Error enrolling TOTP:', error);
    return { ok: false, mensaje: t('errores.errorDesconocido') };
  }

  // Devolver los datos para mostrar QR
  const totpData = data.totp;
  return {
    ok: true,
    factorId: data.id,
    qrCode: totpData ? `data:image/svg+xml;utf-8,${encodeURIComponent(totpData.qr_code)}` : null,
    secret: totpData?.secret || null,
  };
}

export async function verificarTOTP(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();
  
  const codigo = formData.get('codigo') as string;
  const factorId = formData.get('factorId') as string;

  if (!codigo || codigo.length !== 6) {
    return { ok: false, mensaje: t('primeraVez.totp.errorVerificacion') };
  }

  // Crear reto
  const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (errorReto || !reto) {
    console.error('[primeraVez] Error creating challenge:', errorReto);
    return { ok: false, mensaje: t('errores.errorDesconocido') };
  }

  // Verificar
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: reto.id,
    code: codigo,
  });

  if (error) {
    console.error('[primeraVez] Error verifying TOTP:', error);
    return { ok: false, mensaje: t('primeraVez.totp.errorVerificacion') };
  }

  // Generar códigos de recuperación
  const resultadoCodigos = await generarCodigosRecuperacion({ supabase, usuario });

  if (!resultadoCodigos.ok) {
    console.error('[primeraVez] Error generating recovery codes:', resultadoCodigos.mensaje);
    return { ok: false, mensaje: t('errores.errorDesconocido') };
  }

  // Redirigir a mostrar códigos
  redirect('/primera-vez?paso=codigos');
}

export async function obtenerCodigosRecuperacion() {
  const { supabase, usuario } = await exigirSesion();
  
  const resultado = await generarCodigosRecuperacion({ supabase, usuario });
  
  if (!resultado.ok) {
    return { ok: false, codigos: [] };
  }
  
  return { ok: true, codigos: resultado.codigos };
}

export async function establecerPin(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const pin = formData.get('pin') as string;
  const pinConfirmar = formData.get('pinConfirmar') as string;

  // Validar con Zod
  const validacion = esquemaPin.safeParse({ pin });
  
  if (!validacion.success) {
    const errores = validacion.error.flatten().fieldErrors;
    return { ok: false, mensaje: errores.pin?.[0] || t('primeraVez.pin.errores.invalido') };
  }

  if (pin !== pinConfirmar) {
    return { ok: false, mensaje: t('primeraVez.pin.errorNoCoincide') };
  }

  // Guardar PIN
  const resultado = awaitfixarPinHistoria({ supabase, usuario }, pin);

  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }

  // Ir al inicio
  redirect('/pacientes');
}

export async function continuarTrasCodigos() {
  // Verificar estado de cuenta para decidir siguiente paso
  const { supabase, usuario } = await obtenerUsuario();
  if (!supabase || !usuario) {
    redirect('/login');
  }

  const estado = await estadoDeCuenta({ supabase, usuario });

  if (estado?.rol === 'profesional_sanitario' && !estado.tienePin) {
    redirect('/primera-vez?paso=pin');
  }

  // Si es técnico o ya tiene PIN, ir al inicio
  redirect('/pacientes');
}
```

=== RUTA: app/(app)/primera-vez/formulario-primera-vez.tsx ===
```tsx
'use client';

import { useState, useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t, tCon } from '@/lib/i18n';

interface FormularioPrimeraVezProps {
  paso: 'totp' | 'codigos' | 'pin';
}

export function FormularioPrimeraVez({ paso }: FormularioPrimeraVezProps) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (paso === 'totp') {
      obtenerConfigTOTP();
    } else if (paso === 'codigos') {
      obtenerCodigos();
    }
  }, [paso]);

  async function obtenerConfigTOTP() {
    setLoading(true);
    try {
      const res = await fetch('/primera-vez/acciones?action=obtenerConfiguracionTOTP', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setFactorId(data.factorId);
      } else {
        setError(data.mensaje);
      }
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function obtenerCodigos() {
    setLoading(true);
    try {
      const res = await fetch('/primera-vez/acciones?action=obtenerCodigosRecuperacion', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setCodigos(data.codigos);
      } else {
        setError(data.mensaje);
      }
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerificarTOTP(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append('factorId', factorId!);

    try {
      const res = await fetch('/primera-vez/acciones?action=verificarTOTP', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje);
      }
      // Si ok, la acción redirige
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function handleContinuarCodigos() {
    setLoading(true);
    try {
      const res = await fetch('/primera-vez/acciones?action=continuarTrasCodigos', {
        method: 'POST',
      });
      // Si ok, la acción redirige
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function handleEstablecerPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/primera-vez/acciones?action=establecerPin', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje);
      }
      // Si ok, la acción redirige
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  if (loading && !factorId && paso === 'totp') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">{t('ui.cargar')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t('primeraVez.titulo')}
      </h1>
      <p className="text-gray-600 mb-8">
        {t('primeraVez.subtitulo')}
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {paso === 'totp' && factorId && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t('primeraVez.pasos.totp')}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('primeraVez.totp.descripcion')}
            </p>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              {/* El QR se muestra aquí - se carga desde el servidor */}
              <div id="qr-code" />
            </div>
          </div>

          <form onSubmit={handleVerificarTOTP}>
            <input type="hidden" name="factorId" value={factorId} />
            
            <Field
              id="codigo"
              name="codigo"
              type="text"
              etiqueta={t('primeraVez.totp.codigoPlaceholder')}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
            />

            <div className="mt-6">
              <Button type="submit" disabled={loading}>
                {t('primeraVez.totp.verificar')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {paso === 'codigos' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t('primeraVez.codigosRecuperacion.titulo')}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('primeraVez.codigosRecuperacion.descripcion')}
            </p>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm font-medium text-yellow-800">
              {t('primeraVez.codigosRecuperacion.advertencia')}
            </p>
          </div>

          <div className="bg-gray-50 rounded-md p-4">
            <ul className="space-y-2">
              {codigos.map((codigo, i) => (
                <li key={i} className="font-mono text-sm">
                  {codigo}
                </li>
              ))}
            </ul>
          </div>

          <Button onClick={handleContinuarCodigos} disabled={loading}>
            {t('primeraVez.codigosRecuperacion.confirmar')}
          </Button>
        </div>
      )}

      {paso === 'pin' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t('primeraVez.pasos.pin')}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('primeraVez.pin.descripcion')}
            </p>
          </div>

          <form onSubmit={handleEstablecerPin}>
            <Field
              id="pin"
              name="pin"
              type="password"
              etiqueta={t('primeraVez.pin.placeholder')}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
            />

            <div className="mt-4">
              <Field
                id="pinConfirmar"
                name="pinConfirmar"
                type="password"
                etiqueta={t('primeraVez.pin.confirmarPlaceholder')}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
              />
            </div>

            <div className="mt-6">
              <Button type="submit" disabled={loading}>
                {t('primeraVez.pin.boton')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

=== RUTA: app/(app)/primera-vez/acciones.ts ===
```ts
import { obtenerConfiguracionTOTP, verificarTOTP, obtenerCodigosRecuperacion, establecerPin, continuarTrasCodigos } from './acciones';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  // Obtener sesión
  const { supabase, usuario } = await import('@/lib/supabase/sesion').then(m => m.exigirSesion());

  switch (action) {
    case 'obtenerConfiguracionTOTP': {
      const result = await obtenerConfiguracionTOTP();
      return NextResponse.json(result);
    }
    case 'verificarTOTP': {
      const formData = await request.formData();
      const result = await verificarTOTP(formData as any);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    }
    case 'obtenerCodigosRecuperacion': {
      const result = await obtenerCodigosRecuperacion();
      return NextResponse.json(result);
    }
    case 'continuarTrasCodigos': {
      await continuarTrasCodigos();
      return NextResponse.json({ ok: true });
    }
    case 'establecerPin': {
      const formData = await request.formData();
      const result = await establecerPin(formData as any);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 });
  }
}
```

=== RUTA: app/(app)/candado/page.tsx ===
```tsx
import { cookies } from 'next/headers';
import { crearClienteServer } from '@/lib/supabase/server';
import { estadoDeCuenta, desbloquearHistoria, bloquearHistoria } from '@/lib/cuentas/candado';
import { obtenerUsuario } from '@/lib/supabase/sesion';
import { redirect } from 'next/navigation';
import { FormularioCandado } from './formulario-candado';

export default async function CandadoPage() {
  const cookieStore = await cookies();
  const supabase = crearClienteServer(cookieStore);

  // Obtener usuario
  const { usuario } = await obtenerUsuario();
  if (!usuario) {
    redirect('/login');
  }

  // Obtener estado de cuenta
  const { supabase: supabaseSesion } = await obtenerUsuario();
  const estado = await estadoDeCuenta({ supabase: supabaseSesion, usuario });

  // Si no tiene PIN configurado, no debería estar aquí
  if (!estado?.tienePin) {
    redirect('/primera-vez');
  }

  // Obtener estado actual de desbloqueo
  const resultadoDesbloqueo = await desbloquearHistoria({ supabase: supabaseSesion, usuario }, '');

  return (
    <FormularioCandado
      desbloqueado={resultadoDesbloqueo.desbloqueado}
      bloqueadoHasta={resultadoDesbloqueo.bloqueadoHasta}
      caducaEn={resultadoDesbloqueo.caducaEn}
    />
  );
}
```

=== RUTA: app/(app)/candado/acciones.ts ===
```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion, obtenerUsuario } from '@/lib/supabase/sesion';
import { desbloquearHistoria, bloquearHistoria, prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';

export async function verificarPin(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const pin = formData.get('pin') as string;

  if (!pin || pin.length !== 6) {
    return { ok: false, mensaje: t('candado.error') };
  }

  const resultado = await desbloquearHistoria({ supabase, usuario }, pin);

  if (!resultado.desbloqueado) {
    // No distinguir entre PIN incorrecto y ya bloqueado
    return { ok: false, mensaje: t('candado.error'), bloqueadoHasta: resultado.bloqueadoHasta };
  }

  return { ok: true, caducaEn: resultado.caducaEn };
}

export async function bloquearSesion() {
  const { supabase, usuario } = await exigirSesion();

  await bloquearHistoria({ supabase, usuario });

  redirect('/candado');
}

export async function extenderSesion() {
  const { supabase, usuario } = await exigirSesion();

  const nuevaCaducidad = await prolongarDesbloqueo({ supabase, usuario });

  return { ok: true, caducaEn: nuevaCaducidad };
}
```

=== RUTA: app/(app)/candado/formulario-candado.tsx ===
```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Emergente } from '@/components/ui/emergente';
import { t, tCon } from '@/lib/i18n';

interface FormularioCandadoProps {
  desbloqueado: boolean;
  bloqueadoHasta: string | null;
  caducaEn: string | null;
}

export function FormularioCandado({ desbloqueado: inicialDesbloqueado, bloqueadoHasta, caducaEn: caducaEnInicial }: FormularioCandadoProps) {
  const router = useRouter();
  const [desbloqueado, setDesbloqueado] = useState(inicialDesbloqueado);
  const [bloqueadoHasta, setBloqueadoHasta] = useState<string | null>(bloqueadoHasta);
  const [caducaEn, setCaducaEn] = useState<string | null>(caducaEnInicial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCaducaAviso, setShowCaducaAviso] = useState(false);
  const [pending, startTransition] = useTransition();

  // Temporizador para aviso de caducidad
  useEffect(() => {
    if (!caducaEn || !desbloqueado) return;

    const caducaDate = new Date(caducaEn).getTime();
    
    const checkCaducidad = () => {
      const ahora = Date.now();
      const tiempoRestante = caducaDate - ahora;
      
      if (tiempoRestante <= 5 * 60 * 1000 && tiempoRestante > 0) {
        setShowCaducaAviso(true);
      }
      
      if (tiempoRestante <= 0) {
        // Sesión caducada
        router.push('/candado');
      }
    };

    const intervalo = setInterval(checkCaducidad, 30000);
    checkCaducidad();

    return () => clearInterval(intervalo);
  }, [caducaEn, desbloqueado, router]);

  async function handleVerificarPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/candado/acciones?action=verificarPin', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!data.ok) {
        setError(data.mensaje);
        if (data.bloqueadoHasta) {
          setBloqueadoHasta(data.bloqueadoHasta);
        }
      } else {
        setDesbloqueado(true);
        setCaducaEn(data.caducaEn);
        // Ir a la página anterior o a pacientes
        router.back();
      }
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function handleBloquear() {
    setLoading(true);
    try {
      await fetch('/candado/acciones?action=bloquearSesion', {
        method: 'POST',
      });
      // La acción redirige
    } catch {
      setError(t('errores.errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }

  async function handleExtenderSesion() {
    startTransition(async () => {
      try {
        const res = await fetch('/candado/acciones?action=extenderSesion', {
          method: 'POST',
        });
        const data = await res.json();
        
        if (data.ok) {
          setCaducaEn(data.caducaEn);
          setShowCaducaAviso(false);
        }
      } catch {
        // Ignorar errores al extender
      }
    });
  }

  // Si está bloqueado por intentos
  if (bloqueadoHasta && !desbloqueado) {
    const minutosRestantes = Math.ceil((new Date(bloqueadoHasta).getTime() - Date.now()) / 60000);
    
    return (
      <div className="max-w-md mx-auto mt-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('candado.bloqueado.titulo')}
          </h1>
          <p className="text-gray-600">
            {tCon('candado.bloqueado.mensaje', { minutos: Math.max(1, minutosRestantes) })}
          </p>
        </div>
      </div>
    );
  }

  // Si ya está desbloqueado, mostrar opción de bloquear
  if (desbloqueado) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t('candado.titulo')}
        </h1>
        <p className="text-gray-600 mb-8">
          {t('candado.descripcion')}
        </p>

        <Button onClick={handleBloquear} disabled={loading} variante="peligro">
          {t('candado.botonBloquear')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t('candado.titulo')}
      </h1>
      <p className="text-gray-600 mb-8">
        {t('candado.descripcion')}
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {showCaducaAviso && (
        <div className="mb-6">
          <Emergente titulo={t('candado.caduca.mensaje', { minutos: 5 })}>
            <Button onClick={handleExtenderSesion} disabled={pending}>
              {t('candado.caduca.boton')}
            </Button>
          </Emergente>
        </div>
      )}

      <form onSubmit={handleVerificarPin}>
        <Field
          id="pin"
          name="pin"
          type="password"
          etiqueta={t('candado.placeholder')}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          required
        />

        <div className="mt-6 flex gap-3">
          <Button type="submit" disabled={loading}>
            {t('candado.boton')}
          </Button>
          <Button type="button" onClick={handleBloquear} disabled={loading} variante="ghost">
            {t('candado.botonBloquear')}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

=== RUTA: app/(app)/candado/acciones.ts ===
```ts
import { verificarPin, bloquearSesion, extenderSesion } from './acciones';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  switch (action) {
    case 'verificarPin': {
      const formData = await request.formData();
      const result = await verificarPin(formData as any);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    }
    case 'bloquearSesion': {
      await bloquearSesion();
      return NextResponse.json({ ok: true });
    }
    case 'extenderSesion': {
      const result = await extenderSesion();
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 });
  }
}
```

=== RUTA: app/(app)/ajustes/page.tsx ===
```tsx
import { redirect } from 'next/navigation';
import { exigirSesion, obtenerUsuario } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { obtenerTodosPerfiles } from '@/lib/cuentas/perfiles';
import { AjustesAdmin } from './ajustes-admin';

export default async function AjustesPage() {
  const { supabase, usuario } = await exigirSesion();

  // Verificar rol
  const estado = await estadoDeCuenta({ supabase, usuario });

  if (estado?.rol !== 'administrador') {
    redirect('/pacientes');
  }

  // Obtener lista de perfiles para las acciones de admin
  const perfiles = await obtenerTodosPerfiles({ supabase, usuario });

  return <AjustesAdmin perfiles={perfiles} />;
}
```

=== RUTA: app/(app)/ajustes/acciones.ts ===
```ts
'use server';

import { exigirSesion } from '@/lib/supabase/sesion';
import { invitarPerfil } from '@/lib/cuentas/invitar';
import { darDeBajaPerfil } from '@/lib/cuentas/baja';
import { reponerTotp } from '@/lib/cuentas/totp';
import { esquemaInvitacion, esquemaBaja } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

export async function inviteUser(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const correo = formData.get('correo') as string;
  const nombreCompleto = formData.get('nombreCompleto') as string;
  const rol = formData.get('rol') as string;
  const centroId = formData.get('centroId') as string | null;

  // Validar con Zod
  const validacion = esquemaInvitacion.safeParse({
    correo,
    nombreCompleto,
    rol,
    centroId: centroId || null,
  });

  if (!validacion.success) {
    const errores = validacion.error.flatten().fieldErrors;
    const primerError = errores.correo?.[0] || errores.nombreCompleto?.[0] || 
                       errores.rol?.[0] || errores.centroId?.[0] || 
                       t('errores.requerido');
    return { ok: false, mensaje: primerError };
  }

  const resultado = await invitarPerfil(
    { supabase, usuario },
    { correo, nombreCompleto, rol: rol as any, centroId: centroId || null }
  );

  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }

  return { ok: true };
}

export async function bajaUser(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const perfilId = formData.get('perfilId') as string;
  const motivo = formData.get('motivo') as string | null;

  // Validar con Zod
  const validacion = esquemaBaja.safeParse({
    perfilId,
    motivo: motivo || undefined,
  });

  if (!validacion.success) {
    return { ok: false, mensaje: t('errores.requerido') };
  }

  const resultado = await darDeBajaPerfil(
    { supabase, usuario },
    { perfilId, motivo: motivo || undefined }
  );

  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }

  return { ok: true };
}

export async function reponerTOTPPerfil(formData: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const perfilId = formData.get('perfilId') as string;

  if (!perfilId) {
    return { ok: false, mensaje: t('errores.requerido') };
  }

  const resultado = await reponerTotp({ supabase, usuario }, { perfilId });

  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }

  return { ok: true };
}
```

=== RUTA: app/(app)/ajustes/ajustes-admin.tsx ===
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Desplegable } from '@/components/ui/desplegable';
import { Field } from '@/components/ui/field';
import { Dialogo } from '@/components/ui/dialogo