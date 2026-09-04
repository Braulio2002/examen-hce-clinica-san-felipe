import * as bcrypt from 'bcryptjs';

import type { ServicioHashPuerto } from '../../aplicacion/puertos/salida/servicio-hash.puerto';

/**
 * CAPA 3 · ADAPTADORES — Implementación del puerto de hashing con bcrypt.
 *
 * El factor de coste es un parámetro del constructor y no una lectura de
 * ConfigService: así el adaptador tampoco depende del framework, y la
 * infraestructura decide el valor al construirlo.
 *
 * Coste 10 es el equilibrio habitual entre resistencia a fuerza bruta y
 * latencia de login. Subirlo encarece el ataque de forma exponencial sin
 * cambiar una línea de la capa de aplicación.
 */
export class BcryptAdaptador implements ServicioHashPuerto {
  constructor(private readonly rondas = 10) {}

  async verificar(passwordPlano: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(passwordPlano, hash);
    } catch {
      // Un hash con formato inválido no debe propagar una excepción técnica:
      // para la aplicación es simplemente una verificación fallida.
      return false;
    }
  }

  generar(passwordPlano: string): Promise<string> {
    return bcrypt.hash(passwordPlano, this.rondas);
  }
}
