/**
 * Calculo de importes en el cliente.
 *
 * Replica la formula del enunciado para dar retroalimentacion inmediata al
 * usuario mientras digita, tal como pide la seccion 1.2.2 ("al digitar la
 * cantidad se debe calcular...").
 *
 * ADVERTENCIA DE DISENO: este calculo es solo de presentacion. Los importes que
 * se persisten son SIEMPRE los que devuelve el servidor. El FrontEnd nunca
 * envia importes calculados: envia cantidad e identificador de producto, y el
 * BackEnd resuelve precio, subtotal, IGV y total. Confiar en el calculo del
 * cliente permitiria manipular el importe desde el navegador.
 *
 * Formula del enunciado:
 *   SubTotal = Cantidad * PrecioVenta
 *   Igv      = Cantidad * PrecioVenta * 1.18
 *   Total    = SubTotal + Igv
 */

export const FACTOR_IGV = 1.18;
export const MARGEN_PRECIO_VENTA = 1.35;
const DECIMALES = 4;

export interface Importes {
  subTotal: number;
  igv: number;
  total: number;
}

export function calcularImportes(cantidad: number, precio: number): Importes {
  if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0) {
    return { subTotal: 0, igv: 0, total: 0 };
  }

  const subTotal = redondear(cantidad * precio);
  const igv = redondear(cantidad * precio * FACTOR_IGV);

  return { subTotal, igv, total: redondear(subTotal + igv) };
}

export function sumarImportes(lineas: Importes[]): Importes {
  return lineas.reduce<Importes>(
    (acc, l) => ({
      subTotal: redondear(acc.subTotal + l.subTotal),
      igv: redondear(acc.igv + l.igv),
      total: redondear(acc.total + l.total),
    }),
    { subTotal: 0, igv: 0, total: 0 },
  );
}

export function precioVentaDesdeCosto(costo: number): number {
  if (!Number.isFinite(costo) || costo < 0) return 0;
  return redondear(costo * MARGEN_PRECIO_VENTA);
}

/** Formato de moneda peruana para las grillas y totales. */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(valor) ? valor : 0);
}

export function formatearCantidad(valor: number): string {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 }).format(
    Number.isFinite(valor) ? valor : 0,
  );
}

export function formatearFecha(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

function redondear(valor: number): number {
  const factor = 10 ** DECIMALES;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}
