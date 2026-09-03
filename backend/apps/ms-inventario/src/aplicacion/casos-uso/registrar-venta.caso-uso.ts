import { ErrorValidacion, RegistroPuerto } from '@hce/compartido';

import { ReglasDocumento } from '../../dominio/entidades/inventario.entidades';
import { DocumentoVenta, RegistrarVentaPeticion } from '../modelos/inventario.modelos';
import { RegistrarVentaPuerto } from '../puertos/entrada/inventario.puertos';
import { VentaRepositorio } from '../puertos/salida/inventario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Registrar Venta (seccion 1.2.2).
 *
 * La validacion de stock NO se hace aqui leyendo el stock y comparando: entre
 * la lectura y la escritura otra venta concurrente podria consumir la misma
 * existencia. Se delega al procedimiento almacenado, que valida y escribe
 * dentro de una unica transaccion con bloqueo UPDLOCK/HOLDLOCK.
 *
 * Que la concurrencia se resuelva en el motor es una decision de diseno, no una
 * omision: es el unico lugar donde la comprobacion y la escritura son atomicas.
 */
export class RegistrarVentaCasoUso implements RegistrarVentaPuerto {
  constructor(
    private readonly repositorio: VentaRepositorio,
    private readonly registro: RegistroPuerto,
  ) {}

  async ejecutar(peticion: RegistrarVentaPeticion): Promise<DocumentoVenta> {
    try {
      ReglasDocumento.validarLineasVenta(peticion.lineas);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    const venta = await this.repositorio.registrarVenta(peticion.lineas, peticion.usuarioApp);

    this.registro.informar(
      `Venta ${venta.idVentaCab} registrada con ${venta.detalle.length} linea(s). ` +
        `Total ${venta.total}. Se genero el movimiento de Salida.`,
    );
    return venta;
  }
}
