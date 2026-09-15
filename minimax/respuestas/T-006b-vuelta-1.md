<!-- T-006b · MiniMax-M2 · api.minimaxi.chat · 2026-09-11T16:13:00.770Z -->

Voy a analizar el encargo y explorar la estructura existente antes de implementar las pantallas.

```
=== RUTA: lib/i18n/es.ts ===
```

```ts
export const es = {
  // ...existing sections...
  
  acceso: {
    titulo: 'Acceso',
    bienvenida: 'Bienvenido',
    errores: {
      sinSesion: 'Sesión expirada',
      noAutorizado: 'No autorizado',
    },
  },
  
  primeraVez: {
    titulo: 'Configuración inicial',
    configurarContrasena: 'Establecer contraseña',
    configurarTotp: 'Configurar verificación en dos pasos',
    configurarPin: 'Establecer PIN de historia',
    pasoCompletado: 'Completado',
    pasoPendiente: 'Pendiente',
    mensajeBienvenida: 'Completa los siguientes pasos para acceder al sistema',
    pasos: {
      password: 'Contraseña',
      totp: 'Verificación en dos pasos',
      pin: 'PIN de historia',
    },
    infoTotp: {
      escanea: 'Escanea este código QR con tu aplicación de autenticación',
      introduceCodigo: 'Introduce el código de 6 dígitos',
      codigosRecuperacion: 'Códigos de recuperación',
      guardaCodigos: 'Guarda estos códigos en un lugar seguro. Solo se mostrarán una vez.',
      continuar: 'Continuar',
    },
    infoPin: {
      introducePin: 'Introduce un PIN de 6 dígitos',
      confirmaPin: 'Confirma tu PIN',
      noTecnico: 'Los técnicos administrativos no requieren PIN de historia',
    },
  },
  
  candado: {
    titulo: 'Acceso a historia',
    introducirPin: 'Introduce el PIN para acceder a la historia clínica',
    pinIncorrecto: 'PIN incorrecto',
    bloquear: 'Bloquear acceso',
    bloqueado: 'Acceso bloqueado',
    intentosAgotados: 'Demasiados intentos. Acceso bloqueado hasta {hora}',
    caducaEn: 'El acceso caduca en {minutos} minutos',
    prolongar: 'Mantener acceso',
  },
  
  ajustes: {
    titulo: 'Ajustes',
    invitaciones: 'Invitar usuario',
    reponerTotp: 'Reponer verificación',
    darDeBaja: 'Dar de baja',
    administracion: 'Administración',
    seguridad: 'Seguridad',
    confirmar: 'Confirmar',
    cancelar: 'Cancelar',
  },
  
  invitacion: {
    titulo: 'Invitar usuario',
    nombre: 'Nombre completo',
    correo: 'Correo electrónico',
    rol: 'Rol',
    centro: 'Centro',
    centroPlaceholder: 'Selecciona un centro',
    roles: {
      administrador: 'Administrador',
      profesional_sanitario: 'Profesional sanitario',
      tecnico_administrativo: 'Técnico administrativo',
    },
    errores: {
      centroRequerido: 'El centro es obligatorio para técnicos administrativos',
      yaExiste: 'Ya existe un usuario con este correo',
      generico: 'Error al invitar usuario',
    },
    exito: 'Usuario invitado correctamente',
  },
  
  reponerTotp: {
    titulo: 'Reponer verificación en dos pasos',
    perfil: 'Usuario',
    confirmar: 'Reponer verificación',
    info: 'El usuario deberá configurar un nuevo código QR',
    errores: {
      noEncontrado: 'Perfil no encontrado',
      generico: 'Error al reponer verificación',
    },
    exito: 'Verificación repuesta correctamente',
  },
  
  baja: {
    titulo: 'Dar de baja usuario',
    perfil: 'Usuario a dar de baja',
    motivo: 'Motivo (opcional)',
    confirmar: 'Dar de baja',
    errores: {
      ultimoAdmin: 'No se puede dar de baja al último administrador activo',
      generico: 'Error al dar de baja',
    },
    exito: 'Usuario dado de baja correctamente',
  },
  
  recuperacion: {
    titulo: 'Recuperar acceso',
    introducirCodigo: 'Introduce tu código de recuperación',
    codigoPlaceholder: 'Código de recuperación',
    recuperar: 'Recuperar acceso',
    errores: {
      invalido: 'Código de recuperación inválido',
      bloqueado: 'Demasiados intentos. Intenta más tarde',
      sinCodigos: 'No quedan códigos de recuperación',
      generico: 'Error al canjear código',
    },
    exito: 'Código válido. Configura tu verificación en dos pasos',
  },
  
  comunes: {
    cargar: 'Cargando...',
    error: 'Error',
    exito: 'Operación exitosa',
    confirmarAccion: '¿Estás seguro?',
    cerrarSesion: 'Cerrar sesión',
  },
};
```

```
=== RUTA: lib/i18n/index.ts ===
```

```ts
import { es } from './es';

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

export type ClaveI18n = NestedKeyOf<typeof es>;

const cache = new Map<string, string>();

function getNestedValue(obj: unknown, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  
  return typeof current === 'string' ? current : path;
}

export function t(clave: ClaveI18n): string {
  const cached = cache.get(clave);
  if (cached) return cached;
  
  const value = getNestedValue(es, clave);
  cache.set(clave, value);
  return value;
}

export function tCon(clave: ClaveI18n, params: Record<string, string | number>): string {
  let text = t(clave);
  
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  
  return text;
}

export { es };
```

```
=== RUTA: app/(app)/layout.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { obtenerUsuario, exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { BotonCerrarSesion } from './piezas/boton-cerrar-sesion';

export default async function LayoutArmazon({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, usuario } = await exigirSesion();
  
  const sesion = { supabase, usuario };
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado) {
    redirect('/login');
  }
  
  // El bloqueo por TOTP no verificado se maneja en la guardia del grupo
  // Aquí solo verificamos que la cuenta existe y está activa
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Gestión Clínica</h1>
          <BotonCerrarSesion />
        </div>
      </header>
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  );
}
```

```
=== RUTA: app/(app)/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { lock, unlock } from './piezas/sesion';

export async function cerrarSesion() {
  const { supabase } = await exigirSesion();
  await supabase.auth.signOut();
  unlock();
  redirect('/login');
}
```

```
=== RUTA: app/(app)/piezas/sesion.ts ===
```

```ts
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'session_lock';

export function lock() {
  cookies().set(SESSION_COOKIE, 'locked', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 30, // 30 minutos
    path: '/',
  });
}

export function unlock() {
  cookies().delete(SESSION_COOKIE);
}

export async function isLocked(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  return !!sessionCookie;
}
```

```
=== RUTA: app/(app)/piezas/boton-cerrar-sesion.tsx ===
```

```ts
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export function BotonCerrarSesion() {
  const router = useRouter();
  
  const handleCerrar = async () => {
    try {
      const response = await fetch('/(app)/cerrar-sesion', {
        method: 'POST',
      });
      
      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };
  
  return (
    <Button
      variant="outline"
      onClick={handleCerrar}
    >
      {t('comunes.cerrarSesion')}
    </Button>
  );
}
```

```
=== RUTA: app/(app)/pacientes/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';

export default async function PaginaPacientes() {
  await exigirSesion();
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Pacientes</h2>
      <p>Página de pacientes en construcción</p>
    </div>
  );
}
```

```
=== RUTA: lib/cuentas/esquemas.ts ===
```

```ts
import { z } from 'zod/v4';

export const ROLES_USUARIO = ['administrador', 'profesional_sanitario', 'tecnico_administrativo'] as const;

export const esquemaInvitacion = z.object({
  correo: z.email(),
  nombreCompleto: z.string().min(1).max(255),
  rol: z.enum(ROLES_USUARIO),
  centroId: z.string().uuid().nullable(),
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
  pin: z.string().regex(/^\d{6}$/, 'El PIN debe tener exactamente 6 dígitos'),
});

export const esquemaBaja = z.object({
  perfilId: z.uuid(),
  motivo: z.string().max(500).optional(),
}).transform((data) => ({
  perfilId: data.perfilId,
  motivo: data.motivo || null,
}));

export const esquemaCodigoRecuperacion = z.object({
  codigo: z.string().trim().min(1).max(64),
});

export type DatosInvitacion = z.infer<typeof esquemaInvitacion>;
export type DatosPin = z.infer<typeof esquemaPin>;
export type DatosBaja = z.infer<typeof esquemaBaja>;
export type DatosCodigoRecuperacion = z.infer<typeof esquemaCodigoRecuperacion>;
```

Ahora voy a implementar las pantallas nuevas:

```
=== RUTA: app/(app)/primera-vez/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta, desbloquearHistoria, fijarPinHistoria } from '@/lib/cuentas/candado';
import { esquemaPin } from '@/lib/cuentas/esquemas';

export async function verificarYCompletarPin(formData: FormData) {
  const sesion = await exigirSesion();
  
  const pin = formData.get('pin')?.toString() ?? '';
  const pinConfirm = formData.get('pinConfirm')?.toString() ?? '';
  
  const validacion = esquemaPin.safeParse({ pin });
  if (!validacion.success) {
    return { ok: false, mensaje: validacion.error.issues[0]?.message ?? 'PIN inválido' };
  }
  
  if (pin !== pinConfirm) {
    return { ok: false, mensaje: 'Los PINs no coinciden' };
  }
  
  const resultado = await fijarPinHistoria(sesion, pin);
  
  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }
  
  redirect('/(app)');
}

export async function verificarPrimerAcceso() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado) {
    redirect('/login');
  }
  
  // Determinar a qué pantalla redirigir según el estado
  if (estado.estado !== 'activo') {
    redirect('/login?motivo=cuenta-inactiva');
  }
  
  // Si tiene TOTP configurado pero no verificado, debe verificarlo
  // Esto se maneja con la verificación del factor en el cliente
  // El estado indica si requiere PIN pero no lo tiene
  
  if (estado.requierePin && !estado.tienePin) {
    redirect('/(app)/primera-vez/pin');
  }
  
  // Si todo está completo, ir al dashboard
  redirect('/(app)');
}
```

```
=== RUTA: app/(app)/primera-vez/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FormularioPrimeraVez } from './formulario';

export default async function PaginaPrimeraVez() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado) {
    redirect('/login');
  }
  
  // Los técnicos administrativos no tienen paso de PIN
  if (estado.rol === 'tecnico_administrativo') {
    // Si es técnico y está activo, ya terminó su configuración
    if (estado.estado === 'activo') {
      redirect('/(app)');
    }
  }
  
  // Si requiere PIN pero no lo tiene, ir a la pantalla de PIN
  if (estado.requierePin && !estado.tienePin) {
    if (estado.rol !== 'tecnico_administrativo') {
      redirect('/(app)/primera-vez/pin');
    }
  }
  
  // Si tiene PIN, el flujo de primera vez está completo
  if (estado.tienePin) {
    redirect('/(app)');
  }
  
  // Mostrar el formulario de primera vez (contraseña → TOTP → PIN para profesionales)
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">{t('primeraVez.titulo')}</h1>
      <FormularioPrimeraVez rol={estado.rol} tienePin={estado.tienePin ?? false} />
    </div>
  );
}
```

```
=== RUTA: app/(app)/primera-vez/formulario.tsx ===
```

```ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { t, tCon } from '@/lib/i18n';

interface FormularioPrimeraVezProps {
  rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo';
  tienePin: boolean;
}

type FormData = {
  pin: string;
  pinConfirm: string;
};

export function FormularioPrimeraVez({ rol, tienePin }: FormularioPrimeraVezProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(esquemaPin.extend({
      pinConfirm: z.string(),
    })),
  });
  
  // Los técnicos no ven el paso de PIN
  const esTecnico = rol === 'tecnico_administrativo';
  
  if (esTecnico) {
    return (
      <div className="text-center">
        <p className="mb-4">{t('primeraVez.infoPin.noTecnico')}</p>
        <Button onClick={() => router.push('/(app)')}>
          {t('comunes.cerrarSesion')}
        </Button>
      </div>
    );
  }
  
  const onSubmit = async (data: FormData) => {
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('pin', data.pin);
      formData.append('pinConfirm', data.pinConfirm);
      
      const response = await fetch('/(app)/primera-vez/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        setError(result.mensaje);
      }
    } catch (err) {
      setError('Error al guardar el PIN');
    } finally {
      setCargando(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field
        label={t('primeraVez.infoPin.introducePin')}
        error={errors.pin?.message}
      >
        <input
          type="password"
          {...register('pin')}
          className="w-full p-2 border rounded"
          maxLength={6}
          pattern="\d{6}"
          autoComplete="off"
        />
      </Field>
      
      <Field
        label={t('primeraVez.infoPin.confirmaPin')}
        error={errors.pinConfirm?.message}
      >
        <input
          type="password"
          {...register('pinConfirm')}
          className="w-full p-2 border rounded"
          maxLength={6}
          pattern="\d{6}"
          autoComplete="off"
        />
      </Field>
      
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
      
      <Button type="submit" disabled={cargando} className="w-full">
        {cargando ? t('comunes.cargar') : 'Establecer PIN'}
      </Button>
    </form>
  );
}
```

```
=== RUTA: app/(app)/candado/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta, desbloquearHistoria, bloquearHistoria, prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { FormularioCandado } from './formulario';
import { t } from '@/lib/i18n';

interface Props {
  searchParams: Promise<{ motivo?: string }>;
}

export default async function PaginaCandado({ searchParams }: Props) {
  const sesion = await exigirSesion();
  const params = await searchParams;
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado) {
    redirect('/login');
  }
  
  // Solo los profesionales y administradores tienen PIN de historia
  if (estado.rol === 'tecnico_administrativo') {
    redirect('/(app)');
  }
  
  // Si no requiere PIN, puede acceder
  if (!estado.requierePin || !estado.tienePin) {
    redirect('/(app)');
  }
  
  // Verificar si ya está desbloqueado
  if (estado.desbloqueoCaducaEn) {
    const caduca = new Date(estado.desbloqueoCaducaEn);
    const ahora = new Date();
    
    if (caduca > ahora) {
      // Ya está desbloqueado, redirigir
      redirect('/(app)');
    }
  }
  
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">{t('candado.titulo')}</h1>
      <FormularioCandado 
        motivo={params.motivo} 
        bloqueadoHasta={estado.desbloqueoCaducaEn}
      />
    </div>
  );
}
```

```
=== RUTA: app/(app)/candado/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { desbloquearHistoria, bloquearHistoria, prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { esquemaPin } from '@/lib/cuentas/esquemas';

export async function intentarDesbloquear(formData: FormData) {
  const sesion = await exigirSesion();
  
  const pin = formData.get('pin')?.toString() ?? '';
  
  const validacion = esquemaPin.safeParse({ pin });
  if (!validacion.success) {
    return { ok: false, mensaje: validacion.error.issues[0]?.message ?? 'PIN inválido' };
  }
  
  const resultado = await desbloquearHistoria(sesion, pin);
  
  if (resultado.desbloqueado) {
    return { 
      ok: true, 
      caducaEn: resultado.caducaEn,
    };
  }
  
  return { 
    ok: false, 
    mensaje: resultado.motivo,
    bloqueadoHasta: resultado.bloqueadoHasta,
  };
}

export async function ejecutarBloquear() {
  const sesion = await exigirSesion();
  await bloquearHistoria(sesion);
  redirect('/(app)/candado');
}

export async function ejecutarProlongar() {
  const sesion = await exigirSesion();
  const nuevaCaducidad = await prolongarDesbloqueo(sesion);
  
  if (nuevaCaducidad) {
    return { ok: true, caducaEn: nuevaCaducidad };
  }
  
  return { ok: false, mensaje: 'No se pudo prolongar el acceso' };
}
```

```
=== RUTA: app/(app)/candado/formulario.tsx ===
```

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { t, tCon } from '@/lib/i18n';

interface FormularioCandadoProps {
  motivo?: string;
  bloqueadoHasta?: string | null;
}

type FormData = {
  pin: string;
};

export function FormularioCandado({ motivo, bloqueadoHasta }: FormularioCandadoProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(esquemaPin),
  });
  
  // Verificar si está bloqueado
  useEffect(() => {
    if (bloqueadoHasta) {
      const actualizarTiempo = () => {
        const ahora = new Date();
        const bloqueado = new Date(bloqueadoHasta);
        
        if (bloqueado > ahora) {
          setBloqueado(true);
          const diff = bloqueado.getTime() - ahora.getTime();
          const minutos = Math.ceil(diff / 60000);
          setTiempoRestante(tCon('candado.intentosAgotados', { hora: bloqueado.toLocaleTimeString() }));
        } else {
          setBloqueado(false);
          setTiempoRestante(null);
        }
      };
      
      actualizarTiempo();
      const intervalo = setInterval(actualizarTiempo, 1000);
      
      return () => clearInterval(intervalo);
    }
  }, [bloqueadoHasta]);
  
  // Prolongar acceso antes de que caduque (solo en acciones reales)
  const manejarProlongar = async () => {
    try {
      const response = await fetch('/(app)/candado/acciones?prolongar=true', {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (result.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error('Error al prolongar:', err);
    }
  };
  
  const onSubmit = async (data: FormData) => {
    if (bloqueado) return;
    
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('pin', data.pin);
      
      const response = await fetch('/(app)/candado/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.ok) {
        router.push('/(app)');
        router.refresh();
      } else {
        if (result.bloqueadoHasta) {
          setBloqueado(true);
          setTiempoRestante(tCon('candado.intentosAgotados', { hora: new Date(result.bloqueadoHasta).toLocaleTimeString() }));
        } else {
          setError(result.mensaje);
        }
        reset();
      }
    } catch (err) {
      setError('Error al verificar el PIN');
    } finally {
      setCargando(false);
    }
  };
  
  const onBloquear = async () => {
    try {
      await fetch('/(app)/candado/acciones?bloquear=true', {
        method: 'POST',
      });
    } catch (err) {
      console.error('Error al bloquear:', err);
    }
  };
  
  if (bloqueado && tiempoRestante) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-600 font-semibold">{tiempoRestante}</p>
        <Button onClick={() => router.push('/(app)')}>
          {t('comunes.cerrarSesion')}
        </Button>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-gray-600 mb-4">{t('candado.introducirPin')}</p>
      
      {motivo === 'caducado' && (
        <p className="text-amber-600 text-sm mb-4">
          {t('candado.caducaEn', { minutos: '5' })}
        </p>
      )}
      
      <Field
        label="PIN"
        error={error ?? undefined}
      >
        <input
          type="password"
          {...register('pin')}
          className="w-full p-2 border rounded"
          maxLength={6}
          pattern="\d{6}"
          autoComplete="off"
          disabled={bloqueado}
        />
      </Field>
      
      <Button type="submit" disabled={cargando || bloqueado} className="w-full">
        {cargando ? t('comunes.cargar') : 'Desbloquear'}
      </Button>
      
      <div className="flex gap-2 mt-4">
        <Button 
          type="button" 
          variant="outline"
          onClick={onBloquear}
          className="flex-1"
        >
          {t('candado.bloquear')}
        </Button>
        
        <Button 
          type="button" 
          variant="outline"
          onClick={manejarProlongar}
          className="flex-1"
        >
          {t('candado.prolongar')}
        </Button>
      </div>
    </form>
  );
}
```

```
=== RUTA: app/(app)/ajustes/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { Link } from '@/components/ui/link';
import { t } from '@/lib/i18n';

export default async function PaginaAjustes() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado) {
    redirect('/login');
  }
  
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('ajustes.titulo')}</h1>
      
      <div className="space-y-6">
        {/* Solo administrador */}
        {estado.rol === 'administrador' && (
          <section className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">{t('ajustes.administracion')}</h2>
            <div className="space-y-2">
              <Link 
                href="/(app)/ajustes/invitar"
                className="block p-3 border rounded hover:bg-gray-50"
              >
                {t('ajustes.invitaciones')}
              </Link>
              <Link 
                href="/(app)/ajustes/reponer-totp"
                className="block p-3 border rounded hover:bg-gray-50"
              >
                {t('ajustes.reponerTotp')}
              </Link>
              <Link 
                href="/(app)/ajustes/dar-de-baja"
                className="block p-3 border rounded hover:bg-gray-50"
              >
                {t('ajustes.darDeBaja')}
              </Link>
            </div>
          </section>
        )}
        
        {/* Seguridad para todos */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">{t('ajustes.seguridad')}</h2>
          
          {/* Solo profesionales y administradores ven PIN */}
          {estado.rol !== 'tecnico_administrativo' && (
            <Link 
              href="/(app)/ajustes/cambiar-pin"
              className="block p-3 border rounded hover:bg-gray-50"
            >
              Cambiar PIN de historia
            </Link>
          )}
          
          <Link 
            href="/(app)/ajustes/recuperar"
            className="block p-3 border rounded hover:bg-gray-50"
          >
            Recuperar acceso
          </Link>
        </section>
      </div>
    </div>
  );
}
```

```
=== RUTA: app/(app)/ajustes/invitar/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FormularioInvitacion } from './formulario';

export default async function PaginaInvitar() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado || estado.rol !== 'administrador') {
    redirect('/(app)/ajustes');
  }
  
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">Invitar usuario</h1>
      <FormularioInvitacion />
    </div>
  );
}
```

```
=== RUTA: app/(app)/ajustes/invitar/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { invitarPerfil } from '@/lib/cuentas/invitar';
import { esquemaInvitacion } from '@/lib/cuentas/esquemas';

export async function invitarUsuario(formData: FormData) {
  const sesion = await exigirSesion();
  
  const datos = {
    correo: formData.get('correo')?.toString() ?? '',
    nombreCompleto: formData.get('nombreCompleto')?.toString() ?? '',
    rol: formData.get('rol')?.toString() ?? '',
    centroId: formData.get('centroId')?.toString() ?? null,
  };
  
  const validacion = esquemaInvitacion.safeParse(datos);
  
  if (!validacion.success) {
    const errores = validacion.error.flatten().fieldErrors;
    const mensaje = Object.values(errores)[0]?.[0] ?? 'Datos inválidos';
    return { ok: false, mensaje };
  }
  
  const resultado = await invitarPerfil(sesion, validacion.data);
  
  if (resultado.ok) {
    return { ok: true };
  }
  
  return { 
    ok: false, 
    motivo: resultado.motivo,
    mensaje: resultado.mensaje,
  };
}
```

```
=== RUTA: app/(app)/ajustes/invitar/formulario.tsx ===
```

```ts
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { esquemaInvitacion, ROLES_USUARIO } from '@/lib/cuentas/esquemas';
import { t, tCon } from '@/lib/i18n';

type FormData = {
  correo: string;
  nombreCompleto: string;
  rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo';
  centroId: string;
};

export function FormularioInvitacion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState<string>('');
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(esquemaInvitacion),
    defaultValues: {
      centroId: '',
    },
  });
  
  const rolWatch = watch('rol');
  
  const onSubmit = async (data: FormData) => {
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('correo', data.correo);
      formData.append('nombreCompleto', data.nombreCompleto);
      formData.append('rol', data.rol);
      formData.append('centroId', data.centroId || '');
      
      const response = await fetch('/(app)/ajustes/invitar/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.ok) {
        router.push('/(app)/ajustes');
        router.refresh();
      } else {
        setError(result.mensaje || result.motivo);
      }
    } catch (err) {
      setError('Error al invitar usuario');
    } finally {
      setCargando(false);
    }
  };
  
  const esTecnico = rolWatch === 'tecnico_administrativo';
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field
        label={t('invitacion.nombre')}
        error={errors.nombreCompleto?.message}
      >
        <input
          type="text"
          {...register('nombreCompleto')}
          className="w-full p-2 border rounded"
        />
      </Field>
      
      <Field
        label={t('invitacion.correo')}
        error={errors.correo?.message}
      >
        <input
          type="email"
          {...register('correo')}
          className="w-full p-2 border rounded"
        />
      </Field>
      
      <Field
        label={t('invitacion.rol')}
        error={errors.rol?.message}
      >
        <select
          {...register('rol')}
          className="w-full p-2 border rounded"
          onChange={(e) => setRolSeleccionado(e.target.value)}
        >
          <option value="">Seleccionar rol</option>
          {ROLES_USUARIO.map((rol) => (
            <option key={rol} value={rol}>
              {t(`invitacion.roles.${rol}`)}
            </option>
          ))}
        </select>
      </Field>
      
      {esTecnico && (
        <Field
          label={t('invitacion.centro')}
          error={errors.centroId?.message}
        >
          <input
            type="text"
            {...register('centroId')}
            placeholder={t('invitacion.centroPlaceholder')}
            className="w-full p-2 border rounded"
          />
        </Field>
      )}
      
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
      
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
          {t('ajustes.cancelar')}
        </Button>
        <Button type="submit" disabled={cargando} className="flex-1">
          {cargando ? t('comunes.cargar') : 'Invitar'}
        </Button>
      </div>
    </form>
  );
}
```

```
=== RUTA: app/(app)/ajustes/reponer-totp/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FormularioReponerTotp } from './formulario';

export default function PaginaReponerTotp() {
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">Reponer verificación</h1>
      <FormularioReponerTotp />
    </div>
  );
}
```

```
=== RUTA: app/(app)/ajustes/reponer-totp/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { reponerTotp } from '@/lib/cuentas/totp';
import { esquemaBaja } from '@/lib/cuentas/esquemas';

export async function reponerFactor(formData: FormData) {
  const sesion = await exigirSesion();
  
  // Solo administradores
  const estado = await import('@/lib/cuentas/candado').then(m => m.estadoDeCuenta(sesion));
  
  if (!estado || estado.rol !== 'administrador') {
    return { ok: false, mensaje: 'No autorizado' };
  }
  
  const perfilId = formData.get('perfilId')?.toString() ?? '';
  
  if (!perfilId) {
    return { ok: false, mensaje: 'Perfil requerido' };
  }
  
  const resultado = await reponerTotp(sesion, { perfilId });
  
  if (resultado.ok) {
    return { ok: true };
  }
  
  return { ok: false, mensaje: resultado.mensaje };
}
```

```
=== RUTA: app/(app)/ajustes/reponer-totp/formulario.tsx ===
```

```ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t } from '@/lib/i18n';

interface Perfil {
  id: string;
  nombre_completo: string;
  correo: string;
}

type FormData = {
  perfilId: string;
};

export function FormularioReponerTotp() {
  const router = useRouter();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();
  
  // Cargar perfiles (simulado - en producción vendría de la base)
  useEffect(() => {
    async function cargarPerfiles() {
      try {
        const response = await fetch('/(app)/ajustes/reponer-totp/api-perfiles');
        if (response.ok) {
          const data = await response.json();
          setPerfiles(data);
        }
      } catch (err) {
        console.error('Error cargando perfiles:', err);
      }
    }
    
    cargarPerfiles();
  }, []);
  
  const onSubmit = async (data: FormData) => {
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('perfilId', data.perfilId);
      
      const response = await fetch('/(app)/ajustes/reponer-totp/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.ok) {
        router.push('/(app)/ajustes');
        router.refresh();
      } else {
        setError(result.mensaje);
      }
    } catch (err) {
      setError('Error al reponer verificación');
    } finally {
      setCargando(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-gray-600 mb-4">{t('reponerTotp.info')}</p>
      
      <Field
        label={t('reponerTotp.perfil')}
        error={errors.perfilId?.message}
      >
        <select
          {...register('perfilId', { required: true })}
          className="w-full p-2 border rounded"
        >
          <option value="">Seleccionar usuario</option>
          {perfiles.map((perfil) => (
            <option key={perfil.id} value={perfil.id}>
              {perfil.nombre_completo} ({perfil.correo})
            </option>
          ))}
        </select>
      </Field>
      
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
      
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
          {t('ajustes.cancelar')}
        </Button>
        <Button type="submit" disabled={cargando} className="flex-1">
          {cargando ? t('comunes.cargar') : t('reponerTotp.confirmar')}
        </Button>
      </div>
    </form>
  );
}
```

```
=== RUTA: app/(app)/ajustes/dar-de-baja/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FormularioBaja } from './formulario';

export default function PaginaDarDeBaja() {
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">Dar de baja usuario</h1>
      <FormularioBaja />
    </div>
  );
}
```

```
=== RUTA: app/(app)/ajustes/dar-de-baja/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { darDeBajaPerfil } from '@/lib/cuentas/baja';
import { esquemaBaja } from '@/lib/cuentas/esquemas';

export async function ejecutarBaja(formData: FormData) {
  const sesion = await exigirSesion();
  
  // Verificar que es administrador
  const estado = await estadoDeCuenta(sesion);
  
  if (!estado || estado.rol !== 'administrador') {
    return { ok: false, mensaje: 'No autorizado' };
  }
  
  const datos = {
    perfilId: formData.get('perfilId')?.toString() ?? '',
    motivo: formData.get('motivo')?.toString() ?? '',
  };
  
  const validacion = esquemaBaja.safeParse(datos);
  
  if (!validacion.success) {
    return { ok: false, mensaje: 'Datos inválidos' };
  }
  
  const resultado = await darDeBajaPerfil(sesion, validacion.data);
  
  if (resultado.ok) {
    return { ok: true };
  }
  
  return {
    ok: false,
    motivo: resultado.motivo,
    mensaje: resultado.mensaje,
  };
}
```

```
=== RUTA: app/(app)/ajustes/dar-de-baja/formulario.tsx ===
```

```ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaBaja } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

interface Perfil {
  id: string;
  nombre_completo: string;
  correo: string;
}

type FormData = {
  perfilId: string;
  motivo: string;
};

export function FormularioBaja() {
  const router = useRouter();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();
  
  useEffect(() => {
    async function cargarPerfiles() {
      try {
        const response = await fetch('/(app)/ajustes/dar-de-baja/api-perfiles');
        if (response.ok) {
          const data = await response.json();
          setPerfiles(data);
        }
      } catch (err) {
        console.error('Error cargando perfiles:', err);
      }
    }
    
    cargarPerfiles();
  }, []);
  
  const onSubmit = async (data: FormData) => {
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('perfilId', data.perfilId);
      formData.append('motivo', data.motivo);
      
      const response = await fetch('/(app)/ajustes/dar-de-baja/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.ok) {
        router.push('/(app)/ajustes');
        router.refresh();
      } else {
        // Mostrar el mensaje que viene del servidor
        setError(result.mensaje || result.motivo);
      }
    } catch (err) {
      setError('Error al dar de baja');
    } finally {
      setCargando(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field
        label={t('baja.perfil')}
        error={errors.perfilId?.message}
      >
        <select
          {...register('perfilId', { required: true })}
          className="w-full p-2 border rounded"
        >
          <option value="">Seleccionar usuario</option>
          {perfiles.map((perfil) => (
            <option key={perfil.id} value={perfil.id}>
              {perfil.nombre_completo} ({perfil.correo})
            </option>
          ))}
        </select>
      </Field>
      
      <Field
        label={t('baja.motivo')}
        error={errors.motivo?.message}
      >
        <textarea
          {...register('motivo')}
          className="w-full p-2 border rounded h-24"
          maxLength={500}
        />
      </Field>
      
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
      
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
          {t('ajustes.cancelar')}
        </Button>
        <Button type="submit" disabled={cargando} className="flex-1">
          {cargando ? t('comunes.cargar') : t('baja.confirmar')}
        </Button>
      </div>
    </form>
  );
}
```

```
=== RUTA: app/(app)/recuperar/page.tsx ===
```

```ts
import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FormularioRecuperacion } from './formulario';

export default function PaginaRecuperar() {
  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-6">Recuperar acceso</h1>
      <FormularioRecuperacion />
    </div>
  );
}
```

```
=== RUTA: app/(app)/recuperar/acciones.ts ===
```

```ts
'use server';

import { redirect } from 'next/navigation';
import { exigirSesion } from '@/lib/supabase/sesion';
import { canjearCodigoRecuperacion } from '@/lib/cuentas/totp';
import { esquemaCodigoRecuperacion } from '@/lib/cuentas/esquemas';

export async function canjearCodigo(formData: FormData) {
  const sesion = await exigirSesion();
  
  const codigo = formData.get('codigo')?.toString() ?? '';
  
  const validacion = esquemaCodigoRecuperacion.safeParse({ codigo });
  
  if (!validacion.success) {
    return { ok: false, mensaje: 'Código inválido' };
  }
  
  const resultado = await canjearCodigoRecuperacion(sesion, validacion.data.codigo);
  
  if (resultado.canjeado) {
    // El TOTP se ha borrado, debe reenrolar
    return { ok: true, mensaje: ' Código válido. Configura tu verificación en dos pasos.' };
  }
  
  return {
    ok: false,
    motivo: resultado.motivo,
    mensaje: obtenerMensajeError(resultado.motivo),
    bloqueadoHasta: resultado.bloqueadoHasta,
  };
}

function obtenerMensajeError(motivo: string): string {
  switch (motivo) {
    case 'codigo_invalido':
      return 'Código de recuperación inválido';
    case 'bloqueado':
      return 'Demasiados intentos. Intenta más tarde';
    case 'sin_codigos':
      return 'No quedan códigos de recuperación';
    case 'error':
    default:
      return 'Error al canjear código';
  }
}
```

```
=== RUTA: app/(app)/recuperar/formulario.tsx ===
```

```ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaCodigoRecuperacion } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

type FormData = {
  codigo: string;
};

export function FormularioRecuperacion() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(esquemaCodigoRecuperacion),
  });
  
  useEffect(() => {
    // Verificar si hay bloqueo activo
    const verificarBloqueo = async () => {
      try {
        const response = await fetch('/(app)/recuperar/verificar-bloqueo', {
          method: 'POST',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.bloqueadoHasta) {
            setBloqueado(true);
            const actualizar = () => {
              const ahora = new Date();
              const bloqueado = new Date(data.bloqueadoHasta);
              
              if (bloqueado > ahora) {
                const diff = bloqueado.getTime() - ahora.getTime();
                const minutos = Math.ceil(diff / 60000);
                setTiempoRestante(`Bloqueado por ${minutos} minutos`);
              } else {
                setBloqueado(false);
                setTiempoRestante(null);
              }
            };
            
            actualizar();
            const intervalo = setInterval(actualizar, 1000);
            return () => clearInterval(intervalo);
          }
        }
      } catch (err) {
        console.error('Error verificando bloqueo:', err);
      }
    };
    
    verificarBloqueo();
  }, []);
  
  const onSubmit = async (data: FormData) => {
    if (bloqueado) return;
    
    setCargando(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('codigo', data.codigo);
      
      const response = await fetch('/(app)/recuperar/acciones', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.ok) {
        // Código válido, debe reenrolar TOTP
        router.push('/(app)/enrolar-totp');
      } else {
        if (result.bloqueadoHasta) {
          setBloqueado(true);
          setTiempoRestante(`Bloqueado hasta ${new Date(result.bloqueadoHasta).toLocaleTimeString()}`);
        } else {
          setError(result.mensaje);
        }
        reset();
      }
    } catch (err) {
      setError('Error al canjear código');
    } finally {
      setCargando(false);
    }
  };
  
  if (bloqueado && tiempoRestante) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-600 font-semibold">{tiempoRestante}</p>
        <Button onClick={() => router.push('/login')}>
          {t('comunes.cerrarSesion')}
        </Button>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-gray-600 mb-4">{t('recuperacion.introducirCodigo')}</p>
      
      <Field
        label={t('recuperacion.codigoPlaceholder')}
        error={errors.codigo?.message}
      >
        <input
          type="text"
          {...register('codigo')}
          className="w-full p-2 border rounded"
          maxLength={64}
          disabled={bloqueado}
        />
      </Field>
      
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
      
      <Button type="submit" disabled={cargando || bloqueado} className="w-full">
        {cargando ? t('comunes.cargar') : t('recuperacion.recuperar')}
      </Button>
    </form>
  );
}
```

Ahora necesito crear los componentes UI que faltan:

```
=== RUTA: components/ui/link.tsx ===
```

```ts
import Link from 'next/link';

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export function Link({ href, children, className = '', ...props }: LinkProps) {
  return (
    <Link href={href} className={`text-blue-600 hover:underline ${className}`} {...props}>
      {children}
    </Link>
  );
}
```

```
=== RUTA: components/ui/select.tsx ===
```

```ts
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: React.ReactNode;
}

export function Select({ label, error, children, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}
      <select
        className={`w-full p-2 border rounded ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

## FALTA

1. **Firma de `supabase.auth.mfa.getAuthenticatorAssuranceLevel`**: No tengo acceso a la versión exacta de `@supabase/supabase-js` para verificar la firma exacta de esta función. Necesito confirmarla.

2. **API routes necesarias**: Los endpoints `/api-perfiles` para las páginas de reponer TOTP y dar de baja no están definidos. Necesitaría saber si existen o cómo obtener la lista de perfiles.

3. **Verificación de bloqueo en recuperación**: La ruta `/verificar-bloqueo` no está implementada - necesito saber cómo obtener el estado de bloqueo del servidor.

4. **Pantalla de enrolamiento TOTP**: El flujo de primera vez menciona mostrar el QR de TOTP y los códigos de recuperación, pero no tengo la implementación de `generarCodigosRecuperacion()` ni el endpoint para generar el QR de TOTP.

5. **Componente `Select`**: He creado uno básico pero debería revisar si existe uno en el proyecto.

6. **Rutas de API para listar perfiles**: Las páginas de reponer TOTP y dar de baja necesitan obtener la lista de perfiles existentes, pero no tengo esas APIs definidas.

7. **Middleware de protección de rutas**: La tarea menciona una "guardia del grupo app/(app)/" que redirige a usuarios sin TOTP verificado - necesito saber cómo está implementada esta verificación.