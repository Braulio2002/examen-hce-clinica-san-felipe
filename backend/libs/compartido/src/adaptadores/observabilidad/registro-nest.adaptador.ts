import { Logger } from '@nestjs/common';

import type { RegistroPuerto } from '../../aplicacion/puertos/registro.puerto';

/**
 * CAPA 3 · ADAPTADORES — Implementación del puerto de registro con NestJS.
 *
 * Traduce el vocabulario del dominio (informar, advertir, depurar) al Logger
 * del framework. Es el único punto del sistema donde la capa de aplicación
 * queda conectada a NestJS para registrar eventos, y esa conexión ocurre por
 * inversión de dependencias: la aplicación define el contrato, el adaptador lo
 * satisface.
 */
export class RegistroNest implements RegistroPuerto {
  private readonly logger: Logger;

  constructor(contexto: string) {
    this.logger = new Logger(contexto);
  }

  depurar(mensaje: string): void {
    this.logger.debug(mensaje);
  }

  informar(mensaje: string): void {
    this.logger.log(mensaje);
  }

  advertir(mensaje: string): void {
    this.logger.warn(mensaje);
  }

  error(mensaje: string, detalle?: string): void {
    this.logger.error(mensaje, detalle);
  }
}
