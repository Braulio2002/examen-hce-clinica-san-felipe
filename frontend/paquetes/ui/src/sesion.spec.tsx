import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Se sustituyen las dos dependencias externas del proveedor: el enrutador de
 * Next -que no existe fuera de la aplicacion- y el cliente de la API.
 *
 * `vi.hoisted` es necesario porque `vi.mock` se eleva por encima de las
 * declaraciones del archivo: sin el, las funciones simuladas todavia no
 * existirian cuando se evalua la factoria del modulo simulado.
 */
const dobles = vi.hoisted(() => ({
  refresh: vi.fn(),
  perfil: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  establecerToken: vi.fn(),
  registrarManejadorExpiracion: vi.fn(),
  inicializarApi: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: dobles.refresh }),
}));

vi.mock('@hce/api-cliente', () => ({
  api: () => ({
    auth: {
      perfil: dobles.perfil,
      iniciarSesion: dobles.iniciarSesion,
      cerrarSesion: dobles.cerrarSesion,
    },
  }),
  inicializarApi: dobles.inicializarApi,
  establecerToken: dobles.establecerToken,
  registrarManejadorExpiracion: dobles.registrarManejadorExpiracion,
}));

const { ProveedorSesion, useSesion } = await import('./sesion');

/**
 * Pruebas del proveedor de sesion.
 *
 * Es el estado compartido del que dependen todas las pantallas: quien esta
 * dentro, si todavia se esta comprobando, y si puede operar el inventario.
 *
 * Dos cosas merecen atencion especial:
 *
 *   - `puedeOperar` DUPLICA a proposito la regla del guardia de roles del
 *     BackEnd. No es una comprobacion de seguridad -esa esta en el servidor y no
 *     se puede saltar-, es de experiencia: sirve para no mostrarle a un usuario
 *     de CONSULTA un boton que solo le va a devolver un 403.
 *
 *   - El estado `cargando` inicial. Sin el, la aplicacion pintaria la pantalla
 *     de login durante el instante que tarda en comprobar la sesion, y quien ya
 *     estaba dentro veria un parpadeo del formulario en cada recarga.
 */
describe('ProveedorSesion', () => {
  const PERFIL = {
    id: 1,
    username: 'admin',
    nombreCompleto: 'Administrador del Sistema',
    rol: 'ADMIN' as const,
  };

  /** Componente de prueba que vuelca el contexto en la pantalla. */
  function Espia(): React.JSX.Element {
    const { usuario, cargando, puedeOperar, iniciarSesion, cerrarSesion } = useSesion();

    return (
      <div>
        <span data-testid="cargando">{String(cargando)}</span>
        <span data-testid="usuario">{usuario?.username ?? 'ninguno'}</span>
        <span data-testid="puede-operar">{String(puedeOperar)}</span>
        <button onClick={() => void iniciarSesion('admin', 'clave')}>Entrar</button>
        {/*
         * El manejador captura el fallo del cierre de sesion, igual que debe
         * hacerlo el codigo real: `cerrarSesion` relanza si el servidor no
         * responde. Observacion de diseno: como el `finally` del proveedor ya
         * navega al login, ese relanzamiento no lo puede aprovechar nadie y en
         * el navegador se convierte en un rechazo sin capturar en la consola.
         * No se cambia el codigo de produccion desde una prueba, pero queda
         * anotado.
         */}
        <button onClick={() => void cerrarSesion().catch(() => undefined)}>Salir</button>
      </div>
    );
  }

  const montar = () =>
    render(
      <ProveedorSesion urlApi="http://localhost:4000/api">
        <Espia />
      </ProveedorSesion>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    dobles.perfil.mockResolvedValue(PERFIL);
    dobles.iniciarSesion.mockResolvedValue({ accessToken: 'tok', usuario: PERFIL });
    dobles.cerrarSesion.mockResolvedValue(undefined);
  });

  describe('arranque', () => {
    it('inicializa la API con la URL recibida', () => {
      montar();

      // La URL llega por prop y no de un import con efecto secundario: el
      // empaquetador de Next 16 descarta esos imports, y con ellos la
      // inicializacion desaparecia sin previo aviso.
      expect(dobles.inicializarApi).toHaveBeenCalledWith('http://localhost:4000/api');
    });

    it('empieza cargando, para no parpadear el login a quien ya tiene sesion', () => {
      montar();

      expect(screen.getByTestId('cargando')).toHaveTextContent('true');
    });

    it('consulta el perfil al montarse', async () => {
      montar();

      await waitFor(() => {
        expect(dobles.perfil).toHaveBeenCalled();
      });
    });

    it('con sesion valida deja al usuario disponible', async () => {
      montar();

      await waitFor(() => {
        expect(screen.getByTestId('usuario')).toHaveTextContent('admin');
      });
      expect(screen.getByTestId('cargando')).toHaveTextContent('false');
    });

    /*
     * Que no haya sesion es el estado NORMAL del primer acceso, no un error.
     * Por eso se captura en silencio: registrar un fallo cada vez que alguien
     * abre la aplicacion sin haber entrado llenaria la consola de ruido.
     */
    it('sin sesion valida termina de cargar sin usuario y sin ruido', async () => {
      dobles.perfil.mockRejectedValue(new Error('401'));
      montar();

      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('usuario')).toHaveTextContent('ninguno');
    });

    it('registra el manejador de expiracion de sesion', () => {
      montar();

      expect(dobles.registrarManejadorExpiracion).toHaveBeenCalled();
    });
  });

  describe('permisos', () => {
    /*
     * La misma matriz que aplica el guardia de roles del BackEnd. Se repite
     * aqui a proposito: el servidor decide, y esto solo evita ensenar botones
     * que van a devolver 403.
     */
    it.each([
      ['ADMIN', true],
      ['FARMACIA', true],
      ['CONSULTA', false],
    ] as const)('%s puede operar el inventario: %s', async (rol, esperado) => {
      dobles.perfil.mockResolvedValue({ ...PERFIL, rol });
      montar();

      await waitFor(() => {
        expect(screen.getByTestId('puede-operar')).toHaveTextContent(String(esperado));
      });
    });

    it('sin usuario no se puede operar', async () => {
      dobles.perfil.mockRejectedValue(new Error('401'));
      montar();

      await waitFor(() => {
        expect(screen.getByTestId('puede-operar')).toHaveTextContent('false');
      });
    });
  });

  describe('inicio de sesion', () => {
    it('envia las credenciales al servicio', async () => {
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(dobles.iniciarSesion).toHaveBeenCalledWith('admin', 'clave');
    });

    /*
     * El token se guarda en MEMORIA como respaldo. El mecanismo principal es la
     * cookie HttpOnly, que JavaScript no puede leer; esto cubre los clientes que
     * no usan cookies. Nunca va a localStorage: lo que hay ahi lo puede leer
     * cualquier script inyectado en la pagina.
     */
    it('guarda el token en memoria como respaldo', async () => {
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => {
        expect(dobles.establecerToken).toHaveBeenCalledWith('tok');
      });
    });

    it('deja al usuario disponible tras entrar', async () => {
      dobles.perfil.mockRejectedValue(new Error('401'));
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => {
        expect(screen.getByTestId('usuario')).toHaveTextContent('admin');
      });
    });

    it('refresca el enrutador para que los componentes de servidor se rehagan', async () => {
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => {
        expect(dobles.refresh).toHaveBeenCalled();
      });
    });
  });

  describe('cierre de sesion', () => {
    it('avisa al servidor, que es quien borra la cookie', async () => {
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Salir' }));

      await waitFor(() => {
        expect(dobles.cerrarSesion).toHaveBeenCalled();
      });
    });

    /*
     * El estado local se limpia en el `finally`, no en el camino de exito. Es
     * deliberado: si la llamada al servidor falla -sin conexion, por ejemplo- el
     * usuario ha pedido salir y tiene que salir. Dejarlo dentro porque el
     * logout dio error seria lo contrario de lo que pidio.
     */
    it('limpia el token aunque el servidor no responda', async () => {
      dobles.cerrarSesion.mockRejectedValue(new Error('sin conexion'));
      montar();
      await waitFor(() => {
        expect(screen.getByTestId('cargando')).toHaveTextContent('false');
      });

      await userEvent.click(screen.getByRole('button', { name: 'Salir' }));

      await waitFor(() => {
        expect(dobles.establecerToken).toHaveBeenCalledWith(null);
      });
    });
  });

  describe('useSesion fuera del proveedor', () => {
    /*
     * Fallar con un mensaje explicito ahorra un rato de desconcierto: el sintoma
     * natural seria "no se puede leer 'usuario' de null" en una linea que no
     * tiene nada que ver con el proveedor que falta.
     */
    it('falla diciendo exactamente que falta', () => {
      // React registra en consola todo error lanzado al renderizar. Se silencia
      // con un espia -que `restoreAllMocks` deshace- en lugar de reasignar
      // `console.error`, que dejaria la consola tocada si la prueba fallara
      // antes de restaurarla.
      const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect(() => render(<Espia />)).toThrow(/dentro de ProveedorSesion/);

      consola.mockRestore();
    });
  });
});
