import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { cargarConfiguracion } from './configuracion/configuracion';

async function bootstrap(): Promise<void> {
  const logger = new Logger('ApiGateway');
  const cfg = cargarConfiguracion();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El body queda limitado mas abajo; aqui se desactiva el parser por defecto
    // solo para poder fijar el limite de forma explicita.
    bodyParser: true,
  });

  /* -------------------------------------------------------------------------
     1. CABECERAS DE SEGURIDAD (Helmet)
     Cubre el requisito de "Cabeceras de Seguridad" del enunciado.
     ------------------------------------------------------------------------- */
  app.use(
    helmet({
      // X-Content-Type-Options: nosniff -> impide que el navegador adivine el
      // tipo MIME y ejecute como script una respuesta que no lo es.
      noSniff: true,
      // Evita el encuadre de la aplicacion en un iframe ajeno (clickjacking).
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      // HSTS solo tiene sentido sobre HTTPS.
      hsts: cfg.entorno === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      /*
       * La CSP por defecto de Helmet rompe la interfaz de Swagger, que usa
       * estilos y scripts en linea. Se declara una politica explicita en lugar
       * de desactivarla: 'unsafe-inline' queda acotado a estilos, nunca a
       * scripts de origen externo.
       */
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", ...cfg.origenesPermitidos],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
    }),
  );

  // Cabecera explicita, ademas de la que fija Helmet, por ser un requisito
  // literal del enunciado.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  /* -------------------------------------------------------------------------
     2. CORS RESTRINGIDO
     Solo el FrontEnd declarado puede consumir la API, con credenciales
     habilitadas para que viaje la cookie HttpOnly.
     ------------------------------------------------------------------------- */
  app.enableCors({
    origin: cfg.origenesPermitidos,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 600,
  });

  /* -------------------------------------------------------------------------
     3. PARSEO Y VALIDACION
     ------------------------------------------------------------------------- */
  app.use(cookieParser());
  app.setGlobalPrefix(cfg.prefijoApi);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // Elimina propiedades no declaradas en el DTO...
      whitelist: true,
      // ...y rechaza la peticion si alguien las envia: evita el "mass assignment".
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // En produccion no se devuelven los valores recibidos en los errores de
      // validacion, para no reflejar datos potencialmente sensibles.
      disableErrorMessages: false,
      validationError: { target: false, value: false },
    }),
  );

  /* -------------------------------------------------------------------------
     4. DOCUMENTACION SWAGGER
     ------------------------------------------------------------------------- */
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API HCE - Gestion de Insumos Medicos')
      .setDescription(
        'API Gateway del ecosistema de microservicios para el control de medicamentos e ' +
          'insumos en atenciones medicas.\n\n' +
          '**Autenticacion**: JWT con vigencia estricta de 30 minutos. El token se entrega ' +
          'en una cookie HttpOnly y tambien en el cuerpo de la respuesta de login para poder ' +
          'probar la API desde Postman o Insomnia.\n\n' +
          '**Usuarios de demostracion**: `admin / Admin123$`, `farmacia / Farmacia123$`, ' +
          '`consulta / Consulta123$`.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addCookieAuth(cfg.jwt.nombreCookie)
      .addTag('Autenticacion', 'Inicio y cierre de sesion')
      .addTag('Productos', 'Catalogo de medicamentos e insumos')
      .addTag('Compras', 'Ingreso de insumos al almacen')
      .addTag('Ventas', 'Despacho de insumos en la atencion medica')
      .addTag('Kardex', 'Existencias y movimientos por producto')
      .addTag('Operacion', 'Disponibilidad del servicio')
      .build(),
  );

  SwaggerModule.setup(`${cfg.prefijoApi}/docs`, app, documento, {
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
    customSiteTitle: 'API HCE - Insumos Medicos',
  });

  /* -------------------------------------------------------------------------
     5. ARRANQUE
     ------------------------------------------------------------------------- */
  app.enableShutdownHooks();

  await app.listen(cfg.puerto, '0.0.0.0');

  logger.log(`API Gateway escuchando en http://localhost:${cfg.puerto}/${cfg.prefijoApi}`);
  logger.log(`Documentacion Swagger en http://localhost:${cfg.puerto}/${cfg.prefijoApi}/docs`);
  logger.log(`Origenes CORS permitidos: ${cfg.origenesPermitidos.join(', ')}`);
  logger.log(`Vigencia del JWT: ${cfg.jwt.expiracionSegundos} segundos`);
}

void bootstrap();
