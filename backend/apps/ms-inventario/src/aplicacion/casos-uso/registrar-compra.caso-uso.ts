import { ErrorValidacion, RegistroPuerto } from '@hce/compartido';

import { ReglasDocumento } from '../../dominio/entidades/inventario.entidades';
import { DocumentoCompra, RegistrarCompraPeticion } from '../modelos/inventario.modelos';
import { RegistrarCompraPuerto } from '../puertos/entrada/inventario.puertos';
import { CompraRepositorio } from '../puertos/salida/inventario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Registrar Compra (seccion 1.2.1).
 *
 * La operacion completa es atomica y ocurre en el procedimiento almacenado:
 *   1. Inserta CompraCab y CompraDet.
 *   2. Actualiza costo y precio de venta (= Costo * 1.35) en Productos.
 *   3. Genera el movimiento de tipo Entrada.
 *
 * Este caso de uso valida la forma del documento contra las reglas del dominio
 * y delega. No calcula importes: eso lo resuelve el motor de base de datos con
 * la misma formula que el value object `Importe`.
 */
export class RegistrarCompraCasoUso implements RegistrarCompraPuerto {
  constructor(
    private readonly repositorio: CompraRepositorio,
    private readonly registro: RegistroPuerto,
  ) {}

  async ejecutar(peticion: RegistrarCompraPeticion): Promise<DocumentoCompra> {
    try {
      ReglasDocumento.validarLineasCompra(peticion.lineas);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    const compra = await this.repositorio.registrarCompra(peticion.lineas, peticion.usuarioApp);

    this.registro.informar(
      `Compra ${compra.idCompraCab} registrada con ${compra.detalle.length} linea(s). ` +
        `Total ${compra.total}. Se genero el movimiento de Entrada y se actualizo el precio.`,
    );
    return compra;
  }
}
