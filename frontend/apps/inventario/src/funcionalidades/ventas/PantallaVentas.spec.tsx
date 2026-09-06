import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';
import type * as PaqueteUi from '@hce/ui';

const dobles = vi.hoisted(() => ({
  listarKardex: vi.fn(),
  registrarVenta: vi.fn(),
  puedeOperar: true,
}));

vi.mock('@/compartido/api', () => ({
  apiHce: {
    kardex: { listar: dobles.listarKardex },
    ventas: { registrar: dobles.registrarVenta },
  },
}));

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

const { PantallaVentas } = await import('./PantallaVentas');

/**
 * Pruebas de la pantalla de registro de ventas.
 *
 * Se parece a la de compras, pero tiene dos diferencias que son de negocio y no
 * de presentacion:
 *
 *   1. El PRECIO no se introduce. Lo fija el servidor desde el catalogo. Si el
 *      cliente pudiera enviarlo, podria venderse a si mismo al precio que
 *      quisiera; por eso la linea que viaja lleva solo producto y cantidad.
 *
 *   2. Existe el limite de STOCK. La pantalla lo comprueba con el stock que
 *      trajo el Kardex, pero eso es solo comodidad: el dato puede quedarse
 *      obsoleto en el instante siguiente si otro puesto vende la misma unidad.
 *      La palabra final la tiene el procedimiento almacenado, que bloquea la
 *      fila y decide. Estas pruebas cubren la parte de la interfaz; la
 *      concurrencia real la cubre el script de 20 ventas simultaneas.
 */
describe('PantallaVentas', () => {
  const FILA = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    stockActual: 10,
    costo: 0.49,
    precioVenta: 0.66,
    valorizado: 6.6,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.puedeOperar = true;
    dobles.listarKardex.mockResolvedValue({
      datos: [FILA],
      meta: { pagina: 1, tamanoPagina: 200, totalRegistros: 1, totalPaginas: 1 },
    });
    dobles.registrarVenta.mockResolvedValue({ idVentaCab: 7, total: 3.89, detalle: [] });
  });

  const agregarProducto = async () => {
    const buscador = await screen.findByLabelText(/Agregar producto/i);
    await userEvent.clear(buscador);
    await userEvent.type(buscador, 'Paracetamol');

    const listado = await screen.findByRole('listbox');
    await userEvent.click(within(listado).getByText(/Paracetamol 500 mg/));
  };

  describe('permisos', () => {
    it('un rol sin permiso no ve el formulario', () => {
      dobles.puedeOperar = false;

      render(<PantallaVentas />);

      expect(screen.getByText(/Acceso restringido/)).toBeVisible();
    });

    it('con permiso si lo ve', async () => {
      render(<PantallaVentas />);

      expect(await screen.findByLabelText(/Agregar producto/i)).toBeVisible();
    });
  });

  describe('origen de los datos', () => {
    /*
     * La venta parte del KARDEX, no del catalogo. Es lo correcto: solo se puede
     * vender lo que hay, y el Kardex es la unica fuente que conoce el stock. El
     * catalogo diria que el producto existe, no que quede alguna unidad.
     */
    it('consulta el Kardex, que es lo que conoce el stock', async () => {
      render(<PantallaVentas />);

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalled();
      });
    });

    it('un fallo al cargarlo se muestra', async () => {
      dobles.listarKardex.mockRejectedValue(
        new ErrorApi('SIN_CONEXION', 'No se pudo contactar con el servidor.', 0),
      );
      render(<PantallaVentas />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo contactar/);
    });
  });

  describe('detalle de la venta', () => {
    it('agregar un producto crea su linea', async () => {
      render(<PantallaVentas />);

      await agregarProducto();

      expect(await screen.findByRole('table')).toBeVisible();
    });

    it('la linea arranca con una unidad', async () => {
      render(<PantallaVentas />);

      await agregarProducto();

      const tabla = await screen.findByRole('table');
      expect(within(tabla).getByDisplayValue('1')).toBeVisible();
    });

    /*
     * Un producto agotado SI aparece en el buscador, pero deshabilitado.
     *
     * Ocultarlo seria peor: el usuario buscaria "Paracetamol", no lo encontraria
     * y concluiria que no existe en el sistema, cuando lo que pasa es que no
     * queda ninguno. Mostrarlo con la nota "sin stock" responde la pregunta que
     * de verdad se esta haciendo.
     */
    const sinStock = () => {
      dobles.listarKardex.mockResolvedValue({
        datos: [{ ...FILA, stockActual: 0 }],
        meta: { pagina: 1, tamanoPagina: 200, totalRegistros: 1, totalPaginas: 1 },
      });
    };

    it('un producto agotado aparece en el buscador, marcado como sin stock', async () => {
      sinStock();
      render(<PantallaVentas />);

      const buscador = await screen.findByLabelText(/Agregar producto/i);
      await userEvent.type(buscador, 'Paracetamol');

      const listado = await screen.findByRole('listbox');
      expect(within(listado).getByText(/sin stock/)).toBeVisible();
    });

    it('pero no se puede elegir: no entra en la venta', async () => {
      sinStock();
      render(<PantallaVentas />);

      await agregarProducto();

      // La opcion esta deshabilitada, asi que el clic no crea linea alguna.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('avisa si se agrega dos veces el mismo producto', async () => {
      render(<PantallaVentas />);
      await agregarProducto();

      await agregarProducto();

      expect(await screen.findByRole('alert')).toHaveTextContent(/ya esta en la venta/);
    });
  });

  describe('limite de stock', () => {
    /*
     * El mensaje es el que pide el enunciado, literalmente: "La cantidad no debe
     * ser mayor al stock". Se comprueba el texto porque es un requisito escrito,
     * no una eleccion de redaccion.
     */
    it('pedir mas unidades de las disponibles lo dice con el mensaje del enunciado', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '15');

      expect(
        await screen.findByText(/La cantidad no debe ser mayor al stock/),
      ).toBeVisible();
    });

    it('el mensaje dice cuantas unidades hay', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '15');

      // Decir "no hay suficiente" obliga al usuario a ir al Kardex a mirar;
      // decir cuantas hay le permite corregir en el momento.
      expect(await screen.findByText(/10 disponibles/)).toBeVisible();
    });

    it('vender exactamente todo el stock si se admite', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '10');
      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      await waitFor(() => {
        expect(dobles.registrarVenta).toHaveBeenCalled();
      });
    });

    /*
     * Con lineas invalidas, la guarda de `registrar()` detiene el envio y
     * explica que corregir. Es la red por si el boton llegara a pulsarse antes
     * de deshabilitarse.
     */
    it('con lineas invalidas el boton se deshabilita y no se llama al servidor', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');
      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '99');

      const boton = screen.getByRole('button', { name: /Registrar venta/i });
      await userEvent.click(boton);

      expect(dobles.registrarVenta).not.toHaveBeenCalled();
      expect(boton).toBeDisabled();
    });

    it('una cantidad de cero tambien se senala', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '0');

      expect(await screen.findByText(/cantidad mayor a cero/i)).toBeVisible();
    });

    it('una cantidad excesiva impide registrar', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      const tabla = await screen.findByRole('table');
      const cantidad = within(tabla).getByDisplayValue('1');

      await userEvent.clear(cantidad);
      await userEvent.type(cantidad, '15');
      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      expect(dobles.registrarVenta).not.toHaveBeenCalled();
    });
  });

  describe('registro', () => {
    /*
     * La linea que viaja lleva SOLO producto y cantidad. Es la diferencia de
     * fondo con la compra, y es de seguridad: el precio lo pone el servidor
     * desde el catalogo, de modo que nadie puede venderse al precio que quiera.
     */
    it('la linea enviada no lleva precio', async () => {
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      await waitFor(() => {
        expect(dobles.registrarVenta).toHaveBeenCalledWith([
          { idProducto: 1, cantidad: 1 },
        ]);
      });
    });

    it('confirma con el numero de documento y su importe', async () => {
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      const confirmacion = await screen.findByRole('status');
      expect(confirmacion).toHaveTextContent(/N.° 7/);
      expect(confirmacion).toHaveTextContent(/3[.,]89/);
    });

    it('menciona el movimiento de Salida que genero', async () => {
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/Salida/);
    });

    it('vacia el detalle al terminar', async () => {
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });
    });

    it('la confirmacion se puede descartar', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));
      await screen.findByRole('status');

      await userEvent.click(screen.getByRole('button', { name: 'Descartar mensaje' }));

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('refresca el stock, que la venta acaba de reducir', async () => {
      render(<PantallaVentas />);
      await agregarProducto();
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(1);
      });

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('errores al registrar', () => {
    it('muestra el mensaje del servidor', async () => {
      dobles.registrarVenta.mockRejectedValue(
        new ErrorApi('STOCK_INSUFICIENTE', 'Solo quedan 2 unidades de Paracetamol.', 422),
      );
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Solo quedan 2 unidades/,
      );
    });

    /*
     * Tras un fallo se REFRESCA el stock. Es lo mas pensado de esta pantalla: si
     * la venta se rechazo por falta de existencias, es porque otro puesto vendio
     * esas unidades entre que se cargo la pantalla y se pulso el boton. Sin
     * refrescar, el usuario seguiria viendo el stock antiguo y reintentaria la
     * misma cantidad indefinidamente.
     */
    it('refresca el stock tras un rechazo por concurrencia', async () => {
      dobles.registrarVenta.mockRejectedValue(
        new ErrorApi('STOCK_INSUFICIENTE', 'Sin stock', 422),
      );
      render(<PantallaVentas />);
      await agregarProducto();
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(1);
      });

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(2);
      });
    });

    it('conserva el detalle para poder ajustar la cantidad', async () => {
      dobles.registrarVenta.mockRejectedValue(new Error('sin conexion'));
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));
      await screen.findByRole('alert');

      expect(screen.getByRole('table')).toBeVisible();
    });

    it('ante un fallo desconocido usa un mensaje comprensible', async () => {
      dobles.registrarVenta.mockRejectedValue(new TypeError('x'));
      render(<PantallaVentas />);
      await agregarProducto();

      await userEvent.click(screen.getByRole('button', { name: /Registrar venta/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo registrar la venta.',
      );
    });
  });

  describe('estado vacio', () => {
    it('explica como empezar', async () => {
      render(<PantallaVentas />);
      await screen.findByLabelText(/Agregar producto/i);

      expect(screen.getByText('Venta sin productos')).toBeVisible();
    });
  });
});
