import type { MssqlService } from '@hce/compartido';

import type {
  LineaCompra,
  LineaVenta,
} from '../../dominio/entidades/inventario.entidades';

import { InventarioMssqlPasarela } from './inventario.mssql.pasarela';

/**
 * Pruebas de la pasarela de inventario contra SQL Server.
 *
 * Esta pasarela es la pieza mas delicada del backend, porque es donde una compra
 * o una venta completa -cabecera, lineas, costo, movimiento de Kardex- se manda
 * a la base en una sola llamada usando Table-Valued Parameters.
 *
 * Lo que se comprueba con un doble del servicio de base:
 *
 *   1. Que el detalle viaje como TVP con el tipo de tabla correcto. Si el nombre
 *      del tipo esta mal, SQL Server rechaza la llamada entera; y si las columnas
 *      se envian en otro orden, el procedimiento las lee cruzadas y guarda una
 *      cantidad donde iba un precio. Ninguna de las dos cosas la ve el compilador.
 *
 *   2. Que la venta NO mande precio. El precio de venta lo fija el servidor desde
 *      el catalogo. Si el cliente pudiera enviarlo, podria comprar a su propio
 *      precio: es una regla de negocio y tambien de seguridad.
 *
 *   3. Que un documento inexistente devuelva null y no un objeto a medias.
 */
describe('InventarioMssqlPasarela', () => {
  const cabeceraCompra = {
    Id_CompraCab: 3,
    FecRegistro: new Date('2026-09-04T10:00:00Z'),
    SubTotal: 125,
    Igv: 22.5,
    Total: 147.5,
  };

  const cabeceraVenta = {
    Id_VentaCab: 7,
    fecRegistro: new Date('2026-09-04T11:00:00Z'),
    SubTotal: 3.3,
    Igv: 0.59,
    Total: 3.89,
  };

  const detalle = {
    Id_producto: 1,
    Nombre_producto: 'Paracetamol 500 mg',
    NroLote: 'LT-2026-0001',
    Cantidad: 5,
    Precio: 0.66,
    Sub_Total: 3.3,
    Igv: 0.59,
    Total: 3.89,
  };

  /**
   * Doble del servicio de base. `conjuntos` simula los multiples resultados que
   * devuelve un procedimiento (cabecera y detalle) y `filas` los de una consulta.
   */
  const baseDatos = (opciones: { conjuntos?: unknown[][]; filas?: unknown[] } = {}) => {
    const ejecutarProcedimiento = jest
      .fn()
      .mockResolvedValue({ conjuntos: opciones.conjuntos ?? [[], []] });
    const consultar = jest.fn().mockResolvedValue(opciones.filas ?? []);

    return {
      doble: { consultar, ejecutarProcedimiento } as unknown as MssqlService,
      consultar,
      ejecutarProcedimiento,
    };
  };

  interface OpcionesTvp {
    tablas?: {
      nombre: string;
      tipoTabla: string;
      columnas: { nombre: string }[];
      filas: unknown[][];
    }[];
    parametros?: { nombre: string; valor: unknown; tipo: unknown }[];
    salidas?: { nombre: string }[];
  }

  const opcionesDe = (espia: jest.Mock): OpcionesTvp =>
    (espia.mock.calls[0]?.[1] ?? {}) as OpcionesTvp;

  const parametro = (espia: jest.Mock, nombre: string) =>
    opcionesDe(espia).parametros?.find((p) => p.nombre === nombre);

  describe('registrarCompra', () => {
    const lineas: LineaCompra[] = [
      { idProducto: 1, cantidad: 5, precio: 0.49 },
      { idProducto: 2, cantidad: 10, precio: 1.2 },
    ];

    it('llama al procedimiento de compra', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      expect(ejecutarProcedimiento.mock.calls[0]?.[0]).toBe('hce.usp_Compra_Registrar');
    });

    it('manda el detalle como TVP con el tipo de tabla que espera el procedimiento', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      const tabla = opcionesDe(ejecutarProcedimiento).tablas?.[0];
      expect(tabla?.nombre).toBe('Detalle');
      expect(tabla?.tipoTabla).toBe('hce.TipoDetalleCompra');
    });

    /*
     * Un TVP se llena por POSICION, no por nombre. Si alguien reordena las
     * columnas y no las filas, el precio entra en la columna de cantidad y la
     * compra se registra con importes absurdos, sin que nada falle.
     */
    it('las filas del TVP siguen el orden de las columnas declaradas', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      const tabla = opcionesDe(ejecutarProcedimiento).tablas?.[0];
      expect(tabla?.columnas.map((c) => c.nombre)).toEqual([
        'Id_producto',
        'Cantidad',
        'Precio',
      ]);
      expect(tabla?.filas).toEqual([
        [1, 5, 0.49],
        [2, 10, 1.2],
      ]);
    });

    it('envia una fila por linea de la compra', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      // Una sola ida a la base con las dos lineas dentro, no una llamada por linea.
      expect(ejecutarProcedimiento).toHaveBeenCalledTimes(1);
      expect(opcionesDe(ejecutarProcedimiento).tablas?.[0]?.filas).toHaveLength(2);
    });

    it('pide de vuelta el identificador generado', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      expect(opcionesDe(ejecutarProcedimiento).salidas?.[0]?.nombre).toBe('Id_CompraCab');
    });

    it('propaga el usuario para la auditoria', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas, 'admin');

      expect(parametro(ejecutarProcedimiento, 'UsuarioApp')?.valor).toBe('admin');
    });

    it('manda null y no undefined cuando no hay usuario', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      // undefined haria que el driver omitiera el parametro por completo.
      expect(parametro(ejecutarProcedimiento, 'UsuarioApp')?.valor).toBeNull();
    });

    it('devuelve el documento con cabecera y detalle mapeados', async () => {
      const { doble } = baseDatos({ conjuntos: [[cabeceraCompra], [detalle]] });

      const documento = await new InventarioMssqlPasarela(doble).registrarCompra(lineas);

      expect(documento.idCompraCab).toBe(3);
      expect(documento.detalle).toHaveLength(1);
      expect(documento.detalle[0]?.nombreProducto).toBe('Paracetamol 500 mg');
    });
  });

  describe('registrarVenta', () => {
    const lineas: LineaVenta[] = [{ idProducto: 1, cantidad: 2 }];

    it('llama al procedimiento de venta con su propio tipo de tabla', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarVenta(lineas);

      expect(ejecutarProcedimiento.mock.calls[0]?.[0]).toBe('hce.usp_Venta_Registrar');
      expect(opcionesDe(ejecutarProcedimiento).tablas?.[0]?.tipoTabla).toBe(
        'hce.TipoDetalleVenta',
      );
    });

    /*
     * La venta manda dos columnas; la compra, tres. La diferencia no es un
     * descuido: en una venta el precio lo pone el servidor tomandolo del catalogo.
     * Si el cliente pudiera enviarlo, podria fijar el precio de su propia compra.
     */
    it('NO manda precio: lo fija el servidor desde el catalogo', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarVenta(lineas);

      const columnas = opcionesDe(ejecutarProcedimiento).tablas?.[0]?.columnas ?? [];
      expect(columnas.map((c) => c.nombre)).toEqual(['Id_producto', 'Cantidad']);
      expect(columnas.map((c) => c.nombre)).not.toContain('Precio');
    });

    it('las filas del TVP llevan solo producto y cantidad', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarVenta(lineas);

      expect(opcionesDe(ejecutarProcedimiento).tablas?.[0]?.filas).toEqual([[1, 2]]);
    });

    it('pide de vuelta el identificador de la venta', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarVenta(lineas);

      expect(opcionesDe(ejecutarProcedimiento).salidas?.[0]?.nombre).toBe('Id_VentaCab');
    });

    it('propaga el usuario para la auditoria', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await new InventarioMssqlPasarela(doble).registrarVenta(lineas, 'vendedor');

      expect(parametro(ejecutarProcedimiento, 'UsuarioApp')?.valor).toBe('vendedor');
    });

    it('devuelve el documento de venta mapeado', async () => {
      const { doble } = baseDatos({ conjuntos: [[cabeceraVenta], [detalle]] });

      const documento = await new InventarioMssqlPasarela(doble).registrarVenta(lineas);

      expect(documento.idVentaCab).toBe(7);
      // Importe en coma flotante: se compara con tolerancia, no por igualdad.
      expect(documento.total).toBeCloseTo(3.89, 2);
    });
  });

  describe('obtenerCompra / obtenerVenta', () => {
    it('devuelve la compra cuando existe', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraCompra], [detalle]],
      });

      await expect(
        new InventarioMssqlPasarela(doble).obtenerCompra(3),
      ).resolves.toMatchObject({ idCompraCab: 3 });
      expect(ejecutarProcedimiento.mock.calls[0]?.[0]).toBe('hce.usp_Compra_Obtener');
      expect(parametro(ejecutarProcedimiento, 'Id_CompraCab')?.valor).toBe(3);
    });

    /*
     * Aqui devolver null es lo correcto: que un documento no exista es una
     * respuesta valida de una consulta. Quien decide si eso merece un 404 es el
     * caso de uso, no la pasarela. Sin esta guarda, el mapeador recibiria una
     * lista vacia y lanzaria un error de infraestructura por un caso normal.
     */
    it('devuelve null si la compra no existe, en lugar de fallar', async () => {
      const { doble } = baseDatos({ conjuntos: [[], []] });

      await expect(new InventarioMssqlPasarela(doble).obtenerCompra(999)).resolves.toBe(
        null,
      );
    });

    it('devuelve la venta cuando existe', async () => {
      const { doble, ejecutarProcedimiento } = baseDatos({
        conjuntos: [[cabeceraVenta], [detalle]],
      });

      await expect(
        new InventarioMssqlPasarela(doble).obtenerVenta(7),
      ).resolves.toMatchObject({ idVentaCab: 7 });
      expect(ejecutarProcedimiento.mock.calls[0]?.[0]).toBe('hce.usp_Venta_Obtener');
    });

    it('devuelve null si la venta no existe', async () => {
      const { doble } = baseDatos({ conjuntos: [[], []] });

      await expect(new InventarioMssqlPasarela(doble).obtenerVenta(999)).resolves.toBe(
        null,
      );
    });
  });

  describe('listados por periodo', () => {
    const resumenCompra = { ...cabeceraCompra, Items: 2, Total_registros: 45 };
    const resumenVenta = { ...cabeceraVenta, Items: 1, Total_registros: 45 };

    it('listarCompras arma la paginacion a partir del total repetido en las filas', async () => {
      const { doble, consultar } = baseDatos({ filas: [resumenCompra] });

      const resultado = await new InventarioMssqlPasarela(doble).listarCompras({
        pagina: 2,
        tamanoPagina: 20,
      });

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Compra_Listar');
      expect(resultado.meta).toEqual({
        pagina: 2,
        tamanoPagina: 20,
        totalRegistros: 45,
        totalPaginas: 3,
      });
    });

    it('listarVentas usa su propio procedimiento', async () => {
      const { doble, consultar } = baseDatos({ filas: [resumenVenta] });

      const resultado = await new InventarioMssqlPasarela(doble).listarVentas({});

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Venta_Listar');
      expect(resultado.datos[0]?.idVentaCab).toBe(7);
    });

    it('aplica pagina 1 y 20 por defecto si no se piden', async () => {
      const { doble, consultar } = baseDatos({ filas: [resumenCompra] });

      await new InventarioMssqlPasarela(doble).listarCompras({});

      expect(parametro(consultar, 'Pagina')?.valor).toBe(1);
      expect(parametro(consultar, 'TamanoPagina')?.valor).toBe(20);
    });

    it('manda las fechas del periodo como parametros tipados', async () => {
      const { doble, consultar } = baseDatos({ filas: [resumenCompra] });

      await new InventarioMssqlPasarela(doble).listarCompras({
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });

      expect(parametro(consultar, 'FechaDesde')?.valor).toBe('2026-09-01');
      expect(parametro(consultar, 'FechaHasta')?.valor).toBe('2026-09-30');
    });

    it('convierte a null el periodo abierto', async () => {
      const { doble, consultar } = baseDatos({ filas: [] });

      await new InventarioMssqlPasarela(doble).listarVentas({});

      expect(parametro(consultar, 'FechaDesde')?.valor).toBeNull();
      expect(parametro(consultar, 'FechaHasta')?.valor).toBeNull();
    });

    it('devuelve un resultado vacio coherente cuando no hay documentos', async () => {
      const { doble } = baseDatos({ filas: [] });

      const resultado = await new InventarioMssqlPasarela(doble).listarCompras({});

      expect(resultado.datos).toEqual([]);
      expect(resultado.meta.totalRegistros).toBe(0);
      expect(resultado.meta.totalPaginas).toBe(0);
    });
  });

  describe('listarKardex', () => {
    const filaKardex = {
      Id_producto: 1,
      Nombre_producto: 'Paracetamol 500 mg',
      NroLote: 'LT-2026-0001',
      Stock_actual: 680,
      Costo: 0.49,
      Precio_venta: 0.66,
      Valorizado: 333.2,
      Total_registros: 13,
    };

    it('consulta el procedimiento del Kardex y pagina el resultado', async () => {
      const { doble, consultar } = baseDatos({ filas: [filaKardex] });

      const resultado = await new InventarioMssqlPasarela(doble).listarKardex({
        pagina: 1,
        tamanoPagina: 10,
      });

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Kardex_Listar');
      expect(resultado.datos[0]?.stockActual).toBe(680);
      expect(resultado.meta.totalRegistros).toBe(13);
    });

    it('manda el texto de busqueda como parametro tipado', async () => {
      const { doble, consultar } = baseDatos({ filas: [filaKardex] });

      // Texto hostil: viaja como VALOR de un parametro, nunca concatenado.
      await new InventarioMssqlPasarela(doble).listarKardex({
        buscar: "'; DROP TABLE hce.Kardex;--",
      });

      expect(parametro(consultar, 'Buscar')?.valor).toBe("'; DROP TABLE hce.Kardex;--");
    });

    it('manda null cuando no se busca nada', async () => {
      const { doble, consultar } = baseDatos({ filas: [] });

      await new InventarioMssqlPasarela(doble).listarKardex({});

      expect(parametro(consultar, 'Buscar')?.valor).toBeNull();
    });
  });

  describe('movimientosDeProducto', () => {
    const movimiento = {
      Id_MovimientoDet: 5,
      Fecha_registro: new Date('2026-09-03T09:00:00Z'),
      Tipo_movimiento: 'Entrada',
      Id_TipoMovimiento: 1,
      Documento_origen: 3,
      Cantidad: 50,
      Saldo: 730,
    };

    it('consulta los movimientos y los mapea', async () => {
      const { doble, consultar } = baseDatos({ filas: [movimiento] });

      const movimientos = await new InventarioMssqlPasarela(doble).movimientosDeProducto(
        1,
      );

      expect(consultar.mock.calls[0]?.[0]).toBe('hce.usp_Kardex_MovimientosPorProducto');
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]?.saldo).toBe(730);
    });

    it('acota por fechas cuando se indican', async () => {
      const { doble, consultar } = baseDatos({ filas: [] });

      await new InventarioMssqlPasarela(doble).movimientosDeProducto(
        1,
        '2026-09-01',
        '2026-09-30',
      );

      expect(parametro(consultar, 'Id_producto')?.valor).toBe(1);
      expect(parametro(consultar, 'FechaDesde')?.valor).toBe('2026-09-01');
      expect(parametro(consultar, 'FechaHasta')?.valor).toBe('2026-09-30');
    });

    it('consulta el historial completo si no se acotan fechas', async () => {
      const { doble, consultar } = baseDatos({ filas: [] });

      await new InventarioMssqlPasarela(doble).movimientosDeProducto(1);

      expect(parametro(consultar, 'FechaDesde')?.valor).toBeNull();
      expect(parametro(consultar, 'FechaHasta')?.valor).toBeNull();
    });

    it('devuelve una lista vacia si el producto no tiene movimientos', async () => {
      const { doble } = baseDatos({ filas: [] });

      await expect(
        new InventarioMssqlPasarela(doble).movimientosDeProducto(99),
      ).resolves.toEqual([]);
    });
  });
});
