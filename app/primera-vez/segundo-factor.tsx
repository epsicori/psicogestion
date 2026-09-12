'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t } from '@/lib/i18n';
import { crearClienteNavegador } from '@/lib/supabase/navegador';

import { generarCodigos } from './acciones';

type Props = {
  /** Id del factor TOTP ya verificado, o `null` si el usuario aún no tiene ninguno. */
  factorVerificadoId: string | null;
};

type Enrolamiento = { factorId: string; qr: string; secreto: string };

/**
 * El segundo factor, en sus dos caras:
 *
 * - **Sin factor**: se enrola uno, se pinta el QR y se pide el código. El
 *   enrolamiento ocurre **una sola vez por montaje** (`useRef`), no en cada
 *   renderizado: `enroll()` crea una fila en `auth.mfa_factors` cada vez que se
 *   llama, y dispararlo en cada render deja al usuario sembrado de factores
 *   huérfanos.
 * - **Con factor verificado**: no se enrola nada, solo se reta y se verifica.
 *   Enrolar de nuevo a quien ya tiene su aplicación configurada sería pedirle que
 *   la reconfigure sin motivo.
 *
 * En los dos casos, al superarlo se generan los códigos de recuperación **y se
 * enseñan una sola vez**: no hay forma de volver a consultarlos, y la pantalla lo
 * dice antes de que el usuario siga.
 */
export function SegundoFactor({ factorVerificadoId }: Props) {
  const router = useRouter();
  const [supabase] = useState(crearClienteNavegador);
  const yaEnrolado = useRef(false);

  const [enrolamiento, setEnrolamiento] = useState<Enrolamiento | null>(null);
  const [retoId, setRetoId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [trabajando, iniciarTransicion] = useTransition();

  const factorId = factorVerificadoId ?? enrolamiento?.factorId ?? null;

  useEffect(() => {
    if (factorVerificadoId || yaEnrolado.current) return;
    yaEnrolado.current = true;

    (async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Psicogestión',
      });

      if (error || !data) {
        console.error('SegundoFactor: fallo al enrolar el TOTP', error);
        setMensaje(t('primeraVez.totp.noSePudoEnrolar'));
        return;
      }

      setEnrolamiento({
        factorId: data.id,
        // `qr_code` es un SVG; para pintarlo hay que anteponerle el prefijo de dato.
        qr: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
        secreto: data.totp.secret,
      });
    })();
  }, [factorVerificadoId, supabase]);

  const verificar = () => {
    if (!factorId) return;
    setMensaje('');

    iniciarTransicion(async () => {
      // El reto se pide en el momento de verificar y no al cargar: caduca, y uno
      // pedido hace cinco minutos ya no vale cuando el usuario acaba de teclear.
      const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({ factorId });

      if (errorReto || !reto) {
        console.error('SegundoFactor: fallo al pedir el reto', errorReto);
        setMensaje(t('primeraVez.totp.noSePudoEnrolar'));
        return;
      }

      setRetoId(reto.id);

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: reto.id,
        code: codigo,
      });

      if (error) {
        setMensaje(t('primeraVez.totp.codigoNoValido'));
        setCodigo('');
        return;
      }

      const resultado = await generarCodigos();

      if (!resultado.ok) {
        // El factor ya está verificado: el paso está superado aunque los códigos
        // fallen. Se avisa, y se deja seguir en vez de dejarlo a medias.
        setMensaje(resultado.mensaje);
        router.refresh();
        return;
      }

      setCodigos(resultado.codigos);
    });
  };

  if (codigos) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold tracking-tight">
          {t('primeraVez.codigos.titulo')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('primeraVez.codigos.unaSolaVez')}</p>
        <ul className="border-border bg-muted grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-sm">
          {codigos.map((uno) => (
            <li key={uno}>{uno}</li>
          ))}
        </ul>
        <Button onClick={() => router.refresh()}>{t('primeraVez.codigos.guardados')}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold tracking-tight">
        {t('primeraVez.totp.titulo')}
      </h2>

      {factorVerificadoId ? (
        <p className="text-muted-foreground text-sm">{t('primeraVez.totp.yaEnrolado')}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('primeraVez.totp.escanea')}</p>
          {enrolamiento ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- el QR es un
                  SVG en línea generado por Auth, no un recurso que optimizar. */}
              <img
                src={enrolamiento.qr}
                alt={t('primeraVez.totp.alt')}
                className="border-border mx-auto size-48 rounded-lg border bg-white p-2"
              />
              <Field
                id="secreto"
                etiqueta={t('primeraVez.totp.secreto')}
                type="password"
                readOnly
                value={enrolamiento.secreto}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t('comunes.cargando')}</p>
          )}
        </>
      )}

      <Field
        id="codigo"
        etiqueta={t('primeraVez.totp.codigo')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ''))}
      />

      <Button onClick={verificar} disabled={trabajando || codigo.length !== 6 || !factorId}>
        {trabajando ? t('comunes.cargando') : t('primeraVez.totp.verificar')}
      </Button>

      {mensaje && (
        <p role="status" className="text-destructive text-sm">
          {mensaje}
        </p>
      )}

      {/* `retoId` no se pinta; se conserva para que el reto usado sea el último
          pedido y no uno anterior si el usuario reintenta. */}
      <span hidden>{retoId}</span>
    </div>
  );
}
