'use client';

import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Desplegable } from '@/components/ui/desplegable';
import { t, tCon } from '@/lib/i18n';
import { compararTextos, type Comparacion, type Segmento } from '@/lib/notas/comparar';
import type { VersionDeVista } from '@/lib/notas/servidor';

import { AvisoReservadas } from './aviso-reservadas';

/**
 * La comparación entre dos versiones de la nota (T-012 corte C, criterio 9).
 *
 * Trabaja sobre lo que la apertura ya trajo bajo su acceso registrado: **no llama a ninguna
 * acción**, así que comparar no es abrir y cae con el candado igual que el resto del editor.
 * Los números de versión son los del modelo (posicionales en lectura conjunta, B1-H4); aquí no se
 * calcula ninguno.
 *
 * Lo añadido y lo retirado se distinguen sin color, con tres señales en el marcado: subrayado o
 * tachado, «+» o «−» a la vista y un texto solo para el lector de pantalla.
 */
export function Comparador({ versiones }: { versiones: VersionDeVista[] }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(() => versiones[versiones.length - 2]?.numero ?? 0);
  const [hasta, setHasta] = useState(() => versiones[versiones.length - 1]?.numero ?? 0);
  const idRegion = useId();
  const idTitulo = useId();

  if (versiones.length < 2) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          variante="contorno"
          aria-expanded={abierto}
          aria-controls={abierto ? idRegion : undefined}
          onClick={() => setAbierto((a) => !a)}
        >
          {t('notas.comparar.abrir')}
        </Button>
      </div>
      {abierto && (
        <RegionDeComparacion
          id={idRegion}
          idTitulo={idTitulo}
          versiones={versiones}
          desde={desde}
          hasta={hasta}
          alElegirDesde={setDesde}
          alElegirHasta={setHasta}
        />
      )}
    </div>
  );
}

function RegionDeComparacion({
  id,
  idTitulo,
  versiones,
  desde,
  hasta,
  alElegirDesde,
  alElegirHasta,
}: {
  id: string;
  idTitulo: string;
  versiones: VersionDeVista[];
  desde: number;
  hasta: number;
  alElegirDesde: (numero: number) => void;
  alElegirHasta: (numero: number) => void;
}) {
  // Se compara siempre de la menor a la mayor, se elija como se elija; el título lo dice.
  const menor = Math.min(desde, hasta);
  const mayor = Math.max(desde, hasta);
  const a = versiones.find((v) => v.numero === menor) ?? versiones[0]!;
  const b = versiones.find((v) => v.numero === mayor) ?? versiones[versiones.length - 1]!;

  const nota = useMemo(() => compararTextos(a.texto, b.texto), [a, b]);
  const conReservadas = Boolean(a.reservadas) || Boolean(b.reservadas);
  const reservadas = useMemo(
    () => (conReservadas ? compararTextos(a.reservadas ?? '', b.reservadas ?? '') : null),
    [a, b, conReservadas],
  );

  const opciones = versiones.map((v) => ({
    valor: String(v.numero),
    etiqueta: tCon('notas.version.titulo', { numero: String(v.numero) }),
  }));
  const hayCambios = [nota, reservadas].some((c) => c?.segmentos.some((s) => s.tipo !== 'igual'));
  const resumida = [nota, reservadas].some((c) => c !== null && !c.completa);

  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <h3 id={idTitulo} className="font-medium">
        {tCon('notas.comparar.titulo', { desde: String(a.numero), hasta: String(b.numero) })}
      </h3>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="md:flex-1">
          <Desplegable
            etiqueta={t('notas.comparar.desde')}
            opciones={opciones}
            valor={String(desde)}
            alElegir={(valor) => alElegirDesde(Number(valor))}
          />
        </div>
        <div className="md:flex-1">
          <Desplegable
            etiqueta={t('notas.comparar.hasta')}
            opciones={opciones}
            valor={String(hasta)}
            alElegir={(valor) => alElegirHasta(Number(valor))}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('notas.comparar.leyenda')}</p>
      {!hayCambios && (
        <p role="status" className="text-sm">
          {t('notas.comparar.sinCambios')}
        </p>
      )}
      {resumida && <p className="text-sm">{t('notas.comparar.resumida')}</p>}
      <BloqueComparado titulo={t('notas.editor.nota')} comparacion={nota} />
      {reservadas && (
        <BloqueComparado titulo={t('notas.editor.reservadas')} comparacion={reservadas} conAviso />
      )}
    </section>
  );
}

function BloqueComparado({
  titulo,
  comparacion,
  conAviso = false,
}: {
  titulo: string;
  comparacion: Comparacion;
  conAviso?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{titulo}</h4>
      {conAviso && <AvisoReservadas />}
      <p className="whitespace-pre-wrap break-words text-sm">
        {comparacion.segmentos.map((segmento, indice) => (
          <PiezaDeSegmento key={indice} segmento={segmento} />
        ))}
      </p>
    </div>
  );
}

function PiezaDeSegmento({ segmento }: { segmento: Segmento }) {
  // Las clases van explícitas: ni el estilo por defecto de `ins`/`del` ni el preflight cuentan.
  if (segmento.tipo === 'anadido') {
    return (
      <ins className="underline decoration-2 underline-offset-2">
        <span aria-hidden="true">+</span>
        <span className="sr-only">{t('notas.comparar.anadido')}</span>
        {segmento.texto}
        <span className="sr-only">{t('notas.comparar.fin')}</span>
      </ins>
    );
  }
  if (segmento.tipo === 'retirado') {
    return (
      <del className="line-through decoration-2">
        <span aria-hidden="true">{'−'}</span>
        <span className="sr-only">{t('notas.comparar.retirado')}</span>
        {segmento.texto}
        <span className="sr-only">{t('notas.comparar.fin')}</span>
      </del>
    );
  }
  return <>{segmento.texto}</>;
}
