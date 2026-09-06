# Evaluación Teórica — Especialista de Desarrollo HCE

> Documento correspondiente al entregable 1. Responde los temas indicados en el
> correo de la convocatoria: API REST, arquitectura monolítica frente a
> microservicios, patrones BFF y DDD, y el diagrama de arquitectura con Docker,
> monitoreo e integraciones.
>
> Las decisiones que aquí se justifican son exactamente las que están
> implementadas en el repositorio; cada sección enlaza el código correspondiente.

---

## 1. API REST

### 1.1 Qué es y qué la distingue

REST es un estilo arquitectónico para sistemas distribuidos. Una API es REST
cuando respeta un conjunto de restricciones, no simplemente porque devuelva
JSON sobre HTTP:

| Restricción       | Qué significa                                                            | Cómo se aplica en esta solución                                            |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Cliente–servidor  | Separación de responsabilidades entre interfaz y almacenamiento          | El FrontEnd Next.js no conoce SQL Server; solo habla con el API Gateway    |
| Sin estado        | Cada petición lleva toda la información necesaria                        | El JWT viaja en cada petición; el servidor no guarda sesión en memoria     |
| Cacheable         | Las respuestas indican si pueden almacenarse                             | Los `GET` son idempotentes; los `POST` de compra y venta nunca se cachean  |
| Interfaz uniforme | Recursos identificados por URI, manipulados por representaciones         | `/api/v1/productos/:id`, `/api/v1/kardex/producto/:id/movimientos`         |
| Sistema en capas  | El cliente no sabe si habla con el servidor final o con un intermediario | El cliente habla con el Gateway y desconoce los tres microservicios detrás |

### 1.2 Diseño de recursos y verbos

El criterio aplicado es que **la URI nombra un sustantivo** y **el verbo HTTP
expresa la acción**:

```
GET    /api/v1/productos                        Listar productos (paginado)
GET    /api/v1/productos/:id                    Obtener un producto
POST   /api/v1/productos                        Registrar producto
PATCH  /api/v1/productos/:id                    Actualizar parcialmente
DELETE /api/v1/productos/:id                    Desactivar (baja lógica)

POST   /api/v1/compras                          Registrar compra
GET    /api/v1/compras                          Listar compras
GET    /api/v1/compras/:id                      Detalle de una compra

POST   /api/v1/ventas                           Registrar venta
GET    /api/v1/ventas                           Listar ventas

GET    /api/v1/kardex                           Existencias por producto
GET    /api/v1/kardex/producto/:id/movimientos  Movimientos del producto
```

Se usa `PATCH` y no `PUT` para actualizar productos porque la operación es
parcial: el cliente envía solo los campos que cambian. `PUT` obligaría a enviar
la representación completa, y omitir un campo significaría borrarlo.

### 1.3 Códigos de estado

Devolver siempre `200` con un campo `error` dentro del cuerpo es el error más
común al implementar REST: rompe el manejo estándar de errores de cualquier
cliente HTTP y de la infraestructura intermedia. La API usa el código como
canal primario:

| Código | Cuándo                                       | Ejemplo real de esta API                        |
| ------ | -------------------------------------------- | ----------------------------------------------- |
| 200    | Lectura correcta                             | `GET /kardex`                                   |
| 201    | Recurso creado                               | `POST /productos`                               |
| 400    | Entrada inválida                             | Cantidad negativa, campo no declarado en el DTO |
| 401    | Sin credenciales o token vencido             | JWT expirado a los 30 minutos                   |
| 403    | Autenticado pero sin permiso                 | Rol `CONSULTA` intentando vender                |
| 404    | Recurso inexistente                          | `GET /productos/9999`                           |
| 409    | Conflicto de estado                          | Producto duplicado (mismo nombre y lote)        |
| 422    | Sintaxis válida, regla de negocio incumplida | Venta que supera el stock                       |
| 429    | Exceso de peticiones                         | Más de 5 intentos de login por minuto           |
| 500    | Fallo interno                                | Error no controlado (nunca expone el detalle)   |

La distinción entre **400 y 422** es deliberada: `400` significa "el mensaje
está mal formado", `422` significa "el mensaje está bien formado pero el
sistema no puede aceptarlo". Vender 10 unidades cuando hay 5 es sintácticamente
correcto; es el estado del inventario lo que lo impide.

La traducción entre errores de dominio y códigos HTTP ocurre en un único lugar:
[`excepcion-http.filtro.ts`](../backend/libs/compartido/src/adaptadores/filtros/excepcion-http.filtro.ts).

### 1.4 Formato uniforme de respuesta

Todo listado devuelve la misma envoltura, de modo que el FrontEnd implementa la
paginación una sola vez:

```json
{
  "datos": [
    {
      "idProducto": 1,
      "nombreProducto": "Paracetamol 500 mg",
      "stockActual": 680
    }
  ],
  "meta": {
    "pagina": 1,
    "tamanoPagina": 20,
    "totalRegistros": 13,
    "totalPaginas": 1
  }
}
```

Y todo error:

```json
{
  "exito": false,
  "codigo": "STOCK_INSUFICIENTE",
  "mensaje": "Stock insuficiente para [Paracetamol 500 mg Tableta]. Solicitado: 700 / Disponible: 680.",
  "ruta": "/api/v1/ventas",
  "marcaTiempo": "2026-09-03T09:20:11.482Z"
}
```

El campo `codigo` es un identificador estable que el cliente puede evaluar
programáticamente; `mensaje` es texto para el usuario y puede cambiar sin
romper integraciones.

### 1.5 Versionado

La API se publica bajo `/api/v1`. El versionado en la ruta se eligió por encima
de las alternativas (cabecera `Accept`, parámetro de consulta) porque es visible
en logs, cacheable por proxies y trivial de enrutar. En un sistema clínico
conviven clientes que no se actualizan al mismo tiempo, y romper un contrato
sin darles ruta de migración no es una opción.

---

## 2. Arquitectura monolítica frente a microservicios

### 2.1 Comparación

| Dimensión             | Monolito                                      | Microservicios                                          |
| --------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Despliegue            | Una unidad; un cambio obliga a desplegar todo | Independiente por servicio                              |
| Escalado              | Se replica la aplicación completa             | Se escala solo el servicio saturado                     |
| Consistencia de datos | Transacciones ACID locales, sencillas         | Requiere sagas o consistencia eventual entre servicios  |
| Latencia interna      | Llamada en memoria                            | Llamada de red, con fallos parciales                    |
| Aislamiento de fallos | Un fallo puede tumbar el proceso completo     | Un servicio caído degrada solo su función               |
| Complejidad operativa | Baja                                          | Alta: descubrimiento, trazas distribuidas, orquestación |
| Equipos               | Coordinación alta sobre un mismo código       | Equipos autónomos por servicio                          |

### 2.2 El error más costoso: dónde se traza la frontera

La discusión útil no es "monolito o microservicios", sino **dónde se corta**.
Un corte mal ubicado produce lo peor de ambos mundos: la complejidad operativa
del sistema distribuido sin la autonomía que lo justifica.

El criterio correcto es cortar por **límites transaccionales y de negocio**, no
por capas técnicas ni por tablas.

### 2.3 Cómo se aplicó aquí

La solución usa **tres microservicios más un API Gateway**:

| Servicio        | Responsabilidad                         | Por qué es un límite legítimo                                                                                                    |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ms-auth`       | Identidad, credenciales, emisión de JWT | Ciclo de vida y perfil de seguridad propios; podría sustituirse por un proveedor externo (Keycloak, Entra ID) sin tocar el resto |
| `ms-catalogo`   | Alta y mantenimiento de productos       | Predominantemente lectura, alta cardinalidad, cacheable; escala distinto que el inventario                                       |
| `ms-inventario` | Compras, ventas y Kardex                | Núcleo transaccional; concentra la escritura y la contención de bloqueos                                                         |
| `api-gateway`   | Enrutamiento y seguridad perimetral     | Punto único de entrada, autenticación y rate limiting                                                                            |

**La decisión que merece justificación es no haber separado compras, ventas y
Kardex en tres servicios**, que a primera vista parecería "más microservicios".

Las tres operan sobre el mismo invariante: el stock derivado de la tabla de
movimientos. Separarlas obligaría a coordinar una transacción distribuida (saga
con compensación o 2PC) para algo que la base de datos resuelve de forma
atómica. Durante la ventana de inconsistencia eventual, dos cajas podrían
despachar el mismo medicamento. **En un sistema de salud ese riesgo no es
aceptable**, y el beneficio a cambio sería únicamente organizativo.

Regla aplicada: _un agregado de dominio no se parte entre servicios_. El
razonamiento está documentado en el propio código, en
[`inventario.entidades.ts`](../backend/apps/ms-inventario/src/dominio/entidades/inventario.entidades.ts).

### 2.4 Cuándo el monolito habría sido la respuesta correcta

Con un solo equipo, un único despliegue y sin necesidad de escalar partes por
separado, un monolito modular habría entregado el mismo valor con mucho menos
coste operativo. Los microservicios se justifican aquí porque el enunciado los
exige y porque el sistema tiene un componente (`ms-inventario`) con un perfil de
carga y de criticidad claramente distinto del resto.

---

## 3. Patrón BFF (Backend For Frontend)

### 3.1 Qué problema resuelve

Cuando varios clientes (web, móvil, tótem de autoservicio) consumen la misma
API genérica, aparecen dos patologías:

- **Sobre-obtención**: el móvil descarga campos que no muestra, gastando datos
  y batería.
- **Cascada de peticiones**: una pantalla necesita cinco llamadas encadenadas
  porque la API está modelada por entidad y no por caso de uso.

El BFF introduce una capa por tipo de cliente que agrega y adapta las respuestas
de los servicios internos a las necesidades exactas de esa interfaz.

### 3.2 Cómo se aplicó aquí

El **API Gateway cumple el rol de BFF para el FrontEnd web**. No es un proxy
transparente: adapta el modelo interno a lo que la interfaz necesita.

Dos ejemplos concretos del código:

1. **`GET /api/v1/kardex`** devuelve en una sola llamada el producto, su stock
   calculado desde movimientos y su valorización al costo. La pantalla de
   ventas necesita exactamente eso para mostrar precio y disponibilidad; sin el
   BFF tendría que llamar a catálogo y a inventario y cruzar los resultados en
   el navegador.

2. **`POST /api/v1/auth/login`** recibe el token del microservicio de
   autenticación y lo transforma en una **cookie HttpOnly** antes de responder.
   Esa adaptación es específica del cliente web: un cliente móvil querría el
   token en el cuerpo, no una cookie. Es exactamente el tipo de decisión que
   pertenece al BFF y no al servicio de dominio.

Ver [`auth.controlador.ts`](../backend/apps/api-gateway/src/adaptadores/controladores/auth.controlador.ts).

### 3.3 Su riesgo, y cómo se contuvo

El BFF degenera con facilidad en un monolito encubierto: se le van agregando
reglas de negocio hasta que los microservicios quedan reducidos a repositorios
anémicos.

Contención aplicada en este proyecto: **los controladores del Gateway no
contienen lógica de negocio**. Validan la entrada con DTOs, propagan el usuario
autenticado para la auditoría y delegan. Toda regla —cálculo de importes,
margen de 1.35, validación de stock— vive en el microservicio propietario del
dominio. Si un controlador del Gateway crece más allá de eso, es señal de fuga
arquitectónica.

---

## 4. Domain-Driven Design (DDD)

### 4.1 Conceptos aplicados

| Concepto        | Definición                                              | Implementación en este repositorio                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje ubicuo | Vocabulario común entre negocio y código                | El código está en español y usa los términos del enunciado: `CompraCab`, `MovimientoDet`, `Kardex`, `Entrada`, `Salida`                                                                                                      |
| Bounded Context | Frontera donde un término tiene un solo significado     | Tres contextos: Identidad, Catálogo, Inventario                                                                                                                                                                              |
| Entidad         | Objeto con identidad propia y ciclo de vida             | [`Producto`](../backend/apps/ms-catalogo/src/dominio/entidades/producto.entidad.ts), [`Usuario`](../backend/apps/ms-auth/src/dominio/entidades/usuario.entidad.ts)                                                           |
| Value Object    | Objeto sin identidad, comparado por valor, inmutable    | [`Importe`](../backend/libs/compartido/src/dominio/objetos-valor/importe.vo.ts)                                                                                                                                              |
| Agregado        | Grupo de objetos con una raíz que garantiza invariantes | Inventario: la raíz es el movimiento; el stock es su invariante                                                                                                                                                              |
| Repositorio     | Abstracción de persistencia orientada al dominio        | [`ProductoRepositorio`](../backend/apps/ms-catalogo/src/aplicacion/puertos/salida/producto.repositorio.ts), [`InventarioRepositorio`](../backend/apps/ms-inventario/src/aplicacion/puertos/salida/inventario.repositorio.ts) |
| Caso de uso     | Una operación completa del negocio                      | `RegistrarCompraCasoUso`, `RegistrarVentaCasoUso`                                                                                                                                                                            |

### 4.2 El agregado de Inventario

El agregado más importante del sistema es el **movimiento de inventario**, y su
invariante es: _el stock de un producto nunca puede ser negativo_.

Ese invariante se protege en tres niveles, deliberadamente redundantes:

1. **Dominio** (`ReglasDocumento`): valida la forma del documento antes de
   consumir una conexión a la base.
2. **Procedimiento almacenado** (`usp_Venta_Registrar`): valida el stock con
   bloqueo `UPDLOCK, HOLDLOCK` dentro de la transacción, lo que serializa las
   ventas concurrentes del mismo insumo y evita la sobreventa por condición de
   carrera.
3. **Trigger** (`TR_MovimientoDet_ValidarStock`): última línea de defensa,
   activa incluso ante un `INSERT` manual o un script externo.

La redundancia es intencional. En un sistema clínico el coste de una existencia
negativa —un medicamento que el sistema dice tener y no está— es mucho mayor
que el coste de validar tres veces.

### 4.3 Value Object `Importe`

`Importe` es inmutable, se compara por valor y concentra la fórmula de cálculo
del enunciado en un único lugar. Existe una segunda implementación, en T-SQL
(`hce.fn_CalcularImportes`), y ambas están cubiertas por pruebas que comparan
sus resultados: no pueden divergir sin que la suite falle.

### 4.4 Lo que este proyecto NO usa de DDD

Ser honesto sobre el alcance es parte del diseño. **No se implementaron
eventos de dominio ni Event Sourcing**. Serían el mecanismo correcto para
notificar al catálogo que el inventario cambió —y de hecho su ausencia obligó a
descartar un decorador de caché, como se explica en el apartado 5.3 del
[documento de arquitectura](02-arquitectura.md)—, pero introducir un broker de
mensajería para un sistema de este tamaño habría añadido complejidad operativa
sin retorno proporcional.

---

## 5. Diagrama de arquitectura

El diagrama completo, con Docker, monitoreo e integraciones, está en
[`02-arquitectura.md`](02-arquitectura.md), junto con la justificación de la
Clean Architecture en sistemas de salud y el detalle de los mecanismos de
seguridad.

---

## 6. Desviación deliberada: la fórmula del IGV

**Es el único punto en el que la solución no sigue el enunciado al pie de la
letra.**

La sección 1.2.2 del examen define textualmente:

```
Subtotal = Cantidad * Precio Venta
Igv      = Cantidad * Precio Venta * 1.18     <- error de redacción
Total    = Subtotal + Igv
```

Esa fórmula hace que el IGV sea el **118 % del subtotal** y el total el **218 %**.
Una venta de S/ 100 tributaría S/ 118 y se cobraría S/ 218.

Se implementó la fórmula correcta, que es el IGV peruano vigente:

```
Subtotal = Cantidad * Precio Venta
Igv      = Subtotal * 0.18
Total    = Subtotal + Igv                     (= Subtotal * 1.18)
```

### El razonamiento

Ante una contradicción entre lo que el enunciado dice y lo que el dominio exige,
caben dos posturas. Replicar el texto y anotar la observación al margen es la
más literal, y es defendible cuando el resultado es inocuo.

Aquí no lo es. Este sistema factura medicamentos: un comprobante con el IGV mal
calculado es un error tributario que se propaga a la contabilidad y al paciente.
Y es de los que no se detectan solos, porque los importes salen perfectamente
cuadrados entre sí —subtotal más IGV igual a total—, solo que con el impuesto
multiplicado por seis.

Entregar ese defecto replicado habría sido dejar a sabiendas una bomba en
producción para cumplir con la letra de un requisito cuyo espíritu es
evidentemente el contrario. Lo más probable es que el enunciado quisiera decir
`Total = Subtotal * 1.18` y el factor se deslizara una línea más arriba.

En un encargo real esto se resuelve con una pregunta al cliente. Como aquí no
había a quién preguntar, se tomó la decisión que menos daño causa si me equivoco:
un IGV correcto en un sistema que factura es defendible ante cualquiera; uno del
118 % no lo es ante nadie.

### Cómo queda trazado

La fórmula vive en un único lugar por capa —función SQL, value object del
BackEnd y módulo de cálculo del FrontEnd—, las tres están cubiertas por pruebas
que comparan sus resultados, y en cada capa hay además una prueba que falla
explícitamente si alguien vuelve al factor 1.18 sin darse cuenta.
