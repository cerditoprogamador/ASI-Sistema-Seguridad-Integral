# Checklist maestro de puesta en marcha — ASI

Fecha: 23/09/2026. Documento de trabajo para producto, desarrollo, diseño, Operaciones, RR. HH. y asesoría legal.

## Cómo utilizar este documento

Las casillas pendientes incluyen funciones por desarrollar y funciones existentes que todavía necesitan validación. No representan únicamente código faltante. No marcar una tarea como terminada sin evidencia de funcionamiento.

- **P0:** obligatorio antes de usar datos personales reales en el piloto.
- **P1:** obligatorio antes de ampliar la operación. Si una función P1 se incluye en el piloto, debe aprobarse antes de usarla.
- **P2:** mejora posterior u opcional; no bloquea el circuito básico.
- Para cada ID registrar: responsable nominal, prioridad definitiva, estado, dependencia, fecha objetivo y enlace a evidencia.
- Estados sugeridos: pendiente, en desarrollo, en validación, bloqueado, aprobado, fuera de alcance con motivo.
- La fecha de entrega debe estimarse después de definir alcance y resolver acceso a infraestructura; este documento no promete un plazo.

## 0. Punto de partida verificado

La revisión realizada es de código y documentación, junto con arranque local; no equivale a una auditoría integral ni a pruebas completas en dispositivos.

- La carpeta declarada principal es `desktop-tutorial/`; `desktop-tutorial-integrado/` contiene ampliaciones. Todavía hay que establecer una única versión oficial.
- Ambas interfaces se sirvieron por HTTP local. El backend principal rechazó las credenciales PostgreSQL y terminó su ejecución.
- Existen roles supervisor, admin y dueño; no se verificó un portal independiente para vigiladores o clientes.
- Hay código para rondas, checklist, evidencia, firmas, incidencias y reportes; la integrada agrega endpoints de administración y persistencia offline.
- El cliente integrado puede devolver una ronda como guardada tras fallar el envío, sin incorporarla automáticamente a la cola en ese camino.
- La sincronización puede considerar exitosas actas sin backend conectado y vaciar la cola. Debe separarse estrictamente la simulación del funcionamiento real.
- No se identificó una clave de idempotencia de envío en la creación de rondas: un reintento puede producir otra acta.
- Las validaciones del servidor son parciales: se acepta una firma o negativa para el conjunto; no se verifica toda la completitud operativa requerida.
- No se encontraron llamadas de la interfaz a varios endpoints de administración existentes. Tener API no significa tener una función lista para el usuario.
- React, Babel y Tailwind se cargan desde CDN. La cola persistente por sí sola no garantiza arranque sin Internet.
- El Java activo del equipo es 8; la preparación Android pendiente contempla configurar un JDK compatible.

## 1. Alcance y decisiones de producto

Responsables: dirección de ASI + Operaciones + producto. Prioridad: P0.

- [ ] A01. Confirmar nombre público: ASI, ASISA y razón social; evitar denominaciones diferentes en app, dominio y documentos.
- [ ] A02. Elegir una carpeta/repositorio oficial; comparar cambios antes de archivar copias.
- [ ] A03. Definir primera entrega: ronda → acta → incidencia → resolución → consulta de resultados.
- [ ] A04. Designar responsable del producto, responsable operativo, responsable de datos y soporte técnico.
- [ ] A05. Elegir usuarios, objetivos y dispositivos del piloto; registrar quién aprueba resultados.
- [ ] A06. Definir canal inicial: web móvil, Android o ambos; decidir quién instala y actualiza.
- [ ] A07. Delimitar exclusiones iniciales: liquidación de sueldos, control horario, emergencias y sanciones automáticas, salvo alcance expreso.
- [ ] A08. Documentar volumen esperado: usuarios simultáneos, rondas diarias, fotos por ronda y años de conservación a determinar.
- [ ] A09. Acordar procedimiento alternativo durante una caída y conciliación posterior de registros.

**Aprobación:** alcance escrito, responsables asignados y circuito del piloto definido.

## 2. Datos de personas y usuarios

Responsables: RR. HH. + Operaciones + desarrollo. P0 para los registros usados en piloto.

- [ ] D01. Crear diccionario de datos: campo, significado, formato, obligatoriedad, finalidad, fuente, permiso y conservación.
- [ ] D02. Separar persona, legajo laboral y cuenta de acceso. Ser vigilador registrado no implica tener usuario de la app.
- [ ] D03. Preparar padrón mínimo: identificador interno, legajo, nombre, estado y asignación vigente.
- [ ] D04. Clasificar DNI, teléfono, domicilio, fecha de nacimiento y fotografía como campos que requieren justificación; no cargar todo por defecto.
- [ ] D05. Registrar habilitaciones/credenciales necesarias y vencimientos; licencias de conducir únicamente si corresponden al puesto.
- [ ] D06. Mantener asignaciones con fecha desde/hasta, objetivo, puesto y turno; contemplar reemplazos y más de una asignación cuando corresponda.
- [ ] D07. Definir altas, cambios, bajas y reingresos sin borrar el historial de actas.
- [ ] D08. Separar motivo operativo de ausencia de documentación médica; restringir especialmente datos de salud y otros datos sensibles.
- [ ] D09. Revisar necesidad y acceso a sanciones e historial; habilitar corrección y revisión humana.
- [ ] D10. Crear cuentas individuales para supervisores, administración y dirección; retirar usuarios de prueba del entorno real.
- [ ] D11. Implementar activación, cambio/restablecimiento de contraseña y baja de acceso.
- [ ] D12. Revocar sesiones al desactivar usuarios o cambiar permisos; comprobarlo con un token previamente emitido.
- [ ] D13. Crear permisos por función y alcance: zona, objetivo, cliente y registros propios, según la operación acordada.
- [ ] D14. Si el personal consultará directamente: agregar rol y portal de empleado con sus propios permisos y recuperación de cuenta.
- [ ] D15. Diseñar importación CSV/Excel con vista previa, validación por fila, reporte de errores y control de duplicados.
- [ ] D16. Probar corrección de una importación fallida sin duplicar personas ni sobreescribir datos válidos.
- [ ] D17. Identificar fuente y fecha de actualización; hacer que RR. HH. valide el padrón antes de incorporarlo.
- [ ] D18. Usar un canal restringido para intercambiar el padrón; no incluirlo en Git, tickets públicos o ejemplos de soporte.

**Aprobación:** padrón conciliado con RR. HH.; usuarios distintos ven únicamente sus datos autorizados.

## 3. Clientes, objetivos y servicio contratado

Responsables: Comercial + Operaciones + desarrollo. P0 para piloto; portal de cliente P2.

- [ ] C01. Modelar cliente como entidad propia; distinguir cliente, sede/objetivo y puestos dentro del objetivo.
- [ ] C02. Definir ficha de cliente: ID, razón social, nombre comercial, estado y CUIT si es necesario para el proceso.
- [ ] C03. Registrar contactos autorizados, función, canal y qué información pueden recibir.
- [ ] C04. Registrar objetivos con dirección verificada, coordenadas, radio y condiciones de acceso.
- [ ] C05. Validar la geocerca en el lugar; documentar límites de predios grandes, edificios y puestos separados.
- [ ] C06. Registrar tipo de servicio, horarios, dotación esperada, responsables y vigencia.
- [ ] C07. Configurar checklist y excepciones por objetivo con aprobación operativa.
- [ ] C08. Definir frecuencia de visitas, turnos, metas y motivos aceptados de reprogramación.
- [ ] C09. Definir matriz de escalamiento: incidencia → responsable → plazo → suplente → canal.
- [ ] C10. Definir qué actas/reportes recibe cada cliente y ocultar datos internos no necesarios.
- [ ] C11. Archivar clientes/objetivos sin eliminar actas históricas ni vínculos de personas.
- [ ] C12. Si se habilita portal de cliente, probar aislamiento entre clientes también en descargas y consultas del asistente.

**Aprobación:** cada objetivo del piloto tiene cliente, dotación, checklist, ubicación y responsables confirmados.

## 4. Funciones operativas del supervisor

Responsables: Operaciones + desarrollo + QA. P0.

- [ ] O01. Mostrar jornada, objetivos asignados, visitas pendientes y actas pendientes de envío.
- [ ] O02. Iniciar ronda con objetivo y autor identificados; registrar hora del dispositivo y recepción del servidor por separado.
- [ ] O03. Manejar permiso GPS denegado, señal perdida, coordenadas antiguas y precisión insuficiente.
- [ ] O04. Acordar margen GPS; comprobar que una precisión muy mala no permita aprobar ubicaciones inaceptables.
- [ ] O05. Aplicar política de rondas remotas por objetivo y permiso; exigir justificación y dejarla auditable.
- [ ] O06. Cargar plantel esperado y confirmar cada presencia o ausencia, sin marcar presentes automáticamente.
- [ ] O07. Resolver reemplazos, personal no asignado y objetivo sin ningún presente; definir el acta válida en cada caso.
- [ ] O08. Bloquear una misma persona como presente y ausente en la misma ronda.
- [ ] O09. Mostrar instrucciones del checklist; permitir “no aplica” únicamente si el negocio lo habilita y con motivo.
- [ ] O10. Validar en servidor todos los ítems obligatorios, sus valores y las observaciones exigidas.
- [ ] O11. Asociar cada respuesta y evidencia a su persona/puesto/ítem cuando corresponda.
- [ ] O12. Exigir las fotos definidas por regla y validar formato, tamaño y cantidad en servidor.
- [ ] O13. Permitir revisar y repetir fotos antes de cerrar; conservar metadatos necesarios y evitar capturas accidentales de terceros.
- [ ] O14. Obtener firma o negativa documentada por cada persona requerida; validar motivo y aviso en servidor.
- [ ] O15. Mostrar acta completa antes de confirmar: objetivo, personas, respuestas, fotos, firmas e incidencias.
- [ ] O16. Guardar borrador durante la ronda y recuperarlo tras cierre inesperado.
- [ ] O17. Diferenciar visualmente borrador, pendiente de envío, recibido, rechazado y corregido.
- [ ] O18. Mostrar número oficial únicamente después de confirmación del backend; mantener identificador local para pendientes.
- [ ] O19. Conservar actas ante caída de red, error del servidor, sesión vencida y reinicio del teléfono.
- [ ] O20. Implementar identificador único de envío y restricción en base de datos para evitar duplicados por reintento.
- [ ] O21. Asociar pendientes a autor y entorno; impedir que otra sesión los envíe atribuyéndose la autoría.
- [ ] O22. No vaciar pendientes hasta confirmación del servidor; informar fallos de almacenamiento local.
- [ ] O23. Publicar correcciones como versión/enmienda auditable; impedir cambios silenciosos en actas cerradas.
- [ ] O24. Ofrecer historial de propias rondas, detalle y exportación autorizada.

**Aprobación:** una ronda completa sobrevive a desconexión y reinicio, llega una sola vez y mantiene autoría, respuestas, fotos y firmas.

## 5. Administración, incidencias y dirección

Responsables: Operaciones + administración + desarrollo. P0 para incidencias básicas; P1 para ampliaciones.

- [ ] M01. Implementar pantallas conectadas para objetivos, personal, asignaciones y usuarios del alcance acordado.
- [ ] M02. Completar publicación/versionado de checklist; conservar la versión aplicada en cada acta.
- [ ] M03. Crear planificación de visitas y evitar asignaciones incompatibles; probar publicación y reprogramación.
- [ ] M04. Generar incidencias con reglas del servidor; validar persona afectada en lugar de asignarlas siempre al primer vigilador.
- [ ] M05. Implementar bandeja con filtros por cliente, objetivo, fecha, gravedad, estado y responsable.
- [ ] M06. Asignar y reasignar con historial; preservar el plazo original salvo cambio justificado.
- [ ] M07. Resolver, rechazar, vincular duplicados y reabrir si se habilita; exigir motivo y evidencia según el caso.
- [ ] M08. Actualizar la interfaz solo cuando el servidor confirme la operación; mostrar errores accionables.
- [ ] M09. Implementar recordatorios y escalamiento; registrar entrega/fallo del canal y responsable de seguimiento.
- [ ] M10. Consultar actas con evidencias, firmas y notas de auditoría; distinguir observación de modificación.
- [ ] M11. Definir fórmula de cada KPI, fuente, período, zona horaria y tratamiento de anulaciones/duplicados.
- [ ] M12. Reconciliar reportes con actas y tickets reales; retirar valores semilla y totales simulados.
- [ ] M13. Mostrar fecha de actualización y diferencia entre “sin datos”, cero y error de carga.
- [ ] M14. Exportar PDF/CSV según permisos, con filtros aplicados y registro de la exportación.
- [ ] M15. Diseñar vistas para dirección: cobertura, pendientes, vencimientos, evolución y objetivos que requieren atención.

**Aprobación:** una incidencia creada en campo se ve en otra cuenta, se resuelve y conserva el estado al recargar.

## 6. UX: uso claro y seguro en campo

Responsables: diseño + Operaciones + QA. P0 en flujo principal; P1 en paneles ampliados.

- [ ] U01. Observar tareas reales de supervisores y administradores; registrar iluminación, guantes, ruido y conectividad.
- [ ] U02. Dibujar recorridos por rol y probar un prototipo con usuarios representativos.
- [ ] U03. Mostrar una acción principal clara por paso y progreso de la ronda.
- [ ] U04. Mantener respuestas al volver atrás; advertir antes de descartar trabajo.
- [ ] U05. Reducir escritura mediante selección y datos precargados verificables, sin inventar confirmaciones.
- [ ] U06. Explicar por qué se solicita GPS/cámara antes del permiso y cómo recuperarse si se rechaza.
- [ ] U07. Explicar cada estado de sincronización con lenguaje operativo: “guardado en este teléfono” o “recibido por el servidor”.
- [ ] U08. Colocar errores junto al campo; conservar valores ingresados después de un fallo.
- [ ] U09. Diseñar estados de carga, vacío, error, sin permisos, sesión vencida, sin conexión y recuperación.
- [ ] U10. Usar objetivos táctiles amplios; adoptar 48 × 48 píxeles CSS como objetivo de diseño inicial y probarlo en equipos reales.
- [ ] U11. Probar lectura bajo sol y texto ampliado; evitar texto diminuto para información operativa.
- [ ] U12. Incluir texto/iconos además del color para Bueno/Regular/Malo y estados de envío.
- [ ] U13. Probar teclado, foco, etiquetas, lector de pantalla y mensajes anunciados; acordar estándar formal de accesibilidad si se exigirá.
- [ ] U14. Ubicar ayuda contextual sin tapar controles; no permitir que el chat haga perder una ronda abierta.
- [ ] U15. Evaluar con tareas medibles: completar ronda, registrar ausencia, recuperar envío y resolver incidencia.
- [ ] U16. Medir éxito, ayuda requerida, errores y tiempo; acordar metas antes del piloto y corregir bloqueos encontrados.

**Aprobación:** usuarios representativos completan tareas críticas sin ayuda bloqueante ni errores de interpretación de guardado.

## 7. UI y branding

Responsables: dirección + diseño. Identidad mínima P0; refinamientos P1/P2.

- [ ] B01. Aprobar nombre, logotipo y permiso de uso; obtener archivo vectorial y versiones claro/oscuro/monocromo.
- [ ] B02. Definir nombre de producto, icono móvil, favicon y aplicación del logo en actas.
- [ ] B03. Consolidar colores y tipografía existentes en un sistema único; reservar colores de estado para su significado operativo.
- [ ] B04. Revisar sombras y relieves actuales para que no reduzcan contraste o claridad de botones.
- [ ] B05. Definir escalas de tipografía, espaciado, bordes, elevación e iconografía.
- [ ] B06. Crear componentes con estados: botones, campos, selectores, tarjetas, tablas, filtros, diálogos y notificaciones.
- [ ] B07. Diseñar layouts reales para móvil, tablet y escritorio; aprovechar el espacio en administración y dirección.
- [ ] B08. Unificar tablas, alineación de números, fechas, nombres largos, paginación y filtros persistentes.
- [ ] B09. Definir tono de voz argentino, claro y respetuoso; evitar mensajes culpabilizantes o ambiguos.
- [ ] B10. Unificar vocabulario: persona/vigilador, cliente/objetivo, incidencia/ticket, acta/ronda.
- [ ] B11. Diseñar plantillas de actas y reportes con identidad, fecha, versión, autor y tratamiento de datos adecuado.
- [ ] B12. Distinguir visualmente demo, pruebas y producción para evitar cargas en el entorno equivocado.
- [ ] B13. Revisar cada pantalla con textos reales largos, datos vacíos y errores, usando datos ficticios representativos.
- [ ] B14. Entregar guía de marca, biblioteca de componentes y capturas de referencia para futuras modificaciones.

**Aprobación:** flujo móvil y escritorio consistentes, legibles y aprobados por ASI; marca única en app y documentos.

## 8. Infraestructura, seguridad y continuidad

Responsables: desarrollo + infraestructura. P0 salvo optimizaciones posteriores.

- [ ] T01. Corregir acceso PostgreSQL; verificar esquema sin ejecutar semillas sobre información real.
- [ ] T02. Separar migraciones de estructura y datos demo; probar actualización sin pérdida de registros.
- [ ] T03. Separar desarrollo, pruebas y producción con bases, secretos y URLs independientes.
- [ ] T04. Configurar dominio/HTTPS, proceso de aplicación persistente y reinicio automático.
- [ ] T05. Restringir exposición de base de datos y acceso administrativo; configurar secretos fuera del repositorio.
- [ ] T06. Revisar CORS, límites, validaciones y errores de API para el entorno publicado.
- [ ] T07. Empaquetar dependencias y recursos para arranque offline; probar primera instalación y reinicio sin Internet.
- [ ] T08. Deshabilitar fallback silencioso a datos demo y credenciales demo en producción.
- [ ] T09. Probar permisos por registro y archivo, no solo por pantalla o rol.
- [ ] T10. Proteger sesiones y datos locales; decidir política de dispositivos compartidos, pérdida y cierre de sesión.
- [ ] T11. Incorporar MFA para accesos privilegiados y recuperación controlada.
- [ ] T12. Definir almacenamiento privado de fotos/firmas, límites, cifrado, retención y acceso temporal cuando corresponda.
- [ ] T13. Registrar eventos de auditoría necesarios sin volcar contraseñas, tokens, fotos ni padrones en logs.
- [ ] T14. Automatizar backups y probar restauración en entorno separado; acordar pérdida máxima tolerable y tiempo de recuperación.
- [ ] T15. Monitorizar disponibilidad, errores, capacidad y acumulación de pendientes; asignar destinatario de alertas.
- [ ] T16. Probar concurrencia, fotos pesadas, almacenamiento lleno y fallos de base de datos.
- [ ] T17. Configurar compilación Android compatible, firma de distribución y custodia del keystore si se elige APK.
- [ ] T18. Probar actualización de app sin perder pendientes; mostrar versión y compatibilidad con API.
- [ ] T19. Implementar pruebas automáticas de autenticación, permisos, rondas, reintentos y validaciones críticas.
- [ ] T20. Preparar despliegue reproducible, reversión y registro de versión; revisar dependencias antes de publicar.

**Aprobación:** servicio accesible desde celulares autorizados; restauración probada; pruebas críticas aprobadas.

## 9. Aspectos legales y documentación

Responsables: asesoría legal argentina + RR. HH. + responsable de datos. P0 antes del piloto con datos reales. Esta sección es una lista de trabajo para revisión profesional, no un dictamen ni términos legales definitivos. Confirmar provincias de operación y requisitos sectoriales.

- [ ] L01. Identificar entidad responsable, domicilio y canal de privacidad; documentar finalidad y fundamento de cada tratamiento. No asumir que aceptar términos autoriza todo.
- [ ] L02. Preparar aviso de privacidad: datos, usos, destinatarios, obligatoriedad y derechos. Revisar consentimiento o excepción aplicable y registro ante AAIP. Base: [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion).
- [ ] L03. Definir atención de acceso, rectificación y supresión con verificación de identidad, responsable, plazos y registro. Referencia: [derechos ante AAIP](https://www.argentina.gob.ar/aaip/datospersonales/derechos).
- [ ] L04. Definir conservación y eliminación por categoría, con excepciones justificadas; limitar datos sensibles y acceso. Revisar también copias locales y backups. Base: [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion).
- [ ] L05. Redactar términos de uso interno: cuentas, uso permitido, responsabilidades, soporte, disponibilidad y procedimiento ante errores.
- [ ] L06. Redactar política de dispositivos personales/compartidos, devolución de acceso y confidencialidad.
- [ ] L07. Revisar con asesor laboral geolocalización, fotografías, controles y comunicaciones al personal; limitar captura a las necesidades acordadas de la ronda.
- [ ] L08. Revisar contratos con clientes: acceso a informes, confidencialidad, tratamiento de datos, conservación, soporte y responsabilidades.
- [ ] L09. Inventariar hosting, almacenamiento, soporte y proveedores IA; revisar contratos y países donde procesan datos. Referencia: [obligaciones de responsables](https://www.argentina.gob.ar/node/53779).
- [ ] L10. Evaluar transferencias internacionales y garantías aplicables antes de contratar proveedores extranjeros. Referencia: [AAIP — transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).
- [ ] L11. Determinar alcance probatorio de firmas en pantalla. Una imagen manuscrita no equivale por sí sola a firma digital bajo la Ley 25.506; revisar identificación, vinculación al acta e integridad. Referencia: [Ley 25.506](https://www.argentina.gob.ar/normativa/nacional/70749/texto).
- [ ] L12. Registrar negativa de firma y aclarar qué manifiesta la firma; acordar texto con RR. HH. y asesoría laboral.
- [ ] L13. Aprobar procedimiento de incidentes de privacidad y evaluar comunicaciones exigibles según caso y contratos.
- [ ] L14. Versionar textos legales y registrar entrega/aceptación cuando corresponda; conservar evidencia vinculada a usuario y fecha.
- [ ] L15. Revisar reglas provinciales de seguridad privada y obligaciones laborales/sectoriales para cada jurisdicción; verificar fuentes específicas al conocerlas.
- [ ] L16. Revisar licencias de marca, tipografías, iconos, librerías y materiales cargados al asistente.
- [ ] L17. Preparar condiciones del asistente: alcance, tratamiento de conversaciones, contacto humano y límites de uso.

**Aprobación:** asesoría legal y RR. HH. validan documentos, flujos y alcance antes de incorporar datos reales. La marca de agua y el GPS informados por el dispositivo no deben promocionarse como prueba infalsificable.

## 10. Asistente dentro de la aplicación

Sí es viable. Es una función nueva, no una capacidad ya implementada. La primera versión puede limitarse a documentación, sin acceso al padrón. Su disponibilidad no bloquea el piloto del circuito básico.

### Nivel 1 — ayuda sobre el uso y procedimientos (P1/P2)

- [ ] IA01. Crear sección “Ayuda” accesible desde el flujo sin perder el borrador.
- [ ] IA02. Preparar manual aprobado, preguntas frecuentes y procedimientos por rol, con dueño y fecha de revisión.
- [ ] IA03. Responder con documentos autorizados y mostrar fuente, versión y enlace al paso correspondiente.
- [ ] IA04. Informar cuando no tiene respuesta y ofrecer contacto humano; evitar inventar procedimientos.
- [ ] IA05. Separar instrucciones de uso de consultas laborales, reclamos y emergencias; definir derivación para cada caso.
- [ ] IA06. Disponer de ayuda básica descargada para cuando no haya red; no prometer IA offline sin una solución específica.
- [ ] IA07. Indicar que es un asistente automatizado y qué datos conviene no escribir.

Ejemplos: “¿Cómo registro una ausencia?”, “¿Qué hago si no tengo GPS?”, “¿Cómo sé si el acta se envió?”.

### Nivel 2 — consulta de datos autorizados (P2)

- [ ] IA08. Crear consultas controladas por API para objetivos, propias rondas, incidencias y vencimientos autorizados.
- [ ] IA09. Aplicar permisos en backend antes de enviar resultados al modelo; nunca depender solo de instrucciones del chat.
- [ ] IA10. Si el personal tendrá acceso: implementar primero su rol, autenticación y alcance individual.
- [ ] IA11. Mostrar fuente, período y actualización de datos; usar consultas/cálculos del servidor para cantidades.
- [ ] IA12. Limitar campos enviados al proveedor; excluir DNI, domicilios, firmas, salud y otros datos que no requiera la consulta.
- [ ] IA13. Probar que no se puede acceder a otro empleado, cliente o zona mediante reformulación de preguntas.

Ejemplos: “¿Cuáles de mis actas siguen pendientes?”, “¿Qué incidencias vencen hoy en mis objetivos?”.

### Nivel 3 — acciones asistidas (P2, después de validar consultas)

- [ ] IA14. Autorizar un conjunto pequeño de acciones y mostrar vista previa y confirmación antes de escribir.
- [ ] IA15. Registrar solicitante, operación, autorización y resultado; prevenir acciones duplicadas.
- [ ] IA16. Excluir firma por terceros, sanciones, cambios de permisos y decisiones laborales automáticas del alcance inicial.

Ejemplos: preparar borrador de incidencia o proponer resumen; el usuario revisa antes de confirmar.

### Implementación y control

- [ ] IA17. Seleccionar proveedor con evaluación de calidad, costo, privacidad, retención, región y condiciones contractuales vigentes.
- [ ] IA18. Guardar clave del proveedor solo en backend; limitar tamaño de mensajes, uso por usuario, gasto y tiempo de espera.
- [ ] IA19. Proteger contra instrucciones maliciosas incluidas en preguntas, documentos o datos; tratarlas como contenido sin autoridad.
- [ ] IA20. Definir conservación/acceso a conversaciones y borrado; separar historial de chat del legajo laboral.
- [ ] IA21. Probar preguntas frecuentes, ambiguas, sin respuesta, ajenas al rol y solicitudes de datos prohibidos.
- [ ] IA22. Definir métricas: respuestas útiles verificadas, citas correctas, derivaciones, costo y filtraciones; cero filtraciones en pruebas de autorización.
- [ ] IA23. Incorporar evaluación de respuestas, actualización de documentos y apagado del asistente sin afectar rondas.

**Aprobación:** responde con fuente, reconoce límites, cumple permisos y no obstaculiza el trabajo cuando falla.

## 11. Plan de pruebas y salida a operación

Responsables: QA + Operaciones + RR. HH. + infraestructura.

- [ ] Q01. Ejecutar primero laboratorio con datos ficticios; registrar versión, dispositivo, escenario y resultado.
- [ ] Q02. Probar ronda normal, ausencia, negativa de firma, GPS fuera de radio y permisos denegados.
- [ ] Q03. Probar respuesta del servidor perdida después de guardar: reintentar debe devolver la misma acta.
- [ ] Q04. Probar pérdida de red, sesión vencida, cierre forzado, reinicio, almacenamiento lleno y actualización con pendientes.
- [ ] Q05. Probar intercambio de usuario en el mismo teléfono sin mezclar pendientes ni datos.
- [ ] Q06. Probar administración desde otra cuenta y equipo; recargar y verificar persistencia real.
- [ ] Q07. Probar permisos mediante API directa además de ocultar botones en la interfaz.
- [ ] Q08. Comparar conteos de actas, firmas, fotos e incidencias con lo enviado; investigar cualquier diferencia.
- [ ] Q09. Probar exportaciones, cierre/reapertura y reportes usando datos conocidos.
- [ ] Q10. Ejecutar restauración de backup y medir tiempos de recuperación.
- [ ] Q11. Capacitar participantes con guía breve y simulación completa; publicar contacto de soporte.
- [ ] Q12. Tras aprobar P0, realizar piloto sugerido con 1–2 supervisores, 1–2 objetivos y una semana de observación.
- [ ] Q13. Revisar diariamente pendientes, actas incompletas, duplicados, fallos y consultas de usuarios.
- [ ] Q14. Aprobar ampliación solo sin defectos críticos, sin pérdida de evidencia y con actas reconciliadas una sola vez.
- [ ] Q15. Definir mantenimiento: actualizaciones, revisión de accesos, backups, limpieza de datos y atención de incidentes.

## 12. Orden de ejecución propuesto

| Etapa | Trabajo | Condición para avanzar |
|---|---|---|
| 1. Definición | A01–A09, fuentes de datos, responsables, alcance legal inicial | Versión y alcance acordados |
| 2. Circuito confiable | PostgreSQL, validaciones, persistencia, autoría y reintentos | Ronda probada de punta a punta con datos ficticios |
| 3. Producto utilizable | UX principal, marca mínima, gestión y cuentas | Usuarios completan tareas y cambios persisten |
| 4. Preparación real | Infraestructura, seguridad, documentos, padrón validado | P0 aprobados y restauración probada |
| 5. Piloto | Capacitación, carga mínima autorizada y observación | Resultados reconciliados, defectos críticos resueltos |
| 6. Ampliación | Paneles completos, clientes adicionales, soporte y monitoreo | P1 del alcance aprobados |
| 7. Asistente | Ayuda documental; luego consultas y eventualmente acciones | Evaluación de calidad, permisos y privacidad aprobada |

La ayuda documental puede desarrollarse en paralelo una vez estabilizados los procedimientos. No debe retrasar correcciones de guardado.

## 13. Información que ASI debe aportar

- [ ] IN01. Razón social, nombre comercial, logo y responsable de aprobación de marca.
- [ ] IN02. Provincias y localidades donde se utilizará; clientes y objetivos del piloto.
- [ ] IN03. Responsable operativo, RR. HH., asesor legal y contacto técnico.
- [ ] IN04. Cantidad de supervisores, vigiladores, administradores y clientes con eventual acceso.
- [ ] IN05. Dispositivos disponibles, versiones Android y conectividad habitual.
- [ ] IN06. Fuente del padrón, formato de archivos y responsable de validarlo.
- [ ] IN07. Ejemplos de actas/checklists/procedimientos actuales, inicialmente anonimizados.
- [ ] IN08. Reglas de firmas, ausencias, fotos, geocerca, escalamiento y plazos.
- [ ] IN09. Dominio/hosting disponibles y responsables de su administración; compartir secretos por canal adecuado.
- [ ] IN10. Alcance deseado del asistente y quién podrá consultarlo.

## Registro de aceptación

| ID | Responsable | Prioridad | Estado | Evidencia | Fecha |
|---|---|---|---|---|---|
| Ejemplo: O20 | A asignar | P0 | Pendiente | Prueba de reintento que produce una sola acta | A definir |

Una casilla aprobada debe enlazar una prueba, documento firmado/aprobado, captura pertinente o registro verificable. No usar porcentajes de avance basados solo en cantidad de pantallas.
