'use client';

import { Link2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { AvisoDeError } from '@/components/ui/piezas';
import { Seleccion } from '@/components/ui/seleccion';
import { formatearImporte } from '@/lib/dinero/importe';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t, tCon } from '@/lib/i18n';

import { asignarCobroAFactura, cargarCobrosAsignables, type CobroAsignable } from './acciones';

type Props = {
  factura: { id: string; numero: string };
  /** Zona de la organización: las fechas del diálogo se formatean con ella (ADR-034). */
  zona: string;
  /**
   * `false` cuando ya no quedan cobros sueltos del paciente: el botón se retira, pero el componente sigue
   * montado para que el aviso de la asignación recién hecha no se pierda ni el foco caiga en `body`.
   */
  disponible?: boolean;
};

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'listo'; cobros: CobroAsignable[]; hayMas: boolean };

/** Las dos respuestas que dejan el cobro en ESTA factura: las dos cierran el diálogo. */
const MENSAJES_DE_EXITO = [t('cobros.facturas.cobroAsignado'), t('cobros.facturas.cobroYaEstaba')];

function textoDeOpcion(cobro: CobroAsignable, zona: string): string {
  const partes = [
    formatearFechaSinZona(cobro.fecha, zona),
    formatearImporte(cobro.importeCentimos),
    t(`cobros.formas.${cobro.formaPago}`),
  ];
  if (cobro.referencia) partes.push(cobro.referencia);
  if (cobro.importeCentimos < 0 && cobro.motivo) partes.push(cobro.motivo);
  return partes.join(' · ');
}

/**
 * «Asignar un cobro» a una factura del espejo (T-023b P1). Al abrir se piden los cobros del paciente
 * de la factura que aún no están en ninguna; la base decide si la asignación vale y aquí solo se
 * traduce su respuesta. Nada se edita ni se borra: se enlaza un cobro que ya existía.
 */
export function AsignarCobro({ factura, zona, disponible = true }: Props) {
  const estado = useRef<HTMLParagraphElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState('');
  const [enviando, iniciarTransicion] = useTransition();
  const enviandoRef = useRef(false);
  const selector = useRef<HTMLSelectElement>(null);
  // Cuenta de aperturas: una respuesta que llega tras cerrar y reabrir no pisa la lista de la apertura nueva.
  const apertura = useRef(0);
  const [pedirFoco, setPedirFoco] = useState(0);

  // El botón que recibía el foco al cerrar el diálogo desaparece cuando ya no quedan cobros sueltos:
  // el foco pasa a la región de estado, que sigue ahí (H1).
  useEffect(() => {
    if (!disponible && aviso !== '') estado.current?.focus();
  }, [disponible, aviso]);

  useEffect(() => {
    if (pedirFoco > 0 && !enviando) selector.current?.focus();
  }, [pedirFoco, enviando]);

  function abrir() {
    const esta = ++apertura.current;
    setAviso('');
    setError('');
    setElegido('');
    setCarga({ estado: 'cargando' });
    setAbierto(true);
    cargarCobrosAsignables({ facturaEspejoId: factura.id }).then(
      (resultado) => {
        if (apertura.current !== esta) return;
        setCarga(
          resultado.ok ? { estado: 'listo', cobros: resultado.cobros, hayMas: resultado.hayMas } : { estado: 'error' },
        );
      },
      () => {
        if (apertura.current !== esta) return;
        setCarga({ estado: 'error' });
      },
    );
  }

  function enviar(evento: { preventDefault: () => void }) {
    evento.preventDefault();
    // aria-disabled no impide el clic ni el Enter: la guarda es esta, no el atributo.
    if (enviandoRef.current) return;
    if (elegido === '') {
      setError(t('cobros.facturas.eligeCobro'));
      setPedirFoco((n) => n + 1);
      return;
    }
    enviandoRef.current = true;
    setError('');
    iniciarTransicion(async () => {
      try {
        const estado = await asignarCobroAFactura({ cobroId: elegido, facturaEspejoId: factura.id });
        if (!estado.errores && estado.mensaje !== undefined && MENSAJES_DE_EXITO.includes(estado.mensaje)) {
          setAbierto(false);
          setAviso(estado.mensaje);
          return;
        }
        const campo = estado.errores?.cobroId?.[0] ?? estado.errores?.facturaEspejoId?.[0];
        setError(campo ?? estado.mensaje ?? t('cobros.facturas.noSePudoAsignar'));
        setPedirFoco((n) => n + 1);
      } catch {
        // Un fallo de red no dice si el cobro quedó asignado: no se cierra, se avisa y se deja reintentar.
        setError(t('cobros.resultadoDesconocido'));
        setPedirFoco((n) => n + 1);
      } finally {
        enviandoRef.current = false;
      }
    });
  }

  return (
    <>
      {disponible && (
        <Button
          type="button"
          variante="contorno"
          className="min-h-11"
          onClick={abrir}
          aria-label={tCon('cobros.facturas.asignarDeFactura', { numero: factura.numero })}
        >
          <Link2 aria-hidden="true" />
          {t('cobros.facturas.asignar')}
        </Button>
      )}
      {/* Visible: «Cobro asignado» confirma una acción económica, no solo para lectores. Siempre montada:
          si el último cobro suelto se asigna, el botón se va y esta región es el destino estable del foco. */}
      <p ref={estado} role="status" tabIndex={-1} className="text-sm text-foreground">
        {aviso}
      </p>
      <Dialogo
        abierto={abierto}
        // Con un envío en vuelo no se cierra: el usuario no vería su resultado (B-H11).
        alCerrar={() => {
          if (!enviandoRef.current) setAbierto(false);
        }}
        titulo={tCon('cobros.facturas.tituloAsignar', { numero: factura.numero })}
      >
        {carga.estado === 'cargando' && <p className="text-sm text-muted-foreground">{t('cobros.facturas.cargandoCobros')}</p>}
        {carga.estado === 'error' && <AvisoDeError mensaje={t('cobros.facturas.errorCobrosAsignables')} />}
        {carga.estado === 'listo' && carga.cobros.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('cobros.facturas.sinCobrosAsignables')}</p>
        )}
        {carga.estado === 'listo' && carga.cobros.length > 0 && (
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            <Seleccion
              ref={selector}
              id={`cobro-asignar-${factura.id}`}
              etiqueta={t('cobros.facturas.cobro')}
              textoVacio={t('cobros.facturas.eligeCobro')}
              opciones={carga.cobros.map((c) => ({ valor: c.id, texto: textoDeOpcion(c, zona) }))}
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              errores={error === t('cobros.facturas.eligeCobro') ? [error] : undefined}
            />
            {carga.hayMas && <p className="text-xs text-muted-foreground">{t('cobros.facturas.hayMas')}</p>}
            <div className="flex justify-end">
              <Button type="submit" aria-disabled={enviando} className="aria-disabled:opacity-60">
                {enviando ? t('cobros.facturas.asignando') : t('cobros.facturas.asignar')}
              </Button>
            </div>
            <p aria-live="polite" className="text-destructive text-sm">
              {error !== t('cobros.facturas.eligeCobro') ? error : ''}
            </p>
          </form>
        )}
      </Dialogo>
    </>
  );
}
