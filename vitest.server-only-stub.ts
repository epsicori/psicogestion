// Vitest corre en jsdom (entorno de cliente) y el paquete real `server-only`
// lanza si se importa fuera de un Server Component. Los módulos de lib/citas/
// (y cualquier otro con `import 'server-only'`) siguen llevando esa línea de
// verdad — es la convención del proyecto y la exige el diseño de T-011 §8—;
// este fichero solo sustituye el paquete DURANTE LAS PRUEBAS (alias en
// vitest.config.ts), para poder probar la lógica pura de esos módulos sin
// tocar la guarda real que protege el build de producción.
export {};
