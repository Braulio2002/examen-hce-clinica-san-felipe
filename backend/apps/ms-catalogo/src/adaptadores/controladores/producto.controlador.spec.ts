import type { CatalogoFachada } from '../../aplicacion/fachadas/catalogo.fachada';

import { ProductoControlador } from './producto.controlador';

/**
 * Pruebas del controlador RPC de catalogo.
 *
 * Un controlador que solo delega parece no merecer prueba, pero aqui hay dos
 * cosas que si pueden romperse y que el compilador no ve.
 *
 * La primera es el cruce de metodos: cinco firmas casi identicas, y basta que
 * `obtener` llame a `eliminar` para que consultar un producto lo dé de baja.
 *
 * La segunda es que el controlador NO debe transformar nada. Si empezara a
 * validar, a traducir errores o a componer respuestas, la logica se estaria
 * escapando de la capa de aplicacion hacia el adaptador, que es justo lo que la
 * arquitectura evita. Por eso se comprueba que el payload llega intacto y que la
 * respuesta se devuelve tal cual.
 */
describe('ProductoControlador', () => {
  const fachada = () => ({
    registrar: jest.fn().mockResolvedValue({ idProducto: 1 }),
    actualizar: jest.fn().mockResolvedValue({ idProducto: 1 }),
    listar: jest.fn().mockResolvedValue({ datos: [], meta: {} }),
    obtener: jest.fn().mockResolvedValue({ idProducto: 1 }),
    eliminar: jest.fn().mockResolvedValue({ idProducto: 1, activo: false }),
  });

  /*
   * El controlador declara la clase concreta de la fachada, no una interfaz, y
   * esa clase tiene campos privados que un doble no puede reproducir. Se
   * convierte de forma explicita en un solo lugar en vez de repetirlo en cada
   * prueba.
   *
   * Es tambien una observacion de diseno: si el controlador dependiera de un
   * puerto de entrada en vez de la clase, el doble encajaria sin conversion.
   * Aqui el acoplamiento es aceptable -la fachada vive en la capa de
   * aplicacion, hacia adentro- pero merece quedar anotado.
   */
  const controlador = (f: ReturnType<typeof fachada>): ProductoControlador =>
    new ProductoControlador(f as unknown as CatalogoFachada);

  it('registrar pasa el payload intacto a la fachada', async () => {
    const f = fachada();
    const peticion = { nombreProducto: 'Ketorolaco', nroLote: 'LT-9', costo: 2.5 };

    await controlador(f).registrar(peticion);

    expect(f.registrar).toHaveBeenCalledWith(peticion);
    expect(f.registrar).toHaveBeenCalledTimes(1);
  });

  it('actualizar delega sin tocar la peticion', async () => {
    const f = fachada();
    const peticion = { idProducto: 3, costo: 9.9 };

    await controlador(f).actualizar(peticion);

    expect(f.actualizar).toHaveBeenCalledWith(peticion);
    expect(f.registrar).not.toHaveBeenCalled();
  });

  it('listar delega la consulta de paginacion', async () => {
    const f = fachada();
    const consulta = { pagina: 2, tamanoPagina: 10, buscar: 'para' };

    await controlador(f).listar(consulta);

    expect(f.listar).toHaveBeenCalledWith(consulta);
  });

  it('obtener consulta, y NUNCA elimina', async () => {
    const f = fachada();

    await controlador(f).obtener({ idProducto: 4 });

    expect(f.obtener).toHaveBeenCalledWith({ idProducto: 4 });
    expect(f.eliminar).not.toHaveBeenCalled();
  });

  it('eliminar delega la baja', async () => {
    const f = fachada();

    await controlador(f).eliminar({ idProducto: 4 });

    expect(f.eliminar).toHaveBeenCalledWith({ idProducto: 4 });
    expect(f.obtener).not.toHaveBeenCalled();
  });

  it('devuelve la respuesta de la fachada sin transformarla', async () => {
    const f = fachada();
    const respuesta = { idProducto: 1, nombreProducto: 'X', stockActual: 5 };
    f.obtener.mockResolvedValue(respuesta);

    await expect(controlador(f).obtener({ idProducto: 1 })).resolves.toBe(respuesta);
  });

  it('deja pasar el error de dominio sin envolverlo', async () => {
    const f = fachada();
    const fallo = new Error('Producto no encontrado.');
    f.obtener.mockRejectedValue(fallo);

    /*
     * Envolver el error aqui romperia la traduccion a codigo HTTP: el filtro de
     * excepciones necesita recibir la excepcion de dominio original para
     * distinguir un 404 de un 500.
     */
    await expect(controlador(f).obtener({ idProducto: 99 })).rejects.toBe(fallo);
  });
});
