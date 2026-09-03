import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Publico } from '../seguridad/decoradores/publico.decorador';

/**
 * Endpoint de salud del API Gateway.
 *
 * Lo consumen el healthcheck de Docker y cualquier balanceador que necesite
 * saber si la instancia esta lista para recibir trafico.
 */
@ApiTags('Operacion')
@Controller('salud')
export class SaludControlador {
  private readonly iniciadoEn = Date.now();

  @Publico()
  @Get()
  @ApiOperation({ summary: 'Verificacion de disponibilidad del API Gateway' })
  estado() {
    return {
      estado: 'operativo',
      servicio: 'api-gateway',
      version: process.env.npm_package_version ?? '1.0.0',
      tiempoActivoSegundos: Math.floor((Date.now() - this.iniciadoEn) / 1000),
      marcaTiempo: new Date().toISOString(),
    };
  }
}
