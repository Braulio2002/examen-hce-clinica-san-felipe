/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   Archivo : 01-schema.sql
   Motor   : Microsoft SQL Server 2019+
   Objetivo: Creacion de la base de datos, esquema y modelo relacional para el
             control de medicamentos / insumos medicos en atenciones clinicas.

   Orden de ejecucion de los scripts:
     01-schema.sql              <- este archivo
     02-triggers-auditoria.sql
     03-stored-procedures.sql
     04-consultas-tsql.sql      (consultas de demostracion)
     05-seed.sql
============================================================================= */

/* -----------------------------------------------------------------------------
   1. BASE DE DATOS
----------------------------------------------------------------------------- */
IF DB_ID(N'HCE_Insumos') IS NULL
BEGIN
    PRINT '>> Creando base de datos HCE_Insumos...';
    EXEC (N'CREATE DATABASE HCE_Insumos COLLATE Modern_Spanish_CI_AS;');
END
ELSE
    PRINT '>> La base de datos HCE_Insumos ya existe. Se reutiliza.';
GO

USE HCE_Insumos;
GO

/* Opciones de sesion requeridas por los indices filtrados, las vistas
   indexadas y los operadores FOR JSON. sqlcmd las trae desactivadas. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

/* READ_COMMITTED_SNAPSHOT reduce el bloqueo lector/escritor. En un sistema de
   salud las consultas de Kardex conviven con registros de venta concurrentes;
   sin RCSI las lecturas quedarian bloqueadas por las transacciones de escritura. */
IF (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = N'HCE_Insumos') = 0
BEGIN
    ALTER DATABASE HCE_Insumos SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
END
GO

/* -----------------------------------------------------------------------------
   2. ESQUEMA
----------------------------------------------------------------------------- */
IF SCHEMA_ID(N'hce') IS NULL
    EXEC (N'CREATE SCHEMA hce AUTHORIZATION dbo;');
GO

/* -----------------------------------------------------------------------------
   3. LIMPIEZA IDEMPOTENTE (permite re-ejecutar el script completo)
      El orden respeta las dependencias de claves foraneas.
----------------------------------------------------------------------------- */
DROP TABLE IF EXISTS hce.MovimientoDet;
DROP TABLE IF EXISTS hce.MovimientoCab;
DROP TABLE IF EXISTS hce.VentaDet;
DROP TABLE IF EXISTS hce.VentaCab;
DROP TABLE IF EXISTS hce.CompraDet;
DROP TABLE IF EXISTS hce.CompraCab;
DROP TABLE IF EXISTS hce.Productos;
DROP TABLE IF EXISTS hce.TipoMovimiento;
DROP TABLE IF EXISTS hce.Auditoria;
DROP TABLE IF EXISTS hce.Usuarios;
GO

/* -----------------------------------------------------------------------------
   4. TABLAS MAESTRAS
----------------------------------------------------------------------------- */

/* 4.1 Usuarios ---------------------------------------------------------------
   Soporta la autenticacion JWT del BackEnd. La contrasena NUNCA se almacena en
   claro: se guarda el hash bcrypt generado por el microservicio de autenticacion. */
CREATE TABLE hce.Usuarios
(
    Id_Usuario      INT             IDENTITY(1,1)   NOT NULL,
    Username        NVARCHAR(50)                    NOT NULL,
    PasswordHash    NVARCHAR(255)                   NOT NULL,
    NombreCompleto  NVARCHAR(150)                   NOT NULL,
    Rol             NVARCHAR(30)                    NOT NULL,
    Activo          BIT                             NOT NULL
        CONSTRAINT DF_Usuarios_Activo       DEFAULT (1),
    Fec_registro    DATETIME2(0)                    NOT NULL
        CONSTRAINT DF_Usuarios_FecRegistro  DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_Usuarios              PRIMARY KEY CLUSTERED (Id_Usuario),
    CONSTRAINT UQ_Usuarios_Username     UNIQUE (Username),
    CONSTRAINT CK_Usuarios_Rol          CHECK (Rol IN (N'ADMIN', N'FARMACIA', N'CONSULTA'))
);
GO

/* 4.2 TipoMovimiento ---------------------------------------------------------
   Catalogo exigido por el enunciado: (1) Entrada, (2) Salida.
   Se modela como tabla y no como constante magica para respetar la integridad
   referencial y permitir nuevos tipos (ajuste de inventario, merma, devolucion)
   sin cambios de esquema. */
CREATE TABLE hce.TipoMovimiento
(
    Id_TipoMovimiento   INT             NOT NULL,
    Descripcion         NVARCHAR(30)    NOT NULL,
    Signo               SMALLINT        NOT NULL,  -- +1 suma stock, -1 resta stock

    CONSTRAINT PK_TipoMovimiento        PRIMARY KEY CLUSTERED (Id_TipoMovimiento),
    CONSTRAINT UQ_TipoMovimiento_Desc   UNIQUE (Descripcion),
    CONSTRAINT CK_TipoMovimiento_Signo  CHECK (Signo IN (-1, 1))
);
GO

INSERT INTO hce.TipoMovimiento (Id_TipoMovimiento, Descripcion, Signo)
VALUES (1, N'Entrada', 1),
       (2, N'Salida', -1);
GO

/* 4.3 Productos --------------------------------------------------------------
   Medicamentos e insumos medicos. Se aplica borrado logico (columna Activo):
   en un entorno clinico un producto referenciado por movimientos historicos
   nunca debe desaparecer fisicamente, por trazabilidad y auditoria sanitaria. */
CREATE TABLE hce.Productos
(
    Id_producto     INT             IDENTITY(1,1)   NOT NULL,
    Nombre_producto NVARCHAR(150)                   NOT NULL,
    NroLote         NVARCHAR(50)                    NOT NULL,
    Fec_registro    DATETIME2(0)                    NOT NULL
        CONSTRAINT DF_Productos_FecRegistro DEFAULT (SYSDATETIME()),
    Costo           DECIMAL(18,4)                   NOT NULL
        CONSTRAINT DF_Productos_Costo       DEFAULT (0),
    PrecioVenta     DECIMAL(18,4)                   NOT NULL
        CONSTRAINT DF_Productos_PrecioVenta DEFAULT (0),
    Activo          BIT                             NOT NULL
        CONSTRAINT DF_Productos_Activo      DEFAULT (1),

    CONSTRAINT PK_Productos                 PRIMARY KEY CLUSTERED (Id_producto),
    CONSTRAINT UQ_Productos_Nombre_Lote     UNIQUE (Nombre_producto, NroLote),
    CONSTRAINT CK_Productos_Costo           CHECK (Costo       >= 0),
    CONSTRAINT CK_Productos_PrecioVenta     CHECK (PrecioVenta >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_Productos_Nombre
    ON hce.Productos (Nombre_producto)
    INCLUDE (NroLote, Costo, PrecioVenta)
    WHERE Activo = 1;
GO

/* -----------------------------------------------------------------------------
   5. COMPRAS (ingreso de insumos al almacen clinico)
----------------------------------------------------------------------------- */
CREATE TABLE hce.CompraCab
(
    Id_CompraCab    INT             IDENTITY(1,1)   NOT NULL,
    FecRegistro     DATETIME2(0)                    NOT NULL
        CONSTRAINT DF_CompraCab_FecRegistro DEFAULT (SYSDATETIME()),
    SubTotal        DECIMAL(18,4)                   NOT NULL,
    Igv             DECIMAL(18,4)                   NOT NULL,
    Total           DECIMAL(18,4)                   NOT NULL,

    CONSTRAINT PK_CompraCab             PRIMARY KEY CLUSTERED (Id_CompraCab),
    CONSTRAINT CK_CompraCab_Importes    CHECK (SubTotal >= 0 AND Igv >= 0 AND Total >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_CompraCab_FecRegistro
    ON hce.CompraCab (FecRegistro DESC);
GO

CREATE TABLE hce.CompraDet
(
    Id_CompraDet    INT             IDENTITY(1,1)   NOT NULL,
    Id_CompraCab    INT                             NOT NULL,
    Id_producto     INT                             NOT NULL,
    Cantidad        DECIMAL(18,4)                   NOT NULL,
    Precio          DECIMAL(18,4)                   NOT NULL,
    Sub_Total       DECIMAL(18,4)                   NOT NULL,
    Igv             DECIMAL(18,4)                   NOT NULL,
    Total           DECIMAL(18,4)                   NOT NULL,

    CONSTRAINT PK_CompraDet             PRIMARY KEY CLUSTERED (Id_CompraDet),
    CONSTRAINT FK_CompraDet_CompraCab   FOREIGN KEY (Id_CompraCab)
        REFERENCES hce.CompraCab (Id_CompraCab) ON DELETE CASCADE,
    CONSTRAINT FK_CompraDet_Productos   FOREIGN KEY (Id_producto)
        REFERENCES hce.Productos (Id_producto),
    CONSTRAINT CK_CompraDet_Cantidad    CHECK (Cantidad > 0),
    CONSTRAINT CK_CompraDet_Precio      CHECK (Precio  >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_CompraDet_CompraCab ON hce.CompraDet (Id_CompraCab);
CREATE NONCLUSTERED INDEX IX_CompraDet_Producto  ON hce.CompraDet (Id_producto);
GO

/* -----------------------------------------------------------------------------
   6. VENTAS (despacho de insumos en la atencion medica)
----------------------------------------------------------------------------- */
CREATE TABLE hce.VentaCab
(
    Id_VentaCab     INT             IDENTITY(1,1)   NOT NULL,
    fecRegistro     DATETIME2(0)                    NOT NULL
        CONSTRAINT DF_VentaCab_fecRegistro DEFAULT (SYSDATETIME()),
    SubTotal        DECIMAL(18,4)                   NOT NULL,
    Igv             DECIMAL(18,4)                   NOT NULL,
    Total           DECIMAL(18,4)                   NOT NULL,

    CONSTRAINT PK_VentaCab              PRIMARY KEY CLUSTERED (Id_VentaCab),
    CONSTRAINT CK_VentaCab_Importes     CHECK (SubTotal >= 0 AND Igv >= 0 AND Total >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_VentaCab_fecRegistro
    ON hce.VentaCab (fecRegistro DESC);
GO

CREATE TABLE hce.VentaDet
(
    Id_VentaDet     INT             IDENTITY(1,1)   NOT NULL,
    Id_VentaCab     INT                             NOT NULL,
    Id_producto     INT                             NOT NULL,
    Cantidad        DECIMAL(18,4)                   NOT NULL,
    Precio          DECIMAL(18,4)                   NOT NULL,
    Sub_Total       DECIMAL(18,4)                   NOT NULL,
    Igv             DECIMAL(18,4)                   NOT NULL,
    Total           DECIMAL(18,4)                   NOT NULL,

    CONSTRAINT PK_VentaDet              PRIMARY KEY CLUSTERED (Id_VentaDet),
    CONSTRAINT FK_VentaDet_VentaCab     FOREIGN KEY (Id_VentaCab)
        REFERENCES hce.VentaCab (Id_VentaCab) ON DELETE CASCADE,
    CONSTRAINT FK_VentaDet_Productos    FOREIGN KEY (Id_producto)
        REFERENCES hce.Productos (Id_producto),
    CONSTRAINT CK_VentaDet_Cantidad     CHECK (Cantidad > 0),
    CONSTRAINT CK_VentaDet_Precio       CHECK (Precio  >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_VentaDet_VentaCab ON hce.VentaDet (Id_VentaCab);
CREATE NONCLUSTERED INDEX IX_VentaDet_Producto ON hce.VentaDet (Id_producto);
GO

/* -----------------------------------------------------------------------------
   7. MOVIMIENTOS (Kardex: unica fuente de verdad del stock)
   El stock NO se almacena como columna en Productos. Se deriva siempre de
   MovimientoDet, de modo que la existencia fisica de cada insumo es auditable
   movimiento a movimiento, requisito habitual en trazabilidad farmaceutica.
----------------------------------------------------------------------------- */
CREATE TABLE hce.MovimientoCab
(
    Id_MovimientoCab    INT             IDENTITY(1,1)   NOT NULL,
    Fec_registro        DATETIME2(0)                    NOT NULL
        CONSTRAINT DF_MovimientoCab_FecRegistro DEFAULT (SYSDATETIME()),
    Id_TipoMovimiento   INT                             NOT NULL,  -- (1) Entrada, (2) Salida
    Id_DocumentoOrigen  INT                             NOT NULL,  -- Id_CompraCab / Id_VentaCab

    CONSTRAINT PK_MovimientoCab                 PRIMARY KEY CLUSTERED (Id_MovimientoCab),
    CONSTRAINT FK_MovimientoCab_TipoMovimiento  FOREIGN KEY (Id_TipoMovimiento)
        REFERENCES hce.TipoMovimiento (Id_TipoMovimiento),
    /* Un mismo documento origen no puede generar dos veces el mismo movimiento:
       evita duplicar stock ante reintentos del cliente o mensajes repetidos. */
    CONSTRAINT UQ_MovimientoCab_Documento       UNIQUE (Id_TipoMovimiento, Id_DocumentoOrigen)
);
GO

CREATE NONCLUSTERED INDEX IX_MovimientoCab_Fecha
    ON hce.MovimientoCab (Fec_registro DESC)
    INCLUDE (Id_TipoMovimiento, Id_DocumentoOrigen);
GO

CREATE TABLE hce.MovimientoDet
(
    Id_MovimientoDet    INT             IDENTITY(1,1)   NOT NULL,
    Id_movimientocab    INT                             NOT NULL,
    Id_Producto         INT                             NOT NULL,
    Cantidad            DECIMAL(18,4)                   NOT NULL,

    CONSTRAINT PK_MovimientoDet                 PRIMARY KEY CLUSTERED (Id_MovimientoDet),
    CONSTRAINT FK_MovimientoDet_MovimientoCab   FOREIGN KEY (Id_movimientocab)
        REFERENCES hce.MovimientoCab (Id_MovimientoCab) ON DELETE CASCADE,
    CONSTRAINT FK_MovimientoDet_Productos       FOREIGN KEY (Id_Producto)
        REFERENCES hce.Productos (Id_producto),
    CONSTRAINT CK_MovimientoDet_Cantidad        CHECK (Cantidad > 0)
);
GO

/* Indice clave para el calculo de stock y el Kardex por producto. */
CREATE NONCLUSTERED INDEX IX_MovimientoDet_Producto
    ON hce.MovimientoDet (Id_Producto)
    INCLUDE (Id_movimientocab, Cantidad);
GO

/* -----------------------------------------------------------------------------
   8. AUDITORIA
   Bitacora escrita por los triggers DML. Guarda el estado anterior y posterior
   en JSON, el usuario de base de datos y el usuario de aplicacion propagado por
   el BackEnd mediante SESSION_CONTEXT.
----------------------------------------------------------------------------- */
CREATE TABLE hce.Auditoria
(
    Id_Auditoria    BIGINT          IDENTITY(1,1)   NOT NULL,
    Tabla           SYSNAME                         NOT NULL,
    Operacion       VARCHAR(10)                     NOT NULL,
    ClavePrimaria   NVARCHAR(100)                   NULL,
    ValorAnterior   NVARCHAR(MAX)                   NULL,
    ValorNuevo      NVARCHAR(MAX)                   NULL,
    UsuarioBD       SYSNAME                         NOT NULL
        CONSTRAINT DF_Auditoria_UsuarioBD   DEFAULT (SUSER_SNAME()),
    UsuarioApp      NVARCHAR(100)                   NULL,
    Host            NVARCHAR(128)                   NULL
        CONSTRAINT DF_Auditoria_Host        DEFAULT (HOST_NAME()),
    FechaEvento     DATETIME2(3)                    NOT NULL
        CONSTRAINT DF_Auditoria_FechaEvento DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_Auditoria             PRIMARY KEY CLUSTERED (Id_Auditoria),
    CONSTRAINT CK_Auditoria_Operacion   CHECK (Operacion IN ('INSERT', 'UPDATE', 'DELETE'))
);
GO

CREATE NONCLUSTERED INDEX IX_Auditoria_Tabla_Fecha
    ON hce.Auditoria (Tabla, FechaEvento DESC);
GO

/* -----------------------------------------------------------------------------
   9. VISTAS DE APOYO
----------------------------------------------------------------------------- */

/* 9.1 Stock actual por producto, derivado exclusivamente de los movimientos. */
CREATE OR ALTER VIEW hce.vw_StockActual
AS
SELECT
    p.Id_producto,
    p.Nombre_producto,
    p.NroLote,
    p.Costo,
    p.PrecioVenta,
    /* El ISNULL va DENTRO del SUM: los productos sin movimientos entran por el
       LEFT JOIN con NULL y, sin esto, SQL Server emite la advertencia
       "Null value is eliminated by an aggregate or other SET operation". */
    Stock_actual = SUM(ISNULL(md.Cantidad * tm.Signo, 0))
FROM hce.Productos AS p
LEFT JOIN hce.MovimientoDet  AS md ON md.Id_Producto      = p.Id_producto
LEFT JOIN hce.MovimientoCab  AS mc ON mc.Id_MovimientoCab = md.Id_movimientocab
LEFT JOIN hce.TipoMovimiento AS tm ON tm.Id_TipoMovimiento = mc.Id_TipoMovimiento
WHERE p.Activo = 1
GROUP BY p.Id_producto, p.Nombre_producto, p.NroLote, p.Costo, p.PrecioVenta;
GO

/* 9.2 Kardex detallado: un renglon por movimiento de producto. */
CREATE OR ALTER VIEW hce.vw_KardexDetalle
AS
SELECT
    md.Id_MovimientoDet,
    mc.Id_MovimientoCab,
    Fecha_registro     = mc.Fec_registro,
    mc.Id_TipoMovimiento,
    Tipo_movimiento    = tm.Descripcion,
    mc.Id_DocumentoOrigen,
    p.Id_producto,
    p.Nombre_producto,
    md.Cantidad,
    Cantidad_con_signo = md.Cantidad * tm.Signo
FROM hce.MovimientoDet  AS md
INNER JOIN hce.MovimientoCab  AS mc ON mc.Id_MovimientoCab  = md.Id_movimientocab
INNER JOIN hce.TipoMovimiento AS tm ON tm.Id_TipoMovimiento = mc.Id_TipoMovimiento
INNER JOIN hce.Productos      AS p  ON p.Id_producto        = md.Id_Producto;
GO

PRINT '>> 01-schema.sql ejecutado correctamente.';
GO
