import type { RegistroPuerto } from '../../aplicacion/puertos/registro.puerto';

import { medirTiempo } from './cronometro';

/**
 * Pruebas de la medicion de duracion.
 *
 * Es lo que usan los decoradores de las pasarelas para instrumentar el acceso a
 * datos, y tiene tres responsabilidades que conviene separar: devolver el
 * resultado sin tocarlo, registrar la duracion, y distinguir una operacion lenta
 * de una normal.
 *
 * La tercera es la que importa en produccion. Una consulta que tarda dos
 * segundos no falla -devuelve su resultado- pero en una farmacia con cola es un
 * problema. Registrarla como aviso en lugar de como traza es lo que hace que
 * aparezca al revisar los registros.
 *
 * El caso del fallo merece atencion propia: la operacion debe medirse y
 * registrarse IGUAL, y el error debe propagarse sin envolver. Un cronometro que
 * se traga la excepcion convertiria un fallo de base de datos en un resultado
 * vacio.
 */
describe('medirTiempo', () => {
  const registro = (): jest.Mocked<RegistroPuerto> => ({
    depurar: jest.fn(),
    informar: jest.fn(),
    advertir: jest.fn(),
    error: jest.fn(),
  });

  it('devuelve el resultado de la operacion sin tocarlo', async () => {
    const resultado = { filas: [1, 2, 3] };

    await expect(
      medirTiempo(registro(), 'listar', () => Promise.resolve(resultado)),
    ).resolves.toBe(resultado);
  });

  it('registra la duracion como traza cuando es rapida', async () => {
    const r = registro();

    await medirTiempo(r, 'listarProductos', () => Promise.resolve('ok'));

    expect(r.depurar).toHaveBeenCalledTimes(1);
    expect(r.depurar.mock.calls[0]?.[0]).toContain('listarProductos');
    expect(r.advertir).not.toHaveBeenCalled();
  });

  it('incluye el tiempo en milisegundos en el mensaje', async () => {
    const r = registro();

    await medirTiempo(r, 'consulta', () => Promise.resolve('ok'));

    expect(r.depurar.mock.calls[0]?.[0]).toMatch(/\d{1,10}\.\d ms/);
  });

  it('avisa cuando la operacion supera el umbral', async () => {
    const r = registro();

    // Umbral de 0 ms: cualquier operacion lo supera. Asi la prueba no depende
    // de dormir el proceso, que la haria lenta y fragil.
    await medirTiempo(r, 'consultaPesada', () => Promise.resolve('ok'), 0);

    expect(r.advertir).toHaveBeenCalledTimes(1);
    expect(r.advertir.mock.calls[0]?.[0]).toContain('lenta');
    expect(r.depurar).not.toHaveBeenCalled();
  });

  describe('cuando la operacion falla', () => {
    it('propaga el error sin envolverlo', async () => {
      const fallo = new Error('la base no responde');

      await expect(
        medirTiempo(registro(), 'registrar', () => Promise.reject(fallo)),
      ).rejects.toBe(fallo);
    });

    it('registra igualmente la duracion y el motivo', async () => {
      const r = registro();

      await expect(
        medirTiempo(r, 'registrarVenta', () =>
          Promise.reject(new Error('stock insuficiente')),
        ),
      ).rejects.toThrow();

      expect(r.advertir).toHaveBeenCalledTimes(1);
      const mensaje = r.advertir.mock.calls[0]?.[0] ?? '';
      expect(mensaje).toContain('registrarVenta');
      expect(mensaje).toContain('stock insuficiente');
      expect(mensaje).toMatch(/\d{1,10}\.\d ms/);
    });

    it('describe el motivo aunque lo lanzado no sea un Error', async () => {
      const r = registro();

      // Codigo de terceros que lanza cadenas o numeros: el registro no debe
      // quedarse en "[object Object]".
      // La conversion es deliberada: se simula codigo de terceros que lanza
      // una cadena en lugar de un Error, que es justo lo que se quiere cubrir.
      const noEsUnError = 'cadena suelta' as unknown as Error;

      await expect(
        medirTiempo(r, 'consulta', () => Promise.reject(noEsUnError)),
      ).rejects.toBe('cadena suelta');

      expect(r.advertir.mock.calls[0]?.[0]).toContain('cadena suelta');
    });
  });
});
