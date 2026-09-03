import { medirTiempo, RegistroPuerto, ResultadoPaginado } from '@hce/compartido';

import { LineaCompra, LineaVenta } from '../../dominio/entidades/inventario.entidades';
import {
  ConsultaKardex,
  ConsultaPeriodo,
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../aplicacion/modelos/inventario.modelos';
import { InventarioRepositorio } from '../../aplicacion/puertos/salida/inventario.repositorio';

/**
 * CAPA 3 · ADAPTADORES — PATRON DECORATOR sobre la pasarela de inventario.
 *
 * Aquí la trazabilidad no es cosmética: las operaciones de compra y venta
 * ejecutan una transacción que toca cinco tablas. Saber cuánto tarda cada una, y
 * cuál falló, es lo que permite diagnosticar una contención de bloqueos en hora
 * punta de farmacia sin instrumentar el procedimiento almacenado.
 *
 * El umbral de "operación lenta" es mayor en las escrituras (1 s) que en las
 * lecturas (500 ms por defecto): una transacción con bloqueo legítimamente tarda
 * más, y avisar antes de tiempo solo generaría ruido en los logs.
 *
 * Se registra el identificador del documento y el número de líneas, nunca el
 * detalle completo: reduce el ruido y evita volcar datos de la operación
 * clínica en los registros.
 */
export class InventarioPasarelaTrazada implements InventarioRepositorio {
  /** Umbral de alerta para operaciones transaccionales de escritura. */
  private static readonly UMBRAL_ESCRITURA_MS = 1000;

  constructor(
    private readonly interno: InventarioRepositorio,
    private readonly registro: RegistroPuerto,
  ) {}

  /* --- Compras -------------------------------------------------------------- */

  registrarCompra(lineas: readonly LineaCompra[], usuarioApp?: string): Promise<DocumentoCompra> {
    return medirTiempo(
      this.registro,
      `registrarCompra(${lineas.length} lineas, usuario=${usuarioApp ?? '-'})`,
      () => this.interno.registrarCompra(lineas, usuarioApp),
      InventarioPasarelaTrazada.UMBRAL_ESCRITURA_MS,
    );
  }

  listarCompras(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return medirTiempo(this.registro, `listarCompras(pagina=${consulta.pagina ?? 1})`, () =>
      this.interno.listarCompras(consulta),
    );
  }

  obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null> {
    return medirTiempo(this.registro, `obtenerCompra(${idCompraCab})`, () =>
      this.interno.obtenerCompra(idCompraCab),
    );
  }

  /* --- Ventas --------------------------------------------------------------- */

  registrarVenta(lineas: readonly LineaVenta[], usuarioApp?: string): Promise<DocumentoVenta> {
    return medirTiempo(
      this.registro,
      `registrarVenta(${lineas.length} lineas, usuario=${usuarioApp ?? '-'})`,
      () => this.interno.registrarVenta(lineas, usuarioApp),
      InventarioPasarelaTrazada.UMBRAL_ESCRITURA_MS,
    );
  }

  listarVentas(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return medirTiempo(this.registro, `listarVentas(pagina=${consulta.pagina ?? 1})`, () =>
      this.interno.listarVentas(consulta),
    );
  }

  obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null> {
    return medirTiempo(this.registro, `obtenerVenta(${idVentaCab})`, () =>
      this.interno.obtenerVenta(idVentaCab),
    );
  }

  /* --- Kardex --------------------------------------------------------------- */

  listarKardex(consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return medirTiempo(this.registro, `listarKardex(pagina=${consulta.pagina ?? 1})`, () =>
      this.interno.listarKardex(consulta),
    );
  }

  movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]> {
    return medirTiempo(this.registro, `movimientosDeProducto(${idProducto})`, () =>
      this.interno.movimientosDeProducto(idProducto, fechaDesde, fechaHasta),
    );
  }
}
