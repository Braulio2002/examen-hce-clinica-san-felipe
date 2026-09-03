import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

import {
  ErrorConflicto,
  ErrorInfraestructura,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorStockInsuficiente,
  ErrorValidacion,
  ExcepcionDominio,
} from '../../dominio/excepciones/dominio.excepcion';

/** Valores primitivos que el driver mssql sabe enviar tal cual. */
export type ValorSql = string | number | boolean | Date | Buffer | null;

/** Un parametro de entrada de un procedimiento almacenado. */
export interface ParametroSql {
  readonly nombre: string;
  readonly tipo: sql.ISqlType | (() => sql.ISqlType);
  readonly valor: unknown;
}

/** Definicion de un Table-Valued Parameter. */
export interface ParametroTabla {
  readonly nombre: string;
  /** Nombre del tipo tabla en SQL Server, por ejemplo hce.TipoDetalleCompra. */
  readonly tipoTabla: string;
  readonly columnas: ReadonlyArray<{ nombre: string; tipo: sql.ISqlType | (() => sql.ISqlType) }>;
  readonly filas: ReadonlyArray<ReadonlyArray<ValorSql>>;
}

export interface OpcionesEjecucion {
  readonly parametros?: readonly ParametroSql[];
  readonly tablas?: readonly ParametroTabla[];
  readonly salidas?: readonly ParametroSql[];
}

/**
 * Adaptador de persistencia sobre SQL Server.
 *
 * Responsabilidad unica: administrar el pool de conexiones y ejecutar
 * procedimientos almacenados de forma parametrizada. No conoce entidades ni
 * reglas de negocio; los repositorios de cada microservicio lo usan a traves de
 * los puertos definidos en su capa de dominio.
 *
 * Toda entrada viaja como parametro tipado del driver, nunca concatenada: es la
 * defensa estructural contra inyeccion SQL.
 */
@Injectable()
export class MssqlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MssqlService.name);
  private pool?: sql.ConnectionPool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const configuracion: sql.config = {
      server: this.config.get<string>('DB_HOST', 'localhost'),
      port: Number(this.config.get<string>('DB_PORT', '1433')),
      database: this.config.get<string>('DB_NAME', 'HCE_Insumos'),
      user: this.config.get<string>('DB_USER', 'sa'),
      password: this.config.get<string>('DB_PASSWORD', ''),
      options: {
        // El contenedor de SQL Server usa un certificado autofirmado. En un
        // despliegue real esto se cambia por el certificado corporativo.
        encrypt: this.config.get<string>('DB_ENCRYPT', 'true') === 'true',
        trustServerCertificate:
          this.config.get<string>('DB_TRUST_SERVER_CERTIFICATE', 'true') === 'true',
        enableArithAbort: true,
      },
      pool: {
        max: Number(this.config.get<string>('DB_POOL_MAX', '10')),
        min: Number(this.config.get<string>('DB_POOL_MIN', '0')),
        idleTimeoutMillis: 30_000,
      },
      requestTimeout: Number(this.config.get<string>('DB_REQUEST_TIMEOUT', '30000')),
      connectionTimeout: Number(this.config.get<string>('DB_CONNECTION_TIMEOUT', '15000')),
    };

    await this.conectarConReintentos(configuracion);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.close();
    this.logger.log('Pool de conexiones cerrado.');
  }

  /**
   * Ejecuta un procedimiento almacenado y devuelve todos sus conjuntos de
   * resultados junto con los parametros de salida.
   */
  async ejecutarProcedimiento<T = Record<string, unknown>>(
    procedimiento: string,
    opciones: OpcionesEjecucion = {},
  ): Promise<{ conjuntos: T[][]; salidas: Record<string, unknown> }> {
    const request = this.obtenerPool().request();

    for (const p of opciones.parametros ?? []) {
      request.input(p.nombre, p.tipo as sql.ISqlType, p.valor ?? null);
    }

    for (const t of opciones.tablas ?? []) {
      request.input(t.nombre, this.construirTabla(t));
    }

    for (const s of opciones.salidas ?? []) {
      request.output(s.nombre, s.tipo as sql.ISqlType, s.valor ?? null);
    }

    try {
      const resultado = await request.execute(procedimiento);
      return {
        conjuntos: (resultado.recordsets as unknown as T[][]) ?? [],
        salidas: resultado.output ?? {},
      };
    } catch (error) {
      throw this.traducirError(error, procedimiento);
    }
  }

  /** Atajo para los procedimientos que devuelven un unico conjunto de filas. */
  async consultar<T = Record<string, unknown>>(
    procedimiento: string,
    opciones: OpcionesEjecucion = {},
  ): Promise<T[]> {
    const { conjuntos } = await this.ejecutarProcedimiento<T>(procedimiento, opciones);
    return conjuntos[0] ?? [];
  }

  /** Verificacion de disponibilidad usada por el endpoint de salud. */
  async verificarConexion(): Promise<boolean> {
    try {
      await this.obtenerPool().request().query('SELECT 1 AS activo');
      return true;
    } catch {
      return false;
    }
  }

  private obtenerPool(): sql.ConnectionPool {
    if (!this.pool?.connected) {
      throw new ErrorInfraestructura('No hay conexion activa con la base de datos.');
    }
    return this.pool;
  }

  private construirTabla(definicion: ParametroTabla): sql.Table {
    const tabla = new sql.Table(definicion.tipoTabla);
    tabla.create = false;

    for (const columna of definicion.columnas) {
      tabla.columns.add(columna.nombre, columna.tipo as sql.ISqlType, { nullable: false });
    }
    for (const fila of definicion.filas) {
      tabla.rows.add(...(fila as ValorSql[]));
    }
    return tabla;
  }

  /**
   * Reintento con espera incremental. SQL Server dentro de Docker tarda entre
   * 20 y 60 segundos en aceptar conexiones; sin esto el microservicio muere en
   * el arranque del docker-compose aunque la base termine levantando bien.
   */
  private async conectarConReintentos(configuracion: sql.config): Promise<void> {
    const maxIntentos = Number(this.config.get<string>('DB_MAX_REINTENTOS', '15'));
    const esperaMs = Number(this.config.get<string>('DB_ESPERA_REINTENTO_MS', '4000'));

    for (let intento = 1; intento <= maxIntentos; intento += 1) {
      try {
        this.pool = await new sql.ConnectionPool(configuracion).connect();
        this.pool.on('error', (err) => this.logger.error(`Error del pool: ${err.message}`));
        this.logger.log(
          `Conectado a SQL Server ${configuracion.server}:${configuracion.port}/${configuracion.database}`,
        );
        return;
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        if (intento === maxIntentos) {
          throw new ErrorInfraestructura(
            `No fue posible conectar con SQL Server tras ${maxIntentos} intentos: ${mensaje}`,
          );
        }
        this.logger.warn(
          `Intento ${intento}/${maxIntentos} de conexion fallido (${mensaje}). Reintentando en ${esperaMs} ms...`,
        );
        await new Promise((resolver) => setTimeout(resolver, esperaMs));
      }
    }
  }

  /**
   * Traduce los codigos de error que lanzan los procedimientos almacenados a
   * excepciones de dominio.
   *
   * Los rangos los definen los scripts de 03-stored-procedures.sql y
   * 02-triggers-auditoria.sql. Mantener el mapeo en un solo metodo evita que
   * cada repositorio invente su propia interpretacion del mismo error.
   */
  private traducirError(error: unknown, contexto: string): Error {
    if (error instanceof ExcepcionDominio) return error;

    const numero = (error as sql.RequestError | undefined)?.number;
    const mensaje =
      (error as { originalError?: { info?: { message?: string } }; message?: string })
        ?.originalError?.info?.message ??
      (error as Error)?.message ??
      'Error desconocido de base de datos.';

    switch (numero) {
      // Stock insuficiente: 54004 lo lanza el procedimiento, 51001 el trigger.
      case 51001:
      case 54004:
        return new ErrorStockInsuficiente(mensaje);

      // Bitacora de auditoria inmutable.
      case 51002:
        return new ErrorProhibido(mensaje);

      // Validaciones de entrada.
      case 52001:
      case 52002:
      case 52003:
      case 53001:
      case 53002:
      case 53003:
      case 53004:
      case 54001:
      case 54002:
      case 54003:
        return new ErrorValidacion(mensaje);

      // Duplicados y conflictos de estado.
      case 52004:
      case 52006:
        return new ErrorConflicto(mensaje);

      // Recurso inexistente.
      case 52005:
        return new ErrorNoEncontrado('Recurso');

      // Violacion de restriccion UNIQUE en el motor.
      case 2601:
      case 2627:
        return new ErrorConflicto('Ya existe un registro con los mismos datos identificatorios.');

      default:
        this.logger.error(`Fallo en ${contexto} (numero ${numero ?? 'n/d'}): ${mensaje}`);
        return new ErrorInfraestructura(
          'Ocurrio un error al acceder a la base de datos. Intente nuevamente.',
        );
    }
  }
}
