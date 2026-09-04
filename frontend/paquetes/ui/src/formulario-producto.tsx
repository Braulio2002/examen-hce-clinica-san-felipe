'use client';

import type React from 'react';
import { useEffect, useState } from 'react';

import { ErrorApi, formatearMoneda, precioVentaDesdeCosto } from '@hce/api-cliente';

import { Boton } from './boton';
import { Campo } from './campo';
import { Modal } from './modal';
import { Alerta } from './retroalimentacion';

/**
 * Formulario de producto, en modal. Sirve para crearlo y para editarlo.
 *
 * Existian dos copias de esto: una en la zona de inventario, para dar de alta un
 * producto sin abandonar la compra, y otra dentro de la pantalla de Productos de
 * la shell, para editarlo. Coincidian en los tres campos, en la validacion, en
 * el calculo del precio sugerido y en el manejo de error y de espera. Cambiaba
 * solo la llamada que persiste.
 *
 * Por eso lo que persiste NO esta aqui: se recibe en `onGuardar`. El formulario
 * sabe pedir y validar los datos; quien lo usa sabe a donde enviarlos. Asi el
 * paquete de interfaz no queda atado a un endpoint concreto, y las dos zonas
 * comparten una sola implementacion en lugar de dos que pueden divergir.
 *
 * El estado se reinicia al abrir, y tambien cuando cambia el producto que se
 * edita: sin eso, abrir el modal sobre otra fila mostraria los datos anteriores.
 */

/** Lo que el formulario recoge. Quien lo usa decide que hacer con ello. */
export interface DatosProducto {
  nombreProducto: string;
  nroLote: string;
  costo: number;
}

/** Valores iniciales cuando se edita un producto existente. */
export interface ProductoEditable {
  nombreProducto: string;
  nroLote: string;
  costo: number;
}

interface Props<T> {
  abierto: boolean;
  onCerrar: () => void;
  /** Persiste los datos y devuelve el producto resultante. */
  onGuardar: (datos: DatosProducto) => Promise<T>;
  /** Se invoca con lo que devolvio `onGuardar`. */
  onGuardado: (resultado: T) => void;
  /** Ausente para crear; presente para editar. */
  producto?: ProductoEditable;
  titulo: string;
  descripcion?: string;
  textoAccion: string;
  mensajeSiFalla: string;
}

const ID_FORMULARIO = 'formulario-producto';

export function FormularioProducto<T>({
  abierto,
  onCerrar,
  onGuardar,
  onGuardado,
  producto,
  titulo,
  descripcion,
  textoAccion,
  mensajeSiFalla,
}: Readonly<Props<T>>): React.JSX.Element {
  const [nombre, setNombre] = useState('');
  const [lote, setLote] = useState('');
  const [costo, setCosto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(producto?.nombreProducto ?? '');
    setLote(producto?.nroLote ?? '');
    setCosto(producto ? String(producto.costo) : '');
    setError(null);
  }, [abierto, producto]);

  const costoNumero = Number(costo);

  /** Devuelve el motivo por el que el formulario no puede enviarse, o null. */
  const motivoInvalido = (): string | null => {
    if (!nombre.trim()) return 'El nombre del producto es obligatorio.';
    if (!lote.trim()) return 'El numero de lote es obligatorio.';
    // Number.isFinite y no `!(x >= 0)`: un campo vacio produce NaN, y NaN
    // compara false contra todo, de modo que la forma invertida lo dejaria pasar.
    if (!Number.isFinite(costoNumero) || costoNumero < 0) {
      return 'El costo debe ser un numero mayor o igual a cero.';
    }
    return null;
  };

  const enviar = async (evento: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();

    const motivo = motivoInvalido();
    if (motivo !== null) {
      setError(motivo);
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      onGuardado(
        await onGuardar({
          nombreProducto: nombre.trim(),
          nroLote: lote.trim(),
          costo: costoNumero,
        }),
      );
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.mensaje : mensajeSiFalla);
    } finally {
      setGuardando(false);
    }
  };

  const ayudaCosto =
    costo !== '' && Number.isFinite(costoNumero) && costoNumero >= 0
      ? `Precio de venta: ${formatearMoneda(precioVentaDesdeCosto(costoNumero))} (costo x 1.35)`
      : 'El precio de venta se calcula como costo x 1.35';

  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      descripcion={descripcion}
      onCerrar={onCerrar}
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" form={ID_FORMULARIO} cargando={guardando}>
            {textoAccion}
          </Boton>
        </>
      }
    >
      <form id={ID_FORMULARIO} onSubmit={enviar} noValidate className="space-y-4">
        {error !== null && <Alerta tipo="error">{error}</Alerta>}

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
          ayuda={ayudaCosto}
        />
      </form>
    </Modal>
  );
}
