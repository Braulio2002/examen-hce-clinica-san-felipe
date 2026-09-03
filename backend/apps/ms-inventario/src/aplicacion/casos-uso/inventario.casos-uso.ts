import { Inject, Injectable, Logger } from '@nestjs/common';

import { ErrorNoEncontrado, ErrorValidacion, ResultadoPaginado } from '@hce/compartido';

import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaVenta,
  MovimientoProducto,
  ReglasDocumento,
  ResumenCompra,
  ResumenVenta,
} from '../../dominio/entidades/inventario.entidades';
import {
  CriteriosKardex,
  FiltroPeriodo,
  INVENTARIO_REPOSITORIO,
  InventarioRepositorio,
} from '../../dominio/puertos/inventario.repositorio';

/**
 * Casos de uso del inventario.
 *
 * Cada uno resuelve una operacion del enunciado y depende unicamente del puerto
 * InventarioRepositorio.
 */

/** Registrar Compra (seccion 1.2.1). */
@Injectable()
export class RegistrarCompraCasoUso {
  private readonly logger = new Logger(RegistrarCompraCasoUso.name);

  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  async ejecutar(lineas: readonly LineaCompra[], usuarioApp?: string): Promise<DocumentoCompra> {
    try {
      ReglasDocumento.validarLineasCompra(lineas);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    const compra = await this.repositorio.registrarCompra(lineas, usuarioApp);

    this.logger.log(
      `Compra ${compra.idCompraCab} registrada con ${compra.detalle.length} linea(s). ` +
        `Total ${compra.total}. Se genero movimiento de Entrada y se actualizo el precio de venta.`,
    );
    return compra;
  }
}

/** Listar Compra. */
@Injectable()
export class ListarComprasCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  ejecutar(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return this.repositorio.listarCompras(filtro);
  }
}

/** Obtener el detalle de una compra. */
@Injectable()
export class ObtenerCompraCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  async ejecutar(idCompraCab: number): Promise<DocumentoCompra> {
    const compra = await this.repositorio.obtenerCompra(idCompraCab);
    if (!compra) throw new ErrorNoEncontrado('Compra', idCompraCab);
    return compra;
  }
}

/**
 * Registrar Venta (seccion 1.2.2).
 *
 * La validacion de stock NO se hace aqui leyendo el stock y comparando: entre
 * la lectura y la escritura otra venta concurrente podria consumir la misma
 * existencia. Se delega al procedimiento almacenado, que valida y escribe
 * dentro de una unica transaccion con bloqueo. Este caso de uso solo valida la
 * forma del documento y traduce el resultado.
 */
@Injectable()
export class RegistrarVentaCasoUso {
  private readonly logger = new Logger(RegistrarVentaCasoUso.name);

  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  async ejecutar(lineas: readonly LineaVenta[], usuarioApp?: string): Promise<DocumentoVenta> {
    try {
      ReglasDocumento.validarLineasVenta(lineas);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    const venta = await this.repositorio.registrarVenta(lineas, usuarioApp);

    this.logger.log(
      `Venta ${venta.idVentaCab} registrada con ${venta.detalle.length} linea(s). ` +
        `Total ${venta.total}. Se genero movimiento de Salida.`,
    );
    return venta;
  }
}

/** Listar Venta. */
@Injectable()
export class ListarVentasCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  ejecutar(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return this.repositorio.listarVentas(filtro);
  }
}

/** Obtener el detalle de una venta. */
@Injectable()
export class ObtenerVentaCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  async ejecutar(idVentaCab: number): Promise<DocumentoVenta> {
    const venta = await this.repositorio.obtenerVenta(idVentaCab);
    if (!venta) throw new ErrorNoEncontrado('Venta', idVentaCab);
    return venta;
  }
}

/** Listar Kardex (seccion 1.2.3). */
@Injectable()
export class ListarKardexCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  ejecutar(criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return this.repositorio.listarKardex(criterios);
  }
}

/** Movimientos de un producto (modal del Kardex). */
@Injectable()
export class MovimientosProductoCasoUso {
  constructor(
    @Inject(INVENTARIO_REPOSITORIO) private readonly repositorio: InventarioRepositorio,
  ) {}

  ejecutar(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]> {
    if (!Number.isInteger(idProducto) || idProducto <= 0) {
      throw new ErrorValidacion('El identificador de producto no es valido.');
    }
    return this.repositorio.movimientosDeProducto(idProducto, fechaDesde, fechaHasta);
  }
}
