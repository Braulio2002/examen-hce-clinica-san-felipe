import { Importe } from '@hce/compartido';

/**
 * Entidad de dominio Producto (medicamento o insumo medico).
 *
 * Invariantes que la entidad garantiza por si misma, sin depender de la base de
 * datos ni del controlador:
 *   - Nombre y numero de lote no vacios.
 *   - Costo y precio de venta no negativos.
 *   - El precio de venta derivado del costo respeta el margen de 1.35.
 *
 * El stock NO es un atributo del producto: es una proyeccion del Kardex y
 * pertenece al agregado de inventario. Duplicarlo aqui crearia dos fuentes de
 * verdad para la existencia fisica de un medicamento.
 */
export class Producto {
  private constructor(
    readonly id: number,
    readonly nombre: string,
    readonly nroLote: string,
    readonly costo: number,
    readonly precioVenta: number,
    readonly fechaRegistro: Date,
    readonly activo: boolean,
  ) {}

  static rehidratar(datos: {
    id: number;
    nombre: string;
    nroLote: string;
    costo: number;
    precioVenta: number;
    fechaRegistro: Date;
    activo: boolean;
  }): Producto {
    return new Producto(
      datos.id,
      datos.nombre,
      datos.nroLote,
      datos.costo,
      datos.precioVenta,
      datos.fechaRegistro,
      datos.activo,
    );
  }

  /**
   * Valida los datos de alta antes de tocar la base. Falla rapido y claro.
   *
   * Los parametros se declaran opcionales porque esta validacion es la
   * frontera con datos que vienen de fuera: aunque el DTO ya los exija, el
   * dominio no puede asumir que alguien lo haya hecho antes.
   */
  static validarAlta(nombre?: string, nroLote?: string, costo?: number): void {
    if (!nombre?.trim()) {
      throw new RangeError('El nombre del producto es obligatorio.');
    }
    if (!nroLote?.trim()) {
      throw new RangeError('El numero de lote es obligatorio.');
    }
    if (costo === undefined || !Number.isFinite(costo) || costo < 0) {
      throw new RangeError('El costo no puede ser negativo.');
    }
  }

  /** Precio de venta sugerido segun la regla de negocio Costo * 1.35. */
  static precioSugerido(costo: number): number {
    return Importe.precioVentaDesdeCosto(costo);
  }
}

/** Proyeccion de lectura del catalogo, con el stock que aporta el Kardex. */
export interface ProductoConStock {
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly fechaRegistro: Date;
  readonly costo: number;
  readonly precioVenta: number;
  readonly stockActual: number;
}
