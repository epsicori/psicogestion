function exigir(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env.local y ` +
        `rellénala con \`npx supabase status\`.`,
    );
  }
  return valor;
}

// Next solo inlinea ocurrencias literales de `process.env.NOMBRE_LITERAL` (ver
// node_modules/next/dist/lib/static-env.js): un acceso indexado con variable
// (`process.env[nombre]`) no se sustituye y la variable llega `undefined` en el
// navegador. Por eso el acceso es literal aquí, no una función genérica indexada.
export const urlSupabase = exigir(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const claveAnonSupabase = exigir(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
