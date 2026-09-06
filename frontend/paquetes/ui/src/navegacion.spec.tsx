import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dobles = vi.hoisted(() => ({
  cerrarSesion: vi.fn(),
  rutaCliente: '/',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => dobles.rutaCliente,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...resto
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} data-enlace="cliente" {...resto}>
      {children}
    </a>
  ),
}));

vi.mock('./sesion', () => ({
  useSesion: () => ({
    usuario: {
      id: 1,
      username: 'admin',
      nombreCompleto: 'Administrador del Sistema',
      rol: 'ADMIN',
    },
    cargando: false,
    puedeOperar: true,
    iniciarSesion: vi.fn(),
    cerrarSesion: dobles.cerrarSesion,
  }),
}));

const { NavegacionPrincipal, rutaEnZona } = await import('./navegacion');

/**
 * Pruebas de la navegacion principal.
 *
 * Es el componente donde vive la consecuencia mas visible de la arquitectura de
 * microfront. Con Multi-Zones hay DOS aplicaciones Next independientes -el shell
 * y la zona de inventario- servidas bajo el mismo dominio, y eso obliga a
 * distinguir dos tipos de enlace:
 *
 *   - Dentro de la misma zona: navegacion de cliente con `<Link>`, instantanea.
 *   - Hacia la otra zona: un `<a>` normal, que provoca una carga completa.
 *
 * Si todo fueran `<Link>`, ir de Productos a Compras daria un 404: el enrutador
 * del shell no conoce las rutas de la zona de inventario. Y si todo fueran
 * `<a>`, se perderia la navegacion instantanea dentro de cada zona.
 *
 * Ese fallo se dio de verdad durante el desarrollo, y esta prueba es lo que
 * impide que vuelva.
 */
describe('NavegacionPrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dobles.rutaCliente = '/';
  });

  describe('enlaces', () => {
    it('ofrece las cinco secciones del sistema', () => {
      render(<NavegacionPrincipal />);

      for (const seccion of ['Inicio', 'Productos', 'Compras', 'Ventas', 'Kardex']) {
        expect(
          screen.getAllByRole('link', { name: new RegExp(seccion) }).length,
        ).toBeGreaterThan(0);
      }
    });

    it('se identifica como navegacion para los lectores de pantalla', () => {
      render(<NavegacionPrincipal />);

      expect(
        screen.getByRole('navigation', { name: 'Navegacion principal' }),
      ).toBeVisible();
    });

    /*
     * Desde el shell -zona sin basePath-, los enlaces al inventario tienen que
     * ser `<a>` de toda la vida. Un `<Link>` intentaria resolver
     * `/inventario/compras` con el enrutador del shell, que no conoce esa ruta,
     * y el usuario veria un 404.
     */
    it('desde el shell, los enlaces a la otra zona son navegacion completa', () => {
      render(<NavegacionPrincipal />);

      const compras = screen.getAllByRole('link', { name: /Compras/ })[0];
      expect(compras).not.toHaveAttribute('data-enlace', 'cliente');
      expect(compras).toHaveAttribute('href', '/inventario/compras');
    });

    it('dentro de la misma zona usa navegacion de cliente', () => {
      render(<NavegacionPrincipal />);

      // Productos vive en el shell, igual que esta navegacion: se puede navegar
      // sin recargar.
      const productos = screen.getAllByRole('link', { name: /Productos/ })[0];
      expect(productos).toHaveAttribute('data-enlace', 'cliente');
    });
  });

  describe('seccion activa', () => {
    /*
     * `usePathname` devuelve la ruta SIN el basePath de la zona. Dentro del
     * inventario devuelve "/kardex", mientras que los enlaces se declaran en
     * absoluto como "/inventario/kardex". Sin recomponer la ruta, dentro de la
     * zona no se marcaba nada como activo y el usuario perdia la referencia de
     * donde estaba.
     */
    it('marca la seccion en la que se esta', () => {
      render(<NavegacionPrincipal rutaActual="/productos" />);

      const productos = screen.getAllByRole('link', { name: /Productos/ })[0];
      expect(productos).toHaveAttribute('aria-current', 'page');
    });

    it('no marca las demas', () => {
      render(<NavegacionPrincipal rutaActual="/productos" />);

      const compras = screen.getAllByRole('link', { name: /Compras/ })[0];
      expect(compras).not.toHaveAttribute('aria-current');
    });

    it('marca la seccion aunque se este en una subruta', () => {
      render(<NavegacionPrincipal rutaActual="/inventario/compras/3" />);

      const compras = screen.getAllByRole('link', { name: /Compras/ })[0];
      expect(compras).toHaveAttribute('aria-current', 'page');
    });

    /*
     * Inicio se compara por igualdad exacta y no por prefijo. Con `startsWith`,
     * "/" seria prefijo de todo y el inicio quedaria marcado en todas las
     * pantallas a la vez.
     */
    it('Inicio solo esta activo en la raiz', () => {
      render(<NavegacionPrincipal rutaActual="/productos" />);

      const inicio = screen.getAllByRole('link', { name: /Inicio/ })[0];
      expect(inicio).not.toHaveAttribute('aria-current');
    });

    it('en la raiz si lo marca', () => {
      render(<NavegacionPrincipal rutaActual="/" />);

      const inicio = screen.getAllByRole('link', { name: /Inicio/ })[0];
      expect(inicio).toHaveAttribute('aria-current', 'page');
    });

    it('sin ruta explicita usa la del enrutador', () => {
      dobles.rutaCliente = '/productos';
      render(<NavegacionPrincipal />);

      const productos = screen.getAllByRole('link', { name: /Productos/ })[0];
      expect(productos).toHaveAttribute('aria-current', 'page');
    });
  });

  /*
   * El menu plegable es el que se ve por debajo de `lg`, es decir el de las
   * TABLETS, que son el dispositivo de planta. No es un extra para moviles: es
   * la navegacion principal del puesto de trabajo real.
   *
   * Tiene ademas la misma distincion de zonas que el de escritorio. Antes todos
   * sus enlaces eran `<a>`, de modo que cada cambio de pantalla en tablet
   * recargaba la aplicacion entera; la prueba fija que eso no vuelva a pasar.
   */
  /*
   * Next resuelve las rutas de un `<Link>` relativas al `basePath` de la zona,
   * asi que un enlace absoluto hay que recortarlo antes de pasarlo. Es la unica
   * transformacion no evidente del componente y por eso tiene funcion propia.
   */
  describe('rutaEnZona', () => {
    it('en el shell -sin basePath- deja la ruta tal cual', () => {
      expect(rutaEnZona('/productos', '')).toBe('/productos');
    });

    it('dentro del inventario recorta el prefijo de la zona', () => {
      // Sin el recorte, Next resolveria `/inventario/inventario/compras`.
      expect(rutaEnZona('/inventario/compras', '/inventario')).toBe('/compras');
    });

    /*
     * El enlace a la raiz de la propia zona: el recorte deja una cadena vacia, y
     * un `<Link href="">` significa para Next "la URL actual", no la portada.
     */
    it('la raiz de la zona se convierte en la barra, no en una cadena vacia', () => {
      expect(rutaEnZona('/inventario', '/inventario')).toBe('/');
    });

    it('la raiz del shell tambien es la barra', () => {
      expect(rutaEnZona('/', '')).toBe('/');
    });
  });

  describe('menu plegable de tablet', () => {
    const abrirMenu = async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Abrir menu de navegacion' }),
      );
    };

    it('empieza cerrado', () => {
      render(<NavegacionPrincipal />);

      expect(
        screen.getByRole('button', { name: 'Abrir menu de navegacion' }),
      ).toHaveAttribute('aria-expanded', 'false');
    });

    it('cerrado hay una sola navegacion en la pagina', () => {
      render(<NavegacionPrincipal />);

      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });

    it('al pulsarlo se despliega', async () => {
      render(<NavegacionPrincipal />);

      await abrirMenu();

      expect(screen.getAllByRole('navigation')).toHaveLength(2);
    });

    it('lo declara con aria-expanded', async () => {
      render(<NavegacionPrincipal />);

      await abrirMenu();

      // Sin esto, quien usa lector de pantalla no sabe si el menu esta
      // desplegado o si el boton no hizo nada.
      expect(
        screen.getByRole('button', { name: 'Abrir menu de navegacion' }),
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('ofrece las mismas cinco secciones', async () => {
      render(<NavegacionPrincipal />);

      await abrirMenu();

      for (const seccion of ['Inicio', 'Productos', 'Compras', 'Ventas', 'Kardex']) {
        expect(
          screen.getAllByRole('link', { name: new RegExp(seccion) }).length,
        ).toBeGreaterThanOrEqual(2);
      }
    });

    it('dentro de la zona usa navegacion de cliente', async () => {
      render(<NavegacionPrincipal />);
      await abrirMenu();

      const enlaces = screen.getAllByRole('link', { name: /Productos/ });
      expect(enlaces.at(-1)).toHaveAttribute('data-enlace', 'cliente');
    });

    it('hacia la otra zona usa navegacion completa', async () => {
      render(<NavegacionPrincipal />);
      await abrirMenu();

      // El mismo criterio que en escritorio, y aqui pesa mas: es la navegacion
      // que se usa de verdad en el puesto.
      const enlaces = screen.getAllByRole('link', { name: /Compras/ });
      expect(enlaces.at(-1)).not.toHaveAttribute('data-enlace', 'cliente');
    });

    it('marca la seccion activa igual que el de escritorio', async () => {
      render(<NavegacionPrincipal rutaActual="/productos" />);
      await abrirMenu();

      const enlaces = screen.getAllByRole('link', { name: /Productos/ });
      expect(enlaces.at(-1)).toHaveAttribute('aria-current', 'page');
    });

    it('tambien cuando la seccion activa es de la otra zona', async () => {
      render(<NavegacionPrincipal rutaActual="/inventario/compras" />);
      await abrirMenu();

      // Un enlace de otra zona se sirve como `<a>`, pero sigue teniendo que
      // marcarse como la pagina actual: estar en otra zona no significa estar
      // en ningun sitio.
      const enlaces = screen.getAllByRole('link', { name: /Compras/ });
      expect(enlaces.at(-1)).toHaveAttribute('aria-current', 'page');
    });

    /*
     * Elegir una seccion cierra el menu. Sin eso, al llegar a la pantalla nueva
     * el menu sigue desplegado tapandola, y hay que cerrarlo a mano en cada
     * navegacion.
     */
    it('elegir una seccion de la misma zona lo cierra', async () => {
      render(<NavegacionPrincipal />);
      await abrirMenu();

      const enlaces = screen.getAllByRole('link', { name: /Productos/ });
      const delMenu = enlaces.at(-1);
      if (!delMenu) throw new Error('No se encontro el enlace del menu plegable.');
      await userEvent.click(delMenu);

      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });

    it('elegir una seccion de la otra zona tambien lo cierra', async () => {
      render(<NavegacionPrincipal />);
      await abrirMenu();

      const enlaces = screen.getAllByRole('link', { name: /Compras/ });
      const delMenu = enlaces.at(-1);
      if (!delMenu) throw new Error('No se encontro el enlace del menu plegable.');
      await userEvent.click(delMenu);

      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });

    it('se puede volver a cerrar con el mismo boton', async () => {
      render(<NavegacionPrincipal />);
      await abrirMenu();

      await abrirMenu();

      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });
  });

  describe('sesion', () => {
    it('muestra quien esta dentro', () => {
      render(<NavegacionPrincipal />);

      // Ver el propio nombre confirma de un vistazo con que cuenta se esta
      // trabajando, que en un puesto compartido de farmacia no es trivial.
      expect(screen.getByText('Administrador del Sistema')).toBeVisible();
    });

    it('ofrece cerrar sesion con una etiqueta accesible', async () => {
      render(<NavegacionPrincipal />);

      const salir = screen.getByRole('button', { name: 'Cerrar sesion' });
      await userEvent.click(salir);

      // El boton es solo un icono: sin `aria-label` seria un boton sin nombre
      // para quien usa lector de pantalla.
      expect(dobles.cerrarSesion).toHaveBeenCalledTimes(1);
    });
  });
});
