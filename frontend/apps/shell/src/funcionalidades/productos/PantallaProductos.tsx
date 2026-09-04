'use client';

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import {
  ErrorApi,
  type Producto,
  formatearFecha,
  formatearMoneda,
  type MetaPaginacion,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  Campo,
  ContenedorTabla,
  ContenidoAsincrono,
  type DatosProducto,
  EstadoVacio,
  EtiquetaStock,
  FormularioProducto,
  MarcoAplicacion,
  useSesion,
  Paginacion,
} from '@hce/ui';

import { apiHce } from '@/compartido/api';

/*
 * Diez por pagina. Con el catalogo de demostracion -trece productos- eso
 * deja dos paginas, de modo que los controles se ven y se pueden probar.
 * Con un tamano mayor la paginacion existia pero no llegaba a mostrarse
 * nunca, y parecia no estar implementada.
 */
const TAMANO_PAGINA = 10;

export function PantallaProductos(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);
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
      setMeta(resultado.meta);
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

          {meta && (
            <Paginacion meta={meta} elementos="productos" onCambiarPagina={setPagina} />
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
   Modal de alta y edicion
   -------------------------------------------------------------------------- */

/**
 * Envuelve el formulario compartido con lo propio de esta pantalla: a que
 * endpoint enviar segun se cree o se edite, y que mensaje devolver.
 *
 * Antes esto era una copia completa del formulario que ya existia en la zona de
 * inventario -mismos campos, misma validacion, mismo calculo del precio
 * sugerido-. Ahora solo queda la decision que de verdad es distinta.
 */
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
  const guardar = async (datos: DatosProducto): Promise<string> => {
    if (producto) {
      await apiHce.productos.actualizar(producto.idProducto, datos);
      return `Producto "${datos.nombreProducto}" actualizado.`;
    }
    await apiHce.productos.registrar(datos);
    return `Producto "${datos.nombreProducto}" registrado.`;
  };

  return (
    <FormularioProducto
      // Al cambiar de producto se fuerza un montaje nuevo, en lugar de
      // sincronizar el estado interno con la prop: es la forma que React
      // recomienda para reiniciar un formulario, y evita arrastrar los datos de
      // la fila anterior si se abre el modal sobre otra.
      key={producto?.idProducto ?? 'nuevo'}
      abierto={abierto}
      onCerrar={onCerrar}
      onGuardar={guardar}
      onGuardado={onGuardado}
      producto={producto ?? undefined}
      titulo={producto ? 'Editar producto' : 'Nuevo producto'}
      descripcion={
        producto
          ? 'Al cambiar el costo se recalcula el precio de venta (costo x 1.35).'
          : 'El precio de venta se calcula automaticamente como costo x 1.35.'
      }
      textoAccion={producto ? 'Guardar cambios' : 'Registrar producto'}
      mensajeSiFalla="No se pudo guardar el producto."
    />
  );
}
