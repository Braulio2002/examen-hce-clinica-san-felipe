import { CatalogoFachada } from './catalogo.fachada';

/**
 * Pruebas del patron Facade del catalogo.
 *
 * Una fachada solo delega, asi que la tentacion es no probarla. Pero lo que
 * puede romperse aqui no es la logica: es el CABLEADO. Cinco metodos con firmas
 * casi identicas, y basta cruzar dos -que `obtener` llame al caso de uso de
 * eliminar- para que el sistema borre un producto cuando alguien pidio verlo.
 *
 * Un error asi no lo detecta el compilador, porque las firmas encajan. Por eso
 * cada prueba comprueba dos cosas: que se invoca EL caso de uso correcto, y que
 * los demas NO se invocan.
 */
describe('CatalogoFachada', () => {
  const dobles = () => ({
    registrar: { ejecutar: jest.fn().mockResolvedValue('r') },
    actualizar: { ejecutar: jest.fn().mockResolvedValue('a') },
    listar: { ejecutar: jest.fn().mockResolvedValue('l') },
    obtener: { ejecutar: jest.fn().mockResolvedValue('o') },
    eliminar: { ejecutar: jest.fn().mockResolvedValue('e') },
  });

  const construir = (d: ReturnType<typeof dobles>) =>
    new CatalogoFachada(d.registrar, d.actualizar, d.listar, d.obtener, d.eliminar);

  it('registrar delega en el caso de uso de alta', async () => {
    const d = dobles();
    const peticion = { nombreProducto: 'Paracetamol', nroLote: 'LT-1', costo: 1 };

    await expect(construir(d).registrar(peticion)).resolves.toBe('r');

    expect(d.registrar.ejecutar).toHaveBeenCalledWith(peticion);
    expect(d.eliminar.ejecutar).not.toHaveBeenCalled();
    expect(d.actualizar.ejecutar).not.toHaveBeenCalled();
  });

  it('actualizar delega en el caso de uso de modificacion', async () => {
    const d = dobles();
    const peticion = { idProducto: 1, costo: 2 };

    await expect(construir(d).actualizar(peticion)).resolves.toBe('a');

    expect(d.actualizar.ejecutar).toHaveBeenCalledWith(peticion);
    expect(d.registrar.ejecutar).not.toHaveBeenCalled();
  });

  it('listar delega en el caso de uso de listado', async () => {
    const d = dobles();
    const peticion = { pagina: 1, tamanoPagina: 20 };

    await expect(construir(d).listar(peticion)).resolves.toBe('l');

    expect(d.listar.ejecutar).toHaveBeenCalledWith(peticion);
  });

  it('obtener delega en consulta, NUNCA en eliminar', async () => {
    const d = dobles();

    await expect(construir(d).obtener({ idProducto: 9 })).resolves.toBe('o');

    expect(d.obtener.ejecutar).toHaveBeenCalledWith({ idProducto: 9 });
    // El cruce que esta prueba existe para impedir.
    expect(d.eliminar.ejecutar).not.toHaveBeenCalled();
  });

  it('eliminar delega en el caso de uso de baja', async () => {
    const d = dobles();

    await expect(construir(d).eliminar({ idProducto: 9 })).resolves.toBe('e');

    expect(d.eliminar.ejecutar).toHaveBeenCalledWith({ idProducto: 9 });
    expect(d.obtener.ejecutar).not.toHaveBeenCalled();
  });

  it('propaga el fallo del caso de uso sin envolverlo', async () => {
    const d = dobles();
    const fallo = new Error('la base no responde');
    d.listar.ejecutar.mockRejectedValue(fallo);

    // La fachada no debe traducir errores: quien decide como se presentan es la
    // capa de adaptadores, que conoce el transporte.
    await expect(construir(d).listar({})).rejects.toBe(fallo);
  });
});
