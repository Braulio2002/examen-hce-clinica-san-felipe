import type { MssqlService } from '@hce/compartido';

import { ProductoMssqlPasarela } from './producto.mssql.pasarela';

/**
 * Pruebas de la pasarela de catalogo contra SQL Server.
 *
 * Se prueba con un doble del servicio de base, no contra SQL Server real. Lo que
 * interesa verificar aqui no es que la base funcione -eso lo cubren las pruebas
 * de extremo a extremo- sino tres cosas que solo se ven desde este lado:
 *
 *   1. Que se invoque EL procedimiento correcto. Un nombre cambiado convierte un
 *      alta en una baja, y el compilador no puede verlo porque es una cadena.
 *
 *   2. Que los valores viajen como PARAMETROS TIPADOS del driver. Es la defensa
 *      estructural contra inyeccion: mientras nada se concatene, no hay
 *      superficie. Por eso se comprueba la forma del parametro, no solo que la
 *      llamada ocurriera.
 *
 *   3. Que una respuesta vacia del procedimiento falle de forma ruidosa en lugar
 *      de devolver `undefined` y romper mucho mas tarde.
 */
describe('ProductoMssqlPasarela', () => {
  const filaProducto = {
    Id_producto: 1,
    Nombre_producto: 'Paracetamol 500 mg',
    NroLote: 'LT-2026-0001',
    Fec_registro: new Date('2026-09-01T08:00:00Z'),
    Costo: 0.49,
    PrecioVenta: 0.6615,
    Stock_actual: 680,
    Total_registros: 13,
  };

  /*
   * El doble expone los dos metodos que usa la pasarela. `consultar` devuelve
   * filas; `ejecutarProcedimiento` se usa cuando no hace falta el resultado,
   * como en la baja logica.
   */
  const baseDatos = (filas: unknown[] = [filaProducto]) => {
    const consultar = jest.fn().mockResolvedValue(filas);
    const ejecutarProcedimiento = jest.fn().mockResolvedValue({ conjuntos: [filas] });
    return {
      doble: { consultar, ejecutarProcedimiento } as unknown as MssqlService,
      consultar,
      ejecutarProcedimiento,
    };
  };

  /** Devuelve el parametro con ese nombre de la ultima llamada. */
  const parametro = (consultar: jest.Mock, nombre: string) => {
    const opciones = consultar.mock.calls[0]?.[1] as
      { parametros?: { nombre: string; valor: unknown; tipo: unknown }[] } | undefined;
    return opciones?.parametros?.find((p) => p.nombre === nombre);
  };

  describe('registrar', () => {
    it('llama al procedimiento de alta', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).registrar({
        nombreProducto: 'Paracetamol 500 mg',
        nroLote: 'LT-2026-0001',
        costo: 0.49,
      });

      expect(consultar).toHaveBeenCalledWith(
        'hce.usp_Producto_Registrar',
        expect.anything(),
      );
    });

    it('envia cada valor como parametro tipado, nunca concatenado', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).registrar({
        nombreProducto: "Robert'); DROP TABLE hce.Productos;--",
        nroLote: 'LT-1',
        costo: 1,
      });

      // El nombre hostil viaja como VALOR de un parametro tipado. Nunca se
      // interpola en el texto del procedimiento, asi que no hay inyeccion.
      const nombre = parametro(consultar, 'Nombre_producto');
      expect(nombre?.valor).toBe("Robert'); DROP TABLE hce.Productos;--");
      expect(nombre?.tipo).toBeDefined();
      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Producto_Registrar');
    });

    it('convierte a null el precio de venta cuando no se indica', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).registrar({
        nombreProducto: 'X',
        nroLote: 'LT-1',
        costo: 1,
      });

      // null y undefined no son lo mismo para el driver: undefined se omite y el
      // procedimiento recibiria un parametro de menos.
      expect(parametro(consultar, 'PrecioVenta')?.valor).toBeNull();
    });

    it('devuelve el producto mapeado al vocabulario de la aplicacion', async () => {
      const { doble } = baseDatos();

      await expect(
        new ProductoMssqlPasarela(doble).registrar({
          nombreProducto: 'X',
          nroLote: 'LT-1',
          costo: 1,
        }),
      ).resolves.toMatchObject({ idProducto: 1, nombreProducto: 'Paracetamol 500 mg' });
    });

    it('falla de forma ruidosa si el procedimiento no devuelve fila', async () => {
      const { doble } = baseDatos([]);

      await expect(
        new ProductoMssqlPasarela(doble).registrar({
          nombreProducto: 'X',
          nroLote: 'LT-1',
          costo: 1,
        }),
      ).rejects.toThrow(/no devolvio/i);
    });
  });

  describe('actualizar', () => {
    it('llama al procedimiento de modificacion', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).actualizar({ idProducto: 1, costo: 2 });

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Producto_Actualizar');
    });

    /*
     * La actualizacion es PARCIAL: cada campo omitido viaja como null para que el
     * procedimiento sepa que no debe tocarlo. Esta prueba recorre el otro lado de
     * esos `?? null`, con todos los campos presentes, y comprueba que cuando se
     * envian llegan con su valor y no convertidos en null.
     */
    it('envia cada campo con su valor cuando se indican todos', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).actualizar({
        idProducto: 1,
        nombreProducto: 'Paracetamol 650 mg',
        nroLote: 'LT-2026-0099',
        costo: 0.55,
        precioVenta: 0.74,
        usuarioApp: 'admin',
      });

      expect(parametro(consultar, 'Nombre_producto')?.valor).toBe('Paracetamol 650 mg');
      expect(parametro(consultar, 'NroLote')?.valor).toBe('LT-2026-0099');
      // Importes en coma flotante: se comparan con tolerancia.
      expect(parametro(consultar, 'Costo')?.valor).toBeCloseTo(0.55, 4);
      expect(parametro(consultar, 'PrecioVenta')?.valor).toBeCloseTo(0.74, 4);
      expect(parametro(consultar, 'UsuarioApp')?.valor).toBe('admin');
    });

    it('los campos omitidos viajan como null, para que el procedimiento los ignore', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).actualizar({ idProducto: 1, costo: 2 });

      expect(parametro(consultar, 'Nombre_producto')?.valor).toBeNull();
      expect(parametro(consultar, 'NroLote')?.valor).toBeNull();
      expect(parametro(consultar, 'PrecioVenta')?.valor).toBeNull();
      expect(parametro(consultar, 'UsuarioApp')?.valor).toBeNull();
    });

    it('tambien el costo se omite como null si no se cambia', async () => {
      const { doble, consultar } = baseDatos();

      // Cambiar solo el nombre es una operacion normal: el costo no debe
      // reescribirse con un cero por el hecho de no haberlo enviado.
      await new ProductoMssqlPasarela(doble).actualizar({
        idProducto: 1,
        nombreProducto: 'Paracetamol 650 mg',
      });

      expect(parametro(consultar, 'Costo')?.valor).toBeNull();
    });

    it('falla si el procedimiento no devuelve la fila afectada', async () => {
      const { doble } = baseDatos([]);

      await expect(
        new ProductoMssqlPasarela(doble).actualizar({ idProducto: 1, costo: 2 }),
      ).rejects.toThrow(/no devolvio/i);
    });
  });

  describe('listar', () => {
    it('llama al procedimiento de listado y arma la paginacion', async () => {
      const { doble, consultar } = baseDatos([filaProducto, filaProducto]);

      const resultado = await new ProductoMssqlPasarela(doble).listar({
        pagina: 1,
        tamanoPagina: 10,
      });

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Producto_Listar');
      expect(resultado.datos).toHaveLength(2);
      // El total sale de la columna repetida por COUNT(*) OVER ().
      expect(resultado.meta.totalRegistros).toBe(13);
      expect(resultado.meta.totalPaginas).toBe(2);
    });

    it('sin paginacion pide la primera pagina de 20', async () => {
      const { doble, consultar } = baseDatos();

      await new ProductoMssqlPasarela(doble).listar({});

      // Sin estos valores por defecto, el procedimiento recibiria null en el
      // OFFSET y devolveria el catalogo entero de una vez.
      expect(parametro(consultar, 'Pagina')?.valor).toBe(1);
      expect(parametro(consultar, 'TamanoPagina')?.valor).toBe(20);
    });

    it('devuelve un resultado vacio y coherente sin filas', async () => {
      const { doble } = baseDatos([]);

      const resultado = await new ProductoMssqlPasarela(doble).listar({
        pagina: 1,
        tamanoPagina: 10,
      });

      expect(resultado.datos).toEqual([]);
      expect(resultado.meta.totalRegistros).toBe(0);
    });
  });

  describe('obtener', () => {
    it('devuelve el producto cuando existe', async () => {
      const { doble, consultar } = baseDatos();

      await expect(new ProductoMssqlPasarela(doble).obtener(1)).resolves.toMatchObject({
        idProducto: 1,
      });
      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Producto_Obtener');
    });

    /*
     * Aqui NO se lanza: devolver null es correcto. Que un producto no exista es
     * una respuesta legitima de una consulta, y quien decide si eso es un 404 es
     * el caso de uso, no la pasarela.
     */
    it('devuelve null cuando no existe, en lugar de fallar', async () => {
      const { doble } = baseDatos([]);

      await expect(new ProductoMssqlPasarela(doble).obtener(999)).resolves.toBeNull();
    });
  });

  describe('eliminar', () => {
    it('llama al procedimiento de baja', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos();

      await new ProductoMssqlPasarela(doble).eliminar(1, 'admin');

      expect(ejecutarProcedimiento.mock.calls[0]?.[0]).toBe('hce.usp_Producto_Eliminar');
    });

    it('acepta la baja sin usuario y lo envia como null', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos();

      await new ProductoMssqlPasarela(doble).eliminar(1);

      expect(parametro(ejecutarProcedimiento, 'UsuarioApp')?.valor).toBeNull();
    });
  });
});
