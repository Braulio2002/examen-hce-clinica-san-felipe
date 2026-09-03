import { ResultadoPaginado } from '@hce/compartido';

import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaVenta,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../entidades/inventario.entidades';

export interface FiltroPeriodo {
  readonly fechaDesde?: string;
  readonly fechaHasta?: string;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export interface CriteriosKardex {
  readonly buscar?: string;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

/**
 * Puerto de salida del agregado Inventario.
 *
 * Separado en tres interfaces por segregacion de interfaces (ISP): un caso de
 * uso de Kardex no debe depender de metodos de escritura de compras. El modulo
 * puede proveer una sola implementacion que las satisfaga todas, o
 * implementaciones distintas, sin que el dominio cambie.
 */

export interface CompraRepositorio {
  registrarCompra(lineas: readonly LineaCompra[], usuarioApp?: string): Promise<DocumentoCompra>;
  listarCompras(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>>;
  obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null>;
}

export interface VentaRepositorio {
  registrarVenta(lineas: readonly LineaVenta[], usuarioApp?: string): Promise<DocumentoVenta>;
  listarVentas(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>>;
  obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null>;
}

export interface KardexRepositorio {
  listarKardex(criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>>;
  movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]>;
}

/** Contrato completo que satisface el adaptador de SQL Server. */
export type InventarioRepositorio = CompraRepositorio & VentaRepositorio & KardexRepositorio;

export const INVENTARIO_REPOSITORIO = Symbol('INVENTARIO_REPOSITORIO');
