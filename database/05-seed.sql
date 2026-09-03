/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 05-seed.sql
   Motor   : Microsoft SQL Server 2019+
   Objetivo: Datos iniciales para levantar el ecosistema con informacion util:
             usuarios de acceso, catalogo de insumos medicos, dos compras y una
             venta que dejan el Kardex con movimientos reales.

   Las compras y la venta se cargan invocando los procedimientos almacenados,
   no con INSERT sueltos. Asi el seed valida de paso que toda la logica
   transaccional (costo -> precio -> movimiento -> stock) funciona.

   Credenciales de demostracion (hash bcrypt, cost 10):
     admin    / Admin123$      -> rol ADMIN
     farmacia / Farmacia123$   -> rol FARMACIA
     consulta / Consulta123$   -> rol CONSULTA (solo lectura)
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
   1. USUARIOS
----------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM hce.Usuarios)
BEGIN
    INSERT INTO hce.Usuarios (Username, PasswordHash, NombreCompleto, Rol, Activo, Fec_registro)
    VALUES
    (N'admin',
     N'$2b$10$WIATrn0clna/uYN1fE/Rt.cBE7jq70oQWBFFBrlz59LUCllxUVNOO',
     N'Administrador del Sistema', N'ADMIN', 1, SYSDATETIME()),

    (N'farmacia',
     N'$2b$10$PUCQPsbk8FY/EaGDJKNRd.pd0IWBBVW5CgQA1X5d.hM61C8PYdI4e',
     N'Quimico Farmaceutico de Turno', N'FARMACIA', 1, SYSDATETIME()),

    (N'consulta',
     N'$2b$10$rdUX/TEiCj54zC8TbCFw8.ceaKhvG2nZGj32dg5nG3NY4aB0rW58y',
     N'Personal de Consulta', N'CONSULTA', 1, SYSDATETIME());

    PRINT '>> Usuarios de demostracion creados.';
END
ELSE
    PRINT '>> Usuarios ya existentes, se omite la carga.';
GO

/* -----------------------------------------------------------------------------
   2. CATALOGO DE MEDICAMENTOS E INSUMOS
   El costo y el precio de venta iniciales se dejan en cero a proposito: la
   primera compra es la que fija el costo real y deriva el precio (Costo * 1.35).
----------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM hce.Productos)
BEGIN
    INSERT INTO hce.Productos (Nombre_producto, NroLote, Fec_registro, Costo, PrecioVenta, Activo)
    VALUES
    (N'Paracetamol 500 mg Tableta',          N'LT-2026-0001', SYSDATETIME(), 0, 0, 1),
    (N'Ibuprofeno 400 mg Tableta',           N'LT-2026-0002', SYSDATETIME(), 0, 0, 1),
    (N'Amoxicilina 500 mg Capsula',          N'LT-2026-0003', SYSDATETIME(), 0, 0, 1),
    (N'Cloruro de Sodio 0.9% 1000 mL',       N'LT-2026-0004', SYSDATETIME(), 0, 0, 1),
    (N'Dextrosa 5% 500 mL',                  N'LT-2026-0005', SYSDATETIME(), 0, 0, 1),
    (N'Jeringa Descartable 5 mL',            N'LT-2026-0006', SYSDATETIME(), 0, 0, 1),
    (N'Guantes de Nitrilo Talla M (caja)',   N'LT-2026-0007', SYSDATETIME(), 0, 0, 1),
    (N'Mascarilla Quirurgica Tricapa (caja)',N'LT-2026-0008', SYSDATETIME(), 0, 0, 1),
    (N'Gasa Esteril 10x10 cm (paquete)',     N'LT-2026-0009', SYSDATETIME(), 0, 0, 1),
    (N'Alcohol Medicinal 70% 1 L',           N'LT-2026-0010', SYSDATETIME(), 0, 0, 1),
    (N'Omeprazol 20 mg Capsula',             N'LT-2026-0011', SYSDATETIME(), 0, 0, 1),
    (N'Metamizol 1 g Ampolla',               N'LT-2026-0012', SYSDATETIME(), 0, 0, 1);

    PRINT '>> Catalogo de insumos medicos creado.';
END
ELSE
    PRINT '>> Productos ya existentes, se omite la carga.';
GO

/* -----------------------------------------------------------------------------
   3. COMPRA INICIAL - abastecimiento de almacen
   Fija el costo de cada insumo, deriva el precio de venta y genera el
   movimiento de Entrada.
----------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM hce.CompraCab)
BEGIN
    DECLARE @Compra1 hce.TipoDetalleCompra;

    INSERT INTO @Compra1 (Id_producto, Cantidad, Precio)
    SELECT p.Id_producto, v.Cantidad, v.Precio
    FROM hce.Productos AS p
    INNER JOIN (VALUES
        (N'LT-2026-0001', CAST(500 AS DECIMAL(18,4)), CAST(0.4500 AS DECIMAL(18,4))),
        (N'LT-2026-0002', 400,  0.6200),
        (N'LT-2026-0003', 300,  1.1500),
        (N'LT-2026-0004', 150,  4.8000),
        (N'LT-2026-0005', 120,  5.3000),
        (N'LT-2026-0006', 800,  0.3500),
        (N'LT-2026-0007',  40, 28.9000),
        (N'LT-2026-0008',  60, 15.5000)
    ) AS v (NroLote, Cantidad, Precio) ON v.NroLote = p.NroLote;

    DECLARE @IdCompra1 INT;
    EXEC hce.usp_Compra_Registrar
         @Detalle      = @Compra1,
         @UsuarioApp   = N'seed',
         @Id_CompraCab = @IdCompra1 OUTPUT;

    PRINT '>> Compra inicial registrada.';

    /* Segunda compra: reposicion parcial, cambia el costo de dos insumos. */
    DECLARE @Compra2 hce.TipoDetalleCompra;

    INSERT INTO @Compra2 (Id_producto, Cantidad, Precio)
    SELECT p.Id_producto, v.Cantidad, v.Precio
    FROM hce.Productos AS p
    INNER JOIN (VALUES
        (N'LT-2026-0009', CAST(200 AS DECIMAL(18,4)), CAST(1.9500 AS DECIMAL(18,4))),
        (N'LT-2026-0010',  90,  9.4000),
        (N'LT-2026-0011', 250,  0.8800),
        (N'LT-2026-0012', 180,  2.7500),
        (N'LT-2026-0001', 200,  0.4900)   -- reposicion: sube el costo del paracetamol
    ) AS v (NroLote, Cantidad, Precio) ON v.NroLote = p.NroLote;

    DECLARE @IdCompra2 INT;
    EXEC hce.usp_Compra_Registrar
         @Detalle      = @Compra2,
         @UsuarioApp   = N'seed',
         @Id_CompraCab = @IdCompra2 OUTPUT;

    PRINT '>> Compra de reposicion registrada.';
END
ELSE
    PRINT '>> Compras ya existentes, se omite la carga.';
GO

/* -----------------------------------------------------------------------------
   4. VENTA DE DEMOSTRACION - despacho de una atencion medica
   Genera el movimiento de Salida y deja el Kardex con entradas y salidas.
----------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM hce.VentaCab)
BEGIN
    DECLARE @Venta1 hce.TipoDetalleVenta;

    INSERT INTO @Venta1 (Id_producto, Cantidad)
    SELECT p.Id_producto, v.Cantidad
    FROM hce.Productos AS p
    INNER JOIN (VALUES
        (N'LT-2026-0001', CAST(20 AS DECIMAL(18,4))),
        (N'LT-2026-0006', 15),
        (N'LT-2026-0009', 10)
    ) AS v (NroLote, Cantidad) ON v.NroLote = p.NroLote;

    DECLARE @IdVenta1 INT;
    EXEC hce.usp_Venta_Registrar
         @Detalle     = @Venta1,
         @UsuarioApp  = N'seed',
         @Id_VentaCab = @IdVenta1 OUTPUT;

    PRINT '>> Venta de demostracion registrada.';
END
ELSE
    PRINT '>> Ventas ya existentes, se omite la carga.';
GO

/* -----------------------------------------------------------------------------
   5. RESUMEN DE VERIFICACION
----------------------------------------------------------------------------- */
PRINT '';
PRINT '=========== RESUMEN DE CARGA ===========';
SELECT Entidad = 'Usuarios',      Registros = COUNT(*) FROM hce.Usuarios
UNION ALL SELECT 'Productos',     COUNT(*) FROM hce.Productos
UNION ALL SELECT 'CompraCab',     COUNT(*) FROM hce.CompraCab
UNION ALL SELECT 'CompraDet',     COUNT(*) FROM hce.CompraDet
UNION ALL SELECT 'VentaCab',      COUNT(*) FROM hce.VentaCab
UNION ALL SELECT 'VentaDet',      COUNT(*) FROM hce.VentaDet
UNION ALL SELECT 'MovimientoCab', COUNT(*) FROM hce.MovimientoCab
UNION ALL SELECT 'MovimientoDet', COUNT(*) FROM hce.MovimientoDet
UNION ALL SELECT 'Auditoria',     COUNT(*) FROM hce.Auditoria;

SELECT Id_producto, Nombre_producto, Stock_actual, Costo, PrecioVenta
FROM hce.vw_StockActual
ORDER BY Nombre_producto;

PRINT '>> 05-seed.sql ejecutado correctamente.';
GO
