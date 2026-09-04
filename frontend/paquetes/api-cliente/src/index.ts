/**
 * Superficie publica del cliente de API.
 *
 * Es el unico punto por el que las zonas del microfront acceden al BackEnd. Que
 * pase por aqui -y no por llamadas sueltas repartidas por las pantallas- es lo
 * que permite que el manejo del token, los reintentos y la traduccion de errores
 * esten resueltos en un solo lugar.
 */
export * from './tipos';
export * from './cliente';
export * from './servicios';
export * from './calculos';
export * from './api';
