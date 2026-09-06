import type { JwtService } from '@nestjs/jwt';

import { JwtNestAdaptador } from './jwt-nest.adaptador';

/**
 * Pruebas del adaptador de emision de token.
 *
 * Este adaptador es la frontera entre el vocabulario de la aplicacion
 * -`idUsuario`, `nombreCompleto`- y el vocabulario de JWT, donde las claves son
 * `sub`, `username`, `nombre`, `rol`. La traduccion es su unica responsabilidad,
 * y es exactamente donde puede romperse sin que el compilador se entere: la
 * carga del token es un objeto libre.
 *
 * Un `sub` mal escrito rompe el guardia del gateway y el usuario queda
 * autenticado pero sin identidad. Por eso se comprueba la carga completa con
 * `toEqual` y no solo un par de campos.
 */
describe('JwtNestAdaptador', () => {
  const contenido = {
    idUsuario: 1,
    username: 'admin',
    nombreCompleto: 'Administrador del Sistema',
    rol: 'ADMIN' as const,
  };

  const servicioJwt = (token = 'token.de.ejemplo') => {
    const signAsync = jest.fn().mockResolvedValue(token);
    return { doble: { signAsync } as unknown as JwtService, signAsync };
  };

  it('traduce el contenido al vocabulario estandar de JWT', async () => {
    const { doble, signAsync } = servicioJwt();

    await new JwtNestAdaptador(doble, 3600).emitir(contenido);

    expect(signAsync.mock.calls[0]?.[0]).toEqual({
      sub: 1,
      username: 'admin',
      nombre: 'Administrador del Sistema',
      rol: 'ADMIN',
    });
  });

  /*
   * `sub` es el sujeto del token segun el RFC 7519, y es el campo que lee el
   * guardia del gateway para saber quien hace la peticion. Merece su propia
   * comprobacion porque es el unico cuyo nombre no se parece al del dominio.
   */
  it('el identificador del usuario viaja en la reclamacion sub', async () => {
    const { doble, signAsync } = servicioJwt();

    await new JwtNestAdaptador(doble, 3600).emitir({ ...contenido, idUsuario: 42 });

    expect(signAsync.mock.calls[0]?.[0]).toMatchObject({ sub: 42 });
  });

  it('firma el token con la caducidad configurada', async () => {
    const { doble, signAsync } = servicioJwt();

    await new JwtNestAdaptador(doble, 7200).emitir(contenido);

    expect(signAsync.mock.calls[0]?.[1]).toEqual({ expiresIn: 7200 });
  });

  it('devuelve el token y su caducidad para que el cliente sepa cuando renovar', async () => {
    const { doble } = servicioJwt('eyJhbGciOiJIUzI1NiJ9.carga.firma');

    await expect(new JwtNestAdaptador(doble, 3600).emitir(contenido)).resolves.toEqual({
      token: 'eyJhbGciOiJIUzI1NiJ9.carga.firma',
      expiraEnSegundos: 3600,
    });
  });

  /*
   * El token no lleva nada que no haga falta para autorizar. Meter la
   * contrasena, el hash o datos personales en la carga seria un error clasico:
   * un JWT va firmado, pero NO cifrado, y cualquiera con el token puede leer su
   * contenido descodificando base64.
   */
  it('la carga del token no lleva mas de lo necesario', async () => {
    const { doble, signAsync } = servicioJwt();

    await new JwtNestAdaptador(doble, 3600).emitir(contenido);

    const carga = signAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(carga).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'nombre',
      'rol',
      'sub',
      'username',
    ]);
  });

  it('propaga el fallo si la firma no se puede realizar', async () => {
    const signAsync = jest.fn().mockRejectedValue(new Error('clave no configurada'));
    const doble = { signAsync } as unknown as JwtService;

    // Un fallo al firmar es un problema de configuracion del servidor. Debe
    // subir, no convertirse en un token vacio.
    await expect(new JwtNestAdaptador(doble, 3600).emitir(contenido)).rejects.toThrow(
      'clave no configurada',
    );
  });
});
