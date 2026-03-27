# Chronos v2 Desarrollado por Xavier Grima Salinas · xgsdev.com

Aplicación de cronómetros con persistencia. Permite crear varios cronómetros, ponerles nombre, arrancarlos, pausarlos, resetearlos y archivarlos. Los datos se guardan en base de datos, así que permite al usuario mantener la persistencia de sus cronómetros (como desplegaremos en la raspy, la db estará dentro del volumen definido en el docker-compose.yml).

---

## Cómo está estructurado?

El navegador habla con Nginx. Nginx sirve la aplicación Angular cuando se le pide cualquier ruta normal, y redirige al backend de Node.js cuando la petición va a '/api/'. El backend consulta PostgreSQL y devuelve los datos. Todo corre en Docker, y Traefik (ya en la Raspberry) se encarga de recibir el tráfico externo de 'chronos-v2.xgsdev.com' y mandarlo a Nginx.

---

## Ficheros

### db/init.sql

SQL que PostgreSQL ejecuta la primera vez que arranca el contenedor, cuando el volumen todavía está vacío. Si ya hay datos, no crea nada (if not exists).

Crea dos tablas:
1.- La tabla 'users' guarda los usuarios. La contraseña nunca se guarda tal cual, sino el resultado de pasarla por bcrypt (función de hash unidireccional). Cuando alguien hace login, bcrypt compara lo que escribe con el hash almacenado sin necesidad de revertir nada.

2.- La tabla 'timers' guarda los cronómetros. Cada uno pertenece a un usuario mediante 'user_id', con 'ON DELETE CASCADE', lo que significa que si se borra el usuario sus cronómetros desaparecen también. El campo 'started_at' guarda un timestamp en milisegundos desde el 1 de enero de 1970 en UTC, que es lo que devuelve 'Date.now()' en JavaScript. El campo 'accumulated_ms' acumula el tiempo de sesiones anteriores cada vez que se pausa. El campo 'archived' es el borrado suave: en vez de eliminar el registro, se marca como 'true' y pasa al histórico.

---

### backend/package.json

Define el proyecto Node.js y las librerías que necesita.

Se usa **express** porque es el framework más extendido para construir APIs en Node.js.

**pg** es el driver que permite a Node.js conectarse y hablar con PostgreSQL. Sin él, el backend no sabe ejecutar queries.

Se usa **bcrypt** para hashear contraseñas: más seguro que sha o md5 por ser más lento y costoso.

Se usa **jsonwebtoken** para implementar JWT. Cuando el usuario hace login, se genera un token firmado con una clave secreta. El frontend lo guarda y lo adjunta en cada petición. El backend verifica la firma y sabe que es auténtico sin tener que consultar la base de datos cada vez.

Se usa **dotenv** para leer el fichero '.env', en el que se guardarán los datos sensibles como la contraseña de la base de datos o la clave secreta de JWT. El código va al repositorio, el '.env' no (todo: añadir al .gitignore).

**cors** evita que el navegador no bloquee las peticiones cuando, en desarrollo, el frontend corre en un puerto y el backend en otro. En producción no hace falta porque Nginx los sirve desde el mismo dominio, pero se deja para arrancar el backend en local.

Se usa **nodemon** solo en desarrollo. Actualiza los ficheros al reiniciar el servidor automáticamente en guardar cambios. En el contenedor de producción no se instala.

---

### backend/src/db/pool.js

Crea y exporta el pool de conexiones a PostgreSQL. Mantiene conexiones ya abiertas y las reutiliza entre peticiones, en vez de abrir y cerrar una conexión por cada query, que sería mucho más lento.

La librería 'pg' lee automáticamente las variables de entorno estándar de PostgreSQL: 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER' y 'PGPASSWORD' y así no hay ninguna configuración hardcodeada. Estas variables se definen en el 'docker-compose.yml'.

Como Node.js cachea los módulos, todos los ficheros que importen el pool comparten la misma instancia. No se crean múltiples pools.

---

### backend/src/middleware/auth.middleware.js

Un middleware en Express es una función que se ejecuta entre que llega la petición y que el controlador la procesa. Este protege todas las rutas que requieren login.

Cuando llega una petición a '/api/timers', antes de llegar al controlador pasa por aquí. Lee el header 'Authorization', que debe venir con el formato 'Bearer <token>'. Separa el token del prefijo 'Bearer', y usa 'jwt.verify' para comprobar que la firma es válida. Si el token está manipulado o ha expirado, 'jwt.verify' lanza un error y se devuelve un 401. Si todo es correcto, añade 'req.user' con el 'id' y 'username' del usuario para que los controladores los usen sin tener que volver a consultar la base de datos.

---

### backend/src/controllers/auth.controller.js

Contiene la lógica del login. Recibe el 'username' y 'password' del body, busca el usuario en la base de datos con una query parametrizada (los '$1' evitan inyecciones SQL), y compara la contraseña con el hash usando 'bcrypt.compare'.

La comparación se hace siempre, exista o no el usuario. Si cortásemos antes de comparar cuando el usuario no existe, un atacante podría medir la diferencia de tiempo en la respuesta y saber si un usuario está registrado o no. Timing attack.

Si todo es correcto, se genera un JWT firmado con 'JWT_SECRET' que expira en 8 horas y se devuelve al frontend. A partir de ese momento el frontend lo adjunta en cada petición y el backend no necesita volver a consultar la base de datos para saber quién es el usuario.

---

### backend/src/controllers/timer.controller.js

Gestiona todas las operaciones sobre los cronómetros. Exporta cuatro funciones: 'getTimers', 'createTimer', 'controlTimer' y 'deleteTimer'.

El cronómetro no guarda un contador que va sumando. Guarda el momento exacto en que arrancó ('started_at') y el tiempo acumulado de sesiones anteriores ('accumulated_ms'). El tiempo total se calcula como 'accumulated_ms + (ahora - started_at)'. Al pausar, se hace ese cálculo en el backend y el resultado se guarda en 'accumulated_ms'. El frontend hace el mismo cálculo cada 50ms para animar el display sin llamar al servidor continuamente (lo acabaría sobrecargando inútilmente... no es eficiente!! [chronos v1]).

'getTimers' devuelve los cronómetros junto con 'server_now' (el timestamp actual del servidor). El frontend calcula el desfase entre ese valor y su propio reloj y lo usa como corrección, así el cronómetro es preciso aunque el reloj del cliente esté desajustado.

'controlTimer' verifica siempre que el cronómetro pertenece al usuario autenticado antes de modificarlo. Sin esa comprobación, cualquier usuario podría manipular los cronómetros de otro conociendo el id. 'RETURNING *' en cada UPDATE hace que PostgreSQL devuelva el registro actualizado directamente, sin necesitar un SELECT posterior.

'deleteTimer' es un borrado suave: marca el cronómetro como 'archived = true' en vez de eliminarlo. Así el usuario puede recuperarlo desde el histórico.

---

### backend/src/routes/auth.routes.js

Define la única ruta pública de la API: 'POST /api/login'. No lleva middleware de autenticación porque es precisamente donde el usuario todavía no tiene token. Solo conecta la URL con el controlador 'login'.

---

### backend/src/routes/timer.routes.js

Define las rutas privadas de los cronómetros. Usa 'router.use(authMiddleware)' una sola vez al principio en vez de aplicarlo ruta a ruta, lo que hace que cualquier petición que llegue aquí sin token válido reciba un 401 antes de llegar a cualquier controlador.

---

### backend/src/app.js

Punto de entrada del backend. Es el fichero que arranca Node.js cuando el contenedor se inicia. Crea la instancia de Express, registra los middlewares globales y monta las rutas.

'dotenv.config()' va en la primera línea para que las variables de entorno del '.env' estén disponibles desde el inicio, antes de que cualquier otro módulo intente leerlas. 'cors()' y 'express.json()' van antes de las rutas porque el orden importa: los middlewares se ejecutan en el orden en que se registran.

También expone 'GET /api/health', una ruta sin lógica que devuelve un JSON con el estado del servidor. Es útil para saber si el backend está vivo desde Traefik, un monitor externo, o simplemente desde el navegador.

---

### backend/Dockerfile

Le dice a Docker cómo construir la imagen del backend. Usa 'node:20-alpine' como base, que es la versión LTS de Node sobre Alpine Linux, una distribución mínima que hace que la imagen pese mucho menos.

El orden de las instrucciones es deliberado: Docker construye por capas y las cachea. Si primero se copia solo el 'package.json' y se ejecuta 'npm install', esa capa se reutiliza en builds posteriores siempre que las dependencias no hayan cambiado. Si se copiara todo el código primero, cualquier cambio en un '.js' invalidaría la caché del 'npm install' y habría que reinstalar todo desde cero en cada build.

'--omit=dev' excluye las dependencias de desarrollo ('nodemon') de la imagen final.
