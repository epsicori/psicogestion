import { describe, expect, it } from 'vitest';
import { t, es } from './index';

describe('t', () => {
  it("devuelve 'Entrar' para la clave 'acceso.entrar'", () => {
    expect(t('acceso.entrar')).toBe('Entrar');
  });

  it("devuelve 'Psicogestión' para la clave 'marca'", () => {
    expect(t('marca')).toBe('Psicogestión');
  });

  it('recorre el catálogo y comprueba que ninguna cadena está vacía', () => {
    function verificar(obj: unknown, ruta: string): void {
      if (typeof obj === 'string') {
        expect(obj.length).toBeGreaterThan(0);
        return;
      }
      if (typeof obj === 'object' && obj !== null) {
        for (const [clave, valor] of Object.entries(obj)) {
          const nuevaRuta = ruta ? `${ruta}.${clave}` : clave;
          verificar(valor, nuevaRuta);
        }
      }
    }
    verificar(es, '');
  });

  it('recorre el catálogo y comprueba que ninguna clave se repite dentro de su área', () => {
    function obtenerClaves(obj: object): string[] {
      return Object.keys(obj);
    }

    const areas = ['armazon', 'modulos', 'roles', 'acceso', 'pacientes'];
    for (const area of areas) {
      if (area in es) {
        const claves = obtenerClaves((es as Record<string, unknown>)[area] as object);
        const unicas = new Set(claves);
        expect(claves.length).toBe(unicas.size);
      }
    }
  });

  // t('acceso.noExiste') → Argument of type '"acceso.noExiste"' is not assignable
});
