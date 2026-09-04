'use client';

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import {
  ErrorApi,
  type Producto,
  formatearFecha,
  formatearMoneda,
  precioVentaDesdeCosto,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  Campo,
  ContenedorTabla,
  ContenidoAsincrono,
  EstadoVacio,
  EtiquetaStock,
  MarcoAplicacion,
  Modal,
  useSesion,
} from '@hce/ui';

import { apiHce } from '@/lib/api';

const TAMANO_PAGINA = 15;

export default function PaginaProductos(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState<Producto | null>(null);

  const cargar = useCallback(async (paginaActual: number, texto: string) => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await apiHce.productos.listar({
        pagina: paginaActual,
        tamanoPagina: TAMANO_PAGINA,
        buscar: texto.trim() || undefined,
      });
      setProductos(resultado.datos);
      setTotalPaginas(Math.max(1, resultado.meta.totalPaginas));
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo cargar el catalogo.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  /*
   * Busqueda con retardo: sin esto cada tecla dispararia una peticion y el
   * rate limit del Gateway (100 por minuto) se agotaria escribiendo una palabra.
   */
  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargar(pagina, buscar), 350);
    return () => window.clearTimeout(temporizador);
  }, [cargar, pagina, buscar]);

  const alGuardar = (mensaje: string): void => {
    setAviso(mensaje);
    setModalAbierto(false);
    setEnEdicion(null);
    void cargar(pagina, buscar);
  };

  return (
    <MarcoAplicacion
      titulo="Catalogo de productos"
      descripcion="Medicamentos e insumos medicos registrados en el almacen."
      acciones={
        puedeOperar ? (
          <Boton
            onClick={() => {
              setEnEdicion(null);
              setModalAbierto(true);
            }}
          >
            Nuevo producto
          </Boton>
        ) : undefined
      }
    >
      {aviso && (
        <div className="mb-4">
          <Alerta tipo="exito" onCerrar={() => setAviso(null)}>
            {aviso}
          </Alerta>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alerta tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Alerta>
        </div>
      )}

      <div className="mb-4 max-w-sm">
        <Campo
          etiqueta="Buscar"
          type="search"
          placeholder="Nombre o numero de lote"
          value={buscar}
          onChange={(e) => {
            setPagina(1);
            setBuscar(e.target.value);
          }}
        />
      </div>

      <ContenidoAsincrono
        cargando={cargando}
        hayDatos={productos.length > 0}
        vacio={
          <div className="tarjeta">
            <EstadoVacio
              titulo="Sin resultados"
              descripcion={
                buscar
                  ? 'Ningun producto coincide con la busqueda.'
                  : 'Aun no hay productos registrados en el catalogo.'
              }
            />
          </div>
        }
      >
        <>
          <ContenedorTabla>
            <table className="tabla-hce">
              <caption className="sr-only">
                Catalogo de medicamentos e insumos medicos
              </caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Lote</th>
                  <th scope="col" className="text-right">
                    Costo
                  </th>
                  <th scope="col" className="text-right">
                    Precio venta
                  </th>
                  <th scope="col" className="text-right">
                    Stock
                  </th>
                  <th scope="col">Registrado</th>
                  {puedeOperar && (
                    <th scope="col" className="text-right">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productos.map((p) => (
                  <tr key={p.idProducto}>
                    <td className="font-medium text-slate-900">{p.nombreProducto}</td>
                    <td className="text-slate-500">{p.nroLote}</td>
                    <td className="text-right tabular-nums">
                      {formatearMoneda(p.costo)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatearMoneda(p.precioVenta)}
                    </td>
                    <td className="text-right">
                      <EtiquetaStock stock={p.stockActual} />
                    </td>
                    <td className="text-slate-500">{formatearFecha(p.fechaRegistro)}</td>
                    {puedeOperar && (
                      <td className="text-right">
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => {
                            setEnEdicion(p);
                            setModalAbierto(true);
                          }}
                        >
                          Editar
                        </Boton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>

          {totalPaginas > 1 && (
            <nav
              aria-label="Paginacion"
              className="mt-4 flex items-center justify-between"
            >
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Boton>
              <span className="text-sm text-slate-500" aria-live="polite">
                Pagina {pagina} de {totalPaginas}
              </span>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Siguiente
              </Boton>
            </nav>
          )}
        </>
      </ContenidoAsincrono>

      <ModalProducto
        abierto={modalAbierto}
        producto={enEdicion}
        onCerrar={() => {
          setModalAbierto(false);
          setEnEdicion(null);
        }}
        onGuardado={alGuardar}
      />
    </MarcoAplicacion>
  );
}

/* -----------------------------------------------------------------------------
   Modal de alta y edicion de producto
   -------------------------------------------------------------------------- */
function ModalProducto({
  abierto,
  producto,
  onCerrar,
  onGuardado,
}: Readonly<{
  abierto: boolean;
  producto: Producto | null;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}>): React.JSX.Element {
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
  const precioSugerido = precioVentaDesdeCosto(costoNumero);

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
      if (producto) {
        await apiHce.productos.actualizar(producto.idProducto, {
          nombreProducto: nombre.trim(),
          nroLote: lote.trim(),
          costo: costoNumero,
        });
        onGuardado(`Producto "${nombre.trim()}" actualizado.`);
      } else {
        await apiHce.productos.registrar({
          nombreProducto: nombre.trim(),
          nroLote: lote.trim(),
          costo: costoNumero,
        });
        onGuardado(`Producto "${nombre.trim()}" registrado.`);
      }
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo guardar el producto.',
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={producto ? 'Editar producto' : 'Nuevo producto'}
      descripcion={
        producto
          ? 'Al cambiar el costo, el precio de venta se recalcula automaticamente.'
          : 'El precio de venta se deriva del costo aplicando el margen de 1.35.'
      }
      onCerrar={onCerrar}
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-producto" cargando={guardando}>
            {producto ? 'Guardar cambios' : 'Registrar'}
          </Boton>
        </>
      }
    >
      <form id="formulario-producto" onSubmit={enviar} noValidate className="space-y-4">
        {error && <Alerta tipo="error">{error}</Alerta>}

        <Campo
          etiqueta="Nombre del producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Paracetamol 500 mg Tableta"
          maxLength={150}
          disabled={guardando}
        />
        <Campo
          etiqueta="Numero de lote"
          value={lote}
          onChange={(e) => setLote(e.target.value)}
          placeholder="LT-2026-0001"
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
              ? `Precio de venta calculado: ${formatearMoneda(precioSugerido)} (costo x 1.35)`
              : 'El precio de venta se calcula como costo x 1.35'
          }
        />
      </form>
    </Modal>
  );
}
