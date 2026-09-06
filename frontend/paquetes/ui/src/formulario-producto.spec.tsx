import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';

import { FormularioProducto } from './formulario-producto';

/**
 * Pruebas del formulario de producto.
 *
 * Lo comparten el alta y la edicion: mismo formulario, distinto texto y distinta
 * operacion de guardado. Esa reutilizacion es lo que evita que las validaciones
 * se dupliquen y acaben divergiendo, que era el riesgo real cuando cada pantalla
 * tenia su propio modal.
 *
 * La validacion del costo es la parte con mas historia, y estas pruebas
 * encontraron ahi un defecto real: `Number('')` devuelve 0, no NaN, asi que
 * dejar el campo en blanco creaba el producto con costo cero sin avisar. El
 * caso esta detallado en la prueba correspondiente.
 */
describe('FormularioProducto', () => {
  const abrir = (props: Partial<Parameters<typeof FormularioProducto>[0]> = {}) => {
    const onGuardar = vi.fn().mockResolvedValue({ idProducto: 1 });
    const onGuardado = vi.fn();
    const onCerrar = vi.fn();

    render(
      <FormularioProducto
        abierto
        onCerrar={onCerrar}
        onGuardar={onGuardar}
        onGuardado={onGuardado}
        titulo="Registrar producto"
        textoAccion="Registrar"
        mensajeSiFalla="No se pudo registrar el producto."
        {...props}
      />,
    );

    return { onGuardar, onGuardado, onCerrar };
  };

  /*
   * El modal lleva el foco a su primer control 30 ms despues de abrirse. Si la
   * prueba empieza a teclear antes, ese salto de foco interrumpe el tecleo a
   * media palabra y el campo queda con una o dos letras. Esperar a que el foco
   * se asiente reproduce lo que hace una persona -el modal termina de abrirse y
   * entonces escribe- y elimina una fuente de intermitencia.
   */
  const esperarAperturaCompleta = async () => {
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toContainElement(
        document.activeElement as HTMLElement,
      );
    });
  };

  const rellenar = async (
    datos: { nombre?: string; lote?: string; costo?: string } = {},
  ) => {
    await esperarAperturaCompleta();

    if (datos.nombre !== undefined) {
      await userEvent.type(screen.getByLabelText('Nombre del producto'), datos.nombre);
    }
    if (datos.lote !== undefined) {
      await userEvent.type(screen.getByLabelText('Numero de lote'), datos.lote);
    }
    if (datos.costo !== undefined) {
      await userEvent.type(screen.getByLabelText('Costo unitario'), datos.costo);
    }
  };

  const enviar = () => userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

  describe('alta', () => {
    it('empieza con los campos vacios', () => {
      abrir();

      expect(screen.getByLabelText('Nombre del producto')).toHaveValue('');
      expect(screen.getByLabelText('Numero de lote')).toHaveValue('');
    });

    it('guarda los datos que se introducen', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: 'Ketorolaco 30 mg', lote: 'LT-13', costo: '0.45' });
      await enviar();

      await waitFor(() => {
        expect(onGuardar).toHaveBeenCalledWith({
          nombreProducto: 'Ketorolaco 30 mg',
          nroLote: 'LT-13',
          costo: 0.45,
        });
      });
    });

    /*
     * El recorte de espacios se hace aqui ademas de en el DTO del servidor. No
     * es redundancia inutil: evita que el usuario vea un error de validacion
     * -o cree un duplicado invisible- por un espacio que ni siquiera puede ver.
     */
    it('recorta los espacios antes de enviar', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: '  Ketorolaco  ', lote: '  LT-13 ', costo: '1' });
      await enviar();

      await waitFor(() => {
        expect(onGuardar).toHaveBeenCalledWith(
          expect.objectContaining({ nombreProducto: 'Ketorolaco', nroLote: 'LT-13' }),
        );
      });
    });

    it('convierte el costo a numero', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '0.4567' });
      await enviar();

      await waitFor(() => {
        expect(onGuardar.mock.calls[0]?.[0]).toMatchObject({ costo: 0.4567 });
      });
    });

    it('avisa al padre con el resultado del guardado', async () => {
      const { onGuardado } = abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '1' });
      await enviar();

      await waitFor(() => {
        expect(onGuardado).toHaveBeenCalledWith({ idProducto: 1 });
      });
    });
  });

  describe('edicion', () => {
    const producto = { nombreProducto: 'Paracetamol', nroLote: 'LT-1', costo: 0.49 };

    it('llega con los datos del producto cargados', () => {
      abrir({ producto, titulo: 'Editar producto', textoAccion: 'Guardar' });

      expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Paracetamol');
      expect(screen.getByLabelText('Numero de lote')).toHaveValue('LT-1');
      expect(screen.getByLabelText('Costo unitario')).toHaveValue(0.49);
    });

    it('el texto del boton se adapta a la operacion', () => {
      abrir({ producto, textoAccion: 'Guardar cambios' });

      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
    });
  });

  describe('validacion', () => {
    it('exige el nombre', async () => {
      abrir();

      await rellenar({ lote: 'LT-1', costo: '1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/nombre.*obligatorio/i);
    });

    it('un nombre de solo espacios no cuenta como nombre', async () => {
      abrir();

      await rellenar({ nombre: '   ', lote: 'LT-1', costo: '1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/nombre.*obligatorio/i);
    });

    it('exige el lote', async () => {
      abrir();

      await rellenar({ nombre: 'X', costo: '1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/lote.*obligatorio/i);
    });

    /*
     * Esta prueba encontro un defecto real y esta escrita a partir de el.
     *
     * La validacion comprobaba `Number.isFinite(Number(costo))` confiando en que
     * un campo vacio produce NaN. No es asi: `Number('')` devuelve 0. El
     * resultado era que dejar el costo en blanco creaba el producto con costo 0
     * y precio de venta 0, sin un solo aviso, y el error solo se notaba al
     * intentar vender ese producto a cero soles.
     *
     * Corregido en el codigo -comprobando la cadena vacia aparte-, no en la
     * prueba.
     */
    it('el costo vacio se rechaza: la cadena vacia se convierte en 0, no en NaN', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/costo.*obligatorio/i);
      expect(onGuardar).not.toHaveBeenCalled();
    });

    it('un costo no numerico tambien se rechaza', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '-' });
      await enviar();

      expect(await screen.findByRole('alert')).toBeVisible();
      expect(onGuardar).not.toHaveBeenCalled();
    });

    it('el costo negativo se rechaza', async () => {
      abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '-5' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/costo/i);
    });

    it('el costo cero se admite: hay insumos sin coste, como las muestras', async () => {
      const { onGuardar } = abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '0' });
      await enviar();

      await waitFor(() => {
        expect(onGuardar).toHaveBeenCalled();
      });
    });

    it('una validacion fallida no llama al servidor', async () => {
      const { onGuardar } = abrir();

      await enviar();

      // Validar en el cliente evita un viaje inutil y da respuesta inmediata.
      // El servidor vuelve a validar igualmente: esto es comodidad, no seguridad.
      expect(onGuardar).not.toHaveBeenCalled();
    });
  });

  describe('ayuda del precio de venta', () => {
    it('explica la regla mientras el campo esta vacio', () => {
      abrir();

      expect(screen.getByText(/costo x 1.35/)).toBeVisible();
    });

    it('una validacion fallida por costo vacio lo dice con claridad', async () => {
      abrir();

      await rellenar({ nombre: 'X', lote: 'LT-1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El costo es obligatorio.',
      );
    });

    /*
     * Al escribir el costo, la ayuda pasa a mostrar el precio calculado. Es lo
     * que evita la sorpresa: el usuario ve a que se va a vender antes de
     * guardar, en lugar de descubrirlo al abrir el catalogo.
     */
    it('al escribir el costo muestra el precio que resultara', async () => {
      abrir();

      await rellenar({ costo: '1' });

      await waitFor(() => {
        expect(screen.getByText(/Precio de venta/)).toBeVisible();
      });
    });

    it('un costo invalido vuelve a la explicacion generica', async () => {
      abrir();

      await rellenar({ costo: '-' });

      expect(screen.getByText(/se calcula como costo x 1.35/)).toBeVisible();
    });
  });

  describe('errores del servidor', () => {
    /*
     * Un error de la API se muestra con SU mensaje. El BackEnd redacta cosas
     * como "Ya existe un producto con ese nombre y lote", que es exactamente lo
     * que el usuario necesita saber; sustituirlo por uno generico le obligaria a
     * adivinar que ha pasado.
     */
    it('muestra el mensaje que redacto el servidor', async () => {
      const onGuardar = vi
        .fn()
        .mockRejectedValue(
          new ErrorApi('CONFLICTO', 'Ya existe un producto con ese nombre y lote.', 409),
        );
      abrir({ onGuardar });

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '1' });
      await enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(/Ya existe un producto/);
    });

    it('ante un fallo desconocido usa el mensaje de respaldo', async () => {
      const onGuardar = vi.fn().mockRejectedValue(new Error('TypeError raro'));
      abrir({ onGuardar });

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '1' });
      await enviar();

      // Un error de programacion no se ensena tal cual: su texto no significa
      // nada para quien esta usando la aplicacion.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo registrar el producto.',
      );
    });

    it('tras fallar se puede reintentar: el formulario no se bloquea', async () => {
      const onGuardar = vi
        .fn()
        .mockRejectedValueOnce(new Error('fallo'))
        .mockResolvedValueOnce({ idProducto: 1 });
      const { onGuardado } = abrir({ onGuardar });

      await rellenar({ nombre: 'X', lote: 'LT-1', costo: '1' });
      await enviar();
      await screen.findByRole('alert');
      await enviar();

      await waitFor(() => {
        expect(onGuardado).toHaveBeenCalled();
      });
    });
  });

  describe('cancelacion', () => {
    it('el boton de cancelar cierra el formulario', async () => {
      const { onCerrar } = abrir();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onCerrar).toHaveBeenCalledTimes(1);
    });

    it('cerrado no se renderiza', () => {
      const { container } = render(
        <FormularioProducto
          abierto={false}
          onCerrar={vi.fn()}
          onGuardar={vi.fn()}
          onGuardado={vi.fn()}
          titulo="T"
          textoAccion="Guardar"
          mensajeSiFalla="fallo"
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});
