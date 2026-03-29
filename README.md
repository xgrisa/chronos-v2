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

Define la única ruta abierta de la API: 'POST /api/login'. No lleva middleware de autenticación porque el usuario todavía no tiene token. Solo conecta la URL con el controlador 'login'.

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

---

### frontend/package.json

Define el proyecto Angular y sus dependencias. Todos los paquetes '@angular/' son del ecosistema oficial: el compilador, el router, el cliente HTTP, el motor de formularios, etc. Van juntos y en la misma versión para evitar incompatibilidades.

'bootstrap' y 'bootstrap-icons' dan los estilos y los iconos. 'rxjs' es la librería de programación reactiva que usa Angular internamente y que también usamos en los servicios para gestionar las respuestas HTTP como observables. 'zone.js' es lo que permite a Angular detectar cambios automáticamente.

En 'devDependencies' solo va el CLI de Angular y el compilador de TypeScript, que solo se necesitan para construir la app, no para ejecutarla.

---

### frontend/tsconfig.json

Configura el compilador de TypeScript. 'strict: true' activa todas las comprobaciones estrictas: variables tipadas, posibles nulls controlados, retornos de función garantizados.

### frontend/tsconfig.app.json

Extiende el tsconfig base pero solo para la app (no para tests). Define 'src/main.ts' como punto de entrada y excluye los tipos de Node.js, que no existen en el navegador.

### frontend/angular.json

Fichero de configuración del Angular CLI. Define cómo se construye la app: cuál es el punto de entrada, qué assets incluir, qué estilos cargar globalmente (Bootstrap y Bootstrap Icons) y los límites de tamaño del bundle. También configura el servidor de desarrollo. Es configuración declarativa, no hay lógica.

---

### frontend/src/index.html

El único fichero HTML de toda la app. Angular es una SPA (Single Page Application): el navegador lo carga una vez y Angular gestiona toda la navegación sin recargar la página. El '<app-root>' es el punto donde Angular inyecta la aplicación. El '<base href="/">' le indica al router que las rutas parten desde la raíz del dominio.

### frontend/src/main.ts

Punto de entrada de Angular. Arranca la aplicación pasándole el componente raíz ('AppComponent') y la configuración de 'app.config.ts'.

### frontend/src/styles.scss

Estilos globales mínimos. Bootstrap se carga desde 'angular.json', así que aquí solo va lo que aplica a toda la app y no pertenece a ningún componente concreto.

### frontend/src/environments/environment.ts

Define la URL base de la API como '/api' (relativo). Cuando el navegador está en 'chronos.xgsdev.com' y Angular hace una petición a '/api/timers', el navegador la resuelve como 'chronos.xgsdev.com/api/timers'. Nginx la recibe y la redirige internamente al backend. Así el código funciona en cualquier dominio sin cambiar nada.

---

### frontend/src/app/app.ts

Componente raíz. Es el primero que carga Angular y actúa como contenedor de toda la app. No tiene lógica propia, solo el '<router-outlet>': el hueco donde Angular renderiza el componente que corresponda según la ruta actual.

### frontend/src/app/app.config.ts

Registra los proveedores globales de la app: el router y el cliente HTTP. 'withInterceptors' es donde se enchufan los interceptores — así todas las peticiones HTTP pasan por 'authInterceptor' automáticamente antes de salir.

### frontend/src/app/app.routes.ts

Define las tres rutas de la app. La ruta raíz redirige a '/login'. La ruta '/dashboard' tiene 'canActivate: [authGuard]', que es la diferencia clave respecto a v1.

---

### frontend/src/app/guards/auth.guard.ts

Protege la ruta del dashboard. Comprueba si hay token en localStorage y, si no, redirige a '/login' usando 'router.createUrlTree' — la forma correcta en Angular moderno, ya que permite al sistema de routing cancelar la navegación limpiamente en vez de forzarla desde fuera.

### frontend/src/app/interceptors/auth.interceptor.ts

Se ejecuta automáticamente en todas las peticiones HTTP. Hace dos cosas: añade el token JWT al header 'Authorization' de cada petición saliente, y gestiona los errores 401 de respuesta. Si el servidor devuelve un 401 (token expirado o inválido), hace logout automático para que el usuario no se quede en el dashboard con una sesión muerta.

---

### frontend/src/app/services/auth.service.ts

Gestiona la autenticación. Llama al endpoint de login, guarda el token en 'localStorage' con 'tap' (un operador de RxJS que ejecuta un efecto secundario sin modificar el observable), y expone 'getToken()' e 'isLoggedIn()' para que el guard y el interceptor puedan consultarlo sin duplicar lógica.

### frontend/src/app/services/timer.service.ts

Gestiona todas las llamadas HTTP de los cronómetros. Exporta la interfaz 'Timer', que modela exactamente lo que devuelve la base de datos — si el schema cambia, hay que actualizar esta interfaz. Los cuatro métodos corresponden a los cuatro endpoints del backend: 'getTimers', 'createTimer', 'controlTimer' y 'deleteTimer'.

---

### frontend/src/scss/ — Arquitectura 7-1

Los estilos siguen el patrón 7-1 de Sass: 7 carpetas con una responsabilidad cada una y un fichero principal ('styles.scss') que las importa todas. No hay estilos en línea ni etiquetas '<style>' en el HTML.

- 'abstracts/' — variables y mixins. No generan CSS por sí solos, solo definen valores reutilizables (colores, tamaños, gradientes).
- 'base/' — estilos base del documento (body, reset).
- 'components/' — elementos reutilizables independientes de la página (tarjetas de cronómetro, display del tiempo).
- 'layout/' — estructura de página (navbar).
- 'pages/' — estilos específicos de cada vista (login, dashboard).
- 'themes/' y 'vendors/' — reservados para dark mode y librerías externas. Vacíos por ahora, se mantienen en el repo con '.gitkeep' porque Git no rastrea carpetas vacías.

### frontend/src/app/components/login/

Componente de login. El '.ts' gestiona el formulario y la llamada al servicio de autenticación. El '.html' es el formulario sin ningún estilo en línea — el centrado y el gradiente de fondo están en 'scss/pages/_login.scss', donde '.login-wrapper' usa Flexbox para centrar la tarjeta tanto horizontal como verticalmente.

### frontend/src/app/components/dashboard/

Componente principal de la app. El '.ts' gestiona toda la lógica de los cronómetros: carga, creación, control (start/pause/reset), archivado y restauración. El intervalo de 50ms actualiza únicamente los cronómetros en marcha, y 'ChangeDetectorRef.markForCheck()' le indica a Angular que vuelva a renderizar solo cuando hay cambios reales.

El '.html' no tiene ningún estilo en línea. '[ngClass]' aplica clases dinámicamente según el estado del cronómetro. La clase 'timer-display' está definida en 'scss/components/_timer-card.scss' y aplica 'font-variant-numeric: tabular-nums' para que los dígitos no se muevan al cambiar de valor.

---

### frontend/Dockerfile

Multi-stage build en dos etapas. La primera usa Node.js para compilar la app Angular ('npm run build'). La segunda copia únicamente los ficheros estáticos resultantes a una imagen Nginx limpia. La imagen final no contiene Node, el código fuente ni las dependencias de desarrollo — solo lo que el navegador necesita descargar.

### nginx/default.conf

Configura Nginx como punto de entrada único. Las peticiones a '/' sirven los ficheros estáticos del build de Angular. La directiva 'try_files' es necesaria para el router de Angular: si el navegador pide '/dashboard' directamente, ese fichero no existe en disco — 'try_files' devuelve 'index.html' y Angular gestiona la ruta en el cliente. Las peticiones a '/api/' se redirigen al contenedor 'backend' en el puerto 3000.

### docker-compose.yml (versión final)

Orquesta los cuatro servicios. 'postgres' y 'backend' solo están en la red interna 'chronos-internal', invisible desde fuera. 'frontend' está en las dos redes: la interna para hablar con el backend, y la red 'proxy' (externa, ya existente) para que Traefik lo alcance. Las labels de Traefik configuran el router para 'chronos.xgsdev.com' con HTTPS y certificado gestionado por 'myresolver' (Let's Encrypt vía Cloudflare).
