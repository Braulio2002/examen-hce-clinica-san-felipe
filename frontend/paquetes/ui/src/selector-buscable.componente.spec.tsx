import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectorBuscable } from './selector-buscable';

/**
 * Pruebas del selector buscable como COMPONENTE.
 *
 * La funcion de coincidencia -acentos, palabras sueltas, busqueda por lote- ya
 * tiene su propio archivo de pruebas, que la ejercita como funcion pura. Aqui
 * se prueba lo otro: el comportamiento del control.
 *
 * Es un combobox segun el patron ARIA, y eso implica un contrato concreto de
 * teclado. Importa mas de lo que parece: en farmacia se registra con las manos
 * ocupadas y el raton es incomodo. Que las flechas recorran las opciones y
 * Enter seleccione no es un extra, es la forma normal de usar esta pantalla.
 *
 * El detalle mas fino del patron es que el foco NUNCA sale del campo de texto.
 * La opcion resaltada se comunica con `aria-activedescendant`, de modo que el
 * usuario puede seguir escribiendo para afinar la busqueda mientras navega por
 * los resultados. Mover el foco a la lista obligaria a volver al campo para
 * cada correccion.
 */
describe('SelectorBuscable', () => {
  const OPCIONES = [
    {
      id: 1,
      etiqueta: 'Paracetamol 500 mg',
      terminosExtra: 'LT-001',
      nota: 'Lote LT-001',
    },
    {
      id: 2,
      etiqueta: 'Ibuprofeno 400 mg',
      terminosExtra: 'LT-002',
      nota: 'Lote LT-002',
    },
    {
      id: 3,
      etiqueta: 'Amoxicilina 500 mg',
      terminosExtra: 'LT-003',
      nota: 'sin stock',
      deshabilitada: true,
    },
  ];

  const montar = (props: Partial<Parameters<typeof SelectorBuscable>[0]> = {}) => {
    const onSeleccionar = vi.fn();

    render(
      <SelectorBuscable
        etiqueta="Agregar producto"
        opciones={OPCIONES}
        onSeleccionar={onSeleccionar}
        {...props}
      />,
    );

    return { onSeleccionar, campo: screen.getByRole('combobox') };
  };

  describe('contrato ARIA de combobox', () => {
    it('el campo se anuncia como combobox', () => {
      montar();

      expect(screen.getByRole('combobox', { name: 'Agregar producto' })).toBeVisible();
    });

    it('cerrado lo declara', () => {
      montar();

      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    });

    it('al escribir se abre y lo declara', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'para');

      await waitFor(() => {
        expect(campo).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('la lista se anuncia como listbox con el nombre del campo', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'para');

      expect(
        await screen.findByRole('listbox', { name: 'Agregar producto' }),
      ).toBeVisible();
    });

    it('cada resultado se anuncia como opcion', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'mg');

      expect((await screen.findAllByRole('option')).length).toBeGreaterThan(1);
    });
  });

  describe('busqueda', () => {
    it('filtra segun lo que se escribe', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'ibu');

      const listado = await screen.findByRole('listbox');
      expect(listado).toHaveTextContent('Ibuprofeno 400 mg');
      expect(listado).not.toHaveTextContent('Paracetamol');
    });

    it('encuentra tambien por numero de lote', async () => {
      const { campo } = montar();

      // En farmacia se suele tener la caja delante: teclear el lote es mas
      // rapido y menos propenso a error que teclear el nombre completo.
      await userEvent.type(campo, 'LT-002');

      expect(await screen.findByRole('listbox')).toHaveTextContent('Ibuprofeno 400 mg');
    });

    it('muestra la nota de cada opcion', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'para');

      expect(await screen.findByText(/Lote LT-001/)).toBeVisible();
    });

    it('sin coincidencias lo dice', async () => {
      const { campo } = montar({ sinResultados: 'Ningun producto coincide.' });

      await userEvent.type(campo, 'zzzz');

      expect(await screen.findByText('Ningun producto coincide.')).toBeVisible();
    });

    it('muestra el texto de ayuda', () => {
      montar({ ayuda: 'Busca por nombre o por lote.' });

      expect(screen.getByText('Busca por nombre o por lote.')).toBeVisible();
    });

    it('muestra el marcador de posicion', () => {
      montar({ marcador: 'Escriba nombre o lote...' });

      expect(screen.getByPlaceholderText('Escriba nombre o lote...')).toBeVisible();
    });
  });

  describe('seleccion con el raton', () => {
    it('elegir una opcion avisa con su identificador', async () => {
      const { campo, onSeleccionar } = montar();

      await userEvent.type(campo, 'para');
      await userEvent.click(await screen.findByText('Paracetamol 500 mg'));

      expect(onSeleccionar).toHaveBeenCalledWith(1);
    });

    it('tras elegir, la lista se cierra', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'para');
      await userEvent.click(await screen.findByText('Paracetamol 500 mg'));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    /*
     * Una opcion deshabilitada -un producto sin stock- se muestra pero no se
     * puede elegir. Ocultarla seria peor: el usuario buscaria el producto, no lo
     * encontraria y concluiria que no existe, cuando lo que pasa es que se acabo.
     */
    it('una opcion deshabilitada no se puede elegir', async () => {
      const { campo, onSeleccionar } = montar();

      await userEvent.type(campo, 'amoxi');
      await userEvent.click(await screen.findByText('Amoxicilina 500 mg'));

      expect(onSeleccionar).not.toHaveBeenCalled();
    });

    it('pero si se muestra, con su motivo', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'amoxi');

      expect(await screen.findByText(/sin stock/)).toBeVisible();
    });

    it('se marca como deshabilitada para los lectores de pantalla', async () => {
      const { campo } = montar();

      await userEvent.type(campo, 'amoxi');

      expect(await screen.findByRole('option')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('manejo con teclado', () => {
    it('la flecha abajo abre la lista', async () => {
      const { campo } = montar();

      campo.focus();
      await userEvent.keyboard('{ArrowDown}');

      expect(await screen.findByRole('listbox')).toBeVisible();
    });

    it('las flechas recorren las opciones', async () => {
      const { campo } = montar();
      await userEvent.type(campo, 'mg');
      await screen.findByRole('listbox');

      await userEvent.keyboard('{ArrowDown}');

      // La opcion activa se comunica por `aria-activedescendant`, no moviendo el
      // foco: asi se puede seguir escribiendo para afinar mientras se navega.
      await waitFor(() => {
        expect(campo).toHaveAttribute('aria-activedescendant');
      });
    });

    it('el foco no abandona el campo de texto', async () => {
      const { campo } = montar();
      await userEvent.type(campo, 'mg');
      await screen.findByRole('listbox');

      await userEvent.keyboard('{ArrowDown}{ArrowDown}');

      expect(campo).toHaveFocus();
    });

    it('Enter elige la opcion resaltada', async () => {
      const { campo, onSeleccionar } = montar();
      await userEvent.type(campo, 'para');
      await screen.findByRole('listbox');

      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onSeleccionar).toHaveBeenCalledWith(1);
    });

    it('Escape cierra la lista sin elegir nada', async () => {
      const { campo, onSeleccionar } = montar();
      await userEvent.type(campo, 'para');
      await screen.findByRole('listbox');

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(onSeleccionar).not.toHaveBeenCalled();
    });

    it('la flecha arriba tambien navega', async () => {
      const { campo } = montar();
      await userEvent.type(campo, 'mg');
      await screen.findByRole('listbox');

      await userEvent.keyboard('{ArrowDown}{ArrowUp}');

      expect(campo).toHaveFocus();
    });
  });

  describe('estado de carga', () => {
    it('mientras carga lo indica', () => {
      montar({ cargando: true });

      // Sin esto, un catalogo que tarda parece un catalogo vacio y el usuario
      // empieza a teclear creyendo que no hay nada.
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('cargado, el campo se puede usar', () => {
      montar({ cargando: false });

      expect(screen.getByRole('combobox')).toBeEnabled();
    });
  });
});
