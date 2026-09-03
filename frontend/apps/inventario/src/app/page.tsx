import { redirect } from 'next/navigation';

/** La raiz de la zona no tiene contenido propio: lleva al Kardex. */
export default function PaginaRaizInventario(): never {
  redirect('/inventario/kardex');
}
