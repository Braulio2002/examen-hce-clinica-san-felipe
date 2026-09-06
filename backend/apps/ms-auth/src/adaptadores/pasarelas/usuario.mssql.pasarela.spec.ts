import type { MssqlService } from '@hce/compartido';

import { Usuario } from '../../dominio/entidades/usuario.entidad';

import { UsuarioMssqlPasarela } from './usuario.mssql.pasarela';

/**
 * Pruebas de la pasarela de usuarios contra SQL Server.
 *
 * Es la unica pasarela que devuelve una ENTIDAD de dominio y no un modelo plano,
 * porque el caso de uso de login necesita preguntarle al usuario si puede operar
 * y comparar su hash. Esa reconstruccion -de fila a entidad- es lo que se prueba
 * aqui, junto con el paso del nombre de usuario como parametro tipado.
 */
describe('UsuarioMssqlPasarela', () => {
  const fila = {
    Id_Usuario: 1,
    Username: 'admin',
    PasswordHash: '$2a$10$hashDeEjemplo',
    NombreCompleto: 'Administrador del Sistema',
    Rol: 'ADMIN' as const,
    Activo: true,
  };

  const baseDatos = (filas: unknown[] = [fila]) => {
    const consultar = jest.fn().mockResolvedValue(filas);
    return { doble: { consultar } as unknown as MssqlService, consultar };
  };

  it('consulta el procedimiento de busqueda por username', async () => {
    const { doble, consultar } = baseDatos();

    await new UsuarioMssqlPasarela(doble).buscarPorUsername('admin');

    expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Usuario_ObtenerPorUsername');
  });

  /*
   * El nombre de usuario llega directamente del formulario de login sin
   * autenticar: es la entrada mas expuesta de todo el sistema. Viaja como valor
   * de un parametro tipado, nunca concatenado en el texto de la consulta.
   */
  it('envia el username como parametro tipado, nunca concatenado', async () => {
    const { doble, consultar } = baseDatos([]);

    await new UsuarioMssqlPasarela(doble).buscarPorUsername("' OR 1=1--");

    const opciones = consultar.mock.calls[0]?.[1] as {
      parametros?: { nombre: string; valor: unknown; tipo: unknown }[];
    };
    const parametro = opciones.parametros?.find((p) => p.nombre === 'Username');
    expect(parametro?.valor).toBe("' OR 1=1--");
    expect(parametro?.tipo).toBeDefined();
  });

  it('reconstruye una entidad de dominio, no un objeto plano', async () => {
    const { doble } = baseDatos();

    const usuario = await new UsuarioMssqlPasarela(doble).buscarPorUsername('admin');

    // La comprobacion de la clase importa: el caso de uso llama a metodos de la
    // entidad. Un objeto plano con los mismos campos fallaria en tiempo de
    // ejecucion al invocar `puedeOperarInventario`.
    expect(usuario).toBeInstanceOf(Usuario);
    expect(usuario?.puedeOperarInventario()).toBe(true);
  });

  it('traduce cada columna a su lugar en la entidad', async () => {
    const { doble } = baseDatos();

    const usuario = await new UsuarioMssqlPasarela(doble).buscarPorUsername('admin');

    expect(usuario?.aPerfilPublico()).toEqual({
      id: 1,
      username: 'admin',
      nombreCompleto: 'Administrador del Sistema',
      rol: 'ADMIN',
    });
  });

  /*
   * El orden de los argumentos del constructor de `Usuario` es posicional:
   * nombre completo antes que rol. Si se cruzaran, el sistema tendria un usuario
   * cuyo rol es su nombre, y el compilador no lo veria porque ambos son
   * cadenas... salvo que `Rol` sea un tipo literal, como aqui. Esta prueba fija
   * el contrato de todas formas, por si el tipo se relaja.
   */
  it('no cruza el nombre completo con el rol', async () => {
    const { doble } = baseDatos([
      { ...fila, NombreCompleto: 'Nombre Real', Rol: 'FARMACIA' as const },
    ]);

    const usuario = await new UsuarioMssqlPasarela(doble).buscarPorUsername('f');

    expect(usuario?.nombreCompleto).toBe('Nombre Real');
    expect(usuario?.rol).toBe('FARMACIA');
  });

  it('conserva el hash para que el caso de uso pueda verificarlo', async () => {
    const { doble } = baseDatos();

    const usuario = await new UsuarioMssqlPasarela(doble).buscarPorUsername('admin');

    expect(usuario?.obtenerHash()).toBe('$2a$10$hashDeEjemplo');
  });

  it('conserva el estado desactivado', async () => {
    const { doble } = baseDatos([{ ...fila, Activo: false }]);

    const usuario = await new UsuarioMssqlPasarela(doble).buscarPorUsername('admin');

    expect(usuario?.puedeOperarInventario()).toBe(false);
  });

  /*
   * Devolver null y no lanzar es deliberado: que un usuario no exista es una
   * respuesta normal del login. Quien decide que eso es un 401 -y con el mismo
   * mensaje que una contrasena incorrecta, para no revelar que usuarios existen-
   * es el caso de uso.
   */
  it('devuelve null cuando el usuario no existe', async () => {
    const { doble } = baseDatos([]);

    await expect(
      new UsuarioMssqlPasarela(doble).buscarPorUsername('fantasma'),
    ).resolves.toBeNull();
  });
});
