import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Response } from 'express';

import { CLIENTES_MICROSERVICIO, enviarMensaje, PATRONES_AUTH } from '@hce/compartido';

import { Publico } from '../seguridad/decoradores/publico.decorador';
import { UsuarioActual } from '../seguridad/decoradores/usuario-actual.decorador';
import { UsuarioAutenticado } from '../seguridad/estrategias/jwt.estrategia';
import { LoginDto, RespuestaLoginDto } from '../dto/login.dto';

interface ResultadoSesion {
  accessToken: string;
  expiraEnSegundos: number;
  usuario: { id: number; username: string; nombreCompleto: string; rol: string };
}

@ApiTags('Autenticacion')
@Controller('auth')
export class AuthControlador {
  constructor(
    @Inject(CLIENTES_MICROSERVICIO.AUTH) private readonly clienteAuth: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  /*
   * Rate limit especifico y mucho mas estricto que el global: el login es la
   * superficie natural de fuerza bruta y de rociado de contrasenas.
   */
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Inicia sesion y emite un JWT con vigencia de 30 minutos',
    description:
      'El token se devuelve en el cuerpo (para clientes tipo Postman) y ademas se ' +
      'establece como cookie HttpOnly, que es el mecanismo que usa el FrontEnd para ' +
      'mitigar el robo de token por XSS.',
  })
  @ApiOkResponse({ type: RespuestaLoginDto })
  @ApiUnauthorizedResponse({ description: 'Usuario o contrasena incorrectos' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos de acceso' })
  async login(
    @Body() credenciales: LoginDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaLoginDto> {
    const sesion = await enviarMensaje<ResultadoSesion>(
      this.clienteAuth,
      PATRONES_AUTH.INICIAR_SESION,
      credenciales,
    );

    respuesta.cookie(
      this.config.get<string>('JWT_COOKIE', 'hce_access_token'),
      sesion.accessToken,
      this.opcionesCookie(sesion.expiraEnSegundos),
    );

    return sesion;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierra la sesion eliminando la cookie de acceso' })
  logout(@Res({ passthrough: true }) respuesta: Response): { mensaje: string } {
    respuesta.clearCookie(
      this.config.get<string>('JWT_COOKIE', 'hce_access_token'),
      this.opcionesCookie(0),
    );
    return { mensaje: 'Sesion finalizada.' };
  }

  @Get('perfil')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Devuelve el perfil del usuario autenticado',
    description:
      'Se resuelve contra la base de datos y no contra el contenido del token, de modo ' +
      'que desactivar una cuenta surte efecto de inmediato.',
  })
  perfil(@UsuarioActual() usuario: UsuarioAutenticado) {
    return enviarMensaje(this.clienteAuth, PATRONES_AUTH.PERFIL, {
      username: usuario.username,
    });
  }

  /**
   * Opciones de la cookie de sesion.
   *   httpOnly : inaccesible desde JavaScript -> mitiga XSS.
   *   sameSite : 'lax' bloquea el envio en peticiones cross-site de terceros -> mitiga CSRF.
   *   secure   : solo HTTPS en produccion.
   *   maxAge   : alineado a la vigencia del token, para que no quede una cookie
   *              huerfana despues de que el JWT caduque.
   */
  private opcionesCookie(expiraEnSegundos: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SEGURA', 'false') === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge: expiraEnSegundos * 1000,
    };
  }
}
