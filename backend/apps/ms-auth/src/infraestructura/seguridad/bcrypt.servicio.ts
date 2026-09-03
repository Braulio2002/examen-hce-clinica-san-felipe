import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { ServicioHash } from '../../dominio/puertos/usuario.repositorio';

/**
 * Adaptador de salida del puerto ServicioHash usando bcrypt.
 *
 * El factor de coste es configurable: 10 es el equilibrio habitual entre
 * resistencia a fuerza bruta y latencia de login. Subirlo encarece el ataque de
 * forma exponencial sin cambiar una linea del dominio.
 */
@Injectable()
export class BcryptServicio implements ServicioHash {
  private readonly rondas: number;

  constructor(config: ConfigService) {
    this.rondas = Number(config.get<string>('BCRYPT_RONDAS', '10'));
  }

  async verificar(passwordPlano: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(passwordPlano, hash);
    } catch {
      // Un hash con formato invalido no debe propagar una excepcion tecnica:
      // para el dominio es simplemente una verificacion fallida.
      return false;
    }
  }

  generar(passwordPlano: string): Promise<string> {
    return bcrypt.hash(passwordPlano, this.rondas);
  }
}
