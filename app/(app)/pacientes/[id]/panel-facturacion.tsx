import type { ReactNode } from 'react';

import { AvisoDeError, EstadoVacio, Pildora } from '@/components/ui/piezas';
import { formatearImporte } from '@/lib/dinero/importe';
import { proveedorActivo } from '@/lib/facturacion/registro';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { BotonPreparar } from './boton-preparar';
import { Bloque } from './bloques';

/**
 * La pestaña Facturación de la ficha (T-026a). La app no aprueba ni expide (ADR-053): enseña el
 * estado de cada borrador, deja prepararlo en el programa y, cuando el programa lo ha emitido,
 * muestra la copia mínima (ADR-077). Sin programa disponible, el panel es honesto: sin botones.
 */
export type EstadoDeBorrador =
  | 'sin_enviar'
  | 'en_cola'
  | 'fallido'
  | 'enviado'
  | 'facturado'
  | 'descartado';

export const TONO_DE_ESTADO: Record<EstadoDeBorrador, 'success' | 'info' | 'warning'> = {
  sin_enviar: 'info',
  en_cola: 'info',
  fallido: 'warning',
  enviado: 'info',
  facturado: 'success',
  descartado: 'info',
};

export function EstadoBorrador({ estado, texto }: { estado: EstadoDeBorrador; texto: string }) {
  return <Pildora tono={TONO_DE_ESTADO[estado]}>{texto}</Pildora>;
}

type Rol = 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo' | null;

const ESTADOS: readonly string[] = ['sin_enviar', 'en_cola', 'fallido', 'enviado', 'facturado', 'descartado'];
const esEstado = (valor: string | null): valor is EstadoDeBorrador => valor !== null && ESTADOS.includes(valor);

/** Euros de la base (numeric) a céntimos enteros. */
const euros = (importe: number) => formatearImporte(Math.round(importe * 100));

const fechaCorta = (iso: string) => {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
};

type FilaEmitida = {
  id: string | null;
  numero: string | null;
  fecha_expedicion: string | null;
  total: number | null;
};
type Borrador = { id: string; profesional_id: string };
type Datos =
  | { tipo: 'emitidas'; filas: FilaEmitida[] }
  | {
      tipo: 'borradores';
      borradores: Borrador[];
      estadoDe: Map<string, string | null>;
      documentoDe: Map<string, string>;
      espejoDe: Map<string, { numero: string; fecha_expedicion: string; total: number }>;
      anotaciones: { borrador_id: string; tipo: 'borrado_sin_aprobar' | 'rectificado' | 'anulado' }[];
    };

/** Todas las lecturas, juntas y con su `try`: el JSX se construye fuera (un fallo de render no se atrapa). */
async function cargar(pacienteId: string, rol: Rol): Promise<Datos | null> {
  try {
    const { supabase } = await exigirSesion();

    // El técnico no lee borradores: solo la copia mínima de lo emitido.
    if (rol === 'tecnico_administrativo') {
      const { data, error } = await supabase
        .from('facturas_espejo_cabecera')
        .select('id, numero, fecha_expedicion, total')
        .eq('paciente_id', pacienteId)
        .order('fecha_expedicion', { ascending: false });
      if (error) throw error;
      return { tipo: 'emitidas', filas: data ?? [] };
    }

    const { data: borradores, error } = await supabase
      .from('borradores_factura')
      .select('id, profesional_id, creado_en')
      .eq('paciente_id', pacienteId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    const ids = (borradores ?? []).map((b) => b.id);
    if (ids.length === 0) {
      return {
        tipo: 'borradores',
        borradores: [],
        estadoDe: new Map(),
        documentoDe: new Map(),
        espejoDe: new Map(),
        anotaciones: [],
      };
    }

    const [estados, envios, espejo, anotaciones] = await Promise.all([
      supabase.from('borradores_factura_estado').select('borrador_id, estado').in('borrador_id', ids),
      supabase.from('borradores_factura_envios').select('borrador_id, proveedor_documento_id').in('borrador_id', ids),
      supabase.from('facturas_espejo').select('borrador_id, numero, fecha_expedicion, total').in('borrador_id', ids),
      supabase.from('facturas_anotaciones').select('borrador_id, tipo').in('borrador_id', ids),
    ]);
    for (const r of [estados, envios, espejo, anotaciones]) if (r.error) throw r.error;

    return {
      tipo: 'borradores',
      borradores: borradores ?? [],
      estadoDe: new Map((estados.data ?? []).map((e) => [e.borrador_id as string, e.estado])),
      documentoDe: new Map((envios.data ?? []).map((e) => [e.borrador_id, e.proveedor_documento_id])),
      espejoDe: new Map((espejo.data ?? []).map((e) => [e.borrador_id, e])),
      anotaciones: anotaciones.data ?? [],
    };
  } catch (error) {
    console.error('PanelFacturacion: fallo al leer la facturación', error);
    return null;
  }
}

export async function PanelFacturacion({ pacienteId, rol }: { pacienteId: string; rol: Rol }) {
  const datos = await cargar(pacienteId, rol);
  if (!datos) return <AvisoDeError mensaje={t('facturacion.panel.error')} />;

  const { usuario } = await exigirSesion();
  const activo = await proveedorActivo().catch((error: unknown) => {
    console.error('PanelFacturacion: fallo al leer el programa', error);
    return null;
  });
  const programa = activo?.ficha.nombre ?? null;

  if (datos.tipo === 'emitidas') return <Emitidas filas={datos.filas} programa={programa} />;
  if (datos.borradores.length === 0) return <EstadoVacio frase={t('facturacion.panel.vacio')} />;

  return (
    <Bloque titulo={t('facturacion.panel.titulo')}>
      <ul className="divide-border flex flex-col divide-y">
        {datos.borradores.map((b) => {
          const bruto = datos.estadoDe.get(b.id) ?? null;
          const estado: EstadoDeBorrador = esEstado(bruto) ? bruto : 'sin_enviar';
          const factura = datos.espejoDe.get(b.id);
          const documento = datos.documentoDe.get(b.id);
          const enlace = activo && documento ? activo.ficha.enlaceDeBorrador(documento) : null;
          const puedePreparar =
            activo !== null &&
            (estado === 'sin_enviar' || estado === 'fallido') &&
            (rol === 'administrador' || b.profesional_id === usuario.id);

          const texto =
            estado === 'en_cola'
              ? programa
                ? tCon('facturacion.panel.estado.en_cola', { programa })
                : t('facturacion.panel.estado.en_colaSinPrograma')
              : estado === 'facturado'
                ? programa
                  ? tCon('facturacion.panel.estado.facturado', { programa, numero: factura?.numero ?? '' })
                  : tCon('facturacion.panel.estado.facturadoSinPrograma', { numero: factura?.numero ?? '' })
                : t(`facturacion.panel.estado.${estado}`);

          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-1">
                <EstadoBorrador estado={estado} texto={texto} />
                {factura && (
                  <span className="text-muted-foreground text-xs">
                    {fechaCorta(factura.fecha_expedicion)} · {euros(factura.total)}
                  </span>
                )}
                {programa &&
                  datos.anotaciones
                    .filter((a) => a.borrador_id === b.id)
                    .map((a) => (
                      <span key={a.tipo} className="text-muted-foreground text-xs">
                        {tCon(`facturacion.panel.anotacion.${a.tipo}`, { programa })}
                      </span>
                    ))}
              </div>
              <div className="flex items-center gap-2">
                {puedePreparar && programa && (
                  <BotonPreparar borradorId={b.id} programa={programa} />
                )}
                {enlace && programa && estado === 'enviado' && (
                  <a
                    href={enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {tCon('facturacion.panel.abrir', { programa })}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Bloque>
  );
}

function Emitidas({ filas, programa }: { filas: FilaEmitida[]; programa: string | null }): ReactNode {
  if (filas.length === 0) return <EstadoVacio frase={t('facturacion.panel.vacio')} />;
  return (
    <Bloque titulo={programa ? tCon('facturacion.panel.emitidas', { programa }) : t('facturacion.panel.titulo')}>
      <ul className="divide-border flex flex-col divide-y">
        {filas.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-3 text-sm">
            <span>nº {f.numero}</span>
            <span className="text-muted-foreground">
              {f.fecha_expedicion ? fechaCorta(f.fecha_expedicion) : ''}
              {f.total !== null ? ` · ${euros(f.total)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}
