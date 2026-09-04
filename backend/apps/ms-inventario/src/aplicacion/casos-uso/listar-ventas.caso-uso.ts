import { normalizarPaginacion, type ResultadoPaginado } from '@hce/compartido';

import type { ConsultaPeriodo, ResumenVenta } from '../modelos/inventario.modelos';
import type { ListarVentasPuerto } from '../puertos/entrada/inventario.puertos';
import type { VentaRepositorio } from '../puertos/salida/inventario.repositorio';

/** CAPA 2 · APLICACION — Caso de uso: Listar Venta. */
export class ListarVentasCasoUso implements ListarVentasPuerto {
  constructor(private readonly repositorio: VentaRepositorio) {}

  ejecutar(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    const { pagina, tamanoPagina } = normalizarPaginacion(consulta);
    return this.repositorio.listarVentas({ ...consulta, pagina, tamanoPagina });
  }
}
