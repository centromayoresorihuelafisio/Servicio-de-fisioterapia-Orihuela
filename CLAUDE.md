# CLAUDE.md — Servicio de Fisioterapia Orihuela (Apps Script)

## Quién soy y cómo trabajar conmigo
- Soy el dueño del proyecto y NO programo. Habla siempre en español y explica sin jerga.
- La app era de uso personal; desde el 2-nov-2026 tiene acceso con usuario y contraseña, dos roles (administrador, que soy yo, y usuario, mi sustituto `FisioCMO2` durante mi baja desde el 17-nov-2026) y un «Registro» de cambios (sección 17 de `CONTEXTO.md`). Fuera de eso, no propongas más medidas de seguridad ni de acceso multiusuario.
- Todo lo nuevo debe respetar esa puerta: ninguna función pública nueva salvo las del editor con `soloPropietario_()`, cada acción del navegador en `accesoAcciones_` con su rol, y `node comprobar/coherencia.mjs` en orden (sección 17 y trampa 5 de la sección 7 de `CONTEXTO.md`).
- Trabajo solo en ordenador (no hay que pensar en móvil ni en táctil).

## Antes de empezar cualquier tarea
1. Lee la sección 0 de `CONTEXTO.md` y úsalo como mapa del proyecto: busca con grep por nombre de función o archivo y lee solo el fragmento necesario. No releas `CONTEXTO.md` entero.
2. NO leas entero este archivo enorme: `valoraciones/Panel_Valoracion.html`. Usa grep y lee solo unas decenas de líneas.
3. Ignora `node_modules` y `.git`.
4. Antes de crear una función, busca con grep que su nombre no exista (el ámbito es global).
5. Si hay algo "POR CONFIRMAR" en `CONTEXTO.md`, compruébalo en el código o pregúntame antes de asumir.

## Cómo trabajar aquí (esto sustituye a la regla del zip de CONTEXTO.md)
- Edita los archivos directamente en el proyecto. NO me entregues zips ni archivos sueltos: ya no hacen falta.
- Al terminar cada cambio, y solo si pasan los repasos (`node comprobar/coherencia.mjs`, sintaxis, LF), haz SIEMPRE sin esperar a que te lo pida: `clasp push`, commit en `main` solo con los archivos de ese cambio y `git push` a GitHub (regla del 5-nov-2026, sección 0 de `CONTEXTO.md`). Si algo falla, no subas nada y avísame. NO cambies de rama ni reescribas el historial. Trabajamos directamente en la rama `main` (la rama `control-acceso` de la sección 17 de `CONTEXTO.md` ya está unida a `main`).
- Todos los archivos van en LF (unificado el 30-oct-2026). No introduzcas CRLF en ningún archivo, nuevo o existente.
- Al terminar cada tarea, dame un resumen corto en español con: qué archivos has tocado (con su ruta), si son nuevos o ya existían, qué cambia en pantalla y qué debo probar.
- Recuérdame que, tras `clasp push`, la Web App necesita una nueva versión de la implementación (Administrar implementaciones › editar › Nueva versión, con «Cualquier usuario»; nunca volver a una versión anterior al login: sección 17.9 de `CONTEXTO.md`).
- Si el cambio altera estructura, convenciones, archivos o el estado del trabajo, actualiza `CONTEXTO.md` siguiendo su regla de mantenimiento (sección 0).

## Unificación visual (terminada)
- Antes de tocar el CSS de cualquier formulario o pantalla, lee la línea «CSS» de la sección 6 y la sección 13 de `CONTEXTO.md`, y revisa el resultado en `?page=guiaVisual` (`ui/Guia_Visual`), en claro y en oscuro.
- Las decisiones D-V1 a D-V7 y las reglas de la sección 13 de `CONTEXTO.md` son del dueño y no se cambian sin preguntar.
- No escribas colores, esquinas, sombras ni duraciones sueltos: usa las variables de `ui/CSS_Global`.
- No toques `core/WebApp.gs` sin mi visto bueno expreso (lo tuviste para las fases de la sección 17 de `CONTEXTO.md`, ya terminadas).
