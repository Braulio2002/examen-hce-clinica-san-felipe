import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CLIENTES_MICROSERVICIO, ExcepcionHttpFiltro } from '@hce/compartido';

import { AuthControlador } from '../../adaptadores/controladores/auth.controlador';
import { ComprasControlador } from '../../adaptadores/controladores/compras.controlador';
import { KardexControlador } from '../../adaptadores/controladores/kardex.controlador';
import { ProductosControlador } from '../../adaptadores/controladores/productos.controlador';
import { SaludControlador } from '../../adaptadores/controladores/salud.controlador';
import { VentasControlador } from '../../adaptadores/controladores/ventas.controlador';
import { JwtEstrategia } from '../../adaptadores/seguridad/estrategias/jwt.estrategia';
import { JwtAuthGuardia } from '../../adaptadores/seguridad/guardias/jwt-auth.guardia';
import { RolesGuardia } from '../../adaptadores/seguridad/guardias/roles.guardia';

/**
 * API GATEWAY
 * ===========
 * Unico punto de entrada del ecosistema. Centraliza:
 *
 *   - Enrutamiento hacia los tres microservicios (auth, catalogo, inventario).
 *   - Autenticacion JWT y autorizacion por rol.
 *   - Rate limiting.
 *   - CORS, Helmet y cabeceras de seguridad (configurados en main.ts).
 *   - Documentacion Swagger.
 *
 * Los microservicios no publican puertos hacia el exterior: solo son
 * alcanzables por TCP dentro de la red interna de Docker. Concentrar la
 * seguridad aqui evita que cada servicio reimplemente su propia validacion de
 * token, que es como aparecen las inconsistencias de autorizacion.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),

    /*
     * Rate limiting con dos politicas:
     *   - 'general': proteccion frente a saturacion del servicio.
     *   - 'login'  : mucho mas estricta, contra fuerza bruta de credenciales.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'general',
            ttl: Number(config.get<string>('RATE_LIMIT_VENTANA_SEGUNDOS', '60')) * 1000,
            limit: Number(config.get<string>('RATE_LIMIT_GENERAL', '100')),
          },
          {
            name: 'login',
            ttl: 60_000,
            limit: Number(config.get<string>('RATE_LIMIT_LOGIN', '5')),
          },
        ],
      }),
    }),

    ClientsModule.registerAsync([
      {
        name: CLIENTES_MICROSERVICIO.AUTH,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('MS_AUTH_HOST', 'localhost'),
            port: Number(config.get<string>('MS_AUTH_PORT', '4001')),
          },
        }),
      },
      {
        name: CLIENTES_MICROSERVICIO.CATALOGO,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('MS_CATALOGO_HOST', 'localhost'),
            port: Number(config.get<string>('MS_CATALOGO_PORT', '4002')),
          },
        }),
      },
      {
        name: CLIENTES_MICROSERVICIO.INVENTARIO,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('MS_INVENTARIO_HOST', 'localhost'),
            port: Number(config.get<string>('MS_INVENTARIO_PORT', '4003')),
          },
        }),
      },
    ]),
  ],
  controllers: [
    SaludControlador,
    AuthControlador,
    ProductosControlador,
    ComprasControlador,
    VentasControlador,
    KardexControlador,
  ],
  providers: [
    JwtEstrategia,

    /*
     * Guards globales. El orden de registro es el orden de ejecucion:
     *   1. Throttler : rechaza el exceso de peticiones antes de gastar CPU.
     *   2. JWT       : autentica; deniega salvo rutas marcadas con @Publico().
     *   3. Roles     : autoriza segun el rol del token.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuardia },
    { provide: APP_GUARD, useClass: RolesGuardia },

    { provide: APP_FILTER, useClass: ExcepcionHttpFiltro },
  ],
})
export class AppModule {}
