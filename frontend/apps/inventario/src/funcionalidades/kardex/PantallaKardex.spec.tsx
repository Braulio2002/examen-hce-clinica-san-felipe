import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';
import type * as PaqueteUi from '@hce/ui';

const dobles = vi.hoisted(() => ({
  listarKardex: vi.fn(),
  movimientos: vi.fn(),
}));

vi.mock('@/compartido/api', () => ({
  apiHce: {
    kardex: { listar: dobles.listarKardex, movimientos: dobles.movimientos },
  },
}));

/*
 * El marco de la aplicacion trae la navegacion, que a su vez necesita el
 * contexto de sesion y el enrutador de Next. Sustituirlo por un contenedor
 * simple mantiene la prueba centrada en la pantalla del Kardex, que es lo que
 * se quiere verificar aqui.
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
  };
});

const { PantallaKardex } = await import('./PantallaKardex');

/**
 * Pruebas de la pantalla de Kardex.
 *
 * Es la pantalla mas consultada del sistema: responde a "cuanto tengo de esto".
 * Tres comportamientos merecen prueba propia:
 *
 *   1. La paginacion se resuelve en el SERVIDOR. Con un catalogo grande, traerlo
 *      entero para paginar en el navegador seria transferir miles de filas para
 *      mostrar diez. Se comprueba que la pagina viaja como parametro.
 *
 *   2. La busqueda espera antes de consultar. Sin esa espera, escribir
 *      "paracetamol" lanzaria once peticiones -una por letra- y las respuestas
 *      podrian llegar desordenadas y pintar resultados de una busqueda anterior.
 *
 *   3. Cambiar la busqueda vuelve a la pagina 1. Buscar estando en la pagina 3 y
 *      quedarse ahi da una tabla vacia cuando el nuevo filtro tiene menos
 *      resultados, y parece que la busqueda no encontro nada.
 */
describe('PantallaKardex', () => {
  const FILA = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    stockActual: 680,
    costo: 0.49,
    precioVenta: 0.66,
    valorizado: 333.2,
  };

  const META = { pagina: 1, tamanoPagina: 10, totalRegistros: 13, totalPaginas: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.listarKardex.mockResolvedValue({ datos: [FILA], meta: META });
    dobles.movimientos.mockResolvedValue([]);
  });

  describe('carga', () => {
    it('consulta el Kardex al entrar', async () => {
      render(<PantallaKardex />);

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalled();
      });
    });

    it('pide la primera pagina con el tamano configurado', async () => {
      render(<PantallaKardex />);

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledWith(
          expect.objectContaining({ pagina: 1, tamanoPagina: 10 }),
        );
      });
    });

    it('muestra las existencias de cada producto', async () => {
      render(<PantallaKardex />);

      expect(await screen.findByText('Paracetamol 500 mg')).toBeVisible();
      expect(screen.getByText('LT-2026-0001')).toBeVisible();
      expect(screen.getByText('680')).toBeVisible();
    });

    it('formatea los importes como moneda', async () => {
      render(<PantallaKardex />);

      await screen.findByText('Paracetamol 500 mg');
      // Con un solo producto, el valorizado de la fila y el total de la pantalla
      // coinciden: se buscan todas las apariciones en lugar de exigir una unica.
      expect(screen.getAllByText(/333[.,]20/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/333[.,]20/)[0]).toBeVisible();
    });

    it('la tabla lleva una descripcion para los lectores de pantalla', async () => {
      render(<PantallaKardex />);

      await screen.findByText('Paracetamol 500 mg');
      // El `<caption>` es lo que anuncia el lector antes de entrar en la tabla:
      // sin el, solo dice "tabla con 8 columnas".
      expect(screen.getByText(/Existencias actuales por producto/)).toBeInTheDocument();
    });
  });

  describe('estados vacios y de error', () => {
    it('sin productos lo explica en lugar de dejar la tabla en blanco', async () => {
      dobles.listarKardex.mockResolvedValue({
        datos: [],
        meta: { ...META, totalRegistros: 0, totalPaginas: 0 },
      });
      render(<PantallaKardex />);

      expect(await screen.findByText(/Todavia no hay productos/)).toBeVisible();
    });

    /*
     * El mensaje distingue "no hay nada" de "la busqueda no encontro nada". Son
     * situaciones distintas: en la segunda, la accion util es cambiar el
     * termino, no registrar productos.
     */
    it('sin coincidencias sugiere que el filtro es el problema', async () => {
      dobles.listarKardex.mockResolvedValue({
        datos: [],
        meta: { ...META, totalRegistros: 0, totalPaginas: 0 },
      });
      render(<PantallaKardex />);
      await screen.findByText(/Todavia no hay productos/);

      await userEvent.type(screen.getByLabelText('Buscar'), 'zzz');

      expect(await screen.findByText(/Ningun producto coincide/)).toBeVisible();
    });

    it('un fallo de la API se muestra con su mensaje', async () => {
      dobles.listarKardex.mockRejectedValue(
        new ErrorApi('PROHIBIDO', 'No tiene permiso para consultar el Kardex', 403),
      );
      render(<PantallaKardex />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No tiene permiso/);
    });

    it('un fallo desconocido usa un mensaje comprensible', async () => {
      dobles.listarKardex.mockRejectedValue(new TypeError('x is not a function'));
      render(<PantallaKardex />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cargar el Kardex.',
      );
    });

    it('el aviso de error se puede descartar', async () => {
      dobles.listarKardex.mockRejectedValue(new Error('x'));
      render(<PantallaKardex />);
      await screen.findByRole('alert');

      await userEvent.click(screen.getByRole('button', { name: 'Descartar mensaje' }));

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('busqueda', () => {
    /*
     * Escribir "para" son cuatro pulsaciones. Sin la espera serian cuatro
     * peticiones, y la del servidor no garantiza el orden de respuesta: la de
     * "par" puede llegar despues de la de "para" y pintar resultados obsoletos.
     */
    it('espera a que el usuario deje de escribir antes de consultar', async () => {
      render(<PantallaKardex />);
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(1);
      });
      dobles.listarKardex.mockClear();

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalledTimes(1);
      });
    });

    it('envia el texto buscado al servidor', async () => {
      render(<PantallaKardex />);
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalled();
      });

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenLastCalledWith(
          expect.objectContaining({ buscar: 'para' }),
        );
      });
    });

    it('un texto de solo espacios se envia como si no hubiera filtro', async () => {
      render(<PantallaKardex />);
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenCalled();
      });

      await userEvent.type(screen.getByLabelText('Buscar'), '   ');

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenLastCalledWith(
          expect.objectContaining({ buscar: undefined }),
        );
      });
    });
  });

  describe('paginacion', () => {
    it('ofrece navegar entre paginas', async () => {
      render(<PantallaKardex />);

      expect(
        await screen.findByRole('button', { name: 'Pagina siguiente' }),
      ).toBeVisible();
    });

    /*
     * La pagina viaja como parametro al servidor. Si se paginara en el
     * navegador habria que traer el catalogo entero para mostrar diez filas.
     */
    it('cambiar de pagina consulta al servidor, no filtra en el navegador', async () => {
      render(<PantallaKardex />);
      await screen.findByRole('button', { name: 'Pagina siguiente' });

      await userEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 2 }),
        );
      });
    });

    /*
     * Buscar estando en la pagina 3 y quedarse ahi devuelve una tabla vacia si
     * el nuevo filtro tiene menos de tres paginas, y el usuario cree que su
     * busqueda no encontro nada.
     */
    it('buscar vuelve a la primera pagina', async () => {
      render(<PantallaKardex />);
      await screen.findByRole('button', { name: 'Pagina siguiente' });
      await userEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 2 }),
        );
      });

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      await waitFor(() => {
        expect(dobles.listarKardex).toHaveBeenLastCalledWith(
          expect.objectContaining({ pagina: 1, buscar: 'para' }),
        );
      });
    });
  });

  describe('movimientos de un producto', () => {
    it('cada fila ofrece ver su historial', async () => {
      render(<PantallaKardex />);

      // La etiqueta incluye el nombre del producto: en una tabla con diez filas,
      // diez botones llamados "Ver" son indistinguibles para un lector.
      expect(
        await screen.findByRole('button', {
          name: 'Ver movimientos de Paracetamol 500 mg',
        }),
      ).toBeVisible();
    });

    it('al pulsarlo se abre el detalle de ese producto', async () => {
      render(<PantallaKardex />);
      const ver = await screen.findByRole('button', {
        name: 'Ver movimientos de Paracetamol 500 mg',
      });

      await userEvent.click(ver);

      expect(await screen.findByRole('dialog')).toBeVisible();
    });

    /*
     * Al cerrarlo, la pantalla olvida el producto seleccionado. Si no lo
     * hiciera, el modal se quedaria montado con datos viejos y al abrir el de
     * otro producto se verian los movimientos del anterior durante un instante.
     */
    it('al cerrarlo se olvida el producto seleccionado', async () => {
      render(<PantallaKardex />);
      await userEvent.click(
        await screen.findByRole('button', {
          name: 'Ver movimientos de Paracetamol 500 mg',
        }),
      );
      await screen.findByRole('dialog');

      const cierres = screen.getAllByRole('button', { name: 'Cerrar' });
      const ultimo = cierres.at(-1);
      if (!ultimo) throw new Error('No se encontro el boton de cerrar.');
      await userEvent.click(ultimo);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
