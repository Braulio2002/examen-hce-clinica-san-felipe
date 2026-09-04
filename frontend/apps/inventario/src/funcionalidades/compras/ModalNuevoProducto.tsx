'use client';

import type React from 'react';

import type { AltaProducto, Producto } from '@hce/api-cliente';
import { FormularioProducto } from '@hce/ui';

import { apiHce } from '@/compartido/api';

/**
 * Alta rapida de producto desde la pantalla de compra.
 *
 * Cubre el requisito del enunciado: si el producto no existe, poder crearlo sin
 * abandonar la compra en curso.
 *
 * El formulario en si vive en el paquete de interfaz, compartido con la
 * pantalla de Productos de la shell. Aqui queda unicamente lo que es propio de
 * esta zona: a que endpoint se envia y con que textos. Antes eran dos
 * implementaciones completas del mismo formulario, con el riesgo de que una
 * ganara una validacion y la otra no.
 */
async function registrarProducto(datos: AltaProducto): Promise<Producto> {
  return apiHce.productos.registrar(datos);
}

export function ModalNuevoProducto({
  abierto,
  onCerrar,
  onCreado,
}: Readonly<{
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (producto: Producto) => void;
}>): React.JSX.Element {
  return (
    <FormularioProducto
      abierto={abierto}
      onCerrar={onCerrar}
      onGuardar={registrarProducto}
      onGuardado={onCreado}
      titulo="Registrar producto"
      descripcion="El producto se agrega al catalogo y se anade a la compra en curso."
      textoAccion="Registrar y agregar"
      mensajeSiFalla="No se pudo registrar el producto."
    />
  );
}
