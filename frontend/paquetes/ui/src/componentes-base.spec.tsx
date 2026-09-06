import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Boton } from './boton';
import { Campo } from './campo';
import { Paginacion } from './paginacion';
import { ResumenTotales } from './resumen-totales';
import { EtiquetaStock } from './stock';

/**
 * Pruebas de los componentes base del sistema de diseno.
 *
 * Se consultan por ROL y por texto accesible, no por clase CSS ni por
 * estructura de nodos. La diferencia no es de estilo: una prueba que busca
 * `.btn-primario` se rompe al renombrar una clase aunque el boton siga
 * funcionando, y no se entera si el boton deja de ser accesible. Consultando
 * como lo haria una persona -o un lector de pantalla- la prueba falla cuando
 * cambia el comportamiento, que es cuando debe fallar.
 *
 * Por eso mismo estas pruebas cubren accesibilidad sin proponerselo: si el
 * `aria-label` desaparece, la consulta deja de encontrar el elemento.
 */
describe('Componentes base', () => {
  describe('Boton', () => {
    it('muestra su contenido y es accesible por rol', () => {
      render(<Boton>Registrar compra</Boton>);

      expect(screen.getByRole('button', { name: 'Registrar compra' })).toBeVisible();
    });

    /*
     * El tipo por defecto es `button` y no `submit`, que es el de HTML. Es una
     * decision: dentro de un formulario, un boton sin tipo explicito lo envia al
     * pulsarlo. Un "Anadir linea" que enviara la compra entera seria un fallo
     * caro y muy dificil de atribuir.
     */
    it('por defecto no envia el formulario que lo contiene', () => {
      render(<Boton>Anadir linea</Boton>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('se puede declarar como boton de envio cuando toca', () => {
      render(<Boton type="submit">Entrar</Boton>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('llama al manejador al pulsarlo', async () => {
      const alPulsar = vi.fn();
      render(<Boton onClick={alPulsar}>Guardar</Boton>);

      await userEvent.click(screen.getByRole('button'));

      expect(alPulsar).toHaveBeenCalledTimes(1);
    });

    /*
     * Mientras carga, el boton se deshabilita. Es la defensa contra el doble
     * envio: sin ella, dos clics rapidos registran la venta dos veces y
     * descuentan el stock por partida doble.
     */
    it('cargando queda deshabilitado: evita el doble envio', async () => {
      const alPulsar = vi.fn();
      render(
        <Boton cargando onClick={alPulsar}>
          Registrando
        </Boton>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('button')).toBeDisabled();
      expect(alPulsar).not.toHaveBeenCalled();
    });

    it('cargando lo anuncia a los lectores de pantalla', () => {
      render(<Boton cargando>Registrando</Boton>);

      // `aria-busy` es lo que informa de que la operacion sigue en curso a quien
      // no puede ver el indicador giratorio.
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('deshabilitado no responde al clic', async () => {
      const alPulsar = vi.fn();
      render(
        <Boton disabled onClick={alPulsar}>
          Guardar
        </Boton>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(alPulsar).not.toHaveBeenCalled();
    });

    it.each(['primario', 'secundario', 'peligro', 'fantasma'] as const)(
      'la variante %s se renderiza',
      (variante) => {
        render(<Boton variante={variante}>Accion</Boton>);

        expect(screen.getByRole('button')).toBeVisible();
      },
    );

    it.each(['sm', 'md', 'lg'] as const)('el tamano %s se renderiza', (tamano) => {
      render(<Boton tamano={tamano}>Accion</Boton>);

      expect(screen.getByRole('button')).toBeVisible();
    });

    it('acepta un icono a la izquierda del texto', () => {
      render(<Boton iconoIzquierda={<span data-testid="icono" />}>Nuevo</Boton>);

      expect(screen.getByTestId('icono')).toBeInTheDocument();
    });

    it('el icono se sustituye por el indicador mientras carga', () => {
      render(
        <Boton cargando iconoIzquierda={<span data-testid="icono" />}>
          Nuevo
        </Boton>,
      );

      expect(screen.queryByTestId('icono')).not.toBeInTheDocument();
    });
  });

  describe('Campo', () => {
    /*
     * La etiqueta se asocia al input por `htmlFor`/`id`. Eso es lo que hace que
     * `getByLabelText` lo encuentre, y tambien lo que hace que pulsar la
     * etiqueta enfoque el campo y que un lector de pantalla lo anuncie. Si la
     * asociacion se rompe, esta consulta deja de encontrarlo.
     */
    it('la etiqueta identifica al campo', () => {
      render(<Campo etiqueta="Nombre del producto" />);

      expect(screen.getByLabelText('Nombre del producto')).toBeVisible();
    });

    it('genera un identificador propio si no se le da uno', () => {
      render(
        <>
          <Campo etiqueta="Uno" />
          <Campo etiqueta="Dos" />
        </>,
      );

      // Dos campos en la misma pantalla no pueden compartir `id`: la etiqueta
      // del segundo apuntaria al primero.
      const uno = screen.getByLabelText('Uno');
      const dos = screen.getByLabelText('Dos');
      expect(uno.id).not.toBe(dos.id);
    });

    it('respeta el identificador que se le pase', () => {
      render(<Campo etiqueta="Costo" id="costo" />);

      expect(screen.getByLabelText('Costo')).toHaveAttribute('id', 'costo');
    });

    it('escribe lo que el usuario teclea', async () => {
      const alCambiar = vi.fn();
      render(<Campo etiqueta="Buscar" onChange={alCambiar} />);

      await userEvent.type(screen.getByLabelText('Buscar'), 'para');

      expect(alCambiar).toHaveBeenCalled();
    });

    describe('mensaje de error', () => {
      it('se muestra con rol de alerta', () => {
        render(<Campo etiqueta="Costo" error="El costo es obligatorio" />);

        // El rol `alert` hace que el lector de pantalla lo anuncie en cuanto
        // aparece, sin esperar a que el usuario llegue navegando hasta el.
        expect(screen.getByRole('alert')).toHaveTextContent('El costo es obligatorio');
      });

      it('marca el campo como invalido', () => {
        render(<Campo etiqueta="Costo" error="obligatorio" />);

        expect(screen.getByLabelText('Costo')).toHaveAttribute('aria-invalid', 'true');
      });

      it('enlaza el mensaje con el campo', () => {
        render(<Campo etiqueta="Costo" error="obligatorio" id="costo" />);

        // Sin `aria-describedby`, el lector anuncia "Costo, campo de texto" y el
        // usuario nunca se entera de por que no puede continuar.
        expect(screen.getByLabelText('Costo')).toHaveAttribute(
          'aria-describedby',
          'costo-error',
        );
      });
    });

    describe('texto de ayuda', () => {
      it('se muestra cuando no hay error', () => {
        render(
          <Campo etiqueta="Precio" ayuda="Si se omite se calcula con margen 1.35" />,
        );

        expect(screen.getByText(/margen 1.35/)).toBeVisible();
      });

      it('lo enlaza con el campo', () => {
        render(<Campo etiqueta="Precio" ayuda="opcional" id="precio" />);

        expect(screen.getByLabelText('Precio')).toHaveAttribute(
          'aria-describedby',
          'precio-ayuda',
        );
      });

      /*
       * El error tiene prioridad sobre la ayuda. Mostrar los dos a la vez
       * competiria por la atencion en el momento en que el usuario mas necesita
       * saber que hacer, y `aria-describedby` solo puede apuntar a uno.
       */
      it('el error lo desplaza: no compiten por la atencion', () => {
        render(<Campo etiqueta="Precio" ayuda="opcional" error="Debe ser positivo" />);

        expect(screen.getByRole('alert')).toBeVisible();
        expect(screen.queryByText('opcional')).not.toBeInTheDocument();
      });
    });
  });

  describe('EtiquetaStock', () => {
    /*
     * Tres estados con umbral en 20 unidades. Lo que se comprueba es el TEXTO y
     * no el color: quien no distingue colores tiene que poder saber que un
     * producto esta bajo de stock, y por eso el aviso esta escrito, no solo
     * pintado de ambar.
     */
    it('sin unidades avisa con palabras, no solo con color', () => {
      render(<EtiquetaStock stock={0} />);

      expect(screen.getByText('Sin stock')).toBeVisible();
    });

    it('el stock negativo tambien se trata como agotado', () => {
      render(<EtiquetaStock stock={-3} />);

      expect(screen.getByText('Sin stock')).toBeVisible();
    });

    it.each([1, 10, 20])('con %s unidades marca stock bajo', (stock) => {
      render(<EtiquetaStock stock={stock} />);

      expect(screen.getByText(`${stock} (bajo)`)).toBeVisible();
    });

    it('a partir de 21 unidades muestra solo la cifra', () => {
      render(<EtiquetaStock stock={21} />);

      expect(screen.getByText('21')).toBeVisible();
    });

    it('con stock holgado no dice nada de bajo', () => {
      render(<EtiquetaStock stock={680} />);

      expect(screen.getByText('680')).toBeVisible();
      expect(screen.queryByText(/bajo/)).not.toBeInTheDocument();
    });
  });

  describe('ResumenTotales', () => {
    const totales = { subTotal: 125, igv: 22.5, total: 147.5 };

    it('muestra las tres cifras del comprobante', () => {
      render(<ResumenTotales totales={totales} />);

      expect(screen.getByText('Subtotal')).toBeVisible();
      expect(screen.getByText('IGV')).toBeVisible();
      expect(screen.getByText('Total')).toBeVisible();
    });

    it('formatea los importes como moneda', () => {
      render(<ResumenTotales totales={totales} />);

      // El importe crudo -125- no debe llegar a la pantalla: se muestra con su
      // simbolo y sus dos decimales.
      expect(screen.getByText(/125[.,]00/)).toBeVisible();
      expect(screen.getByText(/147[.,]50/)).toBeVisible();
    });

    it('muestra ceros cuando el documento esta vacio', () => {
      render(<ResumenTotales totales={{ subTotal: 0, igv: 0, total: 0 }} />);

      expect(screen.getAllByText(/0[.,]00/).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Paginacion', () => {
    const meta = (parcial: Partial<Parameters<typeof Paginacion>[0]['meta']> = {}) => ({
      pagina: 1,
      tamanoPagina: 20,
      totalRegistros: 45,
      totalPaginas: 3,
      ...parcial,
    });

    it('dice que rango se esta viendo y cuantos hay en total', () => {
      render(<Paginacion meta={meta()} onCambiarPagina={vi.fn()} />);

      expect(screen.getByText('1-20')).toBeVisible();
      expect(screen.getByText('45')).toBeVisible();
    });

    it('el rango se ajusta a la pagina actual', () => {
      render(<Paginacion meta={meta({ pagina: 2 })} onCambiarPagina={vi.fn()} />);

      expect(screen.getByText('21-40')).toBeVisible();
    });

    it('la ultima pagina no promete mas registros de los que hay', () => {
      render(<Paginacion meta={meta({ pagina: 3 })} onCambiarPagina={vi.fn()} />);

      // 45 registros de 20 en 20: la tercera pagina llega hasta el 45, no al 60.
      expect(screen.getByText('41-45')).toBeVisible();
    });

    it('indica en que pagina se esta', () => {
      render(<Paginacion meta={meta({ pagina: 2 })} onCambiarPagina={vi.fn()} />);

      expect(screen.getByText(/Pagina 2 de 3/)).toBeVisible();
    });

    /*
     * Sin resultados no se muestra nada. Una barra de paginacion que dice
     * "Pagina 1 de 0" sobre una tabla vacia es ruido: el mensaje de "no hay
     * resultados" ya lo explica todo.
     */
    it('desaparece cuando no hay resultados', () => {
      const { container } = render(
        <Paginacion
          meta={meta({ totalRegistros: 0, totalPaginas: 0 })}
          onCambiarPagina={vi.fn()}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('avanza a la pagina siguiente', async () => {
      const cambiar = vi.fn();
      render(<Paginacion meta={meta()} onCambiarPagina={cambiar} />);

      await userEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));

      expect(cambiar).toHaveBeenCalledWith(2);
    });

    it('retrocede a la anterior', async () => {
      const cambiar = vi.fn();
      render(<Paginacion meta={meta({ pagina: 3 })} onCambiarPagina={cambiar} />);

      await userEvent.click(screen.getByRole('button', { name: 'Pagina anterior' }));

      expect(cambiar).toHaveBeenCalledWith(2);
    });

    it('en la primera pagina no se puede retroceder', () => {
      render(<Paginacion meta={meta()} onCambiarPagina={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Pagina anterior' })).toBeDisabled();
    });

    it('en la ultima no se puede avanzar', () => {
      render(<Paginacion meta={meta({ pagina: 3 })} onCambiarPagina={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Pagina siguiente' })).toBeDisabled();
    });

    it('se identifica como navegacion para los lectores de pantalla', () => {
      render(<Paginacion meta={meta()} onCambiarPagina={vi.fn()} />);

      expect(screen.getByRole('navigation', { name: 'Paginacion' })).toBeVisible();
    });

    it('el nombre de los elementos se puede adaptar a la pantalla', () => {
      render(
        <Paginacion meta={meta()} onCambiarPagina={vi.fn()} elementos="productos" />,
      );

      expect(screen.getByText(/productos/)).toBeVisible();
    });
  });
});
