/**
 * Ruta /ventas.
 *
 * Solo compone. El App Router exige que cada ruta tenga su archivo, pero la
 * pantalla vive en su funcionalidad: asi todo lo de ventas -estado, tabla,
 * modales- queda en una carpeta y un cambio no obliga a recorrer el arbol.
 */
export { PantallaVentas as default } from '@/funcionalidades/ventas/PantallaVentas';
