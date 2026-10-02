import { Clock, CalendarClock, HelpCircle } from 'lucide-react';

export function SelloDeNota({
  frase,
  enSesion,
}: {
  frase: string;
  enSesion: boolean | null;
}) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      {enSesion === true && <Clock className="size-4" aria-hidden="true" />}
      {enSesion === false && <CalendarClock className="size-4" aria-hidden="true" />}
      {enSesion === null && <HelpCircle className="size-4" aria-hidden="true" />}
      {frase}
    </p>
  );
}
