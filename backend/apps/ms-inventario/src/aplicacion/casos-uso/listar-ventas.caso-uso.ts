import { normalizarPaginacion, ResultadoPaginado } from '@hce/compartido';

import { ConsultaPeriodo, ResumenVenta } from '../modelos/inventario.modelos';
import { ListarVentasPuerto } from '../puertos/entrada/inventario.puertos';
import { VentaRepositorio } from '../puertos/salida/inventario.repositorio';

/** CAPA 2 · APLICACION — Caso de uso: Listar Venta. */
export class ListarVentasCasoUso implements ListarVentasPuerto {
  constructor(private readonly repositorio: VentaRepositorio) {}

  ejecutar(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    const { pagina, tamanoPagina } = normalizarPaginacion(consulta);
    return this.repositorio.listarVentas({ ...consulta, pagina, tamanoPagina });
  }
}
