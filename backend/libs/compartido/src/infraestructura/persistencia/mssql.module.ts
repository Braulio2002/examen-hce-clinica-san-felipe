import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlService } from '../../adaptadores/persistencia/mssql.service';

/**
 * CAPA 4 · INFRAESTRUCTURA — Modulo de persistencia compartido.
 *
 * Solo declara como NestJS construye el adaptador `MssqlService`, que vive en la
 * capa 3. Esa separacion es la que permite que las pasarelas de los
 * microservicios usen el adaptador sin depender de la raiz de composicion.
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
