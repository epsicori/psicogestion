import { createBrowserClient } from '@supabase/ssr';

import { claveAnonSupabase, urlSupabase } from './config';
import type { Database } from './tipos-bd';

export function crearClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase, claveAnonSupabase);
}
