/**
 * CAPA 2 · APLICACION — Modelos que cruzan las fronteras del catálogo.
 *
 * Estructuras planas, sin decoradores ni dependencias. No son entidades: la
 * entidad `Producto` protege invariantes; estos modelos solo transportan datos.
 */

export interface RegistrarProductoPeticion {
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly costo: number;
  /** Si se omite, se deriva del costo aplicando el margen de 1.35. */
  readonly precioVenta?: number;
  readonly usuarioApp?: string;
}

export interface ActualizarProductoPeticion {
  readonly idProducto: number;
  readonly nombreProducto?: string;
  readonly nroLote?: string;
  readonly costo?: number;
  readonly precioVenta?: number;
  readonly usuarioApp?: string;
}

export interface ListarProductosPeticion {
  readonly buscar?: string;
  readonly soloConStock?: boolean;
  readonly pagina?: number;
  readonly tamanoPagina?: number;
}

export interface ObtenerProductoPeticion {
  readonly idProducto: number;
}

export interface EliminarProductoPeticion {
  readonly idProducto: number;
  readonly usuarioApp?: string;
}

/**
 * Proyección de lectura del catálogo.
 *
 * Incluye `stockActual` porque es lo que las pantallas necesitan, pero el stock
 * NO pertenece al agregado de producto: lo aporta el Kardex. La entidad
 * `Producto` deliberadamente no lo tiene.
 */
export interface ProductoRespuesta {
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly fechaRegistro: Date;
  readonly costo: number;
  readonly precioVenta: number;
  readonly stockActual: number;
}

export interface ProductoEliminadoRespuesta {
  readonly idProducto: number;
}
