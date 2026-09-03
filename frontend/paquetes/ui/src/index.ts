/**
 * Superficie publica del paquete de interfaz compartido.
 *
 * Incluye tanto los componentes basicos (botones, campos, modal, tablas) como
 * el "chrome" de la aplicacion: proveedor de sesion, navegacion principal y
 * marco de pantalla. Que ambas zonas del microfront consuman este paquete es lo
 * que hace que el usuario perciba una sola aplicacion aunque esten desplegadas
 * en contenedores distintos.
 */
export * from './componentes';
export * from './sesion';
export * from './navegacion';
export * from './marco';
