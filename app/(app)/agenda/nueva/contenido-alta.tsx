import { AvisoDeError } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import { cargarContexto } from '../datos';
import { cargarVistaAlta, DURACION_INICIAL, relojDelCentro } from './estado-alta';
import { FormularioNavegable } from './formulario-navegable';
import { leerParametrosAlta } from './parametros-alta';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  modo: 'dialogo' | 'pagina';
};

/**
 * Lo que el alta de cita necesita para abrirse, leído en el servidor con la sesión de quien mira:
 * centros, profesionales (solo el administrador y el técnico eligen), tipos de terapia activos
 * (id, nombre y duración: el catálogo no es clínico), el paciente de la URL y la primera vista de
 * huecos. Lo que falla se dice en una alerta; ni un `hoy` inválido ni unas sugerencias que no se
 * calculan tumban el render (T-028 A E15.3).
 */
export async function ContenidoAlta({ searchParams, modo }: Props) {
  const parametros = leerParametrosAlta(await searchParams);
  const contexto = await cargarContexto(parametros.centro);
  if (!contexto.ok) return <AvisoDeError mensaje={contexto.mensaje} />;
  const { sesion, rol, centros } = contexto;
  if (!rol) return <AvisoDeError mensaje={t('agenda.alta.error.cargar')} />;

  const centroId =
    (parametros.centro && centros.some((c) => c.id === parametros.centro) ? parametros.centro : contexto.centro) ?? centros[0]?.id;
  if (!centroId) return <AvisoDeError mensaje={t('agenda.alta.error.sinCentro')} />;

  const { supabase, usuario } = sesion;

  const [tiposLeidos, profesionalesLeidos, pertenenciasLeidas, pacienteLeido] = await Promise.all([
    supabase.from('tipos_terapia').select('id, nombre, duracion_minutos').eq('activo', true).order('nombre'),
    rol === 'profesional_sanitario'
      ? Promise.resolve(null)
      : supabase
          .from('directorio_perfiles')
          .select('id, nombre_completo, rol')
          .in('rol', ['profesional_sanitario', 'administrador'])
          .eq('estado', 'activo'),
    // La pertenencia a un centro es esta relación (ADR-051): `perfiles.centro_id` es solo el principal. Vigente = `hasta is null`.
    rol === 'profesional_sanitario'
      ? Promise.resolve(null)
      : supabase.from('perfiles_centros').select('perfil_id, centro_id').is('hasta', null),
    parametros.paciente
      ? supabase.from('pacientes').select('id, nombre, apellidos, profesional_id').eq('id', parametros.paciente).maybeSingle()
      : Promise.resolve(null),
  ]);

  if (tiposLeidos.error) console.error('Alta de cita: fallo al leer el catálogo de tipos', tiposLeidos.error);
  if (profesionalesLeidos?.error) console.error('Alta de cita: fallo al leer los profesionales', profesionalesLeidos.error);
  if (pertenenciasLeidas?.error) console.error('Alta de cita: fallo al leer las pertenencias a centros', pertenenciasLeidas.error);
  // Sin las pertenencias, el selector cambiaría de significado (solo administradores, en todos los centros): es un error, no una ausencia (H29).
  if (pertenenciasLeidas?.error) return <AvisoDeError mensaje={t('agenda.alta.error.cargar')} />;
  if (pacienteLeido?.error) console.error('Alta de cita: fallo al leer el paciente', pacienteLeido.error);

  const tipos = (tiposLeidos.data ?? []).map((tipo) => ({
    id: tipo.id,
    nombre: tipo.nombre,
    duracionMinutos: tipo.duracion_minutos,
  }));
  // Cada pertenencia vigente a un centro que quien mira tiene es una opción: quien pasa consulta en dos centros sale en los dos.
  const visibles = new Set(centros.map((c) => c.id));
  const pertenencias = new Map<string, string[]>();
  for (const fila of pertenenciasLeidas?.data ?? []) {
    pertenencias.set(fila.perfil_id, [...(pertenencias.get(fila.perfil_id) ?? []), fila.centro_id]);
  }
  const profesionales =
    rol === 'profesional_sanitario'
      ? []
      : (profesionalesLeidos?.data ?? [])
          .flatMap((p) => {
            if (!p.id) return [];
            const nombre = p.nombre_completo ?? '';
            const suyos = pertenencias.get(p.id) ?? [];
            // Un administrador sin ninguna pertenencia no es de un centro: se ofrece en todos los de quien mira.
            if (suyos.length === 0) return p.rol === 'administrador' ? centros.map((c) => ({ id: p.id!, nombre, centroId: c.id })) : [];
            return suyos.filter((c) => visibles.has(c)).map((centroDe) => ({ id: p.id!, nombre, centroId: centroDe }));
          })
          // Orden estable: por nombre y, a igualdad, por id. Sin él, «el primero» cambiaría de una carga a otra.
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id) || a.centroId.localeCompare(b.centroId));
  const delCentro = profesionales.filter((p) => p.centroId === centroId);
  // Por defecto, el profesional asignado al paciente si trabaja en este centro; si no, el primero.
  const asignado = pacienteLeido?.data?.profesional_id;
  const profesionalId =
    rol === 'profesional_sanitario'
      ? usuario.id
      : ((delCentro.find((p) => p.id === asignado) ?? delCentro[0])?.id ?? null);
  if (!profesionalId) return <AvisoDeError mensaje={t('agenda.alta.error.sinProfesionales')} />;

  const paciente = pacienteLeido?.data
    ? {
        id: pacienteLeido.data.id,
        nombre: `${pacienteLeido.data.nombre} ${pacienteLeido.data.apellidos}`.trim(),
        profesionalId: pacienteLeido.data.profesional_id,
      }
    : null;

  const reloj = await relojDelCentro(sesion, centroId);
  if (!reloj.ok) return <AvisoDeError mensaje={reloj.mensaje} />;

  const carga = await cargarVistaAlta(sesion, rol, {
    pacienteId: paciente?.id ?? null,
    profesionalId,
    centroId,
    duracionMinutos: DURACION_INICIAL,
    fechaFoco: parametros.inicio?.fecha ?? null,
    excluir: [],
    zona: reloj.zona,
    hoy: reloj.hoy,
  });
  if (!carga.ok) return <AvisoDeError mensaje={carga.mensaje} />;

  return (
    <FormularioNavegable
      modo={modo}
      rol={rol}
      centros={centros}
      profesionales={profesionales}
      tipos={tipos}
      inicial={{
        paciente,
        centroId,
        profesionalId,
        clave: parametros.inicio ? `${parametros.inicio.fecha}T${parametros.inicio.hora}` : null,
      }}
      vista={carga.vista}
    />
  );
}
