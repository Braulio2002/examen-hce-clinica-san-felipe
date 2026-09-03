import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlService } from './mssql.service';

/**
 * Modulo de persistencia compartido por los microservicios.
 *
 * Se declara @Global porque el pool de conexiones es un recurso de proceso: un
 * unico pool por microservicio, no uno por modulo que lo necesite.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [MssqlService],
  exports: [MssqlService],
})
export class MssqlModule {}
