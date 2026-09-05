import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * CAPA 3 · ADAPTADORES — Identificador de correlación entre microservicios.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Una compra atraviesa cuatro procesos: el Gateway la recibe, ms-inventario la
 * ejecuta, ms-catalogo actualiza el precio y SQL Server la persiste. Cada uno
 * escribe en su propio registro. Cuando algo falla, hay cuatro flujos de líneas
 * sin nada que las una, y averiguar qué compra concreta produjo qué error
 * consiste en comparar marcas de tiempo a ojo. Con dos usuarios trabajando a la
 * vez eso deja de funcionar.
 *
 * Un identificador que nace en el borde y viaja con la petición resuelve eso:
 * el mismo valor aparece en las líneas de los cuatro servicios, y filtrar por él
 * reconstruye la operación completa.
 *
 * POR QUÉ AsyncLocalStorage Y NO UN PARÁMETRO
 * -------------------------------------------
 * La alternativa sería pasar el identificador por argumento desde el
 * controlador hasta el caso de uso y de ahí a la pasarela. Eso obligaría a
 * ensuciar la firma de cada caso de uso con un dato que no pertenece al
 * negocio: un caso de uso de registrar venta no debería saber que existe un
 * sistema de trazas.
 *
 * `AsyncLocalStorage` mantiene el valor asociado a la cadena asíncrona de la
 * petición, de modo que el registro lo recupera sin que nadie tenga que
 * transportarlo. Es la misma idea que un `ThreadLocal`, aplicada al modelo de
 * concurrencia de Node.
 *
 * DÓNDE VIAJA
 * -----------
 * Entre servicios va dentro del payload del mensaje, bajo la clave
 * `correlacion`. Los payload son interfaces planas y no clases con decoradores,
 * así que el `ValidationPipe` no tiene metatipo contra el que validar y el campo
 * extra no interfiere. Es el único canal disponible: el transporte TCP de
 * NestJS no ofrece metadatos aparte del cuerpo del mensaje.
 */

/**
 * Forma que adquiere un payload al viajar con su identificador.
 *
 * Se declara como tipo, y no solo como constante de texto, para que el
 * compilador ate la clave de escritura con la de lectura. Escribirla suelta en
 * dos sitios es como acaban divergiendo: el emisor manda `correlacion`, el
 * receptor busca `correlationId`, y la traza se pierde en silencio.
 */
export interface PayloadConCorrelacion {
  correlacion: string;
}

const almacen = new AsyncLocalStorage<string>();

/** Genera un identificador nuevo para una petición que llega sin él. */
export function nuevaCorrelacion(): string {
  return randomUUID();
}

/**
 * Ejecuta `operacion` con el identificador activo.
 *
 * Todo lo que ocurra dentro —incluidas las continuaciones asíncronas— podrá
 * recuperarlo con `obtenerCorrelacion()`.
 */
export function ejecutarConCorrelacion<T>(identificador: string, operacion: () => T): T {
  return almacen.run(identificador, operacion);
}

/**
 * Identificador de la petición en curso, o `undefined` fuera de una.
 *
 * Devuelve `undefined` y no lanza a propósito: el arranque del proceso y las
 * tareas de fondo registran igual, y una traza sin identificador es mejor que
 * un fallo por intentar registrarla.
 */
export function obtenerCorrelacion(): string | undefined {
  return almacen.getStore();
}

/**
 * Extrae el identificador de un payload RPC recibido.
 *
 * Si el mensaje llega sin él —por ejemplo desde una prueba que invoca el
 * microservicio directamente— se genera uno nuevo, de modo que la operación
 * siempre queda trazada aunque su origen no colabore.
 */
export function correlacionDesdePayload(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    // Se desestructura en lugar de indexar: el acceso dinamico a propiedades lo
    // marca el analizador de seguridad, y aqui el contrato ya fija el nombre.
    const { correlacion } = payload as Partial<PayloadConCorrelacion>;
    if (typeof correlacion === 'string' && correlacion !== '') return correlacion;
  }
  return nuevaCorrelacion();
}

/**
 * Devuelve el payload con el identificador de la petición en curso incorporado.
 *
 * Si no hay identificador activo, o el payload no es un objeto, se devuelve tal
 * cual: propagar la traza nunca debe poder romper la llamada que traza.
 */
export function conCorrelacion(payload: unknown): unknown {
  const identificador = obtenerCorrelacion();
  if (identificador === undefined) return payload;
  if (typeof payload !== 'object' || payload === null) return payload;

  // La clave se escribe literal en lugar de computada: el analizador de
  // seguridad marca el acceso dinamico a propiedades, y aqui `satisfies` deja
  // que sea el compilador quien garantice que coincide con la del contrato.
  const envuelto = { ...payload, correlacion: identificador };
  return envuelto satisfies PayloadConCorrelacion;
}
