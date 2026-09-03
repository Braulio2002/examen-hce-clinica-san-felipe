import { normalizarPaginacion, ResultadoPaginado } from '@hce/compartido';

import { ConsultaPeriodo, ResumenCompra } from '../modelos/inventario.modelos';
import { ListarComprasPuerto } from '../puertos/entrada/inventario.puertos';
import { CompraRepositorio } from '../puertos/salida/inventario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Listar Compra.
 *
 * Normaliza la paginacion antes de llegar al repositorio, de modo que el limite
 * de registros por pagina se aplica sea cual sea el transporte de entrada.
 */
export class ListarComprasCasoUso implements ListarComprasPuerto {
  constructor(private readonly repositorio: CompraRepositorio) {}

  ejecutar(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    const { pagina, tamanoPagina } = normalizarPaginacion(consulta);
    return this.repositorio.listarCompras({ ...consulta, pagina, tamanoPagina });
  }
}
