# CLAUDE.md — Servicio de Fisioterapia Orihuela (Apps Script)

## Quién soy y cómo trabajar conmigo
- Soy el dueño del proyecto y NO programo. Habla siempre en español y explica sin jerga.
- La app es de uso exclusivamente personal. No propongas medidas de seguridad ni de acceso multiusuario.
- Trabajo solo en ordenador (no hay que pensar en móvil ni en táctil).

## Antes de empezar cualquier tarea
1. Lee la sección 0 de `CONTEXTO.md` y úsalo como mapa del proyecto: busca con grep por nombre de función o archivo y lee solo el fragmento necesario. No releas `CONTEXTO.md` entero.
2. NO leas entero este archivo enorme: `valoraciones/Panel_Valoracion.html`. Usa grep y lee solo unas decenas de líneas.
3. Ignora `node_modules` y `.git`.
4. Antes de crear una función, busca con grep que su nombre no exista (el ámbito es global).
5. Si hay algo "POR CONFIRMAR" en `CONTEXTO.md`, compruébalo en el código o pregúntame antes de asumir.

## Cómo trabajar aquí (esto sustituye a la regla del zip de CONTEXTO.md)
- Edita los archivos directamente en el proyecto. NO me entregues zips ni archivos sueltos: ya no hacen falta.
- NO hagas commit, NO hagas push, NO cambies de rama y NO ejecutes `clasp push`. Eso lo hago yo con GitHub Desktop y clasp. Estoy trabajando en la rama `unificacion-visual`.
- Todos los archivos van en LF (unificado el 30-oct-2026). No introduzcas CRLF en ningún archivo, nuevo o existente.
- Al terminar cada tarea, dame un resumen corto en español con: qué archivos has tocado (con su ruta), si son nuevos o ya existían, qué cambia en pantalla y qué debo probar.
- Recuérdame que, tras `clasp push`, la Web App necesita una nueva versión de la implementación.
- Si el cambio altera estructura, convenciones, archivos o el estado del trabajo, actualiza `CONTEXTO.md` siguiendo su regla de mantenimiento (sección 0).

## Unificación visual (terminada)
- Antes de tocar el CSS de cualquier formulario o pantalla, lee la línea «CSS» de la sección 6 y la sección 13 de `CONTEXTO.md`, y revisa el resultado en `?page=guiaVisual` (`ui/Guia_Visual`), en claro y en oscuro.
- Las decisiones D-V1 a D-V7 y las reglas de la sección 13 de `CONTEXTO.md` son del dueño y no se cambian sin preguntar.
- No escribas colores, esquinas, sombras ni duraciones sueltos: usa las variables de `ui/CSS_Global`.
- No toques `core/WebApp.gs` sin mi visto bueno expreso.
