/**
 * Superficie publica del paquete de interfaz compartido.
 *
 * Los componentes basicos van en un archivo por familia. Antes estaban todos en
 * un unico `componentes.tsx` que alcanzo 398 de las 400 lineas que permite el
 * linter. Se partio al tener que anadir la restauracion del foco al Modal: el
 * arreglo no cabia, y ese es exactamente el aviso que el limite existe para dar.
 *
 * Incluye tanto los componentes basicos (botones, campos, modal, tablas) como
 * el "chrome" de la aplicacion: proveedor de sesion, navegacion principal y
 * marco de pantalla. Que ambas zonas del microfront consuman este paquete es lo
 * que hace que el usuario perciba una sola aplicacion aunque esten desplegadas
 * en contenedores distintos.
 */
export * from './boton';
export * from './campo';
export * from './formulario-producto';
export * from './modal';
export * from './paginacion';
export * from './retroalimentacion';
export * from './stock';
export * from './resumen-totales';
export * from './selector-buscable';
export * from './tabla';
export * from './sesion';
export * from './navegacion';
export * from './marco';
