/**
 * Depuracion del destino al que se vuelve tras autenticarse.
 *
 * Vive en su propio modulo, y no dentro del componente de login, para poder
 * probarlo: es una funcion pura con reglas de seguridad y merece pruebas
 * propias, no quedar enterrada en un componente de React.
 */

/** Ruta a la que se cae cuando el destino no es de fiar. */
export const RUTA_PREDETERMINADA = '/';

/**
 * Devuelve el destino si es una ruta interna, y la raiz si no lo es.
 *
 * El middleware construye este parametro a partir de la ruta que el usuario
 * pidio, y por ese camino es de fiar. Pero /login es publica y cualquiera puede
 * teclear el parametro: sin depurar, un enlace como
 * `/login?destino=https://sitio-malicioso` saca a la victima del dominio nada
 * mas abrirlo si ya tiene sesion, porque la redireccion es automatica. Es una
 * situacion normal en personal clinico que deja la sesion abierta.
 *
 * Se exige una unica barra inicial. Las dos formas que hay que rechazar aparte
 * son sutiles:
 *
 *  - `//host` es una URL valida que hereda el protocolo actual, y a simple
 *    vista parece una ruta relativa.
 *  - `/\host` acaba en lo mismo, porque varios navegadores normalizan la barra
 *    invertida a barra normal al interpretar la URL.
 */
export function depurarDestino(valor: string | null | undefined): string {
  if (typeof valor !== 'string') return RUTA_PREDETERMINADA;
  if (!valor.startsWith('/')) return RUTA_PREDETERMINADA;
  if (valor.startsWith('//')) return RUTA_PREDETERMINADA;
  if (valor.startsWith('/\\')) return RUTA_PREDETERMINADA;
  return valor;
}
