import { Logger } from '@nestjs/common';

import type { RegistroPuerto } from '../../aplicacion/puertos/registro.puerto';

import { obtenerCorrelacion } from './contexto-correlacion';

/**
 * CAPA 3 · ADAPTADORES — Implementación del puerto de registro con NestJS.
 *
 * Traduce el vocabulario del dominio (informar, advertir, depurar) al Logger
 * del framework. Es el único punto del sistema donde la capa de aplicación
 * queda conectada a NestJS para registrar eventos, y esa conexión ocurre por
 * inversión de dependencias: la aplicación define el contrato, el adaptador lo
 * satisface.
 *
 * Cada linea lleva delante el identificador de correlacion de la peticion en
 * curso, de modo que filtrar por el en los registros de los cuatro servicios
 * reconstruye una operacion completa. El identificador se recupera del contexto
 * asincrono: la capa de aplicacion no lo conoce ni lo transporta.
 */
export class RegistroNest implements RegistroPuerto {
  private readonly logger: Logger;

  constructor(contexto: string) {
    this.logger = new Logger(contexto);
  }

  /**
   * Antepone el identificador de correlacion cuando existe.
   *
   * Fuera de una peticion -arranque del proceso, tareas de fondo- no hay
   * identificador y la linea sale sin prefijo. Registrar sin traza es preferible
   * a no registrar.
   */
  private conTraza(mensaje: string): string {
    const identificador = obtenerCorrelacion();
    return identificador === undefined ? mensaje : `[${identificador}] ${mensaje}`;
  }

  depurar(mensaje: string): void {
    this.logger.debug(this.conTraza(mensaje));
  }

  informar(mensaje: string): void {
    this.logger.log(this.conTraza(mensaje));
  }

  advertir(mensaje: string): void {
    this.logger.warn(this.conTraza(mensaje));
  }

  error(mensaje: string, detalle?: string): void {
    this.logger.error(this.conTraza(mensaje), detalle);
  }
}
