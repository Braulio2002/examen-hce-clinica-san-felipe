'use client';

import { useRouter } from 'next/navigation';
import type React from 'react';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  api,
  inicializarApi,
  type PerfilUsuario,
  establecerToken,
  registrarManejadorExpiracion,
} from '@hce/api-cliente';

interface ContextoSesion {
  usuario: PerfilUsuario | null;
  cargando: boolean;
  iniciarSesion: (username: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  puedeOperar: boolean;
}

const Contexto = createContext<ContextoSesion | null>(null);

/**
 * Proveedor de sesion de la shell.
 *
 * El JWT vive en una cookie HttpOnly que JavaScript no puede leer. Por eso el
 * estado de sesion no se deduce del token sino que se consulta al servidor con
 * /auth/perfil: es la fuente de verdad y ademas refleja de inmediato una cuenta
 * desactivada, aunque su token siga dentro de la ventana de 30 minutos.
 *
 * El interceptor de respuesta del cliente HTTP avisa aqui cuando llega un 401,
 * de modo que la expiracion del token redirige al login desde un unico lugar
 * en lugar de repetir la comprobacion en cada pantalla.
 */
export function ProveedorSesion({
  urlApi,
  children,
}: Readonly<{ urlApi: string; children: ReactNode }>): React.JSX.Element {
  /*
   * La API se inicializa aqui, y no por un import de efecto lateral en el
   * layout.
   *
   * Ese patron -`import '@/compartido/api'` solo para que el modulo se
   * ejecute- es fragil: el empaquetador puede descartar una importacion cuyo
   * valor nadie usa, y eso fue exactamente lo que ocurrio al actualizar Next.
   * La pantalla de login quedaba sin cliente y fallaba con "La API no ha sido
   * inicializada", porque es la unica que no importa `apiHce` para nada mas.
   *
   * Este proveedor envuelve toda la aplicacion, asi que aqui la inicializacion
   * ocurre siempre. `inicializarApi` es idempotente: conserva la instancia si
   * ya existe, de modo que llamarla en cada render no crea clientes nuevos ni
   * pierde el token que guarda en memoria.
   */
  inicializarApi(urlApi);

  const [usuario, setUsuario] = useState<PerfilUsuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();

  const cerrarSesionLocal = useCallback(() => {
    establecerToken(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    registrarManejadorExpiracion(() => {
      cerrarSesionLocal();
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login')
      ) {
        // El parametro expirada permite mostrar el aviso correcto en el login.
        window.location.href = '/login?expirada=1';
      }
    });
  }, [cerrarSesionLocal]);

  useEffect(() => {
    let cancelado = false;

    api()
      .auth.perfil()
      .then((perfil) => {
        if (!cancelado) setUsuario(perfil);
      })
      .catch(() => {
        // Sin sesion valida: es el estado normal en el primer acceso.
        if (!cancelado) setUsuario(null);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const iniciarSesion = useCallback(
    async (username: string, password: string) => {
      const sesion = await api().auth.iniciarSesion(username, password);
      // Respaldo en memoria (nunca en localStorage) por si la cookie no viaja.
      establecerToken(sesion.accessToken);
      setUsuario(sesion.usuario);
      router.refresh();
    },
    [router],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await api().auth.cerrarSesion();
    } finally {
      cerrarSesionLocal();
      window.location.href = '/login';
    }
  }, [cerrarSesionLocal]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      usuario,
      cargando,
      iniciarSesion,
      cerrarSesion,
      // La misma regla de negocio que aplica el guard de roles del BackEnd.
      puedeOperar: usuario?.rol === 'ADMIN' || usuario?.rol === 'FARMACIA',
    }),
    [usuario, cargando, iniciarSesion, cerrarSesion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de ProveedorSesion.');
  }
  return contexto;
}
