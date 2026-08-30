-- ADR-038 · SMTP propio del cliente, si algún día hace falta.
--
-- GUION DE REFERENCIA. NO SE EJECUTA POR DEFECTO ni desde ninguna migración: hoy el
-- correo de cuenta (invitación, recuperación) lo manda Supabase Auth con el SMTP local
-- de desarrollo (Mailpit) o, en producción, el proveedor que traiga la instancia
-- dedicada del propio ADR-038. Este guion es para el día en que un cliente concreto pida
-- SMTP propio: entonces se ejecuta a mano, una vez, contra esa instancia.
--
-- Regla del ADR-038 y del ADR-029: las credenciales de SMTP van al Vault de Supabase,
-- NUNCA a una variable de entorno de Vercel, y con una CLAVE DE CIFRADO DISTINTA de la
-- que protege el PIN (extensions.crypt, ADR-026) y de la que protege el DNI
-- (pgsodium/AES-256-GCM en la aplicación, ADR-029). Compartir clave entre secretos de
-- dominios distintos convierte la fuga de uno en la fuga de todos.
--
-- Requiere la extensión `supabase_vault` (viene activada por defecto en un proyecto
-- Supabase; en local, comprobar con `select * from pg_extension where extname =
-- 'supabase_vault';` antes de ejecutar esto).

-- 1 · Guarda cada credencial como un secreto independiente, con su propio nombre. No se
--     concatenan usuario+contraseña en un solo secreto: cada uno se rota por separado.
select vault.create_secret(
  'CAMBIA_ESTO_POR_EL_HOST_SMTP_REAL',
  'smtp_cliente_host',
  'Host SMTP propio del cliente (ADR-038). Rotar junto con smtp_cliente_pass.'
);

select vault.create_secret(
  'CAMBIA_ESTO_POR_EL_USUARIO_SMTP_REAL',
  'smtp_cliente_usuario',
  'Usuario SMTP propio del cliente (ADR-038).'
);

select vault.create_secret(
  'CAMBIA_ESTO_POR_LA_CONTRASENA_SMTP_REAL',
  'smtp_cliente_pass',
  'Contraseña SMTP propio del cliente (ADR-038). NUNCA en variable de entorno de Vercel.'
);

-- 2 · Leerlos de vuelta (para configurar `[auth.email.smtp]` en el proyecto remoto,
--     vía el panel de Supabase o su API de gestión — NO se escribe la contraseña en
--     `supabase/config.toml`, que sí se versiona):
--
--   select decrypted_secret from vault.decrypted_secrets where name = 'smtp_cliente_host';
--
-- 3 · Cuando el SMTP propio deje de usarse, se borra el secreto, no se comenta:
--
--   select vault.delete_secret(id) from vault.secrets where name = 'smtp_cliente_host';
--
-- No se automatiza el borrado aquí: es una decisión operativa de una sola vez, no un
-- paso de migración.
