/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 03-stored-procedures.sql
   Motor   : Microsoft SQL Server 2019+
   Objetivo: Tipos tabla, funciones de calculo y procedimientos almacenados que
             implementan los 8 servicios exigidos por el enunciado:
               Registrar Venta / Registrar Compra / Registrar Producto /
               Actualizar Producto / Listar Venta / Listar Compra /
               Listar Producto / Listar Kardex
             mas las operaciones de mantenimiento (obtener, eliminar logico).

   Convenciones
   ------------
   * Prefijo usp_ y nomenclatura <Entidad>_<Accion> para agrupar por dominio.
   * Toda escritura corre con SET XACT_ABORT ON dentro de TRY/CATCH: ante
     cualquier error la transaccion completa se revierte. En un sistema de salud
     un inventario a medio grabar es peor que una operacion rechazada.
   * Los detalles de compra y venta se reciben como Table-Valued Parameters.
     Esto evita el anti-patron de concatenar SQL dinamico por linea y permite
     enviar toda la operacion en un unico viaje de red desde NestJS.
   * Los precios de venta se leen SIEMPRE del servidor (tabla Productos), nunca
     del payload del cliente: es una regla de seguridad, no de conveniencia.
============================================================================= */

USE HCE_Insumos;
GO

/* Opciones de sesion requeridas por los indices filtrados, las vistas
   indexadas y los operadores FOR JSON. sqlcmd las trae desactivadas. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

/* -----------------------------------------------------------------------------
   0. LIMPIEZA IDEMPOTENTE DE TIPOS TABLA
      Los tipos no admiten CREATE OR ALTER, hay que eliminarlos junto con los
      procedimientos que los referencian.
----------------------------------------------------------------------------- */
DROP PROCEDURE IF EXISTS hce.usp_Compra_Registrar;
DROP PROCEDURE IF EXISTS hce.usp_Venta_Registrar;
DROP TYPE IF EXISTS hce.TipoDetalleCompra;
DROP TYPE IF EXISTS hce.TipoDetalleVenta;
GO

CREATE TYPE hce.TipoDetalleCompra AS TABLE
(
    Id_producto INT             NOT NULL,
    Cantidad    DECIMAL(18,4)   NOT NULL,
    Precio      DECIMAL(18,4)   NOT NULL   -- costo unitario de compra
);
GO

CREATE TYPE hce.TipoDetalleVenta AS TABLE
(
    Id_producto INT             NOT NULL,
    Cantidad    DECIMAL(18,4)   NOT NULL
    /* El precio NO se recibe del cliente: se toma de hce.Productos.PrecioVenta */
);
GO

/* =============================================================================
   1. FUNCION UNICA DE CALCULO DE IMPORTES
   -----------------------------------------------------------------------------
   El enunciado (seccion 1.2.2, literales b/c/d) define textualmente:

       Subtotal = Cantidad * Precio Venta
       Igv      = Cantidad * Precio Venta * 1.18
       Total    = Subtotal + Igv

   Se implementa LITERALMENTE como lo pide el examen. Queda constancia de la
   observacion tecnica: con esa formula el IGV resulta ser el 118 % del subtotal
   y el total el 218 %, mientras que el IGV peruano vigente es el 18 % del valor
   de venta (Igv = SubTotal * 0.18  ->  Total = SubTotal * 1.18).

   Para no dispersar la regla por todo el sistema, la formula vive en un unico
   lugar: esta funcion en linea. Cambiar de criterio es cambiar dos lineas aqui
   y su equivalente en el value object del BackEnd
   (backend/libs/shared/src/domain/value-objects/importe.vo.ts).
============================================================================= */
CREATE OR ALTER FUNCTION hce.fn_CalcularImportes
(
    @Cantidad DECIMAL(18,4),
    @Precio   DECIMAL(18,4)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        Sub_Total = CAST(@Cantidad * @Precio                 AS DECIMAL(18,4)),
        Igv       = CAST(@Cantidad * @Precio * 1.18           AS DECIMAL(18,4)),
        Total     = CAST(@Cantidad * @Precio
                       + @Cantidad * @Precio * 1.18           AS DECIMAL(18,4))
);
GO

/* Margen comercial aplicado a la compra: PrecioVenta = Costo * 1.35 (seccion 1.2.1.a) */
CREATE OR ALTER FUNCTION hce.fn_PrecioVentaDesdeCosto (@Costo DECIMAL(18,4))
RETURNS DECIMAL(18,4)
AS
BEGIN
    RETURN CAST(@Costo * 1.35 AS DECIMAL(18,4));
END;
GO

/* =============================================================================
   2. PRODUCTOS
============================================================================= */

/* 2.1 Registrar Producto ---------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Producto_Registrar
    @Nombre_producto NVARCHAR(150),
    @NroLote         NVARCHAR(50),
    @Costo           DECIMAL(18,4) = 0,
    @PrecioVenta     DECIMAL(18,4) = NULL,   -- si es NULL se deriva de Costo * 1.35
    @UsuarioApp      NVARCHAR(100) = NULL,
    @Id_producto     INT           = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC sys.sp_set_session_context @key = N'UsuarioApp', @value = @UsuarioApp;

    IF NULLIF(LTRIM(RTRIM(@Nombre_producto)), N'') IS NULL
        THROW 52001, N'El nombre del producto es obligatorio.', 1;

    IF NULLIF(LTRIM(RTRIM(@NroLote)), N'') IS NULL
        THROW 52002, N'El numero de lote es obligatorio.', 1;

    IF @Costo < 0
        THROW 52003, N'El costo no puede ser negativo.', 1;

    IF EXISTS (SELECT 1 FROM hce.Productos
               WHERE Nombre_producto = @Nombre_producto AND NroLote = @NroLote)
        THROW 52004, N'Ya existe un producto registrado con el mismo nombre y numero de lote.', 1;

    SET @PrecioVenta = ISNULL(@PrecioVenta, hce.fn_PrecioVentaDesdeCosto(@Costo));

    INSERT INTO hce.Productos (Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Activo)
    VALUES (@Nombre_producto, @NroLote, SYSDATETIME(), @Costo, @PrecioVenta, 1);

    SET @Id_producto = CAST(SCOPE_IDENTITY() AS INT);

    SELECT Id_producto, Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Activo
    FROM hce.Productos
    WHERE Id_producto = @Id_producto;
END;
GO

/* 2.2 Actualizar Producto --------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Producto_Actualizar
    @Id_producto     INT,
    @Nombre_producto NVARCHAR(150) = NULL,
    @NroLote         NVARCHAR(50)  = NULL,
    @Costo           DECIMAL(18,4) = NULL,
    @PrecioVenta     DECIMAL(18,4) = NULL,
    @UsuarioApp      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC sys.sp_set_session_context @key = N'UsuarioApp', @value = @UsuarioApp;

    IF NOT EXISTS (SELECT 1 FROM hce.Productos WHERE Id_producto = @Id_producto AND Activo = 1)
        THROW 52005, N'El producto no existe o se encuentra inactivo.', 1;

    /* Se resuelven primero los valores efectivos del producto objetivo. Comparar
       columna contra columna (Nombre_producto = ISNULL(@p, Nombre_producto))
       daria verdadero para CUALQUIER fila cuando el parametro llega en NULL, y
       toda actualizacion parcial se rechazaria como duplicada. */
    DECLARE @NombreFinal NVARCHAR(150), @LoteFinal NVARCHAR(50);

    SELECT @NombreFinal = ISNULL(@Nombre_producto, Nombre_producto),
           @LoteFinal   = ISNULL(@NroLote,         NroLote)
    FROM hce.Productos
    WHERE Id_producto = @Id_producto;

    IF EXISTS (SELECT 1 FROM hce.Productos
               WHERE Nombre_producto = @NombreFinal
                 AND NroLote         = @LoteFinal
                 AND Id_producto    <> @Id_producto)
        THROW 52004, N'Ya existe otro producto con el mismo nombre y numero de lote.', 1;

    UPDATE hce.Productos
    SET Nombre_producto = ISNULL(@Nombre_producto, Nombre_producto),
        NroLote         = ISNULL(@NroLote,         NroLote),
        Costo           = ISNULL(@Costo,           Costo),
        PrecioVenta     = ISNULL(@PrecioVenta,     PrecioVenta)
    WHERE Id_producto = @Id_producto;

    SELECT Id_producto, Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Activo
    FROM hce.Productos
    WHERE Id_producto = @Id_producto;
END;
GO

/* 2.3 Listar Producto (con busqueda, stock y paginacion) -------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Producto_Listar
    @Buscar       NVARCHAR(150) = NULL,
    @SoloConStock BIT           = 0,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @Pagina       = CASE WHEN @Pagina       < 1 THEN 1  ELSE @Pagina       END;
    SET @TamanoPagina = CASE WHEN @TamanoPagina < 1 THEN 20
                             WHEN @TamanoPagina > 200 THEN 200
                             ELSE @TamanoPagina END;

    ;WITH Filtrado AS
    (
        SELECT s.Id_producto, s.Nombre_producto, s.NroLote, s.Costo, s.PrecioVenta, s.Stock_actual,
               p.Fec_registro
        FROM hce.vw_StockActual AS s
        INNER JOIN hce.Productos AS p ON p.Id_producto = s.Id_producto
        WHERE (@Buscar IS NULL
               OR s.Nombre_producto LIKE N'%' + @Buscar + N'%'
               OR s.NroLote         LIKE N'%' + @Buscar + N'%')
          AND (@SoloConStock = 0 OR s.Stock_actual > 0)
    )
    SELECT
        Id_producto, Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Stock_actual,
        Total_registros = COUNT(*) OVER ()
    FROM Filtrado
    ORDER BY Nombre_producto
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* 2.4 Obtener Producto ------------------------------------------------------ */
CREATE OR ALTER PROCEDURE hce.usp_Producto_Obtener
    @Id_producto INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT s.Id_producto, s.Nombre_producto, s.NroLote, p.Fec_registro,
           s.Costo, s.PrecioVenta, s.Stock_actual, p.Activo
    FROM hce.vw_StockActual AS s
    INNER JOIN hce.Productos AS p ON p.Id_producto = s.Id_producto
    WHERE s.Id_producto = @Id_producto;
END;
GO

/* 2.5 Eliminar Producto (borrado logico) ------------------------------------ */
CREATE OR ALTER PROCEDURE hce.usp_Producto_Eliminar
    @Id_producto INT,
    @UsuarioApp  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC sys.sp_set_session_context @key = N'UsuarioApp', @value = @UsuarioApp;

    IF NOT EXISTS (SELECT 1 FROM hce.Productos WHERE Id_producto = @Id_producto AND Activo = 1)
        THROW 52005, N'El producto no existe o ya se encuentra inactivo.', 1;

    IF EXISTS (SELECT 1 FROM hce.vw_StockActual
               WHERE Id_producto = @Id_producto AND Stock_actual > 0)
        THROW 52006, N'No se puede desactivar un producto con stock disponible.', 1;

    UPDATE hce.Productos SET Activo = 0 WHERE Id_producto = @Id_producto;

    SELECT Id_producto, Nombre_producto, Activo FROM hce.Productos WHERE Id_producto = @Id_producto;
END;
GO

/* =============================================================================
   3. COMPRAS
============================================================================= */

/* 3.1 Obtener Compra (cabecera + detalle en dos result sets) ---------------- */
CREATE OR ALTER PROCEDURE hce.usp_Compra_Obtener
    @Id_CompraCab INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id_CompraCab, FecRegistro, SubTotal, Igv, Total
    FROM hce.CompraCab
    WHERE Id_CompraCab = @Id_CompraCab;

    SELECT d.Id_CompraDet, d.Id_CompraCab, d.Id_producto, p.Nombre_producto, p.NroLote,
           d.Cantidad, d.Precio, d.Sub_Total, d.Igv, d.Total
    FROM hce.CompraDet AS d
    INNER JOIN hce.Productos AS p ON p.Id_producto = d.Id_producto
    WHERE d.Id_CompraCab = @Id_CompraCab
    ORDER BY d.Id_CompraDet;
END;
GO

/* 3.2 Registrar Compra -------------------------------------------------------
   Operacion atomica que cubre la seccion 1.2.1.a del enunciado:
     1. Inserta CompraCab y CompraDet.
     2. Actualiza Costo y PrecioVenta (= Costo * 1.35) en Productos.
     3. Genera el movimiento de tipo Entrada (MovimientoCab + MovimientoDet).
   Si un producto se repite en el mismo comprobante, se consolida la cantidad y
   se toma el mayor costo unitario como costo vigente (criterio conservador
   para la valorizacion del inventario).
----------------------------------------------------------------------------- */
CREATE PROCEDURE hce.usp_Compra_Registrar
    @Detalle      hce.TipoDetalleCompra READONLY,
    @UsuarioApp   NVARCHAR(100) = NULL,
    @Id_CompraCab INT           = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC sys.sp_set_session_context @key = N'UsuarioApp', @value = @UsuarioApp;

    IF NOT EXISTS (SELECT 1 FROM @Detalle)
        THROW 53001, N'La compra debe contener al menos un producto.', 1;

    IF EXISTS (SELECT 1 FROM @Detalle WHERE Cantidad <= 0)
        THROW 53002, N'Todas las cantidades de la compra deben ser mayores a cero.', 1;

    IF EXISTS (SELECT 1 FROM @Detalle WHERE Precio < 0)
        THROW 53003, N'El costo unitario no puede ser negativo.', 1;

    DECLARE @ProductoInvalido INT =
        (SELECT TOP (1) d.Id_producto
         FROM @Detalle AS d
         WHERE NOT EXISTS (SELECT 1 FROM hce.Productos AS p
                           WHERE p.Id_producto = d.Id_producto AND p.Activo = 1));

    IF @ProductoInvalido IS NOT NULL
        THROW 53004, N'La compra referencia un producto inexistente o inactivo.', 1;

    /* Consolidacion por producto: cantidad sumada, costo unitario mayor. */
    DECLARE @Lineas TABLE
    (
        Id_producto INT PRIMARY KEY,
        Cantidad    DECIMAL(18,4) NOT NULL,
        Precio      DECIMAL(18,4) NOT NULL,
        Sub_Total   DECIMAL(18,4) NOT NULL,
        Igv         DECIMAL(18,4) NOT NULL,
        Total       DECIMAL(18,4) NOT NULL
    );

    INSERT INTO @Lineas (Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
    SELECT c.Id_producto, c.Cantidad, c.Precio, i.Sub_Total, i.Igv, i.Total
    FROM (
        SELECT Id_producto,
               Cantidad = SUM(Cantidad),
               Precio   = MAX(Precio)
        FROM @Detalle
        GROUP BY Id_producto
    ) AS c
    CROSS APPLY hce.fn_CalcularImportes(c.Cantidad, c.Precio) AS i;

    BEGIN TRY
        BEGIN TRANSACTION;

            /* 1. Cabecera de compra */
            INSERT INTO hce.CompraCab (FecRegistro, SubTotal, Igv, Total)
            SELECT SYSDATETIME(), SUM(Sub_Total), SUM(Igv), SUM(Total) FROM @Lineas;

            SET @Id_CompraCab = CAST(SCOPE_IDENTITY() AS INT);

            /* 2. Detalle de compra */
            INSERT INTO hce.CompraDet (Id_CompraCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
            SELECT @Id_CompraCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total
            FROM @Lineas;

            /* 3. Actualizacion de costo y precio de venta (Costo * 1.35) */
            UPDATE p
            SET p.Costo       = l.Precio,
                p.PrecioVenta = hce.fn_PrecioVentaDesdeCosto(l.Precio)
            FROM hce.Productos AS p
            INNER JOIN @Lineas AS l ON l.Id_producto = p.Id_producto;

            /* 4. Movimiento de Entrada */
            DECLARE @Id_MovimientoCab INT;

            INSERT INTO hce.MovimientoCab (Fec_registro, Id_TipoMovimiento, Id_DocumentoOrigen)
            VALUES (SYSDATETIME(), 1, @Id_CompraCab);

            SET @Id_MovimientoCab = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO hce.MovimientoDet (Id_movimientocab, Id_Producto, Cantidad)
            SELECT @Id_MovimientoCab, Id_producto, Cantidad FROM @Lineas;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC hce.usp_Compra_Obtener @Id_CompraCab = @Id_CompraCab;
END;
GO

/* 3.3 Listar Compra --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Compra_Listar
    @FechaDesde   DATE = NULL,
    @FechaHasta   DATE = NULL,
    @Pagina       INT  = 1,
    @TamanoPagina INT  = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @Pagina       = CASE WHEN @Pagina       < 1 THEN 1 ELSE @Pagina END;
    SET @TamanoPagina = CASE WHEN @TamanoPagina < 1 THEN 20
                             WHEN @TamanoPagina > 200 THEN 200
                             ELSE @TamanoPagina END;

    SELECT
        c.Id_CompraCab,
        c.FecRegistro,
        c.SubTotal,
        c.Igv,
        c.Total,
        Items           = (SELECT COUNT(*) FROM hce.CompraDet AS d WHERE d.Id_CompraCab = c.Id_CompraCab),
        Total_registros = COUNT(*) OVER ()
    FROM hce.CompraCab AS c
    WHERE (@FechaDesde IS NULL OR c.FecRegistro >= @FechaDesde)
      AND (@FechaHasta IS NULL OR c.FecRegistro <  DATEADD(DAY, 1, @FechaHasta))
    ORDER BY c.FecRegistro DESC, c.Id_CompraCab DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO


/* =============================================================================
   4. VENTAS
============================================================================= */

/* 4.1 Obtener Venta --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Venta_Obtener
    @Id_VentaCab INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id_VentaCab, fecRegistro, SubTotal, Igv, Total
    FROM hce.VentaCab
    WHERE Id_VentaCab = @Id_VentaCab;

    SELECT d.Id_VentaDet, d.Id_VentaCab, d.Id_producto, p.Nombre_producto, p.NroLote,
           d.Cantidad, d.Precio, d.Sub_Total, d.Igv, d.Total
    FROM hce.VentaDet AS d
    INNER JOIN hce.Productos AS p ON p.Id_producto = d.Id_producto
    WHERE d.Id_VentaCab = @Id_VentaCab
    ORDER BY d.Id_VentaDet;
END;
GO

/* 4.2 Registrar Venta --------------------------------------------------------
   Cubre la seccion 1.2.2 del enunciado:
     1. Valida que ninguna cantidad supere el stock disponible (derivado de la
        tabla de movimientos), rechazando la operacion completa si no alcanza.
     2. Inserta VentaCab y VentaDet tomando el PrecioVenta vigente del servidor.
     3. Genera el movimiento de tipo Salida.
   La lectura de stock usa UPDLOCK/HOLDLOCK sobre MovimientoDet para serializar
   ventas concurrentes del mismo insumo y evitar sobreventa por condicion de
   carrera. El trigger TR_MovimientoDet_ValidarStock actua como red de seguridad.
----------------------------------------------------------------------------- */
CREATE PROCEDURE hce.usp_Venta_Registrar
    @Detalle     hce.TipoDetalleVenta READONLY,
    @UsuarioApp  NVARCHAR(100) = NULL,
    @Id_VentaCab INT           = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC sys.sp_set_session_context @key = N'UsuarioApp', @value = @UsuarioApp;

    IF NOT EXISTS (SELECT 1 FROM @Detalle)
        THROW 54001, N'La venta debe contener al menos un producto.', 1;

    IF EXISTS (SELECT 1 FROM @Detalle WHERE Cantidad <= 0)
        THROW 54002, N'Todas las cantidades de la venta deben ser mayores a cero.', 1;

    DECLARE @ProductoInvalido INT =
        (SELECT TOP (1) d.Id_producto
         FROM @Detalle AS d
         WHERE NOT EXISTS (SELECT 1 FROM hce.Productos AS p
                           WHERE p.Id_producto = d.Id_producto AND p.Activo = 1));

    IF @ProductoInvalido IS NOT NULL
        THROW 54003, N'La venta referencia un producto inexistente o inactivo.', 1;

    DECLARE @Lineas TABLE
    (
        Id_producto INT PRIMARY KEY,
        Cantidad    DECIMAL(18,4) NOT NULL,
        Precio      DECIMAL(18,4) NOT NULL,
        Sub_Total   DECIMAL(18,4) NOT NULL,
        Igv         DECIMAL(18,4) NOT NULL,
        Total       DECIMAL(18,4) NOT NULL
    );

    BEGIN TRY
        BEGIN TRANSACTION;

            /* 1. Consolidacion por producto con el precio vigente del servidor */
            INSERT INTO @Lineas (Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
            SELECT c.Id_producto, c.Cantidad, p.PrecioVenta, i.Sub_Total, i.Igv, i.Total
            FROM (
                SELECT Id_producto, Cantidad = SUM(Cantidad)
                FROM @Detalle
                GROUP BY Id_producto
            ) AS c
            INNER JOIN hce.Productos AS p ON p.Id_producto = c.Id_producto
            CROSS APPLY hce.fn_CalcularImportes(c.Cantidad, p.PrecioVenta) AS i;

            /* 2. Validacion de stock con bloqueo, para serializar concurrencia */
            DECLARE @SinStock NVARCHAR(400) =
            (
                SELECT TOP (1) CONCAT(
                        N'Stock insuficiente para [', p.Nombre_producto,
                        N']. Solicitado: ',  CAST(l.Cantidad AS NVARCHAR(30)),
                        N' / Disponible: ',  CAST(x.Stock    AS NVARCHAR(30)), N'.')
                FROM @Lineas AS l
                INNER JOIN hce.Productos AS p ON p.Id_producto = l.Id_producto
                CROSS APPLY (
                    SELECT Stock = ISNULL(SUM(md.Cantidad * tm.Signo), 0)
                    FROM hce.MovimientoDet AS md WITH (UPDLOCK, HOLDLOCK)
                    INNER JOIN hce.MovimientoCab  AS mc ON mc.Id_MovimientoCab  = md.Id_movimientocab
                    INNER JOIN hce.TipoMovimiento AS tm ON tm.Id_TipoMovimiento = mc.Id_TipoMovimiento
                    WHERE md.Id_Producto = l.Id_producto
                ) AS x
                WHERE l.Cantidad > x.Stock
                ORDER BY p.Nombre_producto
            );

            IF @SinStock IS NOT NULL
                THROW 54004, @SinStock, 1;

            /* 3. Cabecera de venta */
            INSERT INTO hce.VentaCab (fecRegistro, SubTotal, Igv, Total)
            SELECT SYSDATETIME(), SUM(Sub_Total), SUM(Igv), SUM(Total) FROM @Lineas;

            SET @Id_VentaCab = CAST(SCOPE_IDENTITY() AS INT);

            /* 4. Detalle de venta */
            INSERT INTO hce.VentaDet (Id_VentaCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total)
            SELECT @Id_VentaCab, Id_producto, Cantidad, Precio, Sub_Total, Igv, Total
            FROM @Lineas;

            /* 5. Movimiento de Salida */
            DECLARE @Id_MovimientoCab INT;

            INSERT INTO hce.MovimientoCab (Fec_registro, Id_TipoMovimiento, Id_DocumentoOrigen)
            VALUES (SYSDATETIME(), 2, @Id_VentaCab);

            SET @Id_MovimientoCab = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO hce.MovimientoDet (Id_movimientocab, Id_Producto, Cantidad)
            SELECT @Id_MovimientoCab, Id_producto, Cantidad FROM @Lineas;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC hce.usp_Venta_Obtener @Id_VentaCab = @Id_VentaCab;
END;
GO

/* 4.3 Listar Venta ---------------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Venta_Listar
    @FechaDesde   DATE = NULL,
    @FechaHasta   DATE = NULL,
    @Pagina       INT  = 1,
    @TamanoPagina INT  = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @Pagina       = CASE WHEN @Pagina       < 1 THEN 1 ELSE @Pagina END;
    SET @TamanoPagina = CASE WHEN @TamanoPagina < 1 THEN 20
                             WHEN @TamanoPagina > 200 THEN 200
                             ELSE @TamanoPagina END;

    SELECT
        v.Id_VentaCab,
        v.fecRegistro,
        v.SubTotal,
        v.Igv,
        v.Total,
        Items           = (SELECT COUNT(*) FROM hce.VentaDet AS d WHERE d.Id_VentaCab = v.Id_VentaCab),
        Total_registros = COUNT(*) OVER ()
    FROM hce.VentaCab AS v
    WHERE (@FechaDesde IS NULL OR v.fecRegistro >= @FechaDesde)
      AND (@FechaHasta IS NULL OR v.fecRegistro <  DATEADD(DAY, 1, @FechaHasta))
    ORDER BY v.fecRegistro DESC, v.Id_VentaCab DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO


/* =============================================================================
   5. KARDEX
============================================================================= */

/* 5.1 Listar Kardex ----------------------------------------------------------
   Vista principal exigida en 1.2.3:
   Id_producto, nombre_producto, stock_actual, costo, Precio venta.
----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Kardex_Listar
    @Buscar       NVARCHAR(150) = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @Pagina       = CASE WHEN @Pagina       < 1 THEN 1 ELSE @Pagina END;
    SET @TamanoPagina = CASE WHEN @TamanoPagina < 1 THEN 20
                             WHEN @TamanoPagina > 200 THEN 200
                             ELSE @TamanoPagina END;

    SELECT
        s.Id_producto,
        s.Nombre_producto,
        s.NroLote,
        Stock_actual    = s.Stock_actual,
        Costo           = s.Costo,
        Precio_venta    = s.PrecioVenta,
        Valorizado      = CAST(s.Stock_actual * s.Costo AS DECIMAL(18,4)),
        Total_registros = COUNT(*) OVER ()
    FROM hce.vw_StockActual AS s
    WHERE (@Buscar IS NULL
           OR s.Nombre_producto LIKE N'%' + @Buscar + N'%'
           OR s.NroLote         LIKE N'%' + @Buscar + N'%')
    ORDER BY s.Nombre_producto
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* 5.2 Movimientos de un producto (modal de detalle del Kardex) ---------------
   Columnas exigidas: Fecha registro, tipo Movimiento, cantidad.
   Se agrega el saldo acumulado, que es lo que convierte una lista de
   movimientos en un Kardex util para conciliar inventario fisico.
----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE hce.usp_Kardex_MovimientosPorProducto
    @Id_producto  INT,
    @FechaDesde   DATE = NULL,
    @FechaHasta   DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM hce.Productos WHERE Id_producto = @Id_producto)
        THROW 52005, N'El producto no existe.', 1;

    SELECT
        k.Id_MovimientoDet,
        Fecha_registro = k.Fecha_registro,
        Tipo_movimiento = k.Tipo_movimiento,
        k.Id_TipoMovimiento,
        Documento_origen = k.Id_DocumentoOrigen,
        k.Cantidad,
        Saldo = SUM(k.Cantidad_con_signo) OVER (
                    ORDER BY k.Fecha_registro, k.Id_MovimientoDet
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM hce.vw_KardexDetalle AS k
    WHERE k.Id_producto = @Id_producto
      AND (@FechaDesde IS NULL OR k.Fecha_registro >= @FechaDesde)
      AND (@FechaHasta IS NULL OR k.Fecha_registro <  DATEADD(DAY, 1, @FechaHasta))
    ORDER BY k.Fecha_registro DESC, k.Id_MovimientoDet DESC;
END;
GO

/* =============================================================================
   6. SEGURIDAD / AUTENTICACION
============================================================================= */
CREATE OR ALTER PROCEDURE hce.usp_Usuario_ObtenerPorUsername
    @Username NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id_Usuario, Username, PasswordHash, NombreCompleto, Rol, Activo
    FROM hce.Usuarios
    WHERE Username = @Username AND Activo = 1;
END;
GO

/* =============================================================================
   7. AUDITORIA (consulta)
============================================================================= */
CREATE OR ALTER PROCEDURE hce.usp_Auditoria_Listar
    @Tabla        SYSNAME = NULL,
    @Pagina       INT     = 1,
    @TamanoPagina INT     = 50
AS
BEGIN
    SET NOCOUNT ON;

    SET @Pagina       = CASE WHEN @Pagina       < 1 THEN 1 ELSE @Pagina END;
    SET @TamanoPagina = CASE WHEN @TamanoPagina < 1 THEN 50
                             WHEN @TamanoPagina > 200 THEN 200
                             ELSE @TamanoPagina END;

    SELECT Id_Auditoria, Tabla, Operacion, ClavePrimaria, ValorAnterior, ValorNuevo,
           UsuarioBD, UsuarioApp, Host, FechaEvento,
           Total_registros = COUNT(*) OVER ()
    FROM hce.Auditoria
    WHERE (@Tabla IS NULL OR Tabla = @Tabla)
    ORDER BY FechaEvento DESC, Id_Auditoria DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

PRINT '>> 03-stored-procedures.sql ejecutado correctamente.';
GO
