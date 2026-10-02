import { z } from 'zod';

/** Resolver una alerta de documentación (T-015, P1). Lo usan el formulario y la acción. */
export const esquemaResolverAlerta = z.object({ alertaId: z.uuid() });
export type ResolverAlerta = z.infer<typeof esquemaResolverAlerta>;
