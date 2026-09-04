import {
  CodigoError,
  ExcepcionDominio,
  medirTiempo,
  type RegistroPuerto,
  type ResultadoPaginado,
} from '@hce/compartido';

import type {
  ActualizarProductoPeticion,
  ListarProductosPeticion,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../aplicacion/modelos/producto.modelos';
import type { ProductoRepositorio } from '../../aplicacion/puertos/salida/producto.repositorio';

/**
 * CAPA 3 · ADAPTADORES — PATRON DECORATOR sobre la pasarela del catálogo.
 *
 * Ambas clases implementan ProductoRepositorio y envuelven otra instancia del
 * mismo puerto, así que se componen en cualquier orden:
 *
 *     new ProductoPasarelaTrazada(
 *       new ProductoPasarelaConReintentos(
 *         new ProductoMssqlPasarela(mssql)))
 *
 * El caso de uso sigue viendo un ProductoRepositorio y no cambia una línea.
 * Ésa es la ventaja del Decorator sobre la herencia: las responsabilidades se
 * combinan en tiempo de composición, sin crear una clase por cada combinación.
 *
 * -----------------------------------------------------------------------------
 * NOTA DE DISEÑO: por qué NO hay un decorador de caché
 * -----------------------------------------------------------------------------
 * La primera versión incluía un ProductoPasarelaConCache que memorizaba las
 * lecturas por identificador. Se eliminó tras detectar el problema en una
 * prueba end-to-end:
 *
 *   - La proyección ProductoRespuesta incluye stockActual.
 *   - El stock lo modifica el microservicio de INVENTARIO al registrar una
 *     compra o una venta.
 *   - El microservicio de CATALOGO no se entera de esas escrituras, así que su
 *     caché no puede invalidarse y sirve existencias obsoletas.
 *
 * El síntoma observado fue el peor posible en una farmacia clínica: después de
 * vender 10 unidades, el catálogo seguía informando el stock anterior. Un
 * operador que confíe en ese dato intenta despachar un medicamento que ya no
 * está.
 *
 * Cachearlo solo sería correcto con invalidación entre servicios (eventos de
 * dominio sobre un broker, o caché compartida en Redis con invalidación
 * publicada por inventario). Mientras eso no exista, la lectura barata no
 * compensa el riesgo clínico.
 */

/** Decorador 1: trazabilidad y detección de consultas lentas. */
export class ProductoPasarelaTrazada implements ProductoRepositorio {
  constructor(
    private readonly interno: ProductoRepositorio,
    private readonly registro: RegistroPuerto,
  ) {}

  registrar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    return medirTiempo(this.registro, `registrar(${peticion.nombreProducto})`, () =>
      this.interno.registrar(peticion),
    );
  }

  actualizar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    return medirTiempo(this.registro, `actualizar(${peticion.idProducto})`, () =>
      this.interno.actualizar(peticion),
    );
  }

  listar(
    peticion: ListarProductosPeticion,
  ): Promise<ResultadoPaginado<ProductoRespuesta>> {
    return medirTiempo(
      this.registro,
      `listar(pagina=${peticion.pagina ?? 1}, buscar=${peticion.buscar ?? '-'})`,
      () => this.interno.listar(peticion),
    );
  }

  obtener(idProducto: number): Promise<ProductoRespuesta | null> {
    return medirTiempo(this.registro, `obtener(${idProducto})`, () =>
      this.interno.obtener(idProducto),
    );
  }

  eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    return medirTiempo(this.registro, `eliminar(${idProducto})`, () =>
      this.interno.eliminar(idProducto, usuarioApp),
    );
  }
}

/**
 * Decorador 2: reintento de fallos transitorios de infraestructura.
 *
 * Reintenta únicamente las operaciones de LECTURA y solo ante errores de
 * infraestructura (pérdida momentánea de conexión, deadlock elegido como
 * víctima por el motor). Nunca reintenta:
 *
 *   - Errores de negocio (validación, conflicto, no encontrado): repetirlos da
 *     el mismo resultado y solo añade latencia.
 *   - Operaciones de ESCRITURA: si la conexión se corta después del COMMIT pero
 *     antes de recibir la confirmación, el cliente no puede distinguir "falló"
 *     de "tuvo éxito sin confirmar". Reintentar duplicaría el alta del producto.
 *     Para escrituras idempotentes haría falta una clave de idempotencia, que
 *     hoy el contrato no define.
 */
export class ProductoPasarelaConReintentos implements ProductoRepositorio {
  constructor(
    private readonly interno: ProductoRepositorio,
    private readonly registro: RegistroPuerto,
    private readonly maxIntentos = 3,
    private readonly esperaBaseMs = 150,
  ) {}

  // --- Escrituras: se delegan sin reintento (ver nota de la clase) -----------

  registrar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    return this.interno.registrar(peticion);
  }

  actualizar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    return this.interno.actualizar(peticion);
  }

  eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    return this.interno.eliminar(idProducto, usuarioApp);
  }

  // --- Lecturas: con reintento ante fallo transitorio ------------------------

  listar(
    peticion: ListarProductosPeticion,
  ): Promise<ResultadoPaginado<ProductoRespuesta>> {
    return this.conReintentos('listar', () => this.interno.listar(peticion));
  }

  obtener(idProducto: number): Promise<ProductoRespuesta | null> {
    return this.conReintentos(`obtener(${idProducto})`, () =>
      this.interno.obtener(idProducto),
    );
  }

  private async conReintentos<T>(
    operacion: string,
    ejecutar: () => Promise<T>,
  ): Promise<T> {
    let ultimoError: unknown;

    for (let intento = 1; intento <= this.maxIntentos; intento += 1) {
      try {
        return await ejecutar();
      } catch (error) {
        ultimoError = error;

        const esTransitorio =
          error instanceof ExcepcionDominio &&
          error.codigo === CodigoError.INFRAESTRUCTURA;

        if (!esTransitorio || intento === this.maxIntentos) break;

        // Espera exponencial: 150 ms, 300 ms, 600 ms...
        const espera = this.esperaBaseMs * 2 ** (intento - 1);
        this.registro.advertir(
          `${operacion} fallo de forma transitoria (intento ${intento}/${this.maxIntentos}). ` +
            `Reintentando en ${espera} ms.`,
        );
        await new Promise((resolver) => setTimeout(resolver, espera));
      }
    }

    throw ultimoError;
  }
}
