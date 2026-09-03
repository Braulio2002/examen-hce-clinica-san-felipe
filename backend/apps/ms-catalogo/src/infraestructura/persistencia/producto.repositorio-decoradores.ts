import { Logger } from '@nestjs/common';

import {
  CodigoError,
  ExcepcionDominio,
  medirTiempo,
  ResultadoPaginado,
} from '@hce/compartido';

import { ProductoConStock } from '../../dominio/entidades/producto.entidad';
import {
  CriteriosBusquedaProducto,
  DatosActualizacionProducto,
  DatosAltaProducto,
  ProductoRepositorio,
} from '../../dominio/puertos/producto.repositorio';

/**
 * PATRON DECORATOR - decoradores apilables del repositorio de productos.
 *
 * Ambas clases implementan ProductoRepositorio y envuelven otra instancia del
 * mismo puerto, por lo que se componen en cualquier orden:
 *
 *     new ProductoRepositorioTrazado(
 *       new ProductoRepositorioConReintentos(
 *         new ProductoMssqlRepositorio(mssql)))
 *
 * El caso de uso sigue viendo un ProductoRepositorio y no cambia una linea.
 * Esa es la ventaja del Decorator sobre la herencia: las responsabilidades se
 * combinan en tiempo de composicion, sin crear una clase por cada combinacion.
 *
 * -----------------------------------------------------------------------------
 * NOTA DE DISENO: por que NO hay un decorador de cache
 * -----------------------------------------------------------------------------
 * La primera version de este archivo incluia un ProductoRepositorioConCache que
 * memorizaba las lecturas por identificador. Se elimino tras detectar el
 * problema en una prueba end-to-end:
 *
 *   - La proyeccion ProductoConStock incluye stockActual.
 *   - El stock lo modifica el microservicio de INVENTARIO al registrar una
 *     compra o una venta.
 *   - El microservicio de CATALOGO no se entera de esas escrituras, asi que su
 *     cache no puede invalidarse y sirve existencias obsoletas.
 *
 * El sintoma observado fue exactamente el peor posible en una farmacia clinica:
 * despues de vender 10 unidades, el catalogo seguia informando el stock
 * anterior. Un operador que confie en ese dato intenta despachar un medicamento
 * que ya no existe.
 *
 * Cachear ese dato solo seria correcto con invalidacion entre servicios
 * (eventos de dominio sobre un broker, o un cache compartido en Redis con
 * invalidacion publicada por inventario). Mientras eso no exista, la decision
 * correcta es no cachear: la lectura barata no compensa el riesgo clinico.
 */

/** Decorador 1: trazabilidad y deteccion de consultas lentas. */
export class ProductoRepositorioTrazado implements ProductoRepositorio {
  private readonly logger = new Logger(ProductoRepositorioTrazado.name);

  constructor(private readonly interno: ProductoRepositorio) {}

  registrar(datos: DatosAltaProducto): Promise<ProductoConStock> {
    return medirTiempo(this.logger, `registrar(${datos.nombreProducto})`, () =>
      this.interno.registrar(datos),
    );
  }

  actualizar(datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    return medirTiempo(this.logger, `actualizar(${datos.idProducto})`, () =>
      this.interno.actualizar(datos),
    );
  }

  listar(criterios: CriteriosBusquedaProducto): Promise<ResultadoPaginado<ProductoConStock>> {
    return medirTiempo(
      this.logger,
      `listar(pagina=${criterios.pagina}, buscar=${criterios.buscar ?? '-'})`,
      () => this.interno.listar(criterios),
    );
  }

  obtener(idProducto: number): Promise<ProductoConStock | null> {
    return medirTiempo(this.logger, `obtener(${idProducto})`, () =>
      this.interno.obtener(idProducto),
    );
  }

  eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    return medirTiempo(this.logger, `eliminar(${idProducto})`, () =>
      this.interno.eliminar(idProducto, usuarioApp),
    );
  }
}

/**
 * Decorador 2: reintento de fallos transitorios de infraestructura.
 *
 * Reintenta unicamente las operaciones de LECTURA y solo ante errores de
 * infraestructura (perdida momentanea de conexion, deadlock elegido como
 * victima por el motor). Nunca reintenta:
 *
 *   - Errores de negocio (validacion, conflicto, no encontrado): repetirlos da
 *     el mismo resultado y solo agrega latencia.
 *   - Operaciones de ESCRITURA: si la conexion se corta despues del COMMIT pero
 *     antes de recibir la confirmacion, el cliente no puede distinguir "fallo"
 *     de "exito no confirmado". Reintentar duplicaria el alta del producto.
 *     Para escrituras idempotentes haria falta una clave de idempotencia, que
 *     hoy el contrato no define.
 */
export class ProductoRepositorioConReintentos implements ProductoRepositorio {
  private readonly logger = new Logger(ProductoRepositorioConReintentos.name);

  constructor(
    private readonly interno: ProductoRepositorio,
    private readonly maxIntentos = 3,
    private readonly esperaBaseMs = 150,
  ) {}

  // --- Escrituras: se delegan sin reintento (ver nota de la clase) ------------

  registrar(datos: DatosAltaProducto): Promise<ProductoConStock> {
    return this.interno.registrar(datos);
  }

  actualizar(datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    return this.interno.actualizar(datos);
  }

  eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    return this.interno.eliminar(idProducto, usuarioApp);
  }

  // --- Lecturas: con reintento ante fallo transitorio -------------------------

  listar(criterios: CriteriosBusquedaProducto): Promise<ResultadoPaginado<ProductoConStock>> {
    return this.conReintentos('listar', () => this.interno.listar(criterios));
  }

  obtener(idProducto: number): Promise<ProductoConStock | null> {
    return this.conReintentos(`obtener(${idProducto})`, () => this.interno.obtener(idProducto));
  }

  private async conReintentos<T>(operacion: string, ejecutar: () => Promise<T>): Promise<T> {
    let ultimoError: unknown;

    for (let intento = 1; intento <= this.maxIntentos; intento += 1) {
      try {
        return await ejecutar();
      } catch (error) {
        ultimoError = error;

        const esTransitorio =
          error instanceof ExcepcionDominio && error.codigo === CodigoError.INFRAESTRUCTURA;

        if (!esTransitorio || intento === this.maxIntentos) break;

        // Espera exponencial: 150 ms, 300 ms, 600 ms...
        const espera = this.esperaBaseMs * 2 ** (intento - 1);
        this.logger.warn(
          `${operacion} fallo de forma transitoria (intento ${intento}/${this.maxIntentos}). ` +
            `Reintentando en ${espera} ms.`,
        );
        await new Promise((resolver) => setTimeout(resolver, espera));
      }
    }

    throw ultimoError;
  }
}
