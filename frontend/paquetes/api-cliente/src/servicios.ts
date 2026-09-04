import type { AxiosInstance } from 'axios';

import type {
  AltaProducto,
  Compra,
  FilaKardex,
  LineaCompraPayload,
  LineaVentaPayload,
  MovimientoProducto,
  PerfilUsuario,
  Producto,
  RespuestaLogin,
  ResultadoPaginado,
  ResumenCompra,
  ResumenVenta,
  Venta,
} from './tipos';

/**
 * Servicios de dominio del FrontEnd.
 *
 * Cada zona del microfront recibe la instancia de Axios ya configurada con sus
 * interceptores y construye estos servicios encima. Asi las pantallas nunca
 * escriben rutas literales: si el Gateway cambia un endpoint, se corrige aqui.
 */

export function crearServicioAuth(http: AxiosInstance) {
  return {
    async iniciarSesion(username: string, password: string): Promise<RespuestaLogin> {
      const { data } = await http.post<RespuestaLogin>('/auth/login', {
        username,
        password,
      });
      return data;
    },

    async cerrarSesion(): Promise<void> {
      await http.post('/auth/logout');
    },

    async perfil(): Promise<PerfilUsuario> {
      const { data } = await http.get<PerfilUsuario>('/auth/perfil');
      return data;
    },
  };
}

export function crearServicioProductos(http: AxiosInstance) {
  return {
    async listar(
      parametros: {
        buscar?: string;
        soloConStock?: boolean;
        pagina?: number;
        tamanoPagina?: number;
      } = {},
    ): Promise<ResultadoPaginado<Producto>> {
      const { data } = await http.get<ResultadoPaginado<Producto>>('/productos', {
        params: parametros,
      });
      return data;
    },

    async obtener(idProducto: number): Promise<Producto> {
      const { data } = await http.get<Producto>(`/productos/${idProducto}`);
      return data;
    },

    async registrar(payload: AltaProducto): Promise<Producto> {
      const { data } = await http.post<Producto>('/productos', payload);
      return data;
    },

    async actualizar(
      idProducto: number,
      payload: Partial<AltaProducto>,
    ): Promise<Producto> {
      const { data } = await http.patch<Producto>(`/productos/${idProducto}`, payload);
      return data;
    },
  };
}

export function crearServicioCompras(http: AxiosInstance) {
  return {
    async registrar(lineas: LineaCompraPayload[]): Promise<Compra> {
      const { data } = await http.post<Compra>('/compras', { lineas });
      return data;
    },

    async listar(
      parametros: {
        fechaDesde?: string;
        fechaHasta?: string;
        pagina?: number;
        tamanoPagina?: number;
      } = {},
    ): Promise<ResultadoPaginado<ResumenCompra>> {
      const { data } = await http.get<ResultadoPaginado<ResumenCompra>>('/compras', {
        params: parametros,
      });
      return data;
    },

    async obtener(idCompraCab: number): Promise<Compra> {
      const { data } = await http.get<Compra>(`/compras/${idCompraCab}`);
      return data;
    },
  };
}

export function crearServicioVentas(http: AxiosInstance) {
  return {
    async registrar(lineas: LineaVentaPayload[]): Promise<Venta> {
      const { data } = await http.post<Venta>('/ventas', { lineas });
      return data;
    },

    async listar(
      parametros: {
        fechaDesde?: string;
        fechaHasta?: string;
        pagina?: number;
        tamanoPagina?: number;
      } = {},
    ): Promise<ResultadoPaginado<ResumenVenta>> {
      const { data } = await http.get<ResultadoPaginado<ResumenVenta>>('/ventas', {
        params: parametros,
      });
      return data;
    },

    async obtener(idVentaCab: number): Promise<Venta> {
      const { data } = await http.get<Venta>(`/ventas/${idVentaCab}`);
      return data;
    },
  };
}

export function crearServicioKardex(http: AxiosInstance) {
  return {
    async listar(
      parametros: {
        buscar?: string;
        pagina?: number;
        tamanoPagina?: number;
      } = {},
    ): Promise<ResultadoPaginado<FilaKardex>> {
      const { data } = await http.get<ResultadoPaginado<FilaKardex>>('/kardex', {
        params: parametros,
      });
      return data;
    },

    async movimientos(
      idProducto: number,
      parametros: { fechaDesde?: string; fechaHasta?: string } = {},
    ): Promise<MovimientoProducto[]> {
      const { data } = await http.get<MovimientoProducto[]>(
        `/kardex/producto/${idProducto}/movimientos`,
        { params: parametros },
      );
      return data;
    },
  };
}
