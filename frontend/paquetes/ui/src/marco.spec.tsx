import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const dobles = vi.hoisted(() => ({ cargando: false }));

vi.mock('./navegacion', () => ({
  NavegacionPrincipal: () => <nav aria-label="Navegacion principal" />,
}));

vi.mock('./sesion', () => ({
  useSesion: () => ({
    usuario: { id: 1, username: 'admin', nombreCompleto: 'Administrador', rol: 'ADMIN' },
    cargando: dobles.cargando,
    puedeOperar: true,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
  }),
}));

const { MarcoAplicacion } = await import('./marco');

/**
 * Pruebas del marco de la aplicacion.
 *
 * Es la estructura que comparten todas las pantallas: navegacion, encabezado y
 * el contenido. Su valor esta en la ESTRUCTURA SEMANTICA que impone, que es
 * facil de perder al refactorizar hacia divs.
 *
 * Un `<main>` y un unico `<h1>` por pagina no son formalismo: son lo que permite
 * a un lector de pantalla saltar directamente al contenido y saber donde esta.
 * Sin ellos, cada pantalla obliga a recorrer la navegacion entera desde el
 * principio.
 */
describe('MarcoAplicacion', () => {
  const montar = (props: Partial<Parameters<typeof MarcoAplicacion>[0]> = {}) =>
    render(
      <MarcoAplicacion titulo="Catalogo de productos" {...props}>
        <p>contenido de la pantalla</p>
      </MarcoAplicacion>,
    );

  describe('estructura', () => {
    it('incluye la navegacion principal', () => {
      dobles.cargando = false;
      montar();

      expect(
        screen.getByRole('navigation', { name: 'Navegacion principal' }),
      ).toBeVisible();
    });

    /*
     * El contenido va dentro de `<main>`, que es lo que permite el salto directo
     * "ir al contenido" de los lectores de pantalla. Con un `<div>` habria que
     * recorrer la navegacion completa en cada pantalla.
     */
    it('el contenido vive dentro de un elemento principal', () => {
      dobles.cargando = false;
      montar();

      expect(screen.getByRole('main')).toBeVisible();
    });

    it('el titulo es el encabezado de nivel uno de la pagina', () => {
      dobles.cargando = false;
      montar();

      // Uno solo por pagina: es el que anuncia el lector al entrar y el que
      // responde a "donde estoy".
      expect(
        screen.getByRole('heading', { level: 1, name: 'Catalogo de productos' }),
      ).toBeVisible();
    });

    it('muestra la descripcion cuando se le da una', () => {
      dobles.cargando = false;
      montar({ descripcion: 'Medicamentos e insumos registrados.' });

      expect(screen.getByText('Medicamentos e insumos registrados.')).toBeVisible();
    });

    it('muestra las acciones del encabezado', () => {
      dobles.cargando = false;
      montar({ acciones: <button>Nuevo producto</button> });

      expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeVisible();
    });

    it('renderiza el contenido de la pantalla', () => {
      dobles.cargando = false;
      montar();

      expect(screen.getByText('contenido de la pantalla')).toBeVisible();
    });
  });

  describe('mientras se comprueba la sesion', () => {
    /*
     * El marco no pinta el contenido hasta saber si hay sesion. Sin esa espera,
     * cada pantalla lanzaria sus consultas antes de tener token, recibiria un
     * 401 y mostraria un error que desaparece solo un instante despues: un
     * parpadeo de fallo que no es tal.
     */
    it('no pinta el contenido todavia', () => {
      dobles.cargando = true;
      montar();

      expect(screen.queryByText('contenido de la pantalla')).not.toBeInTheDocument();
    });

    it('pero el titulo si se ve, para no dejar la pagina en blanco', () => {
      dobles.cargando = true;
      montar();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Catalogo de productos' }),
      ).toBeVisible();
    });

    it('la navegacion sigue disponible', () => {
      dobles.cargando = true;
      montar();

      // Se puede cambiar de seccion aunque el contenido aun no este listo.
      expect(screen.getByRole('navigation')).toBeVisible();
    });
  });
});
