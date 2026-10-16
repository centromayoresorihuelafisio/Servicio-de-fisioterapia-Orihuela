# CONTEXTO — Servicio de Fisioterapia Orihuela (Apps Script)

Verificado leyendo el código. "POR CONFIRMAR" = no se puede deducir del repo.

## 0. Cómo trabajar con este archivo (leer primero)
- Este archivo sustituye a la exploración del proyecto. No lo releas entero para buscar algo: usa grep por nombre de función/archivo y lee solo el fragmento necesario.
- Archivos enormes, NO leer enteros: `agenda/Web_Vista.html` (~220 KB), `usuarios/BaseDatos_Vista.html` (~105 KB), `valoraciones/Panel_Valoracion.html`, `Web_Vista.html`, `Guardar_Vista.html`, `usuarios/Anadir_Usuario_Vista.html`, `agenda/Web.gs` (~55 KB). Usa grep y lee solo unas decenas de líneas. Ignora `node_modules` y `.git`.
- Idioma: español. Explica sin jerga; el dueño no programa.
- Al modificar: di qué archivos cambian y por qué; entrega el archivo o bloque completo listo para pegar/sobrescribir (no "cambia esto por lo otro" ambiguo). Mantén CRLF/LF del archivo original. Tras cambiar código, recuerda: `clasp push` y, para la Web App, nueva versión de la implementación.
- Antes de crear una función: grep del nombre (ámbito global compartido).
- Si el cambio altera estructura, convenciones o archivos, ofrece al final una versión actualizada de este `CONTEXTO.md`.
- Ante un POR CONFIRMAR, comprueba en el código o pregunta antes de asumir.

**Glosario**: Maestra = hoja "Base de Datos Maestra" (un usuario/paciente por fila). HC = Historia clínica (Google Doc enlazado en la Maestra; los Docs nuevos se nombran con el prefijo `HISTORIA CLINICA `). Jornada = abre las HC de la Agenda de hoy (`prepararJornada`, `historia/Abrir_HCs.gs`). Huérfana = HC cuyo nombre de archivo no coincide con el del usuario; se busca por similitud y se vincula a mano (`historia/Buscar_Huerfana.gs`). Alta = `darDeAltaPaciente`: marca el alta y anota la fecha en la tabla ASISTENCIA del Doc de la HC (`usuarios/Alta.gs`). Curso = hoja `Agenda AAAA-AAAA`.

## 1. Qué es
Gestión de un servicio de fisioterapia sobre **Google Sheets + Apps Script** (V8, `Europe/Madrid`). Base de datos de usuarios, agenda de citas, valoraciones e historias clínicas (Google Docs). Uso personal del profesional. **El dueño no es programador**: la app se ha construido con "vibe coding" con Claude. Explica los cambios en lenguaje llano y entrega archivos completos o cambios fáciles de pegar. Funciona a la vez como menús/diálogos dentro de la hoja y como **Web App** (Base de Datos, Agenda, Valoraciones).

## 2. Mapa de carpetas
Los archivos están en subcarpetas; en el editor de Apps Script son prefijos (`agenda/Web_Vista`). Convención: `X.gs` = servidor, `X_Vista.html` / `Panel_*.html` / `Dialogo_*.html` = interfaz.
- `core/` — base común. `Config.gs` (constantes), `Utils.gs` (parseFecha, normalizarTexto, obtenerHojaAgenda, cargarMapaHistoriasClinicas…), `Menu.gs` (onOpen), `OnEdit.gs`, `PanelAdmin.gs` (menú ⚙️), `WebApp.gs` (doGet, getSS, include, incluirPanel).
- `usuarios/` — alta, edición, búsqueda, orden, Base de Datos web, WhatsApp, contactos Google. Clave: `BaseDatos.gs`, `Anadir_Usuario.gs`, `Editar_Usuario.gs`, `Alta.gs`, `Whatsapp.gs`, `Contactos_Google.gs`.
- `agenda/` — citas, Agenda web, semanal, eventos, recordatorios, disponibilidad, Calendar. Clave: `Web.gs` (la mayor parte de la API web), `Cita.gs`, `Disponibilidad.gs`, `Recordatorios.gs`, `Exportar_Calendar.gs`.
- `valoraciones/` — `Guardar.gs` (formulario y guardado), `Web.gs` (vista de evolución).
- `historia/` — `Generar.gs` (HC desde plantilla Doc), `Abrir_HCs.gs`, `Buscar_Huerfana.gs`.
- `ui/` — piezas compartidas: `CSS_Global`, `CSS_Ficha`, `JS_Ficha`, `Ficha_Usuario.gs`, `JS_Paneles_Diferidos`, `JS_Selector_Fecha`, `JS_Cierre_Formulario`, `JS_Formato_Nombre`, `JS_Valoraciones_Cache`, `Modal_Deshacer` + `JS_Modal_Deshacer`.
- `herramientas/` — utilidades de editor, no están en menú salvo `Backup_Proyecto.gs` y `Generar_Curso.gs` (`generarAgendaCurso`).

## 3. Puntos de entrada
**Menú (`core/Menu.gs → onOpen`)**: 📅 (irAFechaActual, mostrarSelectorFecha, prepararJornada, mostrarDialogoCita, abrirChatWhatsapp, showAgendaModal, mostrarFormularioEvento, copiarSiguienteCita, exportSheetAgendaToCalendar, generarAgendaCurso); 🧍 (abrirFormularioPaciente, abrirFormularioValoracion, generarHistoriaClinica, insertarEnlaceHistoriaClinica, buscarHistoriaClinicaHuerfana, darDeAltaPaciente, ordenarPacientes, mostrarDialogoBusqueda, sincronizarContactosGoogle); ⚙️ (configurarPlantillaHC, configurarCarpetaDrive, configurarMensajeWhatsapp, exportarProyectoAUnicoArchivo).

**Diálogos**: todos `showModalDialog` (no hay `showSidebar`).

**Web App (`core/WebApp.gs → doGet`)**, `?page=`; por defecto `baseDatos`; desconocido → `construirIndiceWeb()`; `&embed=1` → contexto `popup`.
- `baseDatos` → `usuarios/BaseDatos_Vista`; `agenda` → `agenda/Web_Vista`; `valoraciones` → `valoraciones/Web_Vista`
- `citas` → `agenda/Cita_Vista`; `nuevoPaciente` → `usuarios/Anadir_Usuario_Vista`; `valoracion` → `valoraciones/Guardar_Vista`
- `editarPaciente&fila=N` → `servirFormularioEdicionWeb`; `huerfanaHC&fila=N` → `servirBuscadorHuerfanaWeb`
- Se registran en el objeto `PAGINAS_WEB`. Triggers: `onEdit` (simple); no hay `newTrigger` en el código y el dueño confirma que no hay triggers instalables. Por tanto `onEdit` es un trigger simple (límites de los simples: no puede usar servicios que requieran autorización completa).

## 4. Datos y configuración (`core/Config.gs`)
- `SHEETS`: MAESTRA ("Base de Datos Maestra"), VALORACIONES, EVENTOS, RECORDATORIOS.
- Agenda: una hoja por curso, `Agenda AAAA-AAAA`, resuelta por `obtenerHojaAgenda()` (`core/Utils.gs`; curso nuevo desde septiembre).
- Estructura de la hoja Agenda (según `obtenerSemanasYHuecos`, `agenda/Cita.gs`): bloques por semana; una fila con texto que empieza por "SEMANA" en la columna C marca la semana; después una fila por día con fecha en A y nombre del día en B, seguida de las filas de horas (hora en C, usuario en D…; ver `COLUMNAS_NUM.AGENDA`). Se crea con `generarAgendaCurso` (`herramientas/Generar_Curso.gs`).
- **Estados** (columna Estado de la Maestra): fuente única `ESTADOS_PACIENTE` en `core/Config.gs`: `ACTIVO` 🟢 Activo, `EN_ESPERA` 🟡 En espera, `ALTA` ✔️ Alta, `CONTACTARA` 🕐 Contactará, `NO_RESPONDE` 🚫 No responde; más `LISTA_EDICION` (los 5, para editar y ficha), `LISTA_NUEVO` (Activo/En espera/Contactará, para crear) y `DEFECTO_NUEVO` (En espera). Servidor: usar `ESTADOS_PACIENTE.X` (`Ordenar.gs`, `Alta.gs`, `agenda/Cita.gs`). Cliente: las páginas `usuarios/BaseDatos_Vista` y `agenda/Web_Vista` llevan `<?!= incluirEstados(); ?>` (`core/WebApp.gs`), que crea la variable global `ESTADOS_PACIENTE` en el navegador; la usan `ui/JS_Ficha`, `usuarios/Panel_Editar` y `usuarios/Panel_Nuevo`. Las plantillas `Editar_Usuario_Vista` y `Anadir_Usuario_Vista` la leen con scriptlets del servidor. Para cambiar un estado: editar solo `Config.gs` (y las celdas de la hoja). Si una página nueva usa `JS_Ficha` o esos paneles, debe incluir `incluirEstados()` antes. `ui/JS_Ficha` y `BaseDatos_Vista` clasifican por palabra clave (`alta`, `activo`…), no por texto exacto. Pendiente: `usuarios/Dialogo_Nuevo.html` (sin uso) aún tiene la lista escrita a mano.
- `COLUMNAS.MAESTRA` / `COLUMNAS.AGENDA`: cabeceras de la fila 1 (búsqueda por nombre).
- `COLUMNAS_NUM`: posiciones fijas. MAESTRA solo NOMBRE=2, TELEFONO=4, ESTADO=8; AGENDA y VALORACIONES completas (VALORACIONES sigue el orden de `appendRow` en `procesarValoracion`).
- `PROP_KEYS` (Script Properties): `DOC_TEMPLATE_ID`, `DRIVE_FOLDER_ID`, `WHATSAPP_MESSAGE`, se editan desde ⚙️ (`PanelAdmin.gs`).
- `PANELES_BAJO_DEMANDA` (true): interruptor de carga diferida de paneles.
- `getSS()` (`WebApp.gs`): hoja vinculada; respaldo `SPREADSHEET_ID`. Úsala en vez de `getActiveSpreadsheet()`.
- `CacheService`: caché de la semana de Agenda (clave `agendaVersion_<sheetId>`); `onEdit` la invalida en hojas cuyo nombre empieza por "Agenda". `LockService` en mover/intercambiar citas, disponibilidad y borrados en `BaseDatos.gs`.

## 5. Cliente-servidor
Patrón: `google.script.run.withSuccessHandler(fn).withFailureHandler(fn).funcion(args)` (~83 usos). Las funciones llamables acaban en `Web` (o son de formulario) y devuelven objetos tipo `{success, message, ...}`.
- `obtenerBaseDatosCompletaWeb` (BaseDatos.gs): headers + pacientes.
- `obtenerAgendaSemanaWeb(fechaISO)` / `obtenerVersionAgendaWeb` (agenda/Web.gs): semana y sondeo de cambios.
- `actualizarCampoAgendaWeb`: edita Asistencia/Notas/Sesión.
- `asignarPacienteHuecoWeb`, `moverCitaWeb`, `intercambiarCitasWeb`, `copiarVariasCitasWeb`, `eliminarVariasCitasWeb`, `restaurarCitasWeb`: gestión de citas.
- `guardarCitasMultiples`, `obtenerSemanasYHuecos` (Cita.gs): formulario de citas.
- `guardarPaciente`, `buscarUsuarioPorDniWeb`, `buscarPosiblesDuplicadosWeb` (Anadir_Usuario.gs); `actualizarPaciente`, `obtenerDatosEdicionPaciente` (Editar_Usuario.gs).
- `procesarValoracion` (Guardar.gs); `obtenerValoracionesWeb`, `actualizarValoracionWeb` (valoraciones/Web.gs).
- `obtenerFichasUsuariosWeb` / `obtenerFichaUsuarioWeb` (ui/Ficha_Usuario.gs).
- `datosWhatsappMaestraWeb`, `datosWhatsappLoteAgendaWeb` (Whatsapp.gs, Web.gs).
- `generarHistoriaClinicaWeb`, `generarHistoriaClinicaRegistroUsuario`, `vincularHistoriaClinicaHuerfana`.
- `obtenerPanelWeb(ruta)`: sirve un panel diferido.
- Recordatorios: `obtenerRecordatoriosWeb`, `guardarRecordatorioWeb` (+ alternar/eliminar).

## 6. Convenciones
- Sufijo `_` = privada (no llamable desde `google.script.run`); también hay prefijo `_` en algunas (`_generarHistoriaClinicaEnFila`).
- Todo HTML se incluye con `<?!= include('carpeta/Archivo'); ?>` (sin extensión, con ruta). `include()` usa `createHtmlOutputFromFile`: NO evalúa scriptlets del archivo incluido. Para evaluar, la página debe servirse con `createTemplateFromFile`.
- Contexto de cierre: `prepararContexto_(template, 'dialogo'|'popup'|'pestana')` + `ui/JS_Cierre_Formulario`.
- CSS: tokens `--md-*` definidos en `ui/CSS_Global.html` (usados en 22 archivos). `--ag-*` definidos en `agenda/Web_Vista.html`; también aparecen en `usuarios/BaseDatos_Vista`, `ui/JS_Selector_Fecha` y `usuarios/Whatsapp_Dialogo`.
- **Paneles laterales**: `Panel_X.html` define `window.PanelX` con `abrir(contenedor, opts)` que devuelve `{haCambiado(), alEscape()}`; CSS acotado (`.pv`, `.pc`). La página los declara con `incluirPanel('ruta/Panel_X', 'PanelX')`, tras `include('ui/JS_Paneles_Diferidos')` (una vez por página).
- **Ficha de usuario compartida**: `<aside class="ficha" id="ficha">` en `BaseDatos_Vista` y `agenda/Web_Vista`; lógica `ui/JS_Ficha`, estilo `ui/CSS_Ficha`, datos `ui/Ficha_Usuario.gs` (carga todas las fichas en segundo plano).
- **Saltos de línea**: 35/37 `.gs` y 32/34 `.html` están en CRLF. Son LF: `ui/JS_Valoraciones_Cache.html`, `ui/Ficha_Usuario.gs`, `usuarios/Dialogo_Nuevo.html`, `usuarios/Anadir_Usuario.gs`. Conserva el estilo de cada archivo al editar. `.gitattributes` fuerza `eol=lf` en git (GitHub Desktop), pero lo subido con `clasp push` desde VS Code es lo local; la mezcla es inofensiva para Apps Script.

## 7. Trampas
1. **Ámbito global**: hoy NO hay funciones top-level duplicadas (comprobado). `findColumnIndex` aparece en `usuarios/Alta.gs:161` y `usuarios/Ordenar.gs:24`, pero son funciones anidadas: inofensivas. Antes de crear una función, haz grep del nombre.
2. **Scriptlets en comentarios**: se evalúan aunque estén en `<!-- -->`. Cabeceras con `include(...)` literal existen en archivos que se cargan con `include()` (`ui/JS_Paneles_Diferidos`, `agenda/Panel_Cita`, `agenda/Panel_Disponibilidad`, `valoraciones/Panel_Valoracion`, `Panel_Valoraciones`, `usuarios/Panel_Editar`, `Whatsapp_Dialogo`, `historia/Panel_Huerfana`). Hoy son inertes; si alguno pasara a servirse como plantilla, se evaluarían. En archivos plantilla (`*_Vista`) no hay ninguno (revisado solo en una línea).
3. **Dónde se incluye**: lo normal es fuera de `<script>`. Excepción: `ui/JS_Modal_Deshacer.html` no tiene `<script>` y se incluye DENTRO de uno (`agenda/Web_Vista.html:1909`, `usuarios/BaseDatos_Vista.html:1368`, `valoraciones/Web_Vista.html:780`).
4. **Paneles nuevos**: hay que añadirlos a `PANELES_DIFERIDOS_` (`core/WebApp.gs`) o `obtenerPanelWeb` lanza "Panel no disponible". `Panel_Recordatorios` y `Whatsapp_Dialogo` van con `include()` a propósito.
5. **Manifiesto vs comentario**: `appsscript.json` dice `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`; el comentario de `WebApp.gs` dice "Solo yo". Revisa quién puede abrir la URL.
6. **Macro huérfana**: `appsscript.json` registra la macro `CopiaraAgenda`, que no existe en el código. El dueño pide dejarla por ahora: no tocarla.
7. **Código muerto probable** (sin referencias): `copiarSiguienteCita2` (`agenda/Siguiente_Semana.gs`, solo en comentarios de Web.gs), `formatFecha` y `getTodayKey` (`agenda/Cita.gs`), `getCalendarEventsForWeek` (`agenda/Semanal.gs`), `generarUrlWhatsappWeb` (`usuarios/Whatsapp.gs`), `testProcesarValoracion`. Archivo sin uso: `usuarios/Dialogo_Nuevo.html` (ningún archivo lo carga). `COLUMNAS_NUM.AGENDA.TELEFONO/SESION` sin uso.
8. **Cache de Agenda**: una escritura que no pase por `agenda/Web.gs` ni `onEdit` deja la semana cacheada (hasta ~90 s según comentario) → llama a `invalidarCacheAgenda_(hoja)`.
9. **Cabeceras escritas a mano**: vistas y formularios tienen cabeceras como "Teléfono 2" en el HTML; renombrar una columna en Sheets exige tocar también esos archivos.

## 8. Recetas
**Botón de menú nuevo**: (1) función en el `.gs` de su carpeta; (2) `.addItem(...)` en `core/Menu.gs`; (3) si abre diálogo: `createTemplateFromFile` + `showModalDialog` como `agenda/Eventos.gs`, con `prepararContexto_(t,'dialogo')`.

**Botón nuevo en la web**: (1) HTML/handler en la `*_Vista.html` de la pestaña; (2) `google.script.run` a una función `...Web`; (3) si es panel, ver receta siguiente.

**Panel lateral nuevo**: (1) `carpeta/Panel_X.html` con `window.PanelX.abrir(...)` (copia `agenda/Panel_Cita.html`); (2) alta en `PANELES_DIFERIDOS_`; (3) `incluirPanel('carpeta/Panel_X','PanelX')` en cada página; (4) llamar `PanelX.abrir(cont, {onGuardado, onCancelar})`.

**Función de servidor para la web**: (1) grep del nombre; (2) añadir en el `Web.gs` de la carpeta (`agenda/Web.gs`, `usuarios/BaseDatos.gs`, `valoraciones/Web.gs`); (3) usar `getSS()` y `SHEETS`/`COLUMNAS`; (4) devolver `{success, ...}`; (5) si escribe en Agenda, invalidar caché.

**Campo nuevo en Maestra**: (1) crear cabecera en la hoja; (2) `COLUMNAS.MAESTRA` en `Config.gs`; (3) formularios: `usuarios/Panel_Nuevo`, `Anadir_Usuario_Vista`, `Panel_Editar`, `Editar_Usuario_Vista` (`Dialogo_Nuevo` no se usa); (4) clave: `guardarPaciente` (`usuarios/Anadir_Usuario.gs`) copia cada campo del formulario a la columna cuya cabecera sea IDÉNTICA al nombre del campo (`datos[cabecera]`), así que el campo del formulario debe llamarse exactamente como la cabecera; no hace falta tocar `guardarPaciente`. Columnas que el formulario nunca rellena: 'Nº', 'Edad', 'Última visita', 'Merged Doc URL - Historias Clínicas'. Arrays se unen con ", " y fechas `AAAA-MM-DD` se convierten a Date. `actualizarPaciente` también mapea por cabecera; (5) tabla en `BaseDatos_Vista` y ficha (`ui/JS_Ficha`) — las columnas extra salen en "Otros datos".

## 9. Despliegue
- **Flujo real del dueño**: edita/sobrescribe el archivo localmente en VS Code → `clasp push` → GitHub Desktop para el repo. Si hay cambios en el editor de Apps Script, hacer `clasp pull` antes.
- `.clasp.json` solo trae `scriptId` (sin `rootDir`): la raíz del repo es el proyecto. `npm install`, luego `clasp pull` / `clasp push`. `package.json` solo tiene `@types/google-apps-script`.
- Servicio avanzado People API. Scopes amplios (Drive, Sheets, Docs, Calendar, Gmail, Contacts) en `appsscript.json`.
- Web App: Implementar > Nueva implementación > Aplicación web (comentario en `WebApp.gs`). El dueño publica **actualizando la implementación existente con una versión nueva** (Implementar > Administrar implementaciones > editar > Nueva versión), así la URL `/exec` no cambia.
- `clasp push` no actualiza la Web App publicada: hace falta la nueva versión.
