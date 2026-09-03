import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { ExcepcionRpcFiltro } from '@hce/compartido';

import { InventarioModule } from './inventario.module';

/** Microservicio de Inventario: compras, ventas y Kardex (transporte TCP interno). */
async function bootstrap(): Promise<void> {
  const host = process.env.MS_INVENTARIO_HOST ?? '0.0.0.0';
  const port = Number(process.env.MS_INVENTARIO_PORT ?? 4003);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(InventarioModule, {
    transport: Transport.TCP,
    options: { host, port },
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ExcepcionRpcFiltro());

  await app.listen();
  new Logger('MsInventario').log(`Microservicio de inventario escuchando en TCP ${host}:${port}`);
}

void bootstrap();
