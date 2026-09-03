import { normalizarPaginacion, ResultadoPaginado } from '@hce/compartido';

import { ConsultaKardex, FilaKardex } from '../modelos/inventario.modelos';
import { ListarKardexPuerto } from '../puertos/entrada/inventario.puertos';
import { KardexRepositorio } from '../puertos/salida/inventario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Listar Kardex (seccion 1.2.3).
 *
 * Depende solo de KardexRepositorio y no del contrato completo del inventario:
 * segregacion de interfaces aplicada de forma efectiva, no decorativa.
 */
export class ListarKardexCasoUso implements ListarKardexPuerto {
  constructor(private readonly repositorio: KardexRepositorio) {}

  ejecutar(consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>> {
    const { pagina, tamanoPagina } = normalizarPaginacion(consulta);
    return this.repositorio.listarKardex({ ...consulta, pagina, tamanoPagina });
  }
}
