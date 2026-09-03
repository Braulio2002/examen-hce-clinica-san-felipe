/**
 * SUPERFICIE PUBLICA DE LA LIBRERIA COMPARTIDA
 * ============================================
 * Organizada por las cuatro capas de Clean Architecture, de la más interna a la
 * más externa. La regla de dependencia se lee en el propio orden del archivo:
 * cada capa solo puede importar de las que aparecen ANTES que ella.
 *
 *   1. dominio        · reglas de negocio de empresa. No importa nada.
 *   2. aplicacion     · casos de uso y sus fronteras. Solo importa dominio.
 *   3. adaptadores    · controladores, presentadores y pasarelas.
 *   4. infraestructura· frameworks y drivers.
 *
 * Esta regla no es una convención escrita: la verifica una prueba automatizada
 * (`regla-dependencia.spec.ts`), que falla si una capa interna importa de una
 * externa.
 */

/* --- Capa 1 · Dominio ----------------------------------------------------- */
export * from './dominio/objetos-valor/importe.vo';
export * from './dominio/excepciones/dominio.excepcion';

/* --- Capa 2 · Aplicación --------------------------------------------------- */
export * from './aplicacion/puertos/caso-uso.puerto';
export * from './aplicacion/puertos/registro.puerto';
export * from './aplicacion/modelos/paginacion';

/* --- Capa 3 · Adaptadores de interfaz -------------------------------------- */
export * from './adaptadores/dto/paginacion.dto';
export * from './adaptadores/filtros/excepcion-http.filtro';
export * from './adaptadores/filtros/excepcion-rpc.filtro';
export * from './adaptadores/mensajeria/patrones-mensaje';
export * from './adaptadores/mensajeria/rpc.util';
export * from './adaptadores/observabilidad/cronometro';
export * from './adaptadores/observabilidad/registro-nest.adaptador';

/* --- Capa 4 · Infraestructura ---------------------------------------------- */
export * from './infraestructura/persistencia/mssql.service';
export * from './infraestructura/persistencia/mssql.module';
