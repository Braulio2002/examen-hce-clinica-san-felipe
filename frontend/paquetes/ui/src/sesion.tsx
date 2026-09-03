'use client';

import {
  api,
  PerfilUsuario,
  establecerToken,
  registrarManejadorExpiracion,
} from '@hce/api-cliente';
import { useRouter } from 'next/navigation';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

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
export function ProveedorSesion({ children }: { children: ReactNode }): React.JSX.Element {
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
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
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
