import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';

import { ExcepcionRpcFiltro } from '@hce/compartido';

import { AuthModule } from './nestjs/auth.module';

/**
 * CAPA 4 · INFRAESTRUCTURA — Punto de entrada del proceso.
 *
 * Microservicio de Autenticacion.
 *
 * Se expone solo por transporte TCP dentro de la red interna de Docker: no
 * publica ningun puerto HTTP al exterior. El unico componente accesible desde
 * fuera es el API Gateway, que centraliza enrutamiento y seguridad.
 */
async function bootstrap(): Promise<void> {
  const host = process.env.MS_AUTH_HOST ?? '0.0.0.0';
  const port = Number(process.env.MS_AUTH_PORT ?? 4001);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: { host, port },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ExcepcionRpcFiltro());

  await app.listen();
  new Logger('MsAuth').log(
    `Microservicio de autenticacion escuchando en TCP ${host}:${port}`,
  );
}

void bootstrap();
