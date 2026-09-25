# Integración local GitHub + desarrollo local

## Base

Esta copia parte del commit `75a5508` de GitHub y conserva las ampliaciones que estaban sin publicar en `desktop-tutorial/`.

La carpeta original no fue modificada.

## Capacidades integradas

- Geocerca recalculada por el servidor, con distancia y precisión GPS auditables.
- Rechazo de rondas presenciales sin GPS verificable o fuera del radio.
- Limpieza de coordenadas obsoletas cuando el dispositivo pierde la señal.
- Vigiladores asignados visibles automáticamente al elegir el objetivo.
- Confirmación explícita de presente o motivo de ausencia para cada asignado.
- Negativa de firma con motivo y constancia de aviso.
- Incidencias con severidad, SLA, asignación, reasignación, rechazo y duplicados.
- Consulta y auditoría de actas.
- Gestión de objetivos, vigiladores, checklist versionado y planificación.
- KPIs de evolución, reincidencias y objetivos en riesgo.
- Datos demo de vigiladores y objetivo de Mendoza recuperados de GitHub.
- Sincronización Capacitor compatible con Windows.

## Decisión de integración

La versión de GitHub marcaba automáticamente como presentes a todos los vigiladores asignados. Eso impedía distinguir una presencia real de una ausencia. La integración carga el plantel esperado automáticamente, pero exige que el supervisor confirme `Está presente` o indique `Franco`, `Licencia`, `Relevo` o `Ausente sin aviso`.

## Estado de validación

- `node --check server.js`: aprobado.
- `npm install`: aprobado.
- `npm run cap:sync`: aprobado.
- Gradle: bloqueado porque el equipo usa Java 8; Android Gradle Plugin 8.13 requiere Java 11 o superior. Se recomienda JDK 17.

