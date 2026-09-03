/**
 * Punto de entrada publico de la libreria compartida.
 *
 * Los microservicios importan siempre desde '@hce/compartido' y nunca por ruta
 * relativa profunda: la superficie publica queda explicita en este archivo y se
 * puede reorganizar la estructura interna sin romper a los consumidores.
 */

// Contratos de mensajeria entre servicios
export * from './constantes/patrones-mensaje';

// Dominio
export * from './dominio/value-objects/importe.vo';
export * from './dominio/excepciones/dominio.excepcion';

// DTOs y utilidades de presentacion
export * from './dto/paginacion.dto';

// Persistencia
export * from './persistencia/mssql.service';
export * from './persistencia/mssql.module';

// Filtros de excepciones
export * from './filtros/excepcion-rpc.filtro';
export * from './filtros/excepcion-http.filtro';

// Patrones de diseno
export * from './patrones/cronometro';

// Utilidades
export * from './utilidades/rpc.util';
