import type { ResultadoPaginado } from '@hce/compartido';

import type {
  LineaCompra,
  LineaVenta,
} from '../../../dominio/entidades/inventario.entidades';
import type {
  ConsultaKardex,
  ConsultaPeriodo,
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../modelos/inventario.modelos';

/**
 * CAPA 2 · APLICACION — Puertos de salida del inventario.
 *
 * Separados en tres interfaces por SEGREGACION DE INTERFACES (la I de SOLID):
 * un caso de uso de Kardex no debe depender de métodos de escritura de compras.
 * La raíz de composición puede satisfacerlas con una sola implementación o con
 * varias, sin que la aplicación cambie.
 */

export interface CompraRepositorio {
  registrarCompra(
    lineas: readonly LineaCompra[],
    usuarioApp?: string,
  ): Promise<DocumentoCompra>;
  listarCompras(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenCompra>>;
  obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null>;
}

export interface VentaRepositorio {
  registrarVenta(
    lineas: readonly LineaVenta[],
    usuarioApp?: string,
  ): Promise<DocumentoVenta>;
  listarVentas(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>>;
  obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null>;
}

export interface KardexRepositorio {
  listarKardex(consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>>;
  movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]>;
}

/** Contrato completo que satisface la pasarela de SQL Server. */
export type InventarioRepositorio = CompraRepositorio &
  VentaRepositorio &
  KardexRepositorio;

export const INVENTARIO_REPOSITORIO = Symbol('INVENTARIO_REPOSITORIO');
