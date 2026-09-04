'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';
import { Suspense, useEffect, useState } from 'react';

import { ErrorApi } from '@hce/api-cliente';
import { Alerta, Boton, Campo, useSesion } from '@hce/ui';

function FormularioLogin(): React.JSX.Element {
  const router = useRouter();
  const parametros = useSearchParams();
  const { iniciarSesion, usuario } = useSesion();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sesionExpirada = parametros.get('expirada') === '1';
  const destino = parametros.get('destino') ?? '/';

  // Si ya hay sesion valida, no tiene sentido mostrar el formulario.
  useEffect(() => {
    if (usuario) router.replace(destino);
  }, [usuario, router, destino]);

  const enviar = async (evento: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Ingrese usuario y contrasena.');
      return;
    }

    setEnviando(true);
    try {
      await iniciarSesion(username.trim(), password);
      router.replace(destino);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi
          ? fallo.mensaje
          : 'No fue posible iniciar sesion. Intente nuevamente.',
      );
      setPassword('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main
      id="contenido"
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-clinica-50 px-4 py-10"
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clinica-600 text-white shadow-lg shadow-clinica-600/20">
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 2h4v6h6v4h-6v6h-4v-6H4V8h6V2Z" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            HCE Insumos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestion de medicamentos e insumos medicos
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          {sesionExpirada && (
            <div className="mb-5">
              <Alerta tipo="aviso" titulo="Su sesion expiro">
                Por seguridad, la sesion caduca a los 30 minutos. Vuelva a ingresar.
              </Alerta>
            </div>
          )}

          {error && (
            <div className="mb-5">
              <Alerta tipo="error" onCerrar={() => setError(null)}>
                {error}
              </Alerta>
            </div>
          )}

          <form onSubmit={enviar} noValidate className="space-y-4">
            <Campo
              etiqueta="Usuario"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={enviando}
            />
            <Campo
              etiqueta="Contrasena"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={enviando}
            />
            <Boton type="submit" tamano="lg" cargando={enviando} className="w-full">
              {enviando ? 'Verificando...' : 'Ingresar'}
            </Boton>
          </form>

          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-600">Usuarios de demostracion</p>
            <ul className="space-y-0.5">
              <li>
                <code className="text-slate-700">admin / Admin123$</code> — acceso total
              </li>
              <li>
                <code className="text-slate-700">farmacia / Farmacia123$</code> — compras
                y ventas
              </li>
              <li>
                <code className="text-slate-700">consulta / Consulta123$</code> — solo
                lectura
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          La sesion se protege con un token JWT de 30 minutos almacenado en una cookie
          HttpOnly.
        </p>
      </div>
    </main>
  );
}

export default function PaginaLogin(): React.JSX.Element {
  // useSearchParams exige un limite de Suspense en el App Router.
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <FormularioLogin />
    </Suspense>
  );
}
