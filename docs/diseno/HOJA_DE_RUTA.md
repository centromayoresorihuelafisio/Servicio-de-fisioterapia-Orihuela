# Hoja de ruta: unificar la apariencia visual (trazada el 28-oct-2026)

**Estado (29-oct-2026): V0 a V4 HECHAS y comprobadas por el dueño. V5 (formularios de Agenda) hecha en código, pendiente de que el dueño la compruebe.**

Documentos hermanos, todos en `docs/diseno/` (no se suben con `clasp push`, igual que `CONTEXTO.md`):
- `AUDITORIA.md`: qué está distinto hoy y por qué importa (códigos `I-01`…`I-24`).
- `SISTEMA_DE_DISENO.md`: el aspecto al que se quiere llegar, con valores concretos.
- Este archivo: en qué orden se hace, qué se toca en cada paso y cómo se comprueba.

## 1. Objetivo

Que Agenda, Usuarios, Valoraciones, Estadísticas, la Historia clínica y **todos los formularios** parezcan una sola aplicación: **el mismo color de marca en claro y en oscuro, los mismos campos, los mismos botones, los mismos avisos y el mismo modo de moverse**, sin cambiar lo que hace cada pantalla.

| | Hoy | Al terminar |
|---|---|---|
| Colores principales | teal y azul mezclados; en oscuro, azul | azul `#0b57d0` en claro, azul claro `#8ab4f8` en oscuro |
| Colores escritos a mano | 204 | menos de 40 (solo gráficas) |
| Familias de variables propias | al menos 9 | 1 |
| Botón principal | 3 alturas, 2 jerarquías | 1 altura (40 px), 1 jerarquía (tonal) |
| Campos de texto | 6 formas | 1 estándar + 1 compacto |
| Avisos / confirmaciones | 5 patrones | 1 |
| Efectos al pulsar | 7 comportamientos | 1 |
| Animación | 11 curvas, 42 duraciones | 2 curvas, 4 duraciones, una llave de «reducir movimiento» |
| Foco con teclado | visible en unos formularios sí y en otros no | siempre visible, mismo anillo |

## 2. Reglas de trabajo (se aplican a todas las fases)

1. **Solo cambia el aspecto, nunca el comportamiento.** No se tocan funciones del servidor (`.gs`), nombres de clase o `id` que use el JavaScript, ni el orden de los campos. Si una limpieza obliga a tocar JavaScript, se dice antes y se pide permiso.
2. **Una fase cada vez, cada una en su `.zip`** con la estructura del proyecto (sección 0 de `CONTEXTO.md`), indicando para cada archivo si es nuevo o sobrescribe, y con `CONTEXTO.md` actualizado.
3. **Punto de restauración antes de cada fase**: el dueño hace un *commit* en GitHub Desktop («Antes de V2», etc.). Si algo sale mal, se vuelve a ese punto con `clasp push` y se elige la versión anterior en Implementar > Administrar implementaciones.
4. **Migración en 6 pasos por formulario** (patrón de las fases V4 a V6):
   1. Añadir al HTML las clases nuevas (`md-btn md-btn--tonal`, `md-campo`…) **junto a** las antiguas, sin quitar estas.
   2. Sustituir en el CSS del formulario cada color, esquina, sombra, tamaño y duración por su variable global.
   3. Borrar del CSS del formulario las reglas que ahora da el sistema (botón, campo, girador, foco…).
   4. Quitar las variables propias (`--pc-*`, `--nu-*`…) y los `@keyframes` repetidos.
   5. Quitar las clases antiguas solo si ni el CSS ni el JavaScript las usan (se comprueba con `grep`).
   6. Revisar en los tres temas con la lista de la sección 5.
5. **Los formularios van de uno en uno y empezando por el más sencillo** (`Panel_Editar` hace de piloto). Si el piloto no gusta, se corrige el sistema antes de repetirlo en los demás.
6. **Archivos grandes** (`agenda/Web_Vista.html` 228 KB, `usuarios/BaseDatos_Vista.html` 105 KB…): se edita por sustituciones exactas, se cuentan las ocurrencias antes y después, y se conserva su estilo de salto de línea (CRLF en los que ya lo tienen). No se reescriben enteros ni se lee el archivo completo para buscar algo.
7. **Despliegue**: tras cada fase, `clasp push` y nueva versión de la implementación (Implementar > Administrar implementaciones > editar > Nueva versión), como siempre.
8. **No mezclar con cambios de funciones.** Antes de empezar, las mejoras F1 a F6 (sección 12 de `CONTEXTO.md`) deben estar desplegadas y probadas, para saber si un fallo es de aspecto o de función (ver V0).

## 3. Fases

El orden no es arbitrario: **primero los cimientos y las páginas** (porque los formularios heredan de ellas el color y el tema), **después los formularios de menos a más complejos**, **al final la limpieza**. Cada fase deja la app usable.

| Fase | Nombre | Cambia lo visible | Tamaño |
|---|---|---|---|
| V0 | Decisiones y comprobaciones previas | No | Pequeña (el dueño) |
| V1 | Cimientos del sistema | No (solo añade) | Media |
| V2 | Páginas y tema | **Sí: Usuarios, Valoraciones, Estadísticas, ficha y HC pasan de teal a azul; los paneles de la Agenda dejan de salir claros en oscuro** | Grande |
| V3 | Avisos y diálogos compartidos | Sí, leve | Media |
| V4 | Formularios de Usuarios | Sí | Grande |
| V5 | Formularios de Agenda | Sí | Grande |
| V6 | Valoración, Historia clínica y ficha | Sí | Grande |
| V7 | Estadísticas y cierre | Sí, leve | Media |

---

### V0 · Decisiones y comprobaciones previas — HECHO (28-oct-2026)

**Objetivo**: que no se empiece a escribir código sin acordar el gusto y sin saber qué hay realmente en pantalla.

**Decisiones del dueño** (28-oct-2026; se conservan aunque ya estén aplicadas):

| Código | Decisión | Recomendación inicial | Respuesta del dueño |
|---|---|---|---|
| D-V1 | Color de marca | Teal `#2b5c75` | **Azul `#0b57d0` en toda la app** (cambia la recomendación) |
| D-V2 | Acento en tema oscuro | Teal claro `#8fc7ea` | **`#8ab4f8`**, «el color que usa Google» (es el azul claro que ya usan Usuarios, Agenda, Valoraciones y Estadísticas en oscuro) |
| D-V3 | Fuente | Google Sans (si carga) | **Google Sans** (carga: ver comprobación 1) |
| D-V4 | Retirar `?page=nuevoPaciente` (`Anadir_Usuario_Vista`) | Sí | **Sí, retirarla** |
| D-V5 | Movimiento | Sobrio (sin onda, sin escalado, sin rebote) | **Sobrio** |
| D-V6 | Iconos de la HC | Material Symbols, no SVG propios | **Material Symbols, salvo WhatsApp: se conserva el icono oficial** |
| D-V7 | Banco de pruebas visual interno | Sí | **Sí** |

**Resultado de las comprobaciones en el navegador** (28-oct-2026):
1. **Fuente (I-07)**: en la pestaña Red de Usuarios, filtrada por Fuentes, aparece la petición `css2?family=Google+Sans…` y los ficheros de fuente responden 200. No se ha cotejado el nombre de cada fichero, así que se da por buena la carga (certeza total, opcional: Elements > Computed > Rendered Fonts). En la Agenda el filtro salió vacío porque DevTools se abrió después de cargar la página.
2. **Tema oscuro (I-02)**: el único fallo es el panel lateral de la Agenda (ficha de usuario, Dar cita y Valoración se abren en claro con la Agenda en oscuro). Hallazgo nuevo `I-24`.
3. **Agenda en claro (I-01)**: sin respuesta explícita. No bloquea: D-V1 resuelve la mezcla azul/teal.
4. **Pantalla (I-23)**: solo ordenador. I-23 queda como «no aplica» (V7).
5. **`?page=nuevoPaciente` (I-03)**: sin respuesta sobre marcadores; el dueño acepta retirarla (D-V4). En V4, antes de borrarla, se le pregunta una vez si la tiene en un marcador.

**F1 a F6** (sección 12 de `CONTEXTO.md`): el dueño confirma que F1 a F6 están desplegadas y probadas con éxito (28-oct-2026); sus encabezados en `CONTEXTO.md` ya están corregidos.

**Qué cambia en el plan al elegir el azul**
- **V1 no cambia el valor de ninguna variable que ya exista**. `--md-primary` y su familia (`--md-primary-dark`, `--md-primary-container`, `--md-primary-light`) siguen en teal hasta V2: pasarlas a azul en V1 se vería.
- **V2 es el primer cambio visible**: Usuarios, Valoraciones, Estadísticas, la ficha, la HC y los formularios pasan de teal a azul; la Agenda no cambia en tema claro; en oscuro solo cambia la HC (de teal claro a azul claro) y los paneles de la Agenda dejan de salir claros (`I-24`).
- **Paleta rehecha en azul** en `SISTEMA_DE_DISENO.md`, sección 3.2. Los ◆ ya existen en el código; los ◇ son nuevos y se miran en pantalla tras V2. Leyendo el código se comprobó que casi toda la familia azul ya existe (la Agenda en claro y las cuatro páginas en oscuro), así que el único azul nuevo es `--md-primary-light` en claro (`#e8f0fe`).
- **Contraste** (calculado): azul `#0b57d0` sobre blanco 6,4 a 1; `#8ab4f8` sobre la superficie oscura `#1b1e24` 7,9 a 1. Ambos pasan el 4,5 a 1 que piden las pautas.

**Entrega de Claude**: este paquete con los cuatro documentos actualizados.

**Salida de la fase**: las 7 decisiones respondidas (hecho) y el *commit* «Antes de V1» (hecho por el dueño el 28-oct-2026).

---

### V1 · Cimientos del sistema — HECHO (28-oct-2026; comprobado por el dueño el 29-oct-2026)

**Objetivo**: crear el sistema único **sin que se vea ningún cambio**. Solo se añade; nada existente cambia de valor.

**Archivos**
- `ui/CSS_Global.html` (sobrescribe, crece de 1,7 KB a unos 12 KB):
  - Variables de color con `light-dark()` (tabla 3.2 del sistema) además de las actuales, que no se tocan. Para cada nombre que ya exista con otro valor (`--md-primary`, `--md-primary-dark`, `--md-primary-container`, `--md-primary-light`, que hoy son teal), V1 **deja el valor actual** y solo anota cuál será el final; el cambio a azul se hace en V2. Los nombres nuevos entran ya con su valor final.
  - `--md-outline-strong`, `--md-warning-text`, `--md-scrim`, `--md-toast-bg/-fg`.
  - `--md-shape-*`, `--md-elev-0..3`, `--fs-*`, `--dur-1..4`, `--ease`, `--ease-out`, `--z-*`.
  - `@keyframes md-spin` y `md-entra`.
  - Componentes con prefijo `md-`: `.md-btn` (+ 5 variantes), `.md-campo` (+ compacto), `.md-chip`, `.md-esqueleto`, `.md-girador`.
  - **No** incluye todavía la regla global de foco ni el bloque `prefers-reduced-motion` (entran en V2, porque sí cambian lo visible).
- `docs/diseno/SISTEMA_DE_DISENO.md` (se actualiza si los valores cambian por las decisiones).

**Qué NO cambia**: ninguna página ni formulario. Las clases `.md-*` no las usa nadie todavía.

**Resultado (28-oct-2026)**: `ui/CSS_Global.html` pasa de 1,7 KB a 13 KB y conserva intacto el contenido anterior (se comprobó que el archivo nuevo empieza con el original byte a byte y que las 26 variables de antes valen lo mismo en claro y en oscuro). Revisión de choques con el proyecto entero: ninguna variable ni clase nueva existía ya, salvo `--md-shape-*` y `--md-elev-*` (definidas por su cuenta en `Panel_Valoracion` y `Anadir_Usuario_Vista`, que siguen usando las suyas) y `--ease` (igual en `Panel_HC` y `HC_Vista`: mismo valor). Sin `<?` en el archivo. Se añaden también `@keyframes md-brillo` (esqueleto) y los estados `aria-busy` del botón.

**Resuelve**: base de I-04, I-08, I-09, I-14, I-15, I-16, I-20.

**Riesgos**
- `include()` no evalúa scriptlets y el archivo se incluye en cuatro páginas: **no puede llevar `<?` en ningún sitio, ni en comentarios** (trampa 2 de `CONTEXTO.md`).
- Si un nombre nuevo coincide con uno existente, cambiaría algo. Se hace `grep` de cada variable y clase antes de escribirla (trampa 1).

**Comprobación**
- Automática: `grep` de que ninguna variable nueva existe ya en otro archivo con otro valor; recuento de variables definidas frente a las de la tabla; `node --check` no aplica (solo CSS); revisión de que no hay `<?`.
- Del dueño (3 minutos): abrir las cuatro pestañas en claro y en oscuro: **debe verse exactamente igual que antes**. Cualquier diferencia es un fallo de la fase.

---

### V2 · Páginas y tema — HECHO (29-oct-2026; comprobado por el dueño el 29-oct-2026)

**Objetivo**: que las páginas contenedor usen el sistema y se vea **un solo color de marca**; es el primer cambio visible y el más importante.

**Archivos** (sobrescriben): `agenda/Web_Vista.html`, `usuarios/BaseDatos_Vista.html`, `valoraciones/Web_Vista.html`, `dashboard/Web_Vista.html`, `historia/HC_Vista.html`, `ui/CSS_Global.html` (añade foco global y reducción de movimiento), `ui/CSS_Ficha.html` (solo si lleva colores sueltos).

**Qué cambia**
1. **Un solo azul (I-01)**: las variables de la familia principal de `CSS_Global` (`--md-primary`, `--md-primary-dark`, `--md-primary-container`, `--md-primary-light`) pasan del teal al azul de la tabla 3.2; con eso Usuarios, Valoraciones, Estadísticas, la ficha, la HC y los formularios abiertos desde cualquier pestaña cambian de teal a azul. La Agenda no cambia en claro: `--ag-accent`, `--ag-accent-dark`, `--ag-accent-soft`, `--ag-container`… pasan a ser alias de `--md-primary`, `--md-primary-dark`, etc. (`--ag-accent: var(--md-primary);`, mismo valor `#0b57d0`). Los 92 usos no se tocan. `--ag-accent-dark` (`#004a77`) y `--ag-container` (`#c2e7ff`) ya valen lo mismo que `--md-primary-dark` y `--md-primary-container` claros, y en oscuro los `--ag-*` y los `--md-*` ya coinciden; la excepción es `--ag-accent-soft` (un `rgba`), que se queda como está. Los alias `--ag-*` se retiran en V7.
2. **Un solo tema (I-05)**: se borran los bloques oscuros repetidos de las cuatro páginas (Usuarios tiene 4) y se deja el selector claro / oscuro / auto tal cual (`data-tema`, `temaApp`). El oscuro sale de `CSS_Global` (`light-dark()`). La causa de `I-24` está confirmada en el código (el bloque oscuro de la Agenda define solo `--ag-*`, ninguna `--md-*`, y la ficha y los paneles leen `--md-*`): al mover el oscuro a `CSS_Global`, la ficha, Dar cita y Valoración se abren oscuros en la Agenda.
3. **`HC_Vista` incluye `CSS_Global`** y deja de escribir sus 39 colores; se le añade el mismo selector de tema para que la ficha a página completa y el cajón se vean igual.
4. **Foco global (I-18)**: una regla `:focus-visible` en `CSS_Global` para todos los elementos interactivos.
5. **Reducir movimiento (I-15)**: el bloque `prefers-reduced-motion` único que pone a cero las `--dur-*`.
6. **Capas (I-20)** de las páginas: números sustituidos por `--z-*`.
7. **Fuente (I-07, D-V3)**: según la decisión, se retira la petición de `Roboto Mono` (se usa `--font-mono`) y se arregla la familia.

**Qué NO cambia**: avisos y diálogos (V3); formularios (V4 a V6); gráficas de Estadísticas (V7); ninguna función.

**Resuelve**: I-01, I-05, I-24, I-07 (parcial), I-15 (parcial), I-18 (parcial), I-20 (parcial).

**Riesgos**
- Es el cambio más visible: el dueño notará Usuarios, Valoraciones, Estadísticas, la ficha y la HC pasando de teal a azul (la Agenda no cambia en claro) y, en oscuro, la HC pasando de teal claro a azul claro. Se avisa en la entrega.
- El único tono azul nuevo, `--md-primary-light` en claro (`#e8f0fe`), no se ha visto en pantalla: se revisa con capturas tras V2 y ajustarlo es cambiar una línea de `CSS_Global`.
- Archivos grandes con CRLF: ver regla 6.
- Algunos tonos de la Agenda (`--chip-*`, `--ag-ctl*`) son propios; se mantienen en V2 y se reducen en V7.

**Comprobación**
- Automática: recuento de `--ag-accent` y similares (siguen igual) y de definiciones de color oscuro por página (de 4 a 0); `grep` de `prefers-color-scheme` (solo en `CSS_Global`); sin `<?` nuevos.
- Del dueño (10 minutos, lista de la sección 5, solo las páginas): los tres temas en las cuatro pestañas; el selector de tema sigue funcionando y recuerda la elección tras recargar; la HC a página completa en oscuro; en la Agenda en oscuro, abrir la ficha de usuario, Dar cita y Valoración (deben salir oscuros).

---

### V3 · Avisos y diálogos compartidos — HECHO (29-oct-2026; comprobado por el dueño el 29-oct-2026)

**Objetivo**: un solo aviso emergente y un solo cuadro de confirmación para toda la app (I-19).

**Archivos**: `ui/CSS_Global.html` (añade `.toast-aviso`, `.modal-overlay`, `.modal-box`, `.modal-mensaje`, `.modal-botones` según 9.5), `agenda/Web_Vista.html`, `usuarios/BaseDatos_Vista.html`, `valoraciones/Web_Vista.html` (borran sus copias), `ui/Modal_Deshacer.html` y `ui/JS_Modal_Deshacer.html` (solo si llevan estilo).

**Qué cambia**: esquinas (según 9.5: cuadro de diálogo `--md-shape-lg` = 16 px, aviso emergente `--md-shape-sm` = 8 px; antes 8, 10 y 14 px según la pestaña), sombra, tamaño de letra, fondo del aviso (se unifican `#323232` y `--ag-toast-bg`), capas (`--z-modal`, `--z-toast`), entrada con `md-entra`. Los botones del cuadro pasan a `.md-btn`.

**Qué NO cambia**: `tonoAviso_`, `iconoAviso_`, los textos, los plazos (6 s del aviso de deshacer) ni las funciones `mostrarAviso` / `mostrarToast`. Las confirmaciones internas de los formularios (`nu-conf`, `pvs-conf`, `mostrarFeedback`) se migran en sus fases (V4 a V6).

**Resuelve**: I-19 (en las páginas), I-09 (parcial), I-16 (parcial).

**Comprobación**
- Automática: `grep` de `.modal-box` y `.toast-aviso` (una sola definición, en `CSS_Global`); las funciones de JavaScript que los crean siguen encontrando sus `id`.
- Del dueño (5 minutos): provocar un aviso de cada tono (correcto, aviso, error) en las tres pestañas; eliminar un usuario o una cita (cuadro y aviso de «Deshacer»); en oscuro.

---

### V4 · Formularios de Usuarios — HECHO (29-oct-2026; comprobado por el dueño el 29-oct-2026)

**Objetivo**: Editar y Nuevo con el sistema; es la **fase piloto** del patrón de migración (regla 4).

**Archivos**
- `usuarios/Panel_Editar.html` (sobrescribe, **piloto**: es el más pequeño y ya usa tokens `--md-*` 77 veces).
- `usuarios/Panel_Nuevo.html` (sobrescribe).
- `usuarios/Anadir_Usuario_Vista.html`: **se retira** (D-V4 = sí, 28-oct-2026), y con ella la entrada `nuevoPaciente` de `PAGINAS_WEB` en `core/WebApp.gs`, que pasa a abrir el índice como ya hace `?page=citas`. Dos cautelas: antes de borrarla se pregunta al dueño una vez si tiene `?page=nuevoPaciente` en un marcador, y tocar `core/WebApp.gs` es código de servidor (va contra la regla 1), así que se pide su visto bueno expreso al entregar V4. Con la retirada, «Crear documento de HC» (I-21) desaparece con ella.
- `usuarios/BaseDatos_Vista.html` (si aloja avisos de formulario propios).

**Orden dentro de la fase**: primero `Panel_Editar` solo, el dueño lo mira y aprueba (o corrige el sistema); después `Panel_Nuevo`; después la retirada de la página completa.

**Qué cambia**: botones (`.md-btn--tonal` + `.md-btn--text`, 40 px, rótulo según 9.1), campos (`.md-campo`: 52 px, borde `--md-outline-strong`, foco), esquinas, sombras (se elimina `--elev-3` local y el tinte teal de las sombras), girador `md-spin`, aviso de duplicados y confirmación de `Panel_Nuevo` con el diálogo común, sin rebote (`pe-pop`).

**Qué NO cambia**: orden de campos, validaciones, etiquetas flotantes con icono (es el patrón estándar), búsqueda de duplicados, `guardarPaciente`, `actualizarPaciente`.

**Resuelve**: I-03, I-06, I-10, I-11, I-12, I-13, I-14, I-16, I-19, I-21, I-22 (en parte).

**Comprobación**
- Automática: sin colores hexadecimales en los dos paneles; sin `--pe-*`, `--nu-*`, `--elev-3`, `--radius-lg` locales; una sola altura de botón; ninguna clase antigua que el JavaScript use ha desaparecido (`grep` de `getElementById`/`querySelector` frente al HTML); `node --check` de cada bloque `<script>`.
- Del dueño: lista de la sección 5 para Editar (desde Usuarios y desde Agenda) y Nuevo; crear un usuario de prueba y editar otro, comprobar el duplicado por DNI y que no se pierde nada.

---

### V5 · Formularios de Agenda — HECHO en código (29-oct-2026; pendiente de que el dueño lo compruebe)

**Objetivo**: Dar cita, Disponibilidad y Recordatorios, los selectores y el diálogo de WhatsApp.

**Archivos** (sobrescriben): `agenda/Panel_Cita.html`, `agenda/Panel_Disponibilidad.html`, `agenda/Panel_Recordatorios.html`, `ui/JS_Selector_Fecha.html`, `usuarios/Whatsapp_Dialogo.html`, y de `agenda/Web_Vista.html` solo el bloque del `SelectorUsuario` (`.su-*`).

**Qué cambia**
- `Panel_Cita`: botones y campos al estándar, **desaparece la onda (`pc-ripple`)** (22 referencias), el oscurecer con `brightness`, `--pc-*`, y se añade el foco que le falta (I-18); el mensaje interno `mostrarFeedback` usa el aviso común.
- `Panel_Disponibilidad` y `Panel_Recordatorios`: su acción principal («Aplicar», «Añadir») pasa de contorno a `.md-btn--tonal` (I-12); campos con la variante compacta; se les añade icono donde corresponda (Disponibilidad no tiene ninguno). Los 5 colores de `Panel_Recordatorios` (`#3b82f6`, `#8b5cf6`, `#14a38b`, `#e0a000`, `#e5484d`) pasan a variables de datos `--md-data-*` (son los tipos de recordatorio; se conserva su significado).
- `JS_Selector_Fecha`: variables `--sf-*` sustituidas, el rojo `#e5484d` pasa a `--md-error`, `z-index: 10000` a `--z-popover`; sin respaldo azul.
- `Whatsapp_Dialogo`: variables `--wl-*` sustituidas, se quita la elevación de 1 px al pasar, el campo de mensaje al estándar.
- `SelectorUsuario`: sombras, esquinas y capas al sistema; la hoja inferior en pantallas de 900 px o menos se conserva.

**Qué NO cambia**: la lógica de huecos, F5 (selector al pulsar un hueco), F6 (Disponibilidad dentro de Dar cita), el calendario, la plantilla del mensaje de WhatsApp.

**Resuelve**: I-01 (restos), I-10, I-11, I-12, I-14, I-15, I-16, I-17 (Disponibilidad), I-18, I-19, I-20.

**Comprobación**
- Automática: sin `pc-ripple`, `--pc-*`, `--rc-*`, `--wl-*`, `--sf-*`; hexadecimales fuera de los datos de Recordatorios = 0; foco presente.
- Del dueño: lista de la sección 5 para Cita (desde Agenda y desde la HC), Disponibilidad (desde Agenda y dentro de Dar cita), Recordatorios, el selector de fecha en cada formulario donde aparece, el de usuario al pulsar un hueco y el diálogo de WhatsApp. Dar una cita real de prueba y borrarla.

---

### V6 · Valoración, Historia clínica y ficha — PENDIENTE

**Objetivo**: deshacer la isla de Valoración y alinear la HC y la ficha.

**Archivos** (sobrescriben): `valoraciones/Panel_Valoracion.html`, `valoraciones/Panel_Valoraciones.html`, `historia/Panel_HC.html`, `ui/CSS_Ficha.html`, `ui/JS_Ficha.html` (solo si dibuja estilos).

**Qué cambia**
- `Panel_Valoracion`: **se borra la paleta local `.pv` (46 variables)** y todo pasa a las globales; **queda por fin en oscuro cuando la página es oscura** (I-02). Se retira `Roboto Flex`. Los colores semánticos del dolor y de los analgésicos (`--md-pain-*`, `--md-analg-*`) se mantienen, pero definidos una vez en `CSS_Global` con sus dos temas. Se retiran los escalados y las entradas `pv-fade-*`.
- `Panel_Valoraciones`: pasa de 76 colores escritos a mano (con respaldo `var(--md-x, #fff)`) a variables sin respaldo; botones y confirmación (`.pvs-conf`) al estándar.
- `Panel_HC`: botones al estándar, **se retira la onda (`hc-rip`)**, `color-mix` se conserva (ya es la técnica del sistema), **20 SVG → Material Symbols**, salvo el icono de WhatsApp, que se conserva como el SVG oficial (D-V6), esquinas y tamaños al sistema, foco global. Se mantiene su estructura de tarjetas, el diseño de indicadores y la impresión (A4: `&imprimir=1`).
- `CSS_Ficha`: los 3 tonos de aviso (`#6b4300`, `#9c2a1f`, `#5a2596`) pasan a `--md-warning-text`, `--md-error` y `--md-data-*`.

**Qué NO cambia**: indicadores (dolor, función, analgésicos), cálculo de mejora, caché (`HCCache`, `ValoracionesCache`), guardado de episodios, el cajón ancho de HC.

**Resuelve**: I-02, I-04, I-07, I-10, I-11, I-12, I-14, I-15, I-17, I-18, I-19.

**Riesgos**
- `Panel_HC` es el archivo con más lógica visual (animaciones propias: `hc-pulso`, `hc-esq`, `hc-hoja-entra`, `hc-sube`). Hay que revisar a mano la impresión y la hoja que se superpone a la historia (trampa 13).
- Los SVG sustituidos deben conservar su tamaño y alineación; se hace de dos en dos, con captura antes/después.

**Comprobación**
- Automática: sin `.pv { --md-… }`, sin hexadecimales fuera de las variables semánticas, sin SVG manual salvo el de WhatsApp (D-V6); recuento de `outline: none` sin sustituto = 0.
- Del dueño: lista de la sección 5 para Valoración (desde Usuarios, Agenda, Valoraciones y HC) **en oscuro**, ficha de HC en cajón y en página, imprimir una HC a PDF y comparar con una impresión anterior.

---

### V7 · Estadísticas y cierre — PENDIENTE

**Objetivo**: terminar de retirar lo viejo y dejar medido el resultado.

**Archivos**: `dashboard/Web_Vista.html`, `dashboard/JS_Graficos.html`, `dashboard/JS_Exportar.html` (solo si lleva estilo), `ui/CSS_Global.html` (retira alias y variables viejas), `agenda/Web_Vista.html`, `usuarios/BaseDatos_Vista.html`, `valoraciones/Web_Vista.html`, y (D-V7 = sí) `ui/Guia_Visual.html` (nuevo) y `core/WebApp.gs` (entrada `guiaVisual` en `PAGINAS_WEB`, sin pestaña), `CONTEXTO.md`.

**Qué cambia**
- Estadísticas: sus tonos (`t-azul`, `t-verde`, `t-ambar`) y `--md-texto-secundario`, `--on-warn`, `--on-err`, `--on-purple` pasan a las variables globales; las gráficas leen los colores de datos de `CSS_Global` (hoy `JS_Graficos` fija 9 hexadecimales claros y `Arial`).
- Se retiran los **alias transitorios**: `--ag-*`, `--radius-sm/md/pill`, `--transition`, `--md-texto-secundario`… y `--chip-*` / `--ag-ctl*` si se han reducido.
- I-23 queda como «no aplica»: el dueño usa la app solo en ordenador (V0, comprobación 4). No se unifican ni se añaden puntos de corte y las reglas de pantalla pequeña que ya existen se dejan como están.
- D-V7 = sí: la página interna `?page=guiaVisual` que muestra todos los componentes (botones, campos, avisos, tarjetas, colores) con un conmutador claro / oscuro.
- Sección 6 de `CONTEXTO.md` («CSS: tokens…») se reescribe a lo que quede vigente, y esta hoja de ruta se reduce a «HECHO (fecha)» con las decisiones del dueño (regla de mantenimiento).

**Resuelve**: I-04 (definitivo), I-08, I-20, I-22 (resto). I-23 queda como «no aplica».

**Comprobación final (automática)** — se ejecuta con `grep` sobre todo el proyecto y se anota en `CONTEXTO.md`:

| Medida | Meta |
|---|---|
| Colores hexadecimales fuera de `CSS_Global` | menos de 40 (solo gráficas y datos) |
| Variables con prefijo `--ag-`, `--pc-`, `--nu-`, `--pe-`, `--rc-`, `--wl-`, `--sf-`, `--hc-` | 0 |
| `@keyframes` de girador | 1 (`md-spin`) |
| Valores distintos de `border-radius` | 6 + `50%` |
| `z-index` con número escrito | 0 (solo `var(--z-*)`) |
| `cubic-bezier` fuera de `CSS_Global` | 0 |
| `outline: none` sin sustituto de foco | 0 |
| Archivos con `prefers-color-scheme` | 1 (`CSS_Global`) |
| Ondas (`ripple`) y `scale(` en controles | 0 (sin excepciones: D-V5 = sobrio) |

---

## 4. Orden y motivo

- **V0 antes de todo**: sin las decisiones de color y fuente cualquier trabajo se puede tener que rehacer; y sin confirmar que F1-F6 están desplegados no se sabría si un fallo es de aspecto o de función.
- **V1 antes de V2**: las páginas necesitan que las variables ya existan.
- **V2 antes de los formularios**: los formularios heredan el color y el tema de la página; si se migran antes, quedarían correctos pero sobre una página con otro color.
- **V3 antes de V4-V6**: así los formularios ya pueden usar el diálogo común al migrar su confirmación.
- **V4 antes de V5 y V6** porque `Panel_Editar` es el piloto (el más pequeño, ya casi sobre tokens). V5 (Agenda) antes de V6 porque Dar cita es el más usado y `Panel_HC` el más delicado: conviene llegar a él con el patrón probado.
- **V7 al final** porque solo se pueden retirar los alias cuando nadie los usa.

## 5. Lista de comprobación del dueño (una por fase, solo lo que toque)

Se hace en **claro**, **oscuro** y **auto**. Para cada formulario abierto desde cada pestaña donde se abre:

1. El color de acento (botón principal, foco, enlaces) es **el mismo azul** en todas las pestañas y en los formularios que se abren desde ellas (en oscuro, el azul claro).
2. Hay **un solo botón con relleno** (el principal) y está a la derecha; «Cancelar» es de texto.
3. El **borde de los campos se distingue** del fondo sin esfuerzo, incluso en oscuro.
4. Con la tecla **Tab** se ve siempre dónde está el foco, en campos y botones.
5. La **letra** es la misma que en el resto de la app (sin saltos de una fuente a otra).
6. Al pulsar un botón o enfocar un campo, la respuesta es **suave y breve**, igual en todos los formularios (sin onda, sin rebote).
7. **Esc** cierra el formulario; los avisos y los cuadros de confirmación se ven y se leen igual en todas las pestañas.
8. Nada se ha movido de sitio ni ha cambiado de nombre; lo que se guarda, se guarda igual.

Para una revisión rápida de 5 minutos tras cada fase: puntos 1, 2, 4 y 8 en Usuarios, Agenda y Valoraciones, en claro y en oscuro.

## 6. Riesgos generales

| Riesgo | Mitigación |
|---|---|
| Un cambio de aspecto rompe una función (clase o `id` renombrado) | Regla 1: no se renombra nada que use el JavaScript; `grep` de cada selector antes de entregar; `node --check` de los bloques `<script>` |
| Cambios en archivos de 100-230 KB difíciles de revisar | Sustituciones exactas con recuento antes/después; nunca reescribir enteros; revisar solo el bloque `<style>` |
| `light-dark()` no soportado en algún navegador | Ya lo usa Estadísticas y el dueño confirmó que funciona (sección 11, 23-oct-2026); si algún navegador no lo soporta, el oscuro no se aplicaría: se comprueba en V1 |
| El dueño ve «cambios de más» | Cada entrega dice qué cambia a la vista y qué no; V1 no cambia nada visible |
| Formularios sin tema oscuro revisado nunca | V6 y el banco de pruebas (D-V7) los obligan a verse en oscuro |
| Un tono ◇ del azul queda poco agraciado (no se han visto en pantalla) | Se revisan con capturas tras V2; ajustar uno es una línea de `CSS_Global` |
| Alias que ocultan restos (`--ag-*`) | Se retiran todos en V7 con `grep` de comprobación |
| Se mezcla con trabajo de funciones nuevo | Regla 8; si surge un formulario nuevo antes de terminar, se hace ya con el sistema (sección 13 de `CONTEXTO.md`) |
| Trampa 2 (scriptlets en comentarios) | Ningún archivo de estilo incluido con `include()` lleva `<?` |

## 7. Fuera de esta hoja de ruta

- Cambiar la estructura o la distribución de las pantallas (qué columnas tiene la tabla, dónde está cada botón de la Agenda).
- Nuevas funciones.
- Rendimiento de carga (salvo lo que se gana al borrar CSS duplicado).
- Seguridad y acceso (decisión del dueño, sección 1 de `CONTEXTO.md`).
- Los dos `JS_Paneles_Diferidos.html` idénticos (`ui/` e `historia/`): se mencionan en `AUDITORIA.md` (I-22) pero no son visuales; se deja a decisión del dueño.

## 8. Seguimiento

| Fase | Estado | Fecha | Notas |
|---|---|---|---|
| V0 | HECHO | 28-oct-2026 | 7 decisiones registradas (D-V1 = azul `#0b57d0`; D-V2 = `#8ab4f8`). Commit «Antes de V1» hecho |
| V1 | HECHO | 28-oct-2026 | Comprobado por el dueño (29-oct-2026) |
| V2 | HECHO | 29-oct-2026 | Comprobado por el dueño (29-oct-2026). **Queda para V7**: reglas oscuras sueltas por elemento (`prefers-color-scheme` en Usuarios 1, Agenda 1, Valoraciones 2), alias `--ag-*` restantes, z-index locales 1–4 y los de `Panel_HC`. La barra de selección de la Agenda queda por debajo de los diálogos |
| V3 | HECHO | 29-oct-2026 | Comprobado por el dueño (29-oct-2026). **Queda para V6**: en Valoraciones siguen `.modal-box-ancho`, `.modal-titulo` y el margen de botones del cuadro de edición |
| V4 | HECHO | 29-oct-2026 | Comprobado por el dueño (29-oct-2026). Retirados `?page=nuevoPaciente` y `usuarios/Anadir_Usuario_Vista.html` (con visto bueno del dueño para `core/WebApp.gs`) |
| V5 | HECHO en código | 29-oct-2026 | Pendiente de comprobación del dueño. Comprobación automática: sin `pc-ripple`, `--pc-*`, `--wl-*`, `--sf-*` ni hexadecimales, `rgba`, `cubic-bezier`, milisegundos o `z-index` numéricos en los cinco archivos; `node --check` de cada `<script>` correcto; saltos de línea conservados. Colores de recordatorio en `--md-data-*` (`CSS_Global`). **Queda para V7**: `--rc-c`/`--rc-bg` (los lee `agenda/Web_Vista`) y los `--ag-*` del selector de usuario. **Pendiente de decidir por el dueño**: rótulos «Aplicar» / «Añadir» frente a «Aplicar disponibilidad» / «Añadir recordatorio» (los pone el JavaScript) y si el mensaje interno de Dar cita (`mostrarFeedback`) pasa al aviso emergente común (cambia el comportamiento) |
| V6 | PENDIENTE | | |
| V7 | PENDIENTE | | |

Al terminar cada fase, su estado pasa a «HECHO (fecha)» y se retira el detalle de cómo se hizo (vive en `git log`); se conservan las decisiones del dueño.
