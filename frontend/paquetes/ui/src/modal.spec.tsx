import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

/**
 * Pruebas del modal.
 *
 * Es el componente con mas comportamiento propio del sistema de diseno, y todo
 * ese comportamiento es de accesibilidad. En una farmacia de planta el teclado
 * suele ser el dispositivo principal -las manos estan ocupadas y el raton
 * incomodo-, asi que estas no son mejoras opcionales:
 *
 *   - Escape cierra. Es lo que todo el mundo intenta primero.
 *   - El foco queda ATRAPADO dentro. Sin eso, Tab lleva al fondo de la pagina y
 *     el usuario sigue tabulando por controles que no puede ver, porque el
 *     modal los tapa.
 *   - Al cerrar, el foco VUELVE a quien lo abrio. Sin eso cae al principio del
 *     documento: quien acaba de pulsar "Ver" en la fila 30 del Kardex tiene que
 *     recorrer la tabla entera de nuevo.
 *
 * Este ultimo punto se comprueba aqui interactuando de verdad, no leyendo el
 * codigo: es la clase de detalle que se rompe en cualquier refactorizacion del
 * efecto y que nadie nota hasta que alguien depende de el.
 */
describe('Modal', () => {
  const abrirModal = (props: Partial<Parameters<typeof Modal>[0]> = {}) =>
    render(
      <Modal abierto titulo="Nuevo producto" onCerrar={vi.fn()} {...props}>
        <input aria-label="Nombre" />
        <input aria-label="Lote" />
      </Modal>,
    );

  describe('visibilidad', () => {
    it('cerrado no renderiza nada', () => {
      const { container } = render(
        <Modal abierto={false} titulo="Nuevo producto" onCerrar={vi.fn()}>
          <p>contenido</p>
        </Modal>,
      );

      // No basta con ocultarlo por CSS: un modal presente pero invisible sigue
      // siendo tabulable y lo sigue leyendo un lector de pantalla.
      expect(container).toBeEmptyDOMElement();
    });

    it('abierto se anuncia como dialogo modal', () => {
      abrirModal();

      const dialogo = screen.getByRole('dialog');
      expect(dialogo).toBeVisible();
      // `aria-modal` le dice al lector de pantalla que ignore el resto de la
      // pagina mientras esto este abierto.
      expect(dialogo).toHaveAttribute('aria-modal', 'true');
    });

    it('el titulo da nombre al dialogo', () => {
      abrirModal();

      // Sin `aria-labelledby`, el lector anuncia "dialogo" a secas y el usuario
      // no sabe que se le esta pidiendo.
      expect(screen.getByRole('dialog', { name: 'Nuevo producto' })).toBeVisible();
    });

    it('muestra la descripcion cuando se le pasa', () => {
      abrirModal({ descripcion: 'Complete los datos del medicamento' });

      expect(screen.getByText('Complete los datos del medicamento')).toBeVisible();
    });

    it('muestra el contenido y el pie', () => {
      render(
        <Modal abierto titulo="T" onCerrar={vi.fn()} pie={<button>Guardar</button>}>
          <p>cuerpo del modal</p>
        </Modal>,
      );

      expect(screen.getByText('cuerpo del modal')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeVisible();
    });

    it.each(['md', 'lg', 'xl'] as const)('el ancho %s se renderiza', (ancho) => {
      abrirModal({ ancho });

      expect(screen.getByRole('dialog')).toBeVisible();
    });
  });

  describe('formas de cerrarlo', () => {
    it('con el boton de cerrar', async () => {
      const cerrar = vi.fn();
      abrirModal({ onCerrar: cerrar });

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

      expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('con la tecla Escape, que es lo primero que intenta todo el mundo', async () => {
      const cerrar = vi.fn();
      abrirModal({ onCerrar: cerrar });

      await userEvent.keyboard('{Escape}');

      expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('pulsando fuera del dialogo', async () => {
      const cerrar = vi.fn();
      abrirModal({ onCerrar: cerrar });

      const fondo = document.querySelector('[aria-hidden="true"]');
      if (fondo) await userEvent.click(fondo);

      expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('otras teclas no lo cierran', async () => {
      const cerrar = vi.fn();
      abrirModal({ onCerrar: cerrar });

      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('a');

      expect(cerrar).not.toHaveBeenCalled();
    });

    it('cerrado, Escape ya no dispara nada', async () => {
      const cerrar = vi.fn();
      render(
        <Modal abierto={false} titulo="T" onCerrar={cerrar}>
          <p>x</p>
        </Modal>,
      );

      await userEvent.keyboard('{Escape}');

      // El oyente se retira al cerrar: si no, quedarian tantos oyentes activos
      // como veces se hubiera abierto el modal.
      expect(cerrar).not.toHaveBeenCalled();
    });
  });

  describe('gestion del foco', () => {
    /*
     * Lo que importa es que el foco entre EN el dialogo, no que caiga en un
     * elemento concreto. Se afirma asi -y no "el foco esta en el campo Nombre"-
     * porque el primer elemento enfocable depende del orden del DOM: hoy es el
     * boton de cerrar, y anadir un control al encabezado lo cambiaria sin que
     * el comportamiento empeorase en absoluto.
     *
     * Sin esto, el usuario de teclado tendria que tabular desde el principio de
     * la pagina hasta encontrar el modal que acaba de abrir.
     */
    it('al abrirse lleva el foco dentro del dialogo', async () => {
      abrirModal();

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toContainElement(
          document.activeElement as HTMLElement,
        );
      });
    });

    it('en concreto, al primer control enfocable que encuentra', async () => {
      abrirModal();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
      });
    });

    /*
     * La trampa de foco. Al llegar al ultimo control, Tab vuelve al primero en
     * lugar de salir al fondo de la pagina. Sin ella, el usuario sigue tabulando
     * por controles que el modal esta tapando y no entiende donde esta.
     */
    it('desde el ultimo control, Tab no se escapa al fondo de la pagina', async () => {
      abrirModal();

      screen.getByLabelText('Lote').focus();
      await userEvent.tab();

      expect(screen.getByRole('dialog')).toContainElement(
        document.activeElement as HTMLElement,
      );
    });

    it('desde el primero, Shift+Tab tampoco', async () => {
      abrirModal();

      screen.getByRole('button', { name: 'Cerrar' }).focus();
      await userEvent.tab({ shift: true });

      expect(screen.getByRole('dialog')).toContainElement(
        document.activeElement as HTMLElement,
      );
    });

    /*
     * Un modal sin ningun control enfocable. Ocurre de verdad mientras se carga
     * su contenido: el dialogo esta abierto y dentro solo hay un indicador de
     * progreso. Tabular ahi no debe romper nada.
     *
     * El codigo comprueba primero y ultimo por separado en lugar de mirar la
     * longitud, y es deliberado: `querySelectorAll` devuelve una coleccion viva,
     * asi que entre la comprobacion y el acceso el DOM puede haber cambiado.
     */
    it('tabular en un modal sin controles no rompe nada', async () => {
      render(
        <Modal abierto titulo="Cargando" onCerrar={vi.fn()}>
          <p>Recuperando movimientos...</p>
        </Modal>,
      );

      await userEvent.tab();

      expect(screen.getByRole('dialog')).toBeVisible();
    });

    /*
     * La devolucion del foco al cerrar. Se comprueba de verdad -abriendo,
     * cerrando y mirando donde quedo el foco- porque es un efecto de limpieza,
     * y los efectos de limpieza son justo lo que desaparece sin ruido en una
     * refactorizacion.
     */
    it('al cerrarse devuelve el foco a quien lo abrio', async () => {
      const Pantalla = ({ abierto }: { abierto: boolean }) => (
        <>
          <button id="disparador">Ver movimientos</button>
          <Modal abierto={abierto} titulo="Movimientos" onCerrar={vi.fn()}>
            <input aria-label="Filtro" />
          </Modal>
        </>
      );

      const { rerender } = render(<Pantalla abierto={false} />);
      const disparador = screen.getByRole('button', { name: 'Ver movimientos' });
      disparador.focus();

      rerender(<Pantalla abierto />);
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toContainElement(
          document.activeElement as HTMLElement,
        );
      });

      rerender(<Pantalla abierto={false} />);

      // El usuario vuelve exactamente donde estaba, no al principio del
      // documento. Es el criterio 2.4.3 de las WCAG.
      await waitFor(() => {
        expect(disparador).toHaveFocus();
      });
    });

    it('no falla si quien lo abrio ya no esta en el documento', async () => {
      const Pantalla = ({
        abierto,
        conBoton,
      }: {
        abierto: boolean;
        conBoton: boolean;
      }) => (
        <>
          {conBoton && <button>Ver</button>}
          <Modal abierto={abierto} titulo="T" onCerrar={vi.fn()}>
            <input aria-label="Filtro" />
          </Modal>
        </>
      );

      const { rerender } = render(<Pantalla abierto={false} conBoton />);
      screen.getByRole('button', { name: 'Ver' }).focus();
      rerender(<Pantalla abierto conBoton />);

      // La fila que abrio el modal desaparece mientras esta abierto: devolver el
      // foco a un nodo huerfano no haria nada, y hay que no romperse por ello.
      rerender(<Pantalla abierto={false} conBoton={false} />);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('desplazamiento del fondo', () => {
    /*
     * Mientras el modal esta abierto, la pagina de detras no debe desplazarse.
     * En tablet es especialmente molesto: se intenta desplazar el contenido del
     * modal y lo que se mueve es la tabla del fondo.
     */
    it('bloquea el desplazamiento de la pagina', () => {
      abrirModal();

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('lo restaura al cerrarse', () => {
      const { rerender } = render(
        <Modal abierto titulo="T" onCerrar={vi.fn()}>
          <p>x</p>
        </Modal>,
      );

      rerender(
        <Modal abierto={false} titulo="T" onCerrar={vi.fn()}>
          <p>x</p>
        </Modal>,
      );

      // No restaurarlo dejaria la pagina bloqueada para siempre tras cerrar el
      // primer modal de la sesion.
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });
});
