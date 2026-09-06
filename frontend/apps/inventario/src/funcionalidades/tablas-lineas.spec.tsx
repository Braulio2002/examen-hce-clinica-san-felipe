import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LineaCompra } from './compras/PantallaCompras';
import { TablaLineasCompra } from './compras/TablaLineasCompra';
import type { LineaVenta } from './ventas/PantallaVentas';
import { TablaLineasVenta } from './ventas/TablaLineasVenta';

/**
 * Pruebas de las tablas de detalle de compra y de venta.
 *
 * Se prueban juntas porque son la misma idea con una diferencia deliberada: en
 * la compra el precio es EDITABLE -es el costo que se esta pagando al
 * proveedor- y en la venta es de solo lectura, porque lo fija el servidor desde
 * el catalogo. Verlas al lado deja esa asimetria a la vista.
 *
 * Lo que mas se comprueba aqui es accesibilidad, y no por formalismo. Una tabla
 * de compra con ocho lineas tiene ocho campos "Cantidad" y ocho botones
 * "Quitar": sin etiquetas que digan de que producto es cada uno, quien usa
 * lector de pantalla no puede saber cual esta tocando. Consultar por esas
 * etiquetas hace que la prueba falle si desaparecen.
 */
describe('Tablas de detalle', () => {
  describe('TablaLineasCompra', () => {
    const LINEA: LineaCompra = {
      idFila: 'f1',
      idProducto: 1,
      nombreProducto: 'Paracetamol 500 mg',
      nroLote: 'LT-2026-0001',
      cantidad: '5',
      precio: '0.49',
    };

    const montar = (
      lineas: LineaCompra[] = [LINEA],
      validar: (l: LineaCompra) => string | null = () => null,
    ) => {
      const onCambiarCampo = vi.fn();
      const onQuitar = vi.fn();

      render(
        <TablaLineasCompra
          lineas={lineas}
          validar={validar}
          onCambiarCampo={onCambiarCampo}
          onQuitar={onQuitar}
        />,
      );

      return { onCambiarCampo, onQuitar };
    };

    it('muestra el producto y su lote', () => {
      montar();

      expect(screen.getByText('Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByText(/LT-2026-0001/)).toBeVisible();
    });

    it('la tabla se presenta a los lectores de pantalla', () => {
      montar();

      // El `<caption>` es lo que anuncia el lector antes de recorrer la tabla.
      expect(screen.getByText('Detalle de la compra en curso')).toBeInTheDocument();
    });

    /*
     * Cada campo lleva el nombre del producto en su etiqueta. Con ocho lineas,
     * ocho campos llamados "Cantidad" son indistinguibles al navegar por
     * teclado; con el nombre dentro, el lector dice exactamente cual es.
     */
    it('cada campo identifica a que producto pertenece', () => {
      montar();

      expect(screen.getByLabelText('Cantidad de Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByLabelText('Costo unitario de Paracetamol 500 mg')).toBeVisible();
    });

    it('cambiar la cantidad avisa con la fila y el campo', async () => {
      const { onCambiarCampo } = montar();

      await userEvent.type(screen.getByLabelText('Cantidad de Paracetamol 500 mg'), '0');

      expect(onCambiarCampo).toHaveBeenCalledWith('f1', 'cantidad', '50');
    });

    /*
     * El costo SI se edita en la compra: es lo que se esta pagando al proveedor
     * en esta operacion concreta, y puede diferir del ultimo costo registrado.
     */
    it('el costo es editable en la compra', async () => {
      const { onCambiarCampo } = montar();

      await userEvent.type(
        screen.getByLabelText('Costo unitario de Paracetamol 500 mg'),
        '9',
      );

      expect(onCambiarCampo).toHaveBeenCalledWith('f1', 'precio', '0.499');
    });

    it('quitar la linea avisa con su identificador', async () => {
      const { onQuitar } = montar();

      await userEvent.click(
        screen.getByRole('button', { name: 'Quitar Paracetamol 500 mg de la compra' }),
      );

      expect(onQuitar).toHaveBeenCalledWith('f1');
    });

    it('muestra el error de una linea invalida', () => {
      montar([{ ...LINEA, cantidad: '0' }], () => 'La cantidad debe ser mayor a cero.');

      expect(screen.getByText('La cantidad debe ser mayor a cero.')).toBeVisible();
    });

    it('una linea correcta no muestra error', () => {
      montar();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renderiza varias lineas', () => {
      montar([
        LINEA,
        { ...LINEA, idFila: 'f2', idProducto: 2, nombreProducto: 'Ibuprofeno 400 mg' },
      ]);

      expect(screen.getByText('Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByText('Ibuprofeno 400 mg')).toBeVisible();
    });
  });

  describe('TablaLineasVenta', () => {
    const LINEA: LineaVenta = {
      idFila: 'f1',
      idProducto: 1,
      nombreProducto: 'Paracetamol 500 mg',
      nroLote: 'LT-2026-0001',
      precioVenta: 0.66,
      stockDisponible: 10,
      cantidad: '2',
    };

    /*
     * La tabla de ventas expone `onCambiarCantidad(idFila, valor)` y no el
     * `onCambiarCampo(idFila, campo, valor)` de la de compras. La diferencia es
     * deliberada: aqui solo hay un campo editable, y pedir ademas cual es seria
     * un parametro que solo puede tomar un valor.
     */
    const montar = (
      lineas: LineaVenta[] = [LINEA],
      validar: (l: LineaVenta) => string | null = () => null,
    ) => {
      const onCambiarCantidad = vi.fn();
      const onQuitar = vi.fn();

      render(
        <TablaLineasVenta
          lineas={lineas}
          validar={validar}
          onCambiarCantidad={onCambiarCantidad}
          onQuitar={onQuitar}
        />,
      );

      return { onCambiarCantidad, onQuitar };
    };

    it('muestra el producto y su lote', () => {
      montar();

      expect(screen.getByText('Paracetamol 500 mg')).toBeVisible();
    });

    it('la tabla se presenta a los lectores de pantalla', () => {
      montar();

      expect(screen.getByText('Detalle de la venta en curso')).toBeInTheDocument();
    });

    it('la cantidad es editable e identifica su producto', async () => {
      const { onCambiarCantidad } = montar();

      await userEvent.type(screen.getByLabelText('Cantidad de Paracetamol 500 mg'), '0');

      expect(onCambiarCantidad).toHaveBeenCalledWith('f1', '20');
    });

    /*
     * La diferencia de fondo con la compra: en la venta NO hay campo de precio.
     * El precio lo pone el servidor desde el catalogo, y ofrecer un campo
     * editable daria a entender que el usuario puede cambiarlo cuando no puede.
     */
    it('el precio no es editable: lo fija el servidor', () => {
      montar();

      expect(
        screen.queryByLabelText(/Precio.*Paracetamol|Costo.*Paracetamol/),
      ).not.toBeInTheDocument();
    });

    it('el precio de venta si se muestra, como informacion', () => {
      montar();

      // El usuario necesita verlo para confirmar el importe, aunque no lo toque.
      expect(screen.getAllByText(/0[.,]66/).length).toBeGreaterThan(0);
    });

    it('quitar la linea avisa con su identificador', async () => {
      const { onQuitar } = montar();

      await userEvent.click(
        screen.getByRole('button', { name: 'Quitar Paracetamol 500 mg de la venta' }),
      );

      expect(onQuitar).toHaveBeenCalledWith('f1');
    });

    it('muestra el error de stock de una linea invalida', () => {
      montar(
        [{ ...LINEA, cantidad: '15' }],
        () => 'La cantidad no debe ser mayor al stock (10 disponibles).',
      );

      expect(
        screen.getByText('La cantidad no debe ser mayor al stock (10 disponibles).'),
      ).toBeVisible();
    });

    it('renderiza varias lineas', () => {
      montar([
        LINEA,
        { ...LINEA, idFila: 'f2', idProducto: 2, nombreProducto: 'Ibuprofeno 400 mg' },
      ]);

      expect(screen.getByText('Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByText('Ibuprofeno 400 mg')).toBeVisible();
    });
  });
});
