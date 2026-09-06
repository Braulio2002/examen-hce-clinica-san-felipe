import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Alerta, Cargador, EstadoVacio } from './retroalimentacion';
import { ContenedorTabla } from './tabla';

/**
 * Pruebas de los componentes de retroalimentacion.
 *
 * Son los que hablan con el usuario cuando algo no va como esperaba. Su
 * correccion no se mide en pixeles sino en si el mensaje LLEGA, y eso depende
 * del rol ARIA que se le asigne: un error anunciado como `status` puede pasar
 * inadvertido para quien usa lector de pantalla justo cuando mas falta hace.
 */
describe('Componentes de retroalimentacion', () => {
  describe('Alerta', () => {
    it('muestra el mensaje', () => {
      render(<Alerta>No se pudo registrar la compra</Alerta>);

      expect(screen.getByText('No se pudo registrar la compra')).toBeVisible();
    });

    it('muestra el titulo cuando se le da uno', () => {
      render(<Alerta titulo="Stock insuficiente">Solo quedan 2 unidades</Alerta>);

      expect(screen.getByText('Stock insuficiente')).toBeVisible();
      expect(screen.getByText('Solo quedan 2 unidades')).toBeVisible();
    });

    /*
     * La distincion de roles es la decision de fondo de este componente.
     *
     * `alert` interrumpe: el lector de pantalla lo anuncia de inmediato, aunque
     * el usuario estuviera leyendo otra cosa. `status` espera a que termine la
     * frase en curso.
     *
     * Un error merece la interrupcion porque bloquea lo que el usuario intentaba
     * hacer. Una confirmacion no: interrumpir para decir "guardado" es ruido.
     */
    it('un error interrumpe al lector de pantalla', () => {
      render(<Alerta tipo="error">Fallo la operacion</Alerta>);

      expect(screen.getByRole('alert')).toBeVisible();
    });

    it.each(['exito', 'aviso', 'info'] as const)(
      'un mensaje de tipo %s no interrumpe: se anuncia como estado',
      (tipo) => {
        render(<Alerta tipo={tipo}>Mensaje</Alerta>);

        expect(screen.getByRole('status')).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      },
    );

    it('el tipo error es el predeterminado', () => {
      render(<Alerta>Sin tipo explicito</Alerta>);

      // Ante la duda, se interrumpe: es peor perderse un error que sobrar un
      // anuncio.
      expect(screen.getByRole('alert')).toBeVisible();
    });

    it('se puede descartar cuando se le da un manejador', async () => {
      const cerrar = vi.fn();
      render(<Alerta onCerrar={cerrar}>Mensaje</Alerta>);

      await userEvent.click(screen.getByRole('button', { name: 'Descartar mensaje' }));

      expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('sin manejador no ofrece boton de descartar', () => {
      render(<Alerta>Mensaje</Alerta>);

      // Un boton que no hace nada es peor que no tenerlo: promete una accion
      // que no existe.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Cargador', () => {
    it('se renderiza', () => {
      const { container } = render(<Cargador />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('acepta un tamano distinto', () => {
      const { container } = render(<Cargador className="h-10 w-10" />);

      expect(container.querySelector('svg')).toHaveClass('h-10');
    });
  });

  describe('EstadoVacio', () => {
    /*
     * Una tabla vacia sin explicacion parece un fallo de carga. El estado vacio
     * distingue "no hay nada todavia" de "algo no funciono", que para el usuario
     * son situaciones completamente distintas.
     */
    it('explica que no hay nada que mostrar', () => {
      render(<EstadoVacio titulo="Sin productos registrados" />);

      expect(screen.getByText('Sin productos registrados')).toBeVisible();
    });

    it('puede anadir una explicacion', () => {
      render(
        <EstadoVacio
          titulo="Sin resultados"
          descripcion="Pruebe con otro termino de busqueda"
        />,
      );

      expect(screen.getByText('Pruebe con otro termino de busqueda')).toBeVisible();
    });

    it('puede ofrecer la accion que resuelve el vacio', () => {
      render(
        <EstadoVacio
          titulo="Sin productos"
          accion={<button>Registrar el primero</button>}
        />,
      );

      // Decir que esta vacio y ademas como llenarlo ahorra al usuario buscar el
      // boton por su cuenta.
      expect(screen.getByRole('button', { name: 'Registrar el primero' })).toBeVisible();
    });

    it('funciona con lo minimo: solo el titulo', () => {
      render(<EstadoVacio titulo="Vacio" />);

      expect(screen.getByText('Vacio')).toBeVisible();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('ContenedorTabla', () => {
    it('envuelve el contenido que se le pase', () => {
      render(
        <ContenedorTabla>
          <table>
            <thead>
              <tr>
                <th scope="col">Producto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Paracetamol</td>
              </tr>
            </tbody>
          </table>
        </ContenedorTabla>,
      );

      expect(screen.getByRole('table')).toBeVisible();
      expect(screen.getByText('Paracetamol')).toBeVisible();
    });
  });
});
