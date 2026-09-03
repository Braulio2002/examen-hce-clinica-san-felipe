import { Logger } from '@nestjs/common';

import { medirTiempo, ResultadoPaginado } from '@hce/compartido';

import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaVenta,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../dominio/entidades/inventario.entidades';
import {
  CriteriosKardex,
  FiltroPeriodo,
  InventarioRepositorio,
} from '../../dominio/puertos/inventario.repositorio';

/**
 * PATRON DECORATOR aplicado al repositorio de inventario.
 *
 * Aqui la trazabilidad no es cosmetica: las operaciones de compra y venta
 * ejecutan una transaccion que toca cinco tablas. Saber cuanto tarda cada una,
 * y cual fallo, es lo que permite diagnosticar una contencion de bloqueos en
 * hora punta de farmacia sin instrumentar el procedimiento almacenado.
 *
 * Se registra el identificador del documento y el numero de lineas, nunca el
 * detalle completo: reduce el ruido y evita volcar datos de la operacion
 * clinica en los logs.
 */
export class InventarioRepositorioTrazado implements InventarioRepositorio {
  private readonly logger = new Logger(InventarioRepositorioTrazado.name);

  constructor(private readonly interno: InventarioRepositorio) {}

  registrarCompra(lineas: readonly LineaCompra[], usuarioApp?: string): Promise<DocumentoCompra> {
    return medirTiempo(
      this.logger,
      `registrarCompra(${lineas.length} lineas, usuario=${usuarioApp ?? '-'})`,
      () => this.interno.registrarCompra(lineas, usuarioApp),
      1000,
    );
  }

  listarCompras(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return medirTiempo(this.logger, `listarCompras(pagina=${filtro.pagina})`, () =>
      this.interno.listarCompras(filtro),
    );
  }

  obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null> {
    return medirTiempo(this.logger, `obtenerCompra(${idCompraCab})`, () =>
      this.interno.obtenerCompra(idCompraCab),
    );
  }

  registrarVenta(lineas: readonly LineaVenta[], usuarioApp?: string): Promise<DocumentoVenta> {
    return medirTiempo(
      this.logger,
      `registrarVenta(${lineas.length} lineas, usuario=${usuarioApp ?? '-'})`,
      () => this.interno.registrarVenta(lineas, usuarioApp),
      1000,
    );
  }

  listarVentas(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return medirTiempo(this.logger, `listarVentas(pagina=${filtro.pagina})`, () =>
      this.interno.listarVentas(filtro),
    );
  }

  obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null> {
    return medirTiempo(this.logger, `obtenerVenta(${idVentaCab})`, () =>
      this.interno.obtenerVenta(idVentaCab),
    );
  }

  listarKardex(criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return medirTiempo(this.logger, `listarKardex(pagina=${criterios.pagina})`, () =>
      this.interno.listarKardex(criterios),
    );
  }

  movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]> {
    return medirTiempo(this.logger, `movimientosDeProducto(${idProducto})`, () =>
      this.interno.movimientosDeProducto(idProducto, fechaDesde, fechaHasta),
    );
  }
}
