# Plan de despliegue y pruebas operativas Android

## 1. Objetivo del piloto

Validar que una ronda completa pueda realizarse en condiciones reales y genere un acta íntegra, sincronizada y auditable, sin pérdida de evidencia ni ambigüedad sobre ubicación, personas inspeccionadas y firmas.

El piloto no debe comenzar con datos laborales reales hasta aprobar una prueba de laboratorio con datos ficticios.

## 2. Preparación técnica

### Entorno de compilación

1. Instalar JDK 17 y configurar `JAVA_HOME`.
2. Ejecutar `npm install`.
3. Ejecutar `npm run cap:sync`.
4. Ejecutar `android\\gradlew.bat test assembleDebug`.
5. Conservar el APK, hash SHA-256, commit, fecha y responsable de cada build.

### Backend de pruebas

- Crear un entorno `staging` separado de producción.
- PostgreSQL exclusivo para el piloto, con backup diario cifrado.
- URL HTTPS estable; no usar una IP LAN ni HTTP para pruebas de campo.
- JWT, credenciales y CORS exclusivos de staging.
- Un usuario por participante; no compartir cuentas.
- Datos ficticios en laboratorio y datos mínimos autorizados en campo.
- Registrar versión de API y versión de APK en cada ejecución.

### APK

- `debug APK`: solamente laboratorio y dispositivos controlados.
- `release APK` firmada: piloto de campo.
- Guardar el keystore fuera del repositorio y con copia de seguridad.
- Usar versionado visible, por ejemplo `0.1.0-piloto.1` y `versionCode` incremental.
- Distribuir inicialmente por canal privado; no publicar en Play Store durante el piloto.

## 3. Etapas

### Etapa A — laboratorio

- 2 modelos Android: uno de gama media reciente y uno antiguo soportado.
- Android 11 o superior y, si está disponible, la versión mínima objetivo.
- 20 rondas ficticias: 10 con Wi-Fi, 5 con datos móviles y 5 sin conexión temporal.
- Casos de GPS dentro, en el borde, fuera de radio, permiso denegado y señal perdida.
- Cámara, múltiples fotos, firma, negativa de firma y ausencias.
- Forzar cierre de la app, rotación de pantalla, batería baja y reanudación.

Salida: cero pérdida de actas/evidencias y cero rondas presenciales aceptadas fuera de geocerca.

### Etapa B — piloto controlado

- 2 supervisores, 2 objetivos y 5 días hábiles.
- 1 dispositivo principal y 1 dispositivo de respaldo por supervisor.
- Acompañamiento durante la primera ronda de cada usuario.
- Revisión diaria de actas, tickets, tiempos y errores.
- Congelar nuevas funciones durante los cinco días; aceptar solamente correcciones críticas.

### Etapa C — piloto ampliado

- 5 a 10 supervisores.
- Objetivos de al menos dos tipos distintos.
- 2 semanas completas, incluyendo turnos y zonas con conectividad deficiente.
- APK release firmada y procedimiento de actualización probado.

## 4. Datos a recopilar

### Identificación de ejecución

- `test_run_id` único.
- Versión de APK, `versionCode`, commit y versión de API.
- Dispositivo, fabricante, modelo, versión Android y nivel de batería inicial/final.
- Usuario de prueba seudonimizado y objetivo.
- Inicio, fin y duración total de la ronda.

### Geolocalización

- Latitud/longitud del objetivo y radio configurado.
- Latitud/longitud capturada, precisión reportada y distancia calculada por servidor.
- Resultado dentro/fuera y tipo presencial/remota.
- Tiempo hasta obtener el primer fix GPS.
- Cambios de señal, permiso denegado y reintentos.

### Flujo operativo

- Cantidad de vigiladores esperados, presentes y ausentes por motivo.
- Tiempo por paso: objetivo, vigiladores, checklist, evidencias y firmas.
- Ítems Bueno/Regular/Malo y observaciones.
- Fotografías requeridas, tomadas, rechazadas o faltantes.
- Firmas realizadas, negativas y motivo.
- Incidencias creadas, severidad, SLA y responsable.

### Conectividad y sincronización

- Estado de red al iniciar y terminar.
- Acta enviada en línea o encolada offline.
- Número de reintentos, hora de sincronización y demora total.
- Tamaño aproximado del payload y número de evidencias.
- Código HTTP y categoría de error, sin guardar tokens ni contraseñas.

### Experiencia del usuario

- Tarea completada: sí/no.
- Ayuda requerida: ninguna, mínima o bloqueante.
- Errores percibidos y paso donde ocurrieron.
- Escala de facilidad de 1 a 5 al terminar la ronda.
- Comentario breve del supervisor.

## 5. Fuente de los datos

- Base PostgreSQL: actas, respuestas, evidencias, firmas, ausencias, tickets y tiempos disponibles.
- Logs estructurados del servidor: errores, latencia, versión y sincronización.
- Planilla de control del piloto: dispositivo, escenario, ayuda requerida y percepción del usuario.
- Registro de defectos: pasos, resultado esperado/obtenido, captura, severidad y `test_run_id`.

La aplicación aún no instrumenta todos los campos diagnósticos anteriores. Antes del piloto ampliado debe agregarse telemetría mínima con consentimiento, evitando contenido de fotografías, firmas, DNI, tokens y coordenadas fuera de las rondas autorizadas.

## 6. Escenarios obligatorios

| ID | Escenario | Resultado esperado |
|---|---|---|
| GPS-01 | Dentro del radio con buena precisión | Permite ronda presencial |
| GPS-02 | Fuera del radio | Bloquea presencial y ofrece remota justificada |
| GPS-03 | Se pierde señal después de un fix | Descarta coordenadas anteriores |
| GPS-04 | Precisión mayor a 1000 m | Servidor rechaza la medición |
| OFF-01 | Se corta Internet durante la ronda | Conserva y sincroniza después sin duplicar |
| OFF-02 | Se cierra la app con acta en cola | Recupera la cola al abrir |
| VIG-01 | Todos los asignados presentes | Permite confirmar cada presencia |
| VIG-02 | Un asignado ausente | Exige motivo antes de continuar |
| FIR-01 | Firma normal | Firma asociada al vigilador correcto |
| FIR-02 | Negativa de firma | Exige motivo y aviso registrado |
| EVI-01 | Valoración que exige foto | No permite finalizar sin evidencia |
| SLA-01 | Incidencia Malo | Crea severidad crítica y SLA de 24 h |
| ADM-01 | Reasignación | Cambia responsable sin reiniciar SLA |
| APK-01 | Actualización sobre versión anterior | Conserva cola y datos locales |

## 7. Criterios de aprobación

- 100 % de actas finalizadas presentes una sola vez en el servidor.
- 0 evidencias o firmas asociadas a una persona/acta incorrecta.
- 0 rondas presenciales aceptadas sin GPS verificable.
- Al menos 95 % de rondas completadas sin ayuda bloqueante.
- Al menos 95 % de colas offline sincronizadas en los 5 minutos posteriores a recuperar red.
- Cero fallos críticos, pérdida de datos o exposición de credenciales.
- Duración mediana de ronda aceptada por Operaciones y sin regresión mayor al 20 % entre builds.

## 8. Paquete de cada entrega

- APK y archivo `.sha256`.
- Nombre de versión, commit y fecha.
- Notas de cambios y problemas conocidos.
- URL y versión del backend compatible.
- Instrucciones de instalación/actualización.
- Matriz de dispositivos probados.
- Resultado de pruebas y decisión: aprobada, condicionada o rechazada.

## 9. Bloqueos actuales

1. El equipo compila con Java 8; instalar/configurar JDK 17.
2. Corregir las credenciales PostgreSQL de staging.
3. Definir URL HTTPS accesible desde teléfonos físicos.
4. Confirmar que la cola offline persiste tras cerrar completamente la app.
5. Agregar identificación de versión y telemetría diagnóstica mínima antes del piloto ampliado.

