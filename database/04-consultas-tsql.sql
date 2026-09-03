/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 04-consultas-tsql.sql
   Motor   : Microsoft SQL Server 2019+
   Objetivo: Scripts T-SQL de INSERTAR / LISTAR / ACTUALIZAR / ELIMINAR para
             cada entidad del modelo, tal como pide la seccion 1.1.1 del
             enunciado, mas las consultas analiticas del Kardex.

   IMPORTANTE
   ----------
   Este archivo es material de referencia y demostracion. En produccion el
   BackEnd NO ejecuta estas sentencias sueltas: invoca los procedimientos
   almacenados de 03-stored-procedures.sql, que encapsulan la transaccion
   completa (compra -> costo -> precio -> movimiento) y no pueden dejar el
   inventario en un estado intermedio.

   Todas las sentencias usan variables parametrizadas (@variable) para dejar
   explicito que jamas se concatena entrada de usuario dentro del SQL.
============================================================================= */

USE HCE_Insumos;
GO

/* Opciones de sesion requeridas por los indices filtrados, las vistas
   indexadas y los operadores FOR JSON. sqlcmd las trae desactivadas. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO
/* #############################################################################
   SECCION A - PRODUCTOS
############################################################################# */

/* A.1 INSERTAR --------------------------------------------------------------- */
DECLARE @Nombre_producto NVARCHAR(150) = N'Paracetamol 500 mg Tableta',
        @NroLote         NVARCHAR(50)  = N'LT-2026-0001',
        @Costo           DECIMAL(18,4) = 0.4500;

INSERT INTO hce.Productos (Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Activo)
VALUES (@Nombre_producto, @NroLote, SYSDATETIME(), @Costo, @Costo * 1.35, 1);

SELECT Id_producto_generado = SCOPE_IDENTITY();
GO

/* A.2 LISTAR ----------------------------------------------------------------- */
-- A.2.1 Listado simple de productos activos
SELECT Id_producto, Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta
FROM hce.Productos
WHERE Activo = 1
ORDER BY Nombre_producto;
GO

-- A.2.2 Listado con stock disponible (lo que consume la pantalla de venta)
DECLARE @Buscar NVARCHAR(150) = NULL;

SELECT Id_producto, Nombre_producto, NroLote, Costo, PrecioVenta, Stock_actual
FROM hce.vw_StockActual
WHERE @Buscar IS NULL
   OR Nombre_producto LIKE N'%' + @Buscar + N'%'
   OR NroLote         LIKE N'%' + @Buscar + N'%'
ORDER BY Nombre_producto;
GO

-- A.2.3 Listado paginado (patron OFFSET/FETCH, el que usa el BackEnd)
DECLARE @Pagina INT = 1, @TamanoPagina INT = 20;

SELECT Id_producto, Nombre_producto, NroLote, Costo, PrecioVenta,
       Total_registros = COUNT(*) OVER ()
FROM hce.Productos
WHERE Activo = 1
ORDER BY Nombre_producto
OFFSET (@Pagina - 1) * @TamanoPagina ROWS
FETCH NEXT @TamanoPagina ROWS ONLY;
GO

/* A.3 ACTUALIZAR ------------------------------------------------------------- */
-- A.3.1 Actualizacion puntual de datos maestros
DECLARE @Id_producto INT = 1,
        @NuevoNombre NVARCHAR(150) = N'Paracetamol 500 mg Tableta Recubierta';

UPDATE hce.Productos
SET Nombre_producto = @NuevoNombre
WHERE Id_producto = @Id_producto AND Activo = 1;

SELECT Filas_afectadas = @@ROWCOUNT;
GO

-- A.3.2 Recalculo de precio de venta a partir del costo (regla Costo * 1.35)
DECLARE @Id_producto INT = 1, @NuevoCosto DECIMAL(18,4) = 0.5200;

UPDATE hce.Productos
SET Costo       = @NuevoCosto,
    PrecioVenta = hce.fn_PrecioVentaDesdeCosto(@NuevoCosto)
WHERE Id_producto = @Id_producto;
GO

/* A.4 ELIMINAR --------------------------------------------------------------- */
-- A.4.1 Borrado logico (el que usa la aplicacion: preserva trazabilidad)
DECLARE @Id_producto INT = 1;

UPDATE hce.Productos
SET Activo = 0
WHERE Id_producto = @Id_producto
  AND NOT EXISTS (SELECT 1 FROM hce.vw_StockActual
                  WHERE Id_producto = @Id_producto AND Stock_actual > 0);
GO

-- A.4.2 Borrado fisico (solo para depuracion; falla si hay movimientos)
DECLARE @Id_producto INT = 999;

DELETE FROM hce.Productos
WHERE Id_producto = @Id_producto
  AND NOT EXISTS (SELECT 1 FROM hce.MovimientoDet WHERE Id_Producto = @Id_producto)
  AND NOT EXISTS (SELECT 1 FROM hce.CompraDet     WHERE Id_producto = @Id_producto)
  AND NOT EXISTS (SELECT 1 FROM hce.VentaDet      WHERE Id_producto = @Id_producto);
GO

/* #############################################################################
   SECCION B - COMPRAS
############################################################################# */

/* B.1 INSERTAR (flujo completo equivalente a hce.usp_Compra_Registrar) ------- */
BEGIN TRY
    BEGIN TRANSACTION;

        DECLARE @Detalle TABLE (Id_producto INT, Cantidad DECIMAL(18,4), Precio DECIMAL(18,4));

        INSERT INTO @Detalle (Id_producto, Cantidad, Precio)
        VALUES (1, 100, 0.4500),
               (2,  50, 1.2000);

        DECLARE @Lineas TABLE (Id_producto INT, Cantidad DECIMAL(18,4), Precio DECIMAL(18,4),
                               Sub_Total DECIMAL(18,4), Igv DECIMAL(18,4), Total DECIMAL(18,4));

        INSERT INTO @Lineas
        SELECT d.Id_producto, d.Cantidad, d.Precio, i.Sub_Total, i.Igv, i.Total
        FROM @Detalle AS d
        CROSS APPLY hce.fn_CalcularImportes(d.Cantidad, d.Precio) AS i;

        -- Cabecera
        INSERT INTO hce.CompraCab (FecRegistro, SubTotal, Igv, Total)
        SELECT SYSDATETIME(), SUM(Sub_Total), SUM(Igv), SUM(Total) FROM @Lineas;

        DECLARE @Id_CompraCab INT = CAST(SCOPE_IDENTITY() AS INT);

        -- Detalle
        INSERT INTO hce.CompraDet (Id_CompraCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
        SELECT @Id_CompraCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total FROM @Lineas;

        -- Actualizacion de costo y precio de venta
        UPDATE p
        SET p.Costo       = l.Precio,
            p.PrecioVenta = hce.fn_PrecioVentaDesdeCosto(l.Precio)
        FROM hce.Productos AS p
        INNER JOIN @Lineas AS l ON l.Id_producto = p.Id_producto;

        -- Movimiento de Entrada
        INSERT INTO hce.MovimientoCab (Fec_registro, Id_TipoMovimiento, Id_DocumentoOrigen)
        VALUES (SYSDATETIME(), 1, @Id_CompraCab);

        DECLARE @Id_MovimientoCab INT = CAST(SCOPE_IDENTITY() AS INT);

        INSERT INTO hce.MovimientoDet (Id_movimientocab, Id_Producto, Cantidad)
        SELECT @Id_MovimientoCab, Id_producto, Cantidad FROM @Lineas;

    COMMIT TRANSACTION;
    SELECT Compra_registrada = @Id_CompraCab;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* B.2 LISTAR ----------------------------------------------------------------- */
-- B.2.1 Cabeceras de compra con conteo de items
SELECT c.Id_CompraCab, c.FecRegistro, c.SubTotal, c.Igv, c.Total,
       Items = (SELECT COUNT(*) FROM hce.CompraDet AS d WHERE d.Id_CompraCab = c.Id_CompraCab)
FROM hce.CompraCab AS c
ORDER BY c.FecRegistro DESC;
GO

-- B.2.2 Detalle de una compra
DECLARE @Id_CompraCab INT = 1;

SELECT d.Id_CompraDet, d.Id_producto, p.Nombre_producto, p.NroLote,
       d.Cantidad, d.Precio, d.Sub_Total, d.Igv, d.Total
FROM hce.CompraDet AS d
INNER JOIN hce.Productos AS p ON p.Id_producto = d.Id_producto
WHERE d.Id_CompraCab = @Id_CompraCab
ORDER BY d.Id_CompraDet;
GO

/* B.3 ACTUALIZAR ------------------------------------------------------------- */
-- Recalcula los totales de la cabecera a partir de su detalle (conciliacion)
DECLARE @Id_CompraCab INT = 1;

UPDATE c
SET c.SubTotal = t.SubTotal,
    c.Igv      = t.Igv,
    c.Total    = t.Total
FROM hce.CompraCab AS c
CROSS APPLY (
    SELECT SubTotal = SUM(d.Sub_Total), Igv = SUM(d.Igv), Total = SUM(d.Total)
    FROM hce.CompraDet AS d WHERE d.Id_CompraCab = c.Id_CompraCab
) AS t
WHERE c.Id_CompraCab = @Id_CompraCab;
GO

/* B.4 ELIMINAR --------------------------------------------------------------- */
-- Elimina la compra, su detalle (ON DELETE CASCADE) y revierte el movimiento
DECLARE @Id_CompraCab INT = 999;

BEGIN TRY
    BEGIN TRANSACTION;
        DELETE FROM hce.MovimientoCab
        WHERE Id_TipoMovimiento = 1 AND Id_DocumentoOrigen = @Id_CompraCab;

        DELETE FROM hce.CompraCab WHERE Id_CompraCab = @Id_CompraCab;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* #############################################################################
   SECCION C - VENTAS
############################################################################# */

/* C.1 INSERTAR (con validacion de stock) ------------------------------------- */
BEGIN TRY
    BEGIN TRANSACTION;

        DECLARE @DetVenta TABLE (Id_producto INT, Cantidad DECIMAL(18,4));

        INSERT INTO @DetVenta (Id_producto, Cantidad)
        VALUES (1, 10),
               (2,  5);

        DECLARE @LineasV TABLE (Id_producto INT, Cantidad DECIMAL(18,4), Precio DECIMAL(18,4),
                                Sub_Total DECIMAL(18,4), Igv DECIMAL(18,4), Total DECIMAL(18,4));

        INSERT INTO @LineasV
        SELECT d.Id_producto, d.Cantidad, p.PrecioVenta, i.Sub_Total, i.Igv, i.Total
        FROM @DetVenta AS d
        INNER JOIN hce.Productos AS p ON p.Id_producto = d.Id_producto
        CROSS APPLY hce.fn_CalcularImportes(d.Cantidad, p.PrecioVenta) AS i;

        -- Validacion: ninguna cantidad puede superar el stock disponible
        IF EXISTS (
            SELECT 1
            FROM @LineasV AS l
            INNER JOIN hce.vw_StockActual AS s ON s.Id_producto = l.Id_producto
            WHERE l.Cantidad > s.Stock_actual
        )
            THROW 54004, N'La cantidad no debe ser mayor al stock disponible.', 1;

        INSERT INTO hce.VentaCab (fecRegistro, SubTotal, Igv, Total)
        SELECT SYSDATETIME(), SUM(Sub_Total), SUM(Igv), SUM(Total) FROM @LineasV;

        DECLARE @Id_VentaCab INT = CAST(SCOPE_IDENTITY() AS INT);

        INSERT INTO hce.VentaDet (Id_VentaCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
        SELECT @Id_VentaCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total FROM @LineasV;

        INSERT INTO hce.MovimientoCab (Fec_registro, Id_TipoMovimiento, Id_DocumentoOrigen)
        VALUES (SYSDATETIME(), 2, @Id_VentaCab);

        DECLARE @Id_MovCabV INT = CAST(SCOPE_IDENTITY() AS INT);

        INSERT INTO hce.MovimientoDet (Id_movimientocab, Id_Producto, Cantidad)
        SELECT @Id_MovCabV, Id_producto, Cantidad FROM @LineasV;

    COMMIT TRANSACTION;
    SELECT Venta_registrada = @Id_VentaCab;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* C.2 LISTAR ----------------------------------------------------------------- */
SELECT v.Id_VentaCab, v.fecRegistro, v.SubTotal, v.Igv, v.Total,
       Items = (SELECT COUNT(*) FROM hce.VentaDet AS d WHERE d.Id_VentaCab = v.Id_VentaCab)
FROM hce.VentaCab AS v
ORDER BY v.fecRegistro DESC;
GO

DECLARE @Id_VentaCab INT = 1;

SELECT d.Id_VentaDet, d.Id_producto, p.Nombre_producto,
       d.Cantidad, d.Precio, d.Sub_Total, d.Igv, d.Total
FROM hce.VentaDet AS d
INNER JOIN hce.Productos AS p ON p.Id_producto = d.Id_producto
WHERE d.Id_VentaCab = @Id_VentaCab;
GO

/* C.3 ACTUALIZAR ------------------------------------------------------------- */
DECLARE @Id_VentaCab INT = 1;

UPDATE v
SET v.SubTotal = t.SubTotal, v.Igv = t.Igv, v.Total = t.Total
FROM hce.VentaCab AS v
CROSS APPLY (
    SELECT SubTotal = SUM(d.Sub_Total), Igv = SUM(d.Igv), Total = SUM(d.Total)
    FROM hce.VentaDet AS d WHERE d.Id_VentaCab = v.Id_VentaCab
) AS t
WHERE v.Id_VentaCab = @Id_VentaCab;
GO

/* C.4 ELIMINAR --------------------------------------------------------------- */
DECLARE @Id_VentaCab INT = 999;

BEGIN TRY
    BEGIN TRANSACTION;
        DELETE FROM hce.MovimientoCab
        WHERE Id_TipoMovimiento = 2 AND Id_DocumentoOrigen = @Id_VentaCab;

        DELETE FROM hce.VentaCab WHERE Id_VentaCab = @Id_VentaCab;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* #############################################################################
   SECCION D - MOVIMIENTOS / KARDEX
############################################################################# */

/* D.1 Kardex resumido: lo que muestra la grilla principal (seccion 1.2.3) ----- */
SELECT Id_producto,
       Nombre_producto,
       Stock_actual,
       Costo,
       Precio_venta = PrecioVenta
FROM hce.vw_StockActual
ORDER BY Nombre_producto;
GO

/* D.2 Movimientos de un producto: lo que muestra el modal ------------------- */
DECLARE @Id_producto INT = 1;

SELECT Fecha_registro  = k.Fecha_registro,
       Tipo_movimiento = k.Tipo_movimiento,
       Cantidad        = k.Cantidad,
       Saldo           = SUM(k.Cantidad_con_signo) OVER (
                             ORDER BY k.Fecha_registro, k.Id_MovimientoDet
                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
FROM hce.vw_KardexDetalle AS k
WHERE k.Id_producto = @Id_producto
ORDER BY k.Fecha_registro DESC, k.Id_MovimientoDet DESC;
GO

/* D.3 Stock puntual de un producto ------------------------------------------ */
DECLARE @Id_producto INT = 1;

SELECT Stock = ISNULL(SUM(md.Cantidad * tm.Signo), 0)
FROM hce.MovimientoDet AS md
INNER JOIN hce.MovimientoCab  AS mc ON mc.Id_MovimientoCab  = md.Id_movimientocab
INNER JOIN hce.TipoMovimiento AS tm ON tm.Id_TipoMovimiento = mc.Id_TipoMovimiento
WHERE md.Id_Producto = @Id_producto;
GO

/* D.4 Productos bajo punto de reorden (alerta operativa de farmacia) -------- */
DECLARE @StockMinimo DECIMAL(18,4) = 20;

SELECT Id_producto, Nombre_producto, NroLote, Stock_actual
FROM hce.vw_StockActual
WHERE Stock_actual <= @StockMinimo
ORDER BY Stock_actual ASC;
GO

/* D.5 Valorizacion del inventario ------------------------------------------- */
SELECT Total_unidades   = SUM(Stock_actual),
       Valor_al_costo   = SUM(Stock_actual * Costo),
       Valor_a_la_venta = SUM(Stock_actual * PrecioVenta)
FROM hce.vw_StockActual;
GO

/* #############################################################################
   SECCION E - AUDITORIA
############################################################################# */

/* E.1 Ultimos eventos registrados por los triggers -------------------------- */
SELECT TOP (100) Id_Auditoria, Tabla, Operacion, ClavePrimaria,
       UsuarioApp, UsuarioBD, Host, FechaEvento
FROM hce.Auditoria
ORDER BY Id_Auditoria DESC;
GO

/* E.2 Historial de cambios de precio de un producto ------------------------- */
DECLARE @Id_producto NVARCHAR(100) = N'1';

SELECT FechaEvento,
       Operacion,
       UsuarioApp,
       Costo_anterior   = JSON_VALUE(ValorAnterior, '$.Costo'),
       Costo_nuevo      = JSON_VALUE(ValorNuevo,    '$.Costo'),
       Precio_anterior  = JSON_VALUE(ValorAnterior, '$.PrecioVenta'),
       Precio_nuevo     = JSON_VALUE(ValorNuevo,    '$.PrecioVenta')
FROM hce.Auditoria
WHERE Tabla = N'hce.Productos'
  AND ClavePrimaria = @Id_producto
ORDER BY Id_Auditoria DESC;
GO

PRINT '>> 04-consultas-tsql.sql: script de referencia (no requiere ejecucion automatica).';
GO
