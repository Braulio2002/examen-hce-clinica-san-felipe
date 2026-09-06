import { ROLES, type RolUsuario, Usuario } from './usuario.entidad';

/**
 * Pruebas de la entidad Usuario.
 *
 * Es dominio puro: no toca base de datos, ni NestJS, ni bcrypt. Se instancia con
 * `new` y se comprueba directamente. Que estas pruebas no necesiten un solo
 * doble es la mejor evidencia de que la capa esta bien aislada.
 *
 * Dos responsabilidades merecen prueba propia:
 *
 *   - `puedeOperarInventario`, que es la regla de autorizacion del negocio. Vive
 *     en el dominio, no en un guardia de NestJS, porque no depende de HTTP.
 *   - `aPerfilPublico`, que decide que sale de la entidad hacia el exterior. El
 *     hash de la contrasena no debe estar ahi, y eso se comprueba explicitamente.
 */
describe('Usuario', () => {
  const crear = (
    rol: RolUsuario = 'ADMIN',
    activo = true,
    hash = '$2a$10$hashDeEjemplo',
  ) => new Usuario(1, 'admin', 'Administrador del Sistema', rol, activo, hash);

  describe('puedeOperarInventario', () => {
    /*
     * La matriz de la prueba es la matriz de permisos del enunciado. Escrita asi
     * se lee de un vistazo y cualquier cambio en los roles obliga a tocarla, que
     * es exactamente lo que se quiere de una regla de autorizacion.
     */
    it.each([
      ['ADMIN', true, true],
      ['FARMACIA', true, true],
      ['CONSULTA', true, false],
    ] as const)('%s activo puede operar: %s -> %s', (rol, activo, esperado) => {
      expect(crear(rol, activo).puedeOperarInventario()).toBe(esperado);
    });

    /*
     * Un usuario dado de baja no opera aunque su rol lo permitiera. El orden
     * importa: primero se comprueba que este activo, y luego el rol. Si la
     * condicion se invirtiera, un ADMIN desactivado seguiria pudiendo vender.
     */
    it.each(['ADMIN', 'FARMACIA', 'CONSULTA'] as const)(
      '%s desactivado no puede operar, tenga el rol que tenga',
      (rol) => {
        expect(crear(rol, false).puedeOperarInventario()).toBe(false);
      },
    );
  });

  describe('aPerfilPublico', () => {
    it('expone los datos que necesita la interfaz', () => {
      expect(crear().aPerfilPublico()).toEqual({
        id: 1,
        username: 'admin',
        nombreCompleto: 'Administrador del Sistema',
        rol: 'ADMIN',
      });
    });

    /*
     * Esta es la prueba que justifica que el perfil publico exista como metodo en
     * lugar de devolver la entidad entera. Si alguien anade el hash al perfil
     * -por comodidad, o al hacer un `...this`- la prueba lo detiene antes de que
     * el hash llegue al navegador en la respuesta del login.
     */
    it('NO expone el hash de la contrasena', () => {
      const perfil = crear();

      expect(perfil.aPerfilPublico()).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(perfil.aPerfilPublico())).not.toContain('$2a$10$');
    });

    it('tampoco expone el estado activo, que es interno', () => {
      expect(crear().aPerfilPublico()).not.toHaveProperty('activo');
    });
  });

  describe('obtenerHash', () => {
    /*
     * El hash es privado y solo sale por este metodo explicito, que usa el caso
     * de uso para compararlo. Es deliberado: obliga a que quien lo lea lo haga a
     * proposito, en lugar de que aparezca por descuido al serializar la entidad.
     */
    it('devuelve el hash para poder verificar la contrasena', () => {
      expect(crear('ADMIN', true, '$2a$10$otroHash').obtenerHash()).toBe(
        '$2a$10$otroHash',
      );
    });
  });

  describe('ROLES', () => {
    it('enumera los tres roles del enunciado', () => {
      expect(ROLES).toEqual(['ADMIN', 'FARMACIA', 'CONSULTA']);
    });
  });
});
