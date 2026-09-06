import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';

const dobles = vi.hoisted(() => ({ movimientos: vi.fn() }));

vi.mock('@/compartido/api', () => ({
  apiHce: { kardex: { movimientos: dobles.movimientos } },
}));

const { ModalMovimientos } = await import('./ModalMovimientos');

/**
 * Pruebas del detalle de movimientos de un producto.
 *
 * Es la trazabilidad que pide el enunciado: para cada producto, todas sus
 * entradas y salidas con el saldo despues de cada una. En un almacen clinico
 * esto es lo que permite responder a "por que faltan doce cajas", y por eso el
 * saldo acumulado importa tanto como el movimiento en si.
 *
 * La decision de diseno que se prueba aqui es que la consulta se hace al ABRIR,
 * no al cargar la pantalla. Con cien productos en el Kardex, precargar el
 * historial de todos serian cien peticiones para consultar, como mucho, uno.
 */
describe('ModalMovimientos', () => {
  const PRODUCTO = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    stockActual: 680,
    costo: 0.49,
    precioVenta: 0.66,
    valorizado: 333.2,
  };

  const MOVIMIENTO = {
    idMovimientoDet: 5,
    fechaRegistro: '2026-09-03T09:00:00Z',
    tipoMovimiento: 'Entrada',
    idTipoMovimiento: 1,
    documentoOrigen: 3,
    cantidad: 50,
    saldo: 730,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.movimientos.mockResolvedValue([MOVIMIENTO]);
  });

  describe('apertura', () => {
    /*
     * Sin producto el modal no existe. Es lo que permite que la pantalla del
     * Kardex lo tenga siempre montado y controle su visibilidad con un solo
     * estado, sin montar y desmontar en cada apertura.
     */
    it('sin producto seleccionado no se muestra', () => {
      const { container } = render(
        <ModalMovimientos producto={null} onCerrar={vi.fn()} />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('sin producto no consulta nada', () => {
      render(<ModalMovimientos producto={null} onCerrar={vi.fn()} />);

      // Cien productos en la tabla y ninguna peticion hasta que se pide una.
      expect(dobles.movimientos).not.toHaveBeenCalled();
    });

    it('con producto consulta sus movimientos', async () => {
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      await waitFor(() => {
        expect(dobles.movimientos).toHaveBeenCalledWith(1);
      });
    });

    it('el titulo dice de que producto son', async () => {
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(
        await screen.findByRole('dialog', { name: /Movimientos de Paracetamol 500 mg/ }),
      ).toBeVisible();
    });

    it('la descripcion recuerda el lote y el stock actual', async () => {
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      // Tener el saldo actual a la vista evita tener que cerrar el modal para
      // comprobarlo contra el ultimo movimiento.
      expect(await screen.findByText(/Lote LT-2026-0001/)).toBeVisible();
      expect(screen.getByText(/stock actual/)).toBeVisible();
    });
  });

  describe('contenido', () => {
    /*
     * La cantidad se muestra con signo: `+50` en una entrada, `-2` en una
     * salida. Es lo que permite leer la columna de un vistazo y ver si el stock
     * subio o bajo, sin tener que cruzar cada fila con la columna de tipo.
     */
    it('muestra el movimiento con su tipo y su cantidad con signo', async () => {
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByText('Entrada')).toBeVisible();
      expect(screen.getByRole('cell', { name: '+50' })).toBeVisible();
    });

    it('una salida se muestra en negativo', async () => {
      dobles.movimientos.mockResolvedValue([
        {
          ...MOVIMIENTO,
          idTipoMovimiento: 2,
          tipoMovimiento: 'Salida',
          cantidad: 2,
          saldo: 678,
        },
      ]);
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByRole('cell', { name: '-2' })).toBeVisible();
    });

    /*
     * El saldo acumulado es lo que convierte una lista de movimientos en una
     * auditoria. Sin el, para saber cuanto habia el martes hay que sumar a mano
     * todo lo anterior.
     */
    it('muestra el saldo despues de cada movimiento', async () => {
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByText(/730/)).toBeVisible();
    });

    it('un producto sin movimientos lo explica', async () => {
      dobles.movimientos.mockResolvedValue([]);
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByText('Sin movimientos')).toBeVisible();
    });

    it('muestra varios movimientos', async () => {
      dobles.movimientos.mockResolvedValue([
        MOVIMIENTO,
        {
          ...MOVIMIENTO,
          idMovimientoDet: 6,
          tipoMovimiento: 'Salida',
          cantidad: 2,
          saldo: 728,
        },
      ]);
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByText('Entrada')).toBeVisible();
      expect(screen.getByText('Salida')).toBeVisible();
    });
  });

  describe('errores', () => {
    it('un fallo de la API se muestra con su mensaje', async () => {
      dobles.movimientos.mockRejectedValue(
        new ErrorApi('PROHIBIDO', 'No tiene permiso para ver los movimientos', 403),
      );
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(await screen.findByText(/No tiene permiso/)).toBeVisible();
    });

    it('un fallo desconocido usa un mensaje comprensible', async () => {
      dobles.movimientos.mockRejectedValue(new TypeError('x'));
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={vi.fn()} />);

      expect(
        await screen.findByText('No se pudieron cargar los movimientos.'),
      ).toBeVisible();
    });
  });

  describe('cierre', () => {
    /*
     * Hay dos formas de cerrar: la cruz del encabezado, que pone el propio
     * modal, y el boton del pie que anade esta pantalla. Ambas comparten
     * etiqueta, asi que se comprueban las dos por separado.
     */
    it('la cruz del encabezado cierra', async () => {
      const cerrar = vi.fn();
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={cerrar} />);
      await screen.findByRole('dialog');

      const [cruz] = screen.getAllByRole('button', { name: 'Cerrar' });
      if (!cruz) throw new Error('No se encontro la cruz de cerrar.');
      await userEvent.click(cruz);

      expect(cerrar).toHaveBeenCalled();
    });

    it('el boton del pie tambien cierra', async () => {
      const cerrar = vi.fn();
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={cerrar} />);
      await screen.findByRole('dialog');

      const botones = screen.getAllByRole('button', { name: 'Cerrar' });
      const pie = botones.at(-1);
      if (!pie) throw new Error('No se encontro el boton de cerrar del pie.');
      await userEvent.click(pie);

      expect(cerrar).toHaveBeenCalled();
    });

    it('Escape tambien lo cierra', async () => {
      const cerrar = vi.fn();
      render(<ModalMovimientos producto={PRODUCTO} onCerrar={cerrar} />);
      await screen.findByRole('dialog');

      await userEvent.keyboard('{Escape}');

      expect(cerrar).toHaveBeenCalled();
    });
  });
});
