import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';

import { MssqlService } from '@hce/compartido';

import { RolUsuario, Usuario } from '../../dominio/entidades/usuario.entidad';
import { UsuarioRepositorio } from '../../dominio/puertos/usuario.repositorio';

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
 * Adaptador de salida: implementacion del puerto UsuarioRepositorio contra
 * SQL Server.
 *
 * Es la unica clase del microservicio que conoce nombres de procedimientos y
 * de columnas. Si manana la persistencia cambia a PostgreSQL o a un proveedor
 * de identidad externo, solo se sustituye este archivo.
 */
@Injectable()
export class UsuarioMssqlRepositorio implements UsuarioRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  async buscarPorUsername(username: string): Promise<Usuario | null> {
    const filas = await this.mssql.consultar<FilaUsuario>('hce.usp_Usuario_ObtenerPorUsername', {
      parametros: [{ nombre: 'Username', tipo: sql.NVarChar(50), valor: username }],
    });

    const fila = filas[0];
    if (!fila) return null;

    return new Usuario(
      fila.Id_Usuario,
      fila.Username,
      fila.NombreCompleto,
      fila.Rol,
      Boolean(fila.Activo),
      fila.PasswordHash,
    );
  }
}
