import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';
import type * as PaqueteUi from '@hce/ui';

const dobles = vi.hoisted(() => ({
  listar: vi.fn(),
  registrar: vi.fn(),
  actualizar: vi.fn(),
  puedeOperar: true,
}));

vi.mock('@/compartido/api', () => ({
  apiHce: {
    productos: {
      listar: dobles.listar,
      registrar: dobles.registrar,
      actualizar: dobles.actualizar,
    },
  },
}));

vi.mock('@hce/ui', async (importarOriginal) => {
  const original = await importarOriginal<typeof PaqueteUi>();
  return {
    ...original,
    MarcoAplicacion: ({
      titulo,
      acciones,
      children,
    }: {
      titulo: string;
      acciones?: React.ReactNode;
      children: React.ReactNode;
    }) => (
      <div>
        <h1>{titulo}</h1>
        {acciones}
        {children}
      </div>
    ),
    useSesion: () => ({
      usuario: {
        id: 1,
        username: 'admin',
        nombreCompleto: 'Administrador',
        rol: 'ADMIN',
      },
      cargando: false,
      puedeOperar: dobles.puedeOperar,
      iniciarSesion: vi.fn(),
      cerrarSesion: vi.fn(),
    }),
  };
});

const { PantallaProductos } = await import('./PantallaProductos');

/**
 * Pruebas del catalogo de productos.
 *
 * Vive en el shell y no en la zona de inventario, porque el catalogo es
 * transversal: lo consultan compras, ventas y Kardex. Es tambien la pantalla
 * donde la autorizacion mas se nota, porque los roles no cambian lo que se ve
 * sino lo que se puede hacer: CONSULTA ve la misma tabla, sin los botones.
 *
 * La busqueda y la paginacion son de servidor, igual que en el Kardex, y por
 * los mismos motivos.
 */
describe('PantallaProductos', () => {
  const PRODUCTO = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    fechaRegistro: '2026-09-01T08:00:00Z',
    costo: 0.49,
    precioVenta: 0.66,
    stockActual: 680,
  };

  const META = { pagina: 1, tamanoPagina: 10, totalRegistros: 13, totalPaginas: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.puedeOperar = true;
    dobles.listar.mockResolvedValue({ datos: [PRODUCTO], meta: META });
    dobles.registrar.mockResolvedValue({ ...PRODUCTO, idProducto: 2 });
    dobles.actualizar.mockResolvedValue(PRODUCTO);
  });

  describe('listado', () => {
    it('consulta el catalogo al entrar', async () => {
      render(<PantallaProductos />);

      await waitFor(() => {
        expect(dobles.listar).toHaveBeenCalled();
      });
    });

    it('muestra los datos de cada producto', async () => {
      render(<PantallaProductos />);

      expect(await screen.findByText('Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByText('LT-2026-0001')).toBeVisible();
    });

    it('muestra el stock con su indicador', async () => {
      render(<PantallaProductos />);

      await screen.findByText('Paracetamol 500 mg');
      expect(screen.getByText('680')).toBeVisible();
    });

    it('sin resultados lo explica', async () => {
      dobles.listar.mockResolvedValue({
        datos: [],
        meta: { ...META, totalRegistros: 0, totalPaginas: 0 },
      });
      render(<PantallaProductos />);

      expect(await screen.findByText('Sin resultados')).toBeVisible();
    });

    it('un fallo se muestra con el mensaje del servidor', async () => {
      dobles.listar.mockRejectedValue(
        new ErrorApi('SIN_CONEXION', 'No se pudo contactar con el servidor.', 0),
      );
      render(<PantallaProductos />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo contactar/);
    });
  });

  describe('permisos', () => {
    /*
     * El rol no cambia lo que se VE sino lo que se PUEDE HACER. Un usuario de
     * CONSULTA necesita el catalogo -para saber que hay y a que precio- pero no
     * debe poder modificarlo. Ocultarle la tabla entera seria excesivo; ocultar
     * los botones es lo justo.
     */
    it('CONSULTA ve el catalogo', async () => {
      dobles.puedeOperar = false;
      render(<PantallaProductos />);

      expect(await screen.findByText('Paracetamol 500 mg')).toBeVisible();
    });

    it('pero no puede crear productos', async () => {
      dobles.puedeOperar = false;
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      expect(
        screen.queryByRole('button', { name: 'Nuevo producto' }),
      ).not.toBeInTheDocument();
    });

    it('ni editarlos', async () => {
      dobles.puedeOperar = false;
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    });

    it('con permiso si aparecen las acciones', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
    });
  });

  describe('busqueda', () => {
    it('espera a que el usuario deje de escribir', async () => {
      render(<PantallaProductos />);
      await waitFor(() => {
        expect(dobles.listar).toHaveBeenCalledTimes(1);
      });
      dobles.listar.mockClear();

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      // Cuatro pulsaciones, una sola consulta.
      await waitFor(() => {
        expect(dobles.listar).toHaveBeenCalledTimes(1);
      });
    });

    it('envia el termino al servidor', async () => {
      render(<PantallaProductos />);
      await waitFor(() => {
        expect(dobles.listar).toHaveBeenCalled();
      });

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      await waitFor(() => {
        expect(dobles.listar).toHaveBeenLastCalledWith(
          expect.objectContaining({ buscar: 'para' }),
        );
      });
    });

    it('buscar vuelve a la primera pagina', async () => {
      render(<PantallaProductos />);
      await screen.findByRole('button', { name: 'Pagina siguiente' });
      await userEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
      await waitFor(() => {
        expect(dobles.listar).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 2 }),
        );
      });

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      await waitFor(() => {
        expect(dobles.listar).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 1 }),
        );
      });
    });
  });

  describe('paginacion', () => {
    it('la resuelve el servidor', async () => {
      render(<PantallaProductos />);
      await screen.findByRole('button', { name: 'Pagina siguiente' });

      await userEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));

      await waitFor(() => {
        expect(dobles.listar).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 2 }),
        );
      });
    });

    it('informa de cuantos productos hay en total', async () => {
      render(<PantallaProductos />);

      expect(await screen.findByText('13')).toBeVisible();
    });
  });

  describe('alta', () => {
    it('el boton abre el formulario', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      expect(await screen.findByRole('dialog', { name: 'Nuevo producto' })).toBeVisible();
    });

    it('el formulario llega vacio', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      const dialogo = await screen.findByRole('dialog');
      expect(within(dialogo).getByLabelText('Nombre del producto')).toHaveValue('');
    });
  });

  describe('edicion', () => {
    it('el boton de la fila abre el formulario con los datos cargados', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

      const dialogo = await screen.findByRole('dialog');
      expect(within(dialogo).getByLabelText('Nombre del producto')).toHaveValue(
        'Paracetamol 500 mg',
      );
    });

    it('el titulo distingue editar de crear', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

      expect(
        await screen.findByRole('dialog', { name: 'Editar producto' }),
      ).toBeVisible();
    });

    /*
     * Abrir "Nuevo producto" despues de haber editado tiene que dar un
     * formulario en blanco. La pantalla lo consigue forzando un montaje nuevo
     * con la clave del componente, en lugar de sincronizar el estado interno con
     * la prop; sin eso, el alta arrancaria con los datos del ultimo producto
     * editado y se acabaria duplicando ese producto por descuido.
     */
    it('tras editar, el alta vuelve a estar en blanco', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');

      await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await screen.findByRole('dialog');
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      const dialogo = await screen.findByRole('dialog');
      expect(within(dialogo).getByLabelText('Nombre del producto')).toHaveValue('');
    });
  });

  describe('tras guardar', () => {
    const rellenarYGuardar = async () => {
      const dialogo = await screen.findByRole('dialog');
      await waitFor(() => {
        expect(dialogo).toContainElement(document.activeElement as HTMLElement);
      });

      await userEvent.type(
        within(dialogo).getByLabelText('Nombre del producto'),
        'Amoxicilina 500 mg',
      );
      await userEvent.type(within(dialogo).getByLabelText('Numero de lote'), 'LT-99');
      await userEvent.type(within(dialogo).getByLabelText('Costo unitario'), '1.15');
      await userEvent.click(
        within(dialogo).getByRole('button', { name: 'Registrar producto' }),
      );
    };

    it('el alta llama al servicio de registro', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      await rellenarYGuardar();

      await waitFor(() => {
        expect(dobles.registrar).toHaveBeenCalledWith({
          nombreProducto: 'Amoxicilina 500 mg',
          nroLote: 'LT-99',
          costo: 1.15,
        });
      });
    });

    it('confirma el alta con el nombre del producto', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      await rellenarYGuardar();

      expect(await screen.findByRole('status')).toHaveTextContent(/Amoxicilina 500 mg/);
    });

    /*
     * Tras guardar hay que recargar el listado. Sin eso, el producto recien
     * creado no aparece en la tabla y el usuario cree que el alta fallo, aunque
     * el mensaje de confirmacion diga lo contrario.
     */
    it('recarga el listado para que el producto nuevo aparezca', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');
      await waitFor(() => {
        expect(dobles.listar).toHaveBeenCalledTimes(1);
      });
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      await rellenarYGuardar();

      await waitFor(() => {
        expect(dobles.listar.mock.calls.length).toBeGreaterThan(1);
      });
    });

    it('cierra el formulario', async () => {
      render(<PantallaProductos />);
      await screen.findByText('Paracetamol 500 mg');
      await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));

      await rellenarYGuardar();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
