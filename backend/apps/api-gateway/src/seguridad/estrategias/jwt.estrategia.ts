import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';

/** Contenido del token emitido por el microservicio de autenticacion. */
export interface PayloadJwt {
  readonly sub: number;
  readonly username: string;
  readonly nombre: string;
  readonly rol: 'ADMIN' | 'FARMACIA' | 'CONSULTA';
  readonly iat: number;
  readonly exp: number;
}

/** Usuario que queda disponible en request.user tras validar el token. */
export interface UsuarioAutenticado {
  readonly id: number;
  readonly username: string;
  readonly nombre: string;
  readonly rol: PayloadJwt['rol'];
  readonly expiraEn: Date;
}

@Injectable()
export class JwtEstrategia extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const nombreCookie = config.get<string>('JWT_COOKIE', 'hce_access_token');

    const opciones: StrategyOptionsWithoutRequest = {
      /*
       * Se acepta el token desde dos fuentes, en este orden:
       *
       *   1. Cookie HttpOnly: es el mecanismo que usa el FrontEnd. Al no ser
       *      accesible desde JavaScript, un XSS no puede robar el token, que es
       *      exactamente la mitigacion que pide el enunciado.
       *   2. Cabecera Authorization: Bearer: necesaria para probar la API con
       *      Postman o Insomnia, y para clientes que no manejan cookies.
       */
      jwtFromRequest: ExtractJwt.fromExtractors([
        (peticion: Request): string | null =>
          (peticion?.cookies as Record<string, string> | undefined)?.[nombreCookie] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      // Nunca se aceptan tokens expirados: la ventana de 30 minutos es estricta.
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.get<string>('JWT_ISSUER', 'hce-clinica-san-felipe'),
      audience: config.get<string>('JWT_AUDIENCE', 'hce-frontend'),
      algorithms: ['HS256'],
    };

    super(opciones);
  }

  validate(payload: PayloadJwt): UsuarioAutenticado {
    if (!payload?.sub || !payload.username) {
      throw new UnauthorizedException('El token no contiene un sujeto valido.');
    }

    return {
      id: payload.sub,
      username: payload.username,
      nombre: payload.nombre,
      rol: payload.rol,
      expiraEn: new Date(payload.exp * 1000),
    };
  }
}
