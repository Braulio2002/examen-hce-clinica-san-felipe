/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 02-triggers-auditoria.sql
   Motor   : Microsoft SQL Server 2019+
   Objetivo: Triggers DML de auditoria (bitacora inmutable) y triggers de
             integridad de negocio sobre el inventario.

   Notas de diseno
   ---------------
   * Cada trigger deduce la operacion (INSERT / UPDATE / DELETE) a partir de la
     presencia de filas en las pseudotablas "inserted" y "deleted".
   * El estado anterior y posterior se serializan a JSON con FOR JSON PATH, de
     modo que la bitacora sobrevive a cambios de esquema sin migraciones.
   * El usuario de aplicacion (el que viaja en el JWT) se propaga desde NestJS
     con  EXEC sp_set_session_context @key = N'UsuarioApp', @value = N'jperez';
     y se recupera aqui con SESSION_CONTEXT. Asi la bitacora identifica a la
     persona real y no solo a la cuenta tecnica de conexion.
   * Todos los triggers son AFTER (no INSTEAD OF) y usan SET NOCOUNT ON para no
     alterar el @@ROWCOUNT que consume el ORM.
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
   1. AUDITORIA DE PRODUCTOS
   Es la tabla mas sensible: cambios de Costo y PrecioVenta impactan la
   valorizacion del inventario clinico y la facturacion al paciente.
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_Productos_Auditoria
ON hce.Productos
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
        RETURN;

    DECLARE @Operacion VARCHAR(10) =
        CASE
            WHEN EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted) THEN 'UPDATE'
            WHEN EXISTS (SELECT 1 FROM inserted)                                    THEN 'INSERT'
            ELSE 'DELETE'
        END;

    INSERT INTO hce.Auditoria (Tabla, Operacion, ClavePrimaria, ValorAnterior, ValorNuevo, UsuarioApp)
    SELECT
        N'hce.Productos',
        @Operacion,
        CAST(COALESCE(i.Id_producto, d.Id_producto) AS NVARCHAR(100)),
        (SELECT dd.* FROM deleted  AS dd WHERE dd.Id_producto = d.Id_producto
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT ii.* FROM inserted AS ii WHERE ii.Id_producto = i.Id_producto
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(NVARCHAR(100), SESSION_CONTEXT(N'UsuarioApp'))
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.Id_producto = i.Id_producto;
END;
GO

/* -----------------------------------------------------------------------------
   2. AUDITORIA DE COMPRAS (cabecera)
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_CompraCab_Auditoria
ON hce.CompraCab
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
        RETURN;

    DECLARE @Operacion VARCHAR(10) =
        CASE
            WHEN EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted) THEN 'UPDATE'
            WHEN EXISTS (SELECT 1 FROM inserted)                                    THEN 'INSERT'
            ELSE 'DELETE'
        END;

    INSERT INTO hce.Auditoria (Tabla, Operacion, ClavePrimaria, ValorAnterior, ValorNuevo, UsuarioApp)
    SELECT
        N'hce.CompraCab',
        @Operacion,
        CAST(COALESCE(i.Id_CompraCab, d.Id_CompraCab) AS NVARCHAR(100)),
        (SELECT dd.* FROM deleted  AS dd WHERE dd.Id_CompraCab = d.Id_CompraCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT ii.* FROM inserted AS ii WHERE ii.Id_CompraCab = i.Id_CompraCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(NVARCHAR(100), SESSION_CONTEXT(N'UsuarioApp'))
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.Id_CompraCab = i.Id_CompraCab;
END;
GO

/* -----------------------------------------------------------------------------
   3. AUDITORIA DE VENTAS (cabecera)
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_VentaCab_Auditoria
ON hce.VentaCab
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
        RETURN;

    DECLARE @Operacion VARCHAR(10) =
        CASE
            WHEN EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted) THEN 'UPDATE'
            WHEN EXISTS (SELECT 1 FROM inserted)                                    THEN 'INSERT'
            ELSE 'DELETE'
        END;

    INSERT INTO hce.Auditoria (Tabla, Operacion, ClavePrimaria, ValorAnterior, ValorNuevo, UsuarioApp)
    SELECT
        N'hce.VentaCab',
        @Operacion,
        CAST(COALESCE(i.Id_VentaCab, d.Id_VentaCab) AS NVARCHAR(100)),
        (SELECT dd.* FROM deleted  AS dd WHERE dd.Id_VentaCab = d.Id_VentaCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT ii.* FROM inserted AS ii WHERE ii.Id_VentaCab = i.Id_VentaCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(NVARCHAR(100), SESSION_CONTEXT(N'UsuarioApp'))
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.Id_VentaCab = i.Id_VentaCab;
END;
GO

/* -----------------------------------------------------------------------------
   4. AUDITORIA DE MOVIMIENTOS (cabecera del Kardex)
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_MovimientoCab_Auditoria
ON hce.MovimientoCab
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
        RETURN;

    DECLARE @Operacion VARCHAR(10) =
        CASE
            WHEN EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted) THEN 'UPDATE'
            WHEN EXISTS (SELECT 1 FROM inserted)                                    THEN 'INSERT'
            ELSE 'DELETE'
        END;

    INSERT INTO hce.Auditoria (Tabla, Operacion, ClavePrimaria, ValorAnterior, ValorNuevo, UsuarioApp)
    SELECT
        N'hce.MovimientoCab',
        @Operacion,
        CAST(COALESCE(i.Id_MovimientoCab, d.Id_MovimientoCab) AS NVARCHAR(100)),
        (SELECT dd.* FROM deleted  AS dd WHERE dd.Id_MovimientoCab = d.Id_MovimientoCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT ii.* FROM inserted AS ii WHERE ii.Id_MovimientoCab = i.Id_MovimientoCab
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(NVARCHAR(100), SESSION_CONTEXT(N'UsuarioApp'))
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.Id_MovimientoCab = i.Id_MovimientoCab;
END;
GO

/* -----------------------------------------------------------------------------
   5. INTEGRIDAD DE NEGOCIO: el stock nunca puede quedar negativo
   Ultima linea de defensa. La validacion primaria vive en el stored procedure
   hce.usp_Venta_Registrar y en el microservicio de ventas, pero un trigger
   garantiza la invariante incluso ante un INSERT manual o un script externo.
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_MovimientoDet_ValidarStock
ON hce.MovimientoDet
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    DECLARE @Id_producto INT, @Stock DECIMAL(18,4), @Nombre NVARCHAR(150);

    SELECT TOP (1)
        @Id_producto = s.Id_producto,
        @Stock       = s.Stock_actual,
        @Nombre      = s.Nombre_producto
    FROM hce.vw_StockActual AS s
    WHERE s.Id_producto IN (SELECT DISTINCT Id_Producto FROM inserted)
      AND s.Stock_actual < 0;

    IF @Id_producto IS NOT NULL
    BEGIN
        DECLARE @Msg NVARCHAR(400) = CONCAT(
            N'Stock insuficiente. El producto [', @Nombre, N'] (Id=', @Id_producto,
            N') quedaria con existencia ', CAST(@Stock AS NVARCHAR(30)),
            N'. La operacion fue revertida.');

        THROW 51001, @Msg, 1;
    END
END;
GO

/* -----------------------------------------------------------------------------
   6. INTEGRIDAD DE NEGOCIO: proteger la bitacora de auditoria
   La tabla de auditoria es de solo insercion. Cualquier intento de modificarla
   o borrarla se rechaza: es evidencia de trazabilidad clinica.
----------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER hce.TR_Auditoria_SoloInsercion
ON hce.Auditoria
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51002, N'La bitacora hce.Auditoria es inmutable: no admite UPDATE ni DELETE.', 1;
END;
GO

PRINT '>> 02-triggers-auditoria.sql ejecutado correctamente.';
GO
