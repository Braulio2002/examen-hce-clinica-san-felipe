/**
 * CAPA 2 · APLICACION — Puerto de entrada genérico (Input Boundary).
 *
 * En Clean Architecture, un caso de uso se expone al exterior a través de una
 * frontera de entrada. Los adaptadores (controladores) dependen de ESTA
 * interfaz, nunca de la clase concreta que la implementa.
 *
 * Beneficio concreto: el controlador no puede invocar métodos internos del caso
 * de uso ni depender de su construcción. La única forma de atravesar la
 * frontera es `ejecutar`, con un modelo de petición y uno de respuesta.
 *
 * Este archivo no importa NADA: es la frontera más interna que ve el exterior.
 */
export interface CasoUso<TPeticion, TRespuesta> {
  ejecutar(peticion: TPeticion): Promise<TRespuesta>;
}

/** Caso de uso que no necesita datos de entrada. */
export interface CasoUsoSinPeticion<TRespuesta> {
  ejecutar(): Promise<TRespuesta>;
}
