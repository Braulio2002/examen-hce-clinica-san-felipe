/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 99-pruebas-verificacion.sql
   Objetivo: Bateria de pruebas que valida las reglas de negocio criticas del
             enunciado directamente contra la base de datos.

   Se ejecuta despues del seed. Cada prueba imprime OK o FALLA; el script
   termina con un resumen. No modifica el estado final del inventario: las
   operaciones de prueba se revierten.
============================================================================= */

USE HCE_Insumos;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

DECLARE @Fallas INT = 0, @Pruebas INT = 0;

/* -----------------------------------------------------------------------------
   PRUEBA 1 - El precio de venta se deriva del costo con el factor 1.35
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
IF EXISTS (
    SELECT 1 FROM hce.Productos
    WHERE Costo > 0
      AND ABS(PrecioVenta - CAST(Costo * 1.35 AS DECIMAL(18,4))) > 0.0001
)
BEGIN
    SET @Fallas += 1;
    PRINT 'FALLA  P1 - Hay productos cuyo PrecioVenta no es Costo * 1.35';
END
ELSE
    PRINT 'OK     P1 - PrecioVenta = Costo * 1.35 en todo el catalogo';

/* -----------------------------------------------------------------------------
   PRUEBA 2 - La compra genera movimiento de Entrada y suma stock
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRAN;
    DECLARE @IdProd INT = (SELECT TOP (1) Id_producto FROM hce.Productos ORDER BY Id_producto);
    DECLARE @StockAntes DECIMAL(18,4) =
        (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProd);

    DECLARE @C hce.TipoDetalleCompra;
    INSERT INTO @C (Id_producto, Cantidad, Precio) VALUES (@IdProd, 25, 0.6000);

    DECLARE @IdCompra INT;
    EXEC hce.usp_Compra_Registrar @Detalle = @C, @UsuarioApp = N'test', @Id_CompraCab = @IdCompra OUTPUT;

    DECLARE @StockDespues DECIMAL(18,4) =
        (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProd);

    IF @StockDespues <> @StockAntes + 25
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P2 - Stock esperado ', @StockAntes + 25, ' pero se obtuvo ', @StockDespues);
    END
    ELSE IF NOT EXISTS (SELECT 1 FROM hce.MovimientoCab
                        WHERE Id_TipoMovimiento = 1 AND Id_DocumentoOrigen = @IdCompra)
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P2 - La compra no genero movimiento de tipo Entrada';
    END
    ELSE
        PRINT 'OK     P2 - La compra suma stock y genera movimiento de Entrada';

    /* La compra tambien debe haber actualizado costo y precio */
    SET @Pruebas += 1;
    IF NOT EXISTS (SELECT 1 FROM hce.Productos
                   WHERE Id_producto = @IdProd AND Costo = 0.6000 AND PrecioVenta = 0.8100)
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P3 - La compra no actualizo Costo/PrecioVenta del producto';
    END
    ELSE
        PRINT 'OK     P3 - La compra actualizo Costo (0.60) y PrecioVenta (0.81)';
ROLLBACK TRAN;

/* -----------------------------------------------------------------------------
   PRUEBA 4 - La venta descuenta stock y genera movimiento de Salida
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRAN;
    DECLARE @IdProdV INT = (SELECT TOP (1) Id_producto FROM hce.vw_StockActual
                            WHERE Stock_actual >= 10 ORDER BY Id_producto);
    DECLARE @StockAntesV DECIMAL(18,4) =
        (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProdV);

    DECLARE @V hce.TipoDetalleVenta;
    INSERT INTO @V (Id_producto, Cantidad) VALUES (@IdProdV, 5);

    DECLARE @IdVenta INT;
    EXEC hce.usp_Venta_Registrar @Detalle = @V, @UsuarioApp = N'test', @Id_VentaCab = @IdVenta OUTPUT;

    DECLARE @StockDespuesV DECIMAL(18,4) =
        (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProdV);

    IF @StockDespuesV <> @StockAntesV - 5
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P4 - Stock esperado ', @StockAntesV - 5, ' pero se obtuvo ', @StockDespuesV);
    END
    ELSE IF NOT EXISTS (SELECT 1 FROM hce.MovimientoCab
                        WHERE Id_TipoMovimiento = 2 AND Id_DocumentoOrigen = @IdVenta)
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P4 - La venta no genero movimiento de tipo Salida';
    END
    ELSE
        PRINT 'OK     P4 - La venta descuenta stock y genera movimiento de Salida';
ROLLBACK TRAN;

/* -----------------------------------------------------------------------------
   PRUEBA 5 - La venta se rechaza si la cantidad supera el stock disponible
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRY
    BEGIN TRAN;
        DECLARE @IdProdX INT = (SELECT TOP (1) Id_producto FROM hce.vw_StockActual ORDER BY Id_producto);
        DECLARE @StockX DECIMAL(18,4) =
            (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProdX);

        DECLARE @VX hce.TipoDetalleVenta;
        INSERT INTO @VX (Id_producto, Cantidad) VALUES (@IdProdX, @StockX + 1);

        DECLARE @IdVentaX INT;
        EXEC hce.usp_Venta_Registrar @Detalle = @VX, @UsuarioApp = N'test', @Id_VentaCab = @IdVentaX OUTPUT;
    ROLLBACK TRAN;

    SET @Fallas += 1;
    PRINT 'FALLA  P5 - Se permitio vender por encima del stock disponible';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRAN;
    IF ERROR_NUMBER() IN (54004, 51001)
        PRINT CONCAT('OK     P5 - Venta rechazada por stock insuficiente: ', ERROR_MESSAGE());
    ELSE
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P5 - Error inesperado (', ERROR_NUMBER(), '): ', ERROR_MESSAGE());
    END
END CATCH;

/* -----------------------------------------------------------------------------
   PRUEBA 6 - Los importes siguen la formula literal del enunciado
              SubTotal = Cant * Precio ; Igv = Cant * Precio * 1.18 ; Total = suma
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
IF EXISTS (
    SELECT 1
    FROM hce.VentaDet AS d
    CROSS APPLY hce.fn_CalcularImportes(d.Cantidad, d.Precio) AS i
    WHERE ABS(d.Sub_Total - i.Sub_Total) > 0.0001
       OR ABS(d.Igv       - i.Igv)       > 0.0001
       OR ABS(d.Total     - i.Total)     > 0.0001
)
BEGIN
    SET @Fallas += 1;
    PRINT 'FALLA  P6 - Hay detalles de venta con importes inconsistentes';
END
ELSE
    PRINT 'OK     P6 - Los importes de venta respetan la formula del enunciado';

/* -----------------------------------------------------------------------------
   PRUEBA 7 - Los triggers de auditoria registran los cambios de producto
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRAN;
    DECLARE @AuditAntes INT = (SELECT COUNT(*) FROM hce.Auditoria WHERE Tabla = N'hce.Productos');
    DECLARE @IdProdA INT = (SELECT TOP (1) Id_producto FROM hce.Productos ORDER BY Id_producto);

    EXEC hce.usp_Producto_Actualizar
         @Id_producto = @IdProdA, @Costo = 1.2345, @UsuarioApp = N'auditor_test';

    DECLARE @AuditDespues INT = (SELECT COUNT(*) FROM hce.Auditoria WHERE Tabla = N'hce.Productos');

    IF @AuditDespues <> @AuditAntes + 1
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P7 - El trigger de auditoria no registro el UPDATE';
    END
    ELSE IF NOT EXISTS (
        SELECT 1 FROM hce.Auditoria
        WHERE Tabla = N'hce.Productos' AND Operacion = 'UPDATE'
          AND UsuarioApp = N'auditor_test'
          AND JSON_VALUE(ValorNuevo, '$.Costo') = '1.2345')
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P7 - La bitacora no guardo el usuario o el valor nuevo esperado';
    END
    ELSE
        PRINT 'OK     P7 - El trigger audita el UPDATE con usuario y valores JSON';
ROLLBACK TRAN;

/* -----------------------------------------------------------------------------
   PRUEBA 8 - La bitacora de auditoria es inmutable
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRY
    BEGIN TRAN;
        UPDATE TOP (1) hce.Auditoria SET Operacion = 'INSERT';
    ROLLBACK TRAN;
    SET @Fallas += 1;
    PRINT 'FALLA  P8 - Se permitio modificar la bitacora de auditoria';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRAN;
    IF ERROR_NUMBER() = 51002
        PRINT 'OK     P8 - La bitacora de auditoria rechaza UPDATE/DELETE';
    ELSE
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P8 - Error inesperado (', ERROR_NUMBER(), '): ', ERROR_MESSAGE());
    END
END CATCH;

/* -----------------------------------------------------------------------------
   PRUEBA 9 - No se puede duplicar el movimiento de un mismo documento origen
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
BEGIN TRY
    BEGIN TRAN;
        DECLARE @IdCompraExistente INT = (SELECT TOP (1) Id_DocumentoOrigen FROM hce.MovimientoCab
                                          WHERE Id_TipoMovimiento = 1);
        INSERT INTO hce.MovimientoCab (Fec_registro, Id_TipoMovimiento, Id_DocumentoOrigen)
        VALUES (SYSDATETIME(), 1, @IdCompraExistente);
    ROLLBACK TRAN;
    SET @Fallas += 1;
    PRINT 'FALLA  P9 - Se permitio duplicar el movimiento de un documento origen';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRAN;
    PRINT 'OK     P9 - La restriccion UQ_MovimientoCab_Documento evita duplicados';
END CATCH;

/* -----------------------------------------------------------------------------
   PRUEBA 10 - El Kardex por producto devuelve saldo acumulado coherente
----------------------------------------------------------------------------- */
SET @Pruebas += 1;
DECLARE @IdProdK INT = (SELECT TOP (1) Id_producto FROM hce.vw_KardexDetalle ORDER BY Id_producto);
DECLARE @SaldoKardex DECIMAL(18,4) =
    (SELECT SUM(Cantidad_con_signo) FROM hce.vw_KardexDetalle WHERE Id_producto = @IdProdK);
DECLARE @SaldoVista DECIMAL(18,4) =
    (SELECT Stock_actual FROM hce.vw_StockActual WHERE Id_producto = @IdProdK);

IF ISNULL(@SaldoKardex, -1) <> ISNULL(@SaldoVista, -2)
BEGIN
    SET @Fallas += 1;
    PRINT CONCAT('FALLA  P10 - Kardex (', @SaldoKardex, ') no coincide con stock (', @SaldoVista, ')');
END
ELSE
    PRINT 'OK     P10 - El Kardex cuadra con el stock actual del producto';

/* -----------------------------------------------------------------------------
   PRUEBA 11 - Cada microservicio solo alcanza sus propios procedimientos

   La frontera entre servicios deja de ser un acuerdo dentro del codigo y pasa a
   sostenerla el motor. Se comprueba suplantando cada cuenta con EXECUTE AS: si
   ms-catalogo pudiera registrar una venta, el aislamiento seria decorativo.

   Se omite la prueba si las cuentas no existen, para que el script siga
   sirviendo contra una base creada solo con los scripts 01 a 05.
----------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_catalogo')
BEGIN
    SET @Pruebas += 1;

    DECLARE @CruceIndebido INT = 0;

    EXECUTE AS USER = 'svc_hce_catalogo';
        BEGIN TRY
            EXEC hce.usp_Venta_Registrar;
            SET @CruceIndebido += 1;   /* No deberia llegar aqui */
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() <> 229 SET @CruceIndebido += 1;  /* 229 = permiso denegado */
        END CATCH;
    REVERT;

    EXECUTE AS USER = 'svc_hce_auth';
        BEGIN TRY
            EXEC hce.usp_Producto_Eliminar @Id_producto = 1;
            SET @CruceIndebido += 1;
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() <> 229 SET @CruceIndebido += 1;
        END CATCH;
    REVERT;

    IF @CruceIndebido > 0
    BEGIN
        SET @Fallas += 1;
        PRINT 'FALLA  P11 - Un servicio alcanzo procedimientos que no le pertenecen';
    END
    ELSE
        PRINT 'OK     P11 - Cada servicio solo ejecuta sus propios procedimientos';
END
ELSE
    PRINT 'OMITE  P11 - Las cuentas por servicio no existen en esta base';

/* -----------------------------------------------------------------------------
   PRUEBA 12 - Ningun servicio tiene acceso directo a las tablas

   El acceso pasa siempre por procedimientos, y el encadenamiento de propiedad
   hace que eso baste. Si una cuenta pudiera leer una tabla por su cuenta, una
   inyeccion en ese servicio alcanzaria datos de los demas.
----------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_catalogo')
BEGIN
    SET @Pruebas += 1;

    DECLARE @PermisosDirectos INT = (
        SELECT COUNT(*)
        FROM sys.database_permissions AS perm
        INNER JOIN sys.database_principals AS prin
            ON prin.principal_id = perm.grantee_principal_id
        INNER JOIN sys.objects AS obj
            ON obj.object_id = perm.major_id
        WHERE prin.name LIKE 'svc[_]hce[_]%'
          AND obj.type IN ('U', 'V')          /* tablas y vistas */
          AND perm.state_desc = 'GRANT'
    );

    IF @PermisosDirectos > 0
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P12 - Hay ', @PermisosDirectos, ' permiso(s) directos sobre tablas o vistas');
    END
    ELSE
        PRINT 'OK     P12 - Ninguna cuenta de servicio tiene permisos sobre tablas ni vistas';
END
ELSE
    PRINT 'OMITE  P12 - Las cuentas por servicio no existen en esta base';

/* -----------------------------------------------------------------------------
   PRUEBA 13 - Ninguna cuenta de servicio pertenece a un rol con privilegios

   db_datareader o db_owner anularian de un plumazo las dos pruebas anteriores,
   y es el atajo mas facil de tomar cuando algo no funciona. Queda vigilado.
----------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_catalogo')
BEGIN
    SET @Pruebas += 1;

    DECLARE @RolesIndebidos INT = (
        SELECT COUNT(*)
        FROM sys.database_role_members AS rm
        INNER JOIN sys.database_principals AS miembro ON miembro.principal_id = rm.member_principal_id
        INNER JOIN sys.database_principals AS rol     ON rol.principal_id     = rm.role_principal_id
        WHERE miembro.name LIKE 'svc[_]hce[_]%'
          AND rol.name <> 'public'
    );

    IF @RolesIndebidos > 0
    BEGIN
        SET @Fallas += 1;
        PRINT CONCAT('FALLA  P13 - ', @RolesIndebidos, ' cuenta(s) de servicio pertenecen a roles con privilegios');
    END
    ELSE
        PRINT 'OK     P13 - Ninguna cuenta de servicio pertenece a roles privilegiados';
END
ELSE
    PRINT 'OMITE  P13 - Las cuentas por servicio no existen en esta base';

/* -----------------------------------------------------------------------------
   RESUMEN
----------------------------------------------------------------------------- */
PRINT '';
PRINT '=====================================================';
PRINT CONCAT(' PRUEBAS EJECUTADAS : ', @Pruebas);
PRINT CONCAT(' FALLAS             : ', @Fallas);
PRINT '=====================================================';

IF @Fallas > 0
    THROW 59999, N'La bateria de verificacion detecto fallas. Revise el detalle.', 1;
GO
