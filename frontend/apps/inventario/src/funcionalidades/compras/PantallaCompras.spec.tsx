import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';
import type * as PaqueteUi from '@hce/ui';

const dobles = vi.hoisted(() => ({
  listarProductos: vi.fn(),
  registrarProducto: vi.fn(),
  registrarCompra: vi.fn(),
  puedeOperar: true,
}));

vi.mock('@/compartido/api', () => ({
  apiHce: {
    productos: { listar: dobles.listarProductos, registrar: dobles.registrarProducto },
    compras: { registrar: dobles.registrarCompra },
  },
}));

/*
 * Del paquete de interfaz solo se sustituyen las dos piezas que necesitan la
 * aplicacion Next completa: el marco -que arrastra navegacion y enrutador- y el
 * contexto de sesion. Todo lo demas -selector, tablas, modal, alertas- se usa de
 * verdad, porque es justo la integracion entre esas piezas lo que interesa
 * comprobar en una pantalla.
 */
vi.mock('@hce/ui', async (importarOriginal) => {
  const original = await importarOriginal<typeof PaqueteUi>();
  return {
    ...original,
    MarcoAplicacion: ({
      titulo,
      children,
    }: {
      titulo: string;
      children: React.ReactNode;
    }) => (
      <div>
        <h1>{titulo}</h1>
        {children}
      </div>
    ),
    useSesion: () => ({
      usuario: {
        id: 1,
        username: 'farmacia',
        nombreCompleto: 'Farmacia',
        rol: 'FARMACIA',
      },
      cargando: false,
      puedeOperar: dobles.puedeOperar,
      iniciarSesion: vi.fn(),
      cerrarSesion: vi.fn(),
    }),
  };
});

const { PantallaCompras } = await import('./PantallaCompras');

/**
 * Pruebas de la pantalla de registro de compras.
 *
 * Es la operacion mas compleja del sistema y la que mas efectos tiene: una
 * compra crea la cabecera, su detalle, actualiza el costo y el precio de venta
 * del producto y genera el movimiento de Entrada del Kardex.
 *
 * De todo eso, la pantalla solo es responsable de tres cosas, y son las que se
 * prueban aqui:
 *
 *   1. Que un usuario sin permiso NO vea el formulario. Es cortesia, no
 *      seguridad -el servidor decide igualmente-, pero evita que alguien
 *      rellene una compra entera para recibir un 403 al final.
 *
 *   2. Que no se pueda enviar un documento invalido. Validar antes de llamar
 *      ahorra un viaje y da respuesta inmediata.
 *
 *   3. Que tras registrar se VACIE el detalle y se RECARGUE el catalogo. Lo
 *      segundo es facil de olvidar y tiene consecuencias: la compra acaba de
 *      cambiar el costo y el precio de venta, asi que dejar el catalogo viejo
 *      haria que la siguiente compra partiera de un precio obsoleto.
 */
describe('PantallaCompras', () => {
  const PRODUCTO = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    costo: 0.49,
    precioVenta: 0.66,
    stockActual: 680,
    fechaRegistro: '2026-09-01T08:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.puedeOperar = true;
    dobles.listarProductos.mockResolvedValue({
      datos: [PRODUCTO],
      meta: { pagina: 1, tamanoPagina: 200, totalRegistros: 1, totalPaginas: 1 },
    });
    dobles.registrarCompra.mockResolvedValue({
      idCompraCab: 3,
      total: 147.5,
      detalle: [],
    });
  });

  /**
   * Selecciona el producto en el buscador.
   *
   * La opcion se busca dentro del desplegable y no en toda la pantalla: una vez
   * agregado, el nombre del producto aparece tambien en la fila del detalle, y
   * una consulta global encontraria las dos.
   */
  const agregarProducto = async () => {
    const buscador = await screen.findByLabelText('Agregar producto');
    await userEvent.clear(buscador);
    await userEvent.type(buscador, 'Paracetamol');

    const listado = await screen.findByRole('listbox');
    await userEvent.click(within(listado).getByText(/Paracetamol 500 mg/));
  };

  describe('permisos', () => {
    /*
     * La misma regla que aplica el guardia de roles del BackEnd, repetida en la
     * interfaz. No sustituye a la del servidor: sirve para no dejar que alguien
     * rellene una compra de quince lineas y descubra al pulsar "Registrar" que
     * no tiene permiso.
     */
    it('un rol sin permiso no ve el formulario', () => {
      dobles.puedeOperar = false;

      render(<PantallaCompras />);

      expect(screen.getByText(/Acceso restringido/)).toBeVisible();
      expect(screen.queryByLabelText('Agregar producto')).not.toBeInTheDocument();
    });

    it('el aviso explica que hacer', () => {
      dobles.puedeOperar = false;

      render(<PantallaCompras />);

      expect(screen.getByText(/Solicite acceso al administrador/)).toBeVisible();
    });

    it('con permiso si ve el formulario', async () => {
      render(<PantallaCompras />);

      expect(await screen.findByLabelText('Agregar producto')).toBeVisible();
    });
  });

  describe('catalogo', () => {
    it('se carga al entrar', async () => {
      render(<PantallaCompras />);

      await waitFor(() => {
        expect(dobles.listarProductos).toHaveBeenCalled();
      });
    });

    it('un fallo al cargarlo se muestra', async () => {
      dobles.listarProductos.mockRejectedValue(
        new ErrorApi('SIN_CONEXION', 'No se pudo contactar con el servidor.', 0),
      );
      render(<PantallaCompras />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo contactar/);
    });
  });

  describe('detalle de la compra', () => {
    it('agregar un producto crea su linea', async () => {
      render(<PantallaCompras />);

      await agregarProducto();

      expect(await screen.findByRole('table')).toBeVisible();
    });

    /*
     * La cantidad arranca en 1 y el costo con el ultimo conocido del producto.
     * Es lo que convierte el registro de una compra rutinaria en dos clics en
     * lugar de dos clics y dos campos.
     */
    it('la linea llega con cantidad 1 y el ultimo costo conocido', async () => {
      render(<PantallaCompras />);

      await agregarProducto();

      const tabla = await screen.findByRole('table');
      expect(within(tabla).getByDisplayValue('1')).toBeVisible();
      expect(within(tabla).getByDisplayValue('0.49')).toBeVisible();
    });

    it('avisa si se intenta agregar dos veces el mismo producto', async () => {
      render(<PantallaCompras />);
      await agregarProducto();

      await agregarProducto();

      expect(await screen.findByRole('alert')).toHaveTextContent(/ya esta en el detalle/);
    });
  });

  describe('validacion antes de enviar', () => {
    /*
     * Sin lineas no existe siquiera el boton de registrar: la pantalla muestra
     * el estado vacio en su lugar. Impedirlo por estructura es mejor que
     * validarlo al pulsar -no hay forma de equivocarse-, y por eso la prueba
     * comprueba la ausencia del boton y no un mensaje de error.
     *
     * El codigo conserva ademas la comprobacion dentro de `registrar()`, que es
     * defensa en profundidad por si en el futuro el boton pasa a estar siempre
     * visible.
     */
    it('sin lineas no hay nada que registrar, y el boton ni aparece', async () => {
      render(<PantallaCompras />);
      await screen.findByLabelText('Agregar producto');

      expect(
        screen.queryByRole('button', { name: /Registrar compra/i }),
      ).not.toBeInTheDocument();
      expect(dobles.registrarCompra).not.toHaveBeenCalled();
    });

    it('sin lineas explica como empezar', async () => {
      render(<PantallaCompras />);
      await screen.findByLabelText('Agregar producto');

      expect(screen.getByText('Compra sin productos')).toBeVisible();
      expect(screen.getByText(/Seleccione un producto del catalogo/)).toBeVisible();
    });

    it('el boton aparece en cuanto hay una linea', async () => {
      render(<PantallaCompras />);

      await agregarProducto();

      expect(
        await screen.findByRole('button', { name: /Registrar compra/i }),
      ).toBeVisible();
    });

    it('una cantidad invalida impide registrar', async () => {
      render(<PantallaCompras />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '0');
      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      expect(dobles.registrarCompra).not.toHaveBeenCalled();
    });
  });

  describe('registro', () => {
    it('envia las lineas convertidas a numero', async () => {
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      await waitFor(() => {
        expect(dobles.registrarCompra).toHaveBeenCalledWith([
          { idProducto: 1, cantidad: 1, precio: 0.49 },
        ]);
      });
    });

    it('confirma con el numero de documento y su importe', async () => {
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      const confirmacion = await screen.findByRole('status');
      expect(confirmacion).toHaveTextContent(/N.° 3/);
      expect(confirmacion).toHaveTextContent(/147[.,]50/);
    });

    /*
     * El mensaje explica los tres efectos de la compra: costo, precio de venta y
     * movimiento de Kardex. No es adorno: son cambios que ocurren en otras
     * pantallas y que el usuario no ve desde aqui.
     */
    it('explica que la compra actualizo costo, precio y Kardex', async () => {
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      const confirmacion = await screen.findByRole('status');
      expect(confirmacion).toHaveTextContent(/costo y el precio de venta/);
      expect(confirmacion).toHaveTextContent(/Entrada/);
    });

    it('vacia el detalle para poder registrar la siguiente', async () => {
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });
    });

    /*
     * La recarga del catalogo es lo mas facil de olvidar de toda la pantalla.
     * La compra acaba de cambiar el costo y el precio de venta del producto: sin
     * recargar, la siguiente compra partiria del precio anterior y el usuario
     * veria un dato que ya no es cierto.
     */
    it('recarga el catalogo, que la compra acaba de modificar', async () => {
      render(<PantallaCompras />);
      await agregarProducto();
      await waitFor(() => {
        expect(dobles.listarProductos).toHaveBeenCalledTimes(1);
      });

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      await waitFor(() => {
        expect(dobles.listarProductos).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('errores al registrar', () => {
    it('muestra el mensaje del servidor', async () => {
      dobles.registrarCompra.mockRejectedValue(
        new ErrorApi('VALIDACION', 'El producto 1 esta inactivo.', 400),
      );
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/esta inactivo/);
    });

    it('ante un fallo desconocido usa un mensaje comprensible', async () => {
      dobles.registrarCompra.mockRejectedValue(new TypeError('x'));
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo registrar la compra.',
      );
    });

    /*
     * Tras un fallo el detalle se CONSERVA. Vaciarlo obligaria a rehacer la
     * compra entera por un error de red, que es exactamente lo contrario de lo
     * que hace falta en ese momento.
     */
    it('conserva el detalle para poder reintentar', async () => {
      dobles.registrarCompra.mockRejectedValue(new Error('sin conexion'));
      render(<PantallaCompras />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar compra/i }));
      await screen.findByRole('alert');

      expect(screen.getByRole('table')).toBeVisible();
    });
  });

  describe('alta de producto desde la compra', () => {
    /*
     * Requisito explicito del enunciado: si al registrar una compra el producto
     * no existe, hay que poder crearlo sin abandonar la pantalla. Salir a
     * Productos y volver perderia el detalle a medio escribir.
     */
    it('ofrece crear el producto que no existe', async () => {
      render(<PantallaCompras />);

      expect(
        await screen.findByRole('button', { name: 'El producto no existe' }),
      ).toBeVisible();
    });

    it('abre el formulario de alta sin salir de la pantalla', async () => {
      render(<PantallaCompras />);
      await screen.findByLabelText('Agregar producto');

      await userEvent.click(
        screen.getByRole('button', { name: 'El producto no existe' }),
      );

      expect(await screen.findByRole('dialog')).toBeVisible();
    });
  });
});
