/* =============================================================================
   EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
   06 - Cuentas de acceso por microservicio (minimo privilegio)

   Hasta aqui los tres microservicios se conectaban con la misma cuenta
   administrativa. Funcionaba, pero anulaba en la practica la frontera entre
   servicios: cualquiera de ellos podia leer y escribir cualquier tabla, y la
   propiedad de los datos quedaba en un acuerdo de caballeros dentro del codigo.

   Este script le da a cada servicio su propia cuenta, con permiso para ejecutar
   unicamente los procedimientos que le corresponden. La frontera pasa a estar
   sostenida por el motor: si ms-catalogo intentara registrar una venta, el
   error no llega del codigo, llega de SQL Server.

   POR QUE BASTA CON CONCEDER EXECUTE
   ----------------------------------
   Ninguna cuenta recibe permisos sobre tablas ni vistas. No hacen falta: los
   procedimientos y las tablas comparten propietario (dbo), asi que el
   encadenamiento de propiedad permite que un procedimiento lea sus tablas en
   nombre de quien lo ejecuta sin que este tenga acceso propio a ellas.

   La condicion para que eso se cumpla es que no haya SQL dinamico, porque
   rompe la cadena. No lo hay en 03-stored-procedures.sql, y conviene que siga
   sin haberlo: introducir un sp_executesql aqui obligaria a conceder permisos
   sobre las tablas y este esquema dejaria de sostenerse.

   Consecuencia practica: una inyeccion o un fallo logico en un servicio no
   alcanza los datos de los demas. Es la diferencia entre una frontera escrita
   y una frontera aplicada.

   USO
   ---
   Las contrasenas llegan como variables de sqlcmd, nunca escritas en el
   archivo:

     sqlcmd -S host -U sa -P *** -C -b -i 06-seguridad-accesos.sql \
       -v ClaveAuth="..." ClaveCatalogo="..." ClaveInventario="..."

   El script es idempotente: si las cuentas existen, actualiza su contrasena y
   vuelve a aplicar los permisos.

   ORDEN OBLIGATORIO
   -----------------
   Este script debe ejecutarse DESPUES de 03-stored-procedures.sql, y hay que
   repetirlo cada vez que aquel se reejecute.

   El motivo no es evidente: 03 elimina y vuelve a crear los tipos tabla -no
   admiten CREATE OR ALTER-, y al eliminarlos SQL Server descarta tambien sus
   concesiones. El sintoma es desconcertante si no se sabe: los servicios siguen
   en pie, las lecturas funcionan, y solo fallan compra y venta con un error
   interno. Le ocurrio a este proyecto durante el desarrollo.

   run-init.sh ya respeta el orden. Si se aplican los scripts a mano, conviene
   no olvidarlo.
   ============================================================================= */

USE master;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* -----------------------------------------------------------------------------
   1. Logins de servidor
   -------------------------------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'svc_hce_auth')
    CREATE LOGIN svc_hce_auth WITH PASSWORD = '$(ClaveAuth)',
        DEFAULT_DATABASE = HCE_Insumos, CHECK_POLICY = ON;
ELSE
    ALTER LOGIN svc_hce_auth WITH PASSWORD = '$(ClaveAuth)';
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'svc_hce_catalogo')
    CREATE LOGIN svc_hce_catalogo WITH PASSWORD = '$(ClaveCatalogo)',
        DEFAULT_DATABASE = HCE_Insumos, CHECK_POLICY = ON;
ELSE
    ALTER LOGIN svc_hce_catalogo WITH PASSWORD = '$(ClaveCatalogo)';
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'svc_hce_inventario')
    CREATE LOGIN svc_hce_inventario WITH PASSWORD = '$(ClaveInventario)',
        DEFAULT_DATABASE = HCE_Insumos, CHECK_POLICY = ON;
ELSE
    ALTER LOGIN svc_hce_inventario WITH PASSWORD = '$(ClaveInventario)';
GO

USE HCE_Insumos;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* -----------------------------------------------------------------------------
   2. Usuarios de base de datos

   Sin pertenencia a ningun rol: db_datareader o db_datawriter darian acceso a
   todas las tablas y vaciarian de sentido el resto del script.
   -------------------------------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_auth')
    CREATE USER svc_hce_auth FOR LOGIN svc_hce_auth;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_catalogo')
    CREATE USER svc_hce_catalogo FOR LOGIN svc_hce_catalogo;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_hce_inventario')
    CREATE USER svc_hce_inventario FOR LOGIN svc_hce_inventario;
GO

/* -----------------------------------------------------------------------------
   3. ms-auth

   Un solo procedimiento. Es el servicio con la superficie mas pequena del
   sistema y tambien el que custodia las credenciales, asi que conviene que siga
   asi: no puede leer productos, ni compras, ni ventas.
   -------------------------------------------------------------------------- */

GRANT EXECUTE ON OBJECT::hce.usp_Usuario_ObtenerPorUsername TO svc_hce_auth;
GO

/* -----------------------------------------------------------------------------
   4. ms-catalogo

   Duena de Productos. Lee el stock a traves de sus propios procedimientos, que
   consultan la vista de movimientos; no necesita -ni recibe- permiso directo
   sobre las tablas de inventario.
   -------------------------------------------------------------------------- */

GRANT EXECUTE ON OBJECT::hce.usp_Producto_Registrar  TO svc_hce_catalogo;
GRANT EXECUTE ON OBJECT::hce.usp_Producto_Actualizar TO svc_hce_catalogo;
GRANT EXECUTE ON OBJECT::hce.usp_Producto_Listar     TO svc_hce_catalogo;
GRANT EXECUTE ON OBJECT::hce.usp_Producto_Obtener    TO svc_hce_catalogo;
GRANT EXECUTE ON OBJECT::hce.usp_Producto_Eliminar   TO svc_hce_catalogo;
GO

/* -----------------------------------------------------------------------------
   5. ms-inventario

   Compras, ventas y kardex. Los tipos de tabla necesitan concesion aparte: sin
   EXECUTE sobre el TYPE, el servicio no puede construir el parametro con el
   detalle del documento y la llamada falla antes de entrar al procedimiento.
   -------------------------------------------------------------------------- */

GRANT EXECUTE ON OBJECT::hce.usp_Compra_Registrar             TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Compra_Listar                TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Compra_Obtener               TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Venta_Registrar              TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Venta_Listar                 TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Venta_Obtener                TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Kardex_Listar                TO svc_hce_inventario;
GRANT EXECUTE ON OBJECT::hce.usp_Kardex_MovimientosPorProducto TO svc_hce_inventario;
GO

GRANT EXECUTE ON TYPE::hce.TipoDetalleCompra TO svc_hce_inventario;
GRANT EXECUTE ON TYPE::hce.TipoDetalleVenta  TO svc_hce_inventario;
GO

/* -----------------------------------------------------------------------------
   6. El unico contrato que cruza la frontera entre servicios

   Registrar una compra actualiza el costo del producto, y Productos pertenece a
   ms-catalogo. Esa escritura pasa por usp_Producto_ActualizarCostoPorCompra.

   Sobre esta concesion hay que ser preciso: NO es lo que autoriza la operacion.
   Se verifico revocandola, y la compra siguio funcionando, porque el
   encadenamiento de propiedad tambien alcanza a las llamadas entre
   procedimientos del mismo propietario.

   Se mantiene por dos razones. Documenta, en la lista de permisos, el unico
   acoplamiento del esquema que cruza la frontera entre servicios. Y pasaria a
   ser necesaria si ese procedimiento se moviera a un esquema o a un propietario
   distinto, que es justo el camino hacia separar las bases.
----------------------------------------------------------------------------- */

GRANT EXECUTE ON OBJECT::hce.usp_Producto_ActualizarCostoPorCompra TO svc_hce_inventario;
GRANT EXECUTE ON TYPE::hce.TipoCostoProducto TO svc_hce_inventario;
GO

/* -----------------------------------------------------------------------------
   7. Comprobacion

   Lista lo que ha quedado concedido. Sirve para revisar de un vistazo que
   ningun servicio tiene mas permisos de los que le tocan: si esta consulta
   devuelve una fila inesperada, el minimo privilegio se rompio.
   -------------------------------------------------------------------------- */

SELECT
    Servicio      = dp.name,
    Permiso       = p.permission_name,
    Objeto        = CASE p.class
                        WHEN 1 THEN QUOTENAME(SCHEMA_NAME(o.schema_id)) + '.' + QUOTENAME(o.name)
                        WHEN 6 THEN QUOTENAME(SCHEMA_NAME(t.schema_id)) + '.' + QUOTENAME(t.name)
                    END,
    Tipo          = CASE p.class WHEN 1 THEN 'Procedimiento' WHEN 6 THEN 'Tipo tabla' END
FROM sys.database_permissions AS p
INNER JOIN sys.database_principals AS dp ON dp.principal_id = p.grantee_principal_id
LEFT JOIN sys.objects AS o ON p.class = 1 AND o.object_id = p.major_id
LEFT JOIN sys.types   AS t ON p.class = 6 AND t.user_type_id = p.major_id
WHERE dp.name LIKE 'svc[_]hce[_]%'
ORDER BY dp.name, Tipo, Objeto;
GO

PRINT 'Cuentas por microservicio creadas. Ninguna tiene permiso sobre tablas ni vistas.';
GO
