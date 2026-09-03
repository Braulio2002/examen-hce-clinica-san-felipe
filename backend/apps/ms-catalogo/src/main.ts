import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { ExcepcionRpcFiltro } from '@hce/compartido';

import { CatalogoModule } from './catalogo.module';

/** Microservicio de Catalogo de insumos medicos (transporte TCP interno). */
async function bootstrap(): Promise<void> {
  const host = process.env.MS_CATALOGO_HOST ?? '0.0.0.0';
  const port = Number(process.env.MS_CATALOGO_PORT ?? 4002);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CatalogoModule, {
    transport: Transport.TCP,
    options: { host, port },
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ExcepcionRpcFiltro());

  await app.listen();
  new Logger('MsCatalogo').log(`Microservicio de catalogo escuchando en TCP ${host}:${port}`);
}

void bootstrap();
