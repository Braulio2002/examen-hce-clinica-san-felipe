'use client';

import type React from 'react';
import { useEffect, useState } from 'react';

import {
  ErrorApi,
  type Producto,
  formatearMoneda,
  precioVentaDesdeCosto,
} from '@hce/api-cliente';
import { Alerta, Boton, Campo, Modal } from '@hce/ui';

import { apiHce } from '@/lib/api';

/**
 * Modal de alta rapida de producto, invocado desde la pantalla de compra.
 *
 * Vive en su propio archivo y no dentro de la pagina por dos razones: la pagina
 * superaba el limite de lineas que fija el linter, y el modal es una unidad con
 * estado propio que se prueba y se lee mejor aislada. Cubre el requisito del
 * enunciado de poder registrar un producto inexistente sin abandonar la compra.
 */
export function ModalNuevoProducto({
  abierto,
  onCerrar,
  onCreado,
}: Readonly<{
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (producto: Producto) => void;
}>): React.JSX.Element {
  const [nombre, setNombre] = useState('');
  const [lote, setLote] = useState('');
  const [costo, setCosto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setNombre('');
      setLote('');
      setCosto('');
      setError(null);
    }
  }, [abierto]);

  const costoNumero = Number(costo);

  const enviar = async (evento: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError('El nombre del producto es obligatorio.');
      return;
    }
    if (!lote.trim()) {
      setError('El numero de lote es obligatorio.');
      return;
    }
    if (!Number.isFinite(costoNumero) || costoNumero < 0) {
      setError('El costo debe ser un numero mayor o igual a cero.');
      return;
    }

    setGuardando(true);
    try {
      const producto = await apiHce.productos.registrar({
        nombreProducto: nombre.trim(),
        nroLote: lote.trim(),
        costo: costoNumero,
      });
      onCreado(producto);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar el producto.',
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar producto"
      descripcion="El producto se agrega al catalogo y se anade a la compra en curso."
      onCerrar={onCerrar}
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-nuevo-producto" cargando={guardando}>
            Registrar y agregar
          </Boton>
        </>
      }
    >
      <form
        id="formulario-nuevo-producto"
        onSubmit={enviar}
        noValidate
        className="space-y-4"
      >
        {error && <Alerta tipo="error">{error}</Alerta>}

        <Campo
          etiqueta="Nombre del producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ketorolaco 30 mg Ampolla"
          maxLength={150}
          disabled={guardando}
        />
        <Campo
          etiqueta="Numero de lote"
          value={lote}
          onChange={(e) => setLote(e.target.value)}
          placeholder="LT-2026-0013"
          maxLength={50}
          disabled={guardando}
        />
        <Campo
          etiqueta="Costo unitario"
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          placeholder="0.45"
          disabled={guardando}
          ayuda={
            costo && Number.isFinite(costoNumero) && costoNumero >= 0
              ? `Precio de venta inicial: ${formatearMoneda(precioVentaDesdeCosto(costoNumero))} (costo x 1.35)`
              : 'El precio de venta se calcula como costo x 1.35'
          }
        />
      </form>
    </Modal>
  );
}
