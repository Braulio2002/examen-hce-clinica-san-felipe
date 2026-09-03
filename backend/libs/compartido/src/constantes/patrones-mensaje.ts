/**
 * Contrato de mensajeria entre el API Gateway y los microservicios.
 *
 * Es el unico punto donde viven los nombres de los patrones de mensaje. El
 * Gateway y cada microservicio importan de aqui, de modo que un cambio de
 * nombre rompe la compilacion en lugar de fallar silenciosamente en tiempo de
 * ejecucion, que es el modo de fallo tipico de las arquitecturas distribuidas
 * con patrones definidos como cadenas sueltas.
 */

export const PATRONES_AUTH = {
  INICIAR_SESION: 'auth.iniciar-sesion',
  VALIDAR_USUARIO: 'auth.validar-usuario',
  PERFIL: 'auth.perfil',
} as const;

export const PATRONES_CATALOGO = {
  REGISTRAR_PRODUCTO: 'catalogo.producto.registrar',
  ACTUALIZAR_PRODUCTO: 'catalogo.producto.actualizar',
  LISTAR_PRODUCTOS: 'catalogo.producto.listar',
  OBTENER_PRODUCTO: 'catalogo.producto.obtener',
  ELIMINAR_PRODUCTO: 'catalogo.producto.eliminar',
} as const;

export const PATRONES_INVENTARIO = {
  REGISTRAR_COMPRA: 'inventario.compra.registrar',
  LISTAR_COMPRAS: 'inventario.compra.listar',
  OBTENER_COMPRA: 'inventario.compra.obtener',

  REGISTRAR_VENTA: 'inventario.venta.registrar',
  LISTAR_VENTAS: 'inventario.venta.listar',
  OBTENER_VENTA: 'inventario.venta.obtener',

  LISTAR_KARDEX: 'inventario.kardex.listar',
  MOVIMIENTOS_PRODUCTO: 'inventario.kardex.movimientos-producto',
} as const;

/** Nombres de inyeccion de los ClientProxy registrados en el API Gateway. */
export const CLIENTES_MICROSERVICIO = {
  AUTH: 'CLIENTE_MS_AUTH',
  CATALOGO: 'CLIENTE_MS_CATALOGO',
  INVENTARIO: 'CLIENTE_MS_INVENTARIO',
} as const;
