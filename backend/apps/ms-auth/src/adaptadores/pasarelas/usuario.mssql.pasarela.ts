import * as sql from 'mssql';

import type { MssqlService } from '@hce/compartido';

import type { UsuarioRepositorio } from '../../aplicacion/puertos/salida/usuario.repositorio';
import { type RolUsuario, Usuario } from '../../dominio/entidades/usuario.entidad';

/** Forma cruda de la fila que devuelve hce.usp_Usuario_ObtenerPorUsername. */
interface FilaUsuario {
  Id_Usuario: number;
  Username: string;
  PasswordHash: string;
  NombreCompleto: string;
  Rol: RolUsuario;
  Activo: boolean;
}

/**
 * CAPA 3 · ADAPTADORES — Pasarela (Gateway) de usuarios contra SQL Server.
 *
 * En la terminología de Clean Architecture esto es un *gateway*: implementa un
 * puerto de salida declarado por la aplicación y traduce entre el modelo de la
 * base y las entidades del dominio.
 *
 * Es la única clase del microservicio que conoce nombres de procedimientos y de
 * columnas. Si la persistencia cambiara a PostgreSQL o a un proveedor de
 * identidad externo, solo se sustituye este archivo.
 */
export class UsuarioMssqlPasarela implements UsuarioRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  async buscarPorUsername(username: string): Promise<Usuario | null> {
    const filas = await this.mssql.consultar<FilaUsuario>(
      'hce.usp_Usuario_ObtenerPorUsername',
      {
        parametros: [{ nombre: 'Username', tipo: sql.NVarChar(50), valor: username }],
      },
    );

    const fila = filas[0];
    if (!fila) return null;

    return new Usuario(
      fila.Id_Usuario,
      fila.Username,
      fila.NombreCompleto,
      fila.Rol,
      fila.Activo,
      fila.PasswordHash,
    );
  }
}
