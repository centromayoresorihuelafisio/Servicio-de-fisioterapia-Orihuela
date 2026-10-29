# Auditoría visual de los formularios (28-oct-2026)

Este documento recoge **qué está distinto entre pantallas y por qué importa**. La solución está en `HOJA_DE_RUTA.md`; el aspecto final que se propone, en `SISTEMA_DE_DISENO.md`. Cada hallazgo lleva un código (`I-01`…) que la hoja de ruta cita. **Actualizado el 28-oct-2026**: se añade `I-24` (paneles de la Agenda en oscuro), se anotan las respuestas del dueño a las comprobaciones (sección F) y se aplican sus decisiones (el azul como marca; ver `HOJA_DE_RUTA.md`, V0).

## A. Qué se revisó y cómo se midió

**Pantallas revisadas** (todas las que el usuario ve y toca):

| Tipo | Archivos |
|---|---|
| Páginas contenedor | `agenda/Web_Vista`, `usuarios/BaseDatos_Vista`, `valoraciones/Web_Vista`, `dashboard/Web_Vista`, `historia/HC_Vista` |
| Formularios en panel lateral | `agenda/Panel_Cita`, `agenda/Panel_Disponibilidad`, `agenda/Panel_Recordatorios`, `usuarios/Panel_Editar`, `usuarios/Panel_Nuevo`, `valoraciones/Panel_Valoracion`, `valoraciones/Panel_Valoraciones`, `historia/Panel_HC` |
| Formulario de página completa | `usuarios/Anadir_Usuario_Vista` (`?page=nuevoPaciente`) |
| Piezas compartidas | `ui/CSS_Global`, `ui/CSS_Ficha`, `ui/JS_Selector_Fecha`, `usuarios/Whatsapp_Dialogo`, avisos y modales de cada página |

**Método**: lectura de `CONTEXTO.md` y recuento automático sobre el CSS (`<style>`) de los 30 archivos `.html`, más lectura de los bloques concretos de botones, campos, avisos y diálogos.

**Límites** (para no sacar conclusiones de más):
- Los recuentos miran solo el CSS escrito en los archivos. No ven los estilos que el JavaScript pone al dibujar (`style="…"` generado) ni lo que el navegador realmente aplica. Son cifras **indicativas**, no exactas al uso.
- No se ha abierto la web real: no se ha visto cómo se renderiza, solo cómo está escrito. Lo marcado **POR CONFIRMAR** hay que mirarlo en pantalla.
- Se ha medido el CSS de la app. El dashboard (Estadísticas) se incluye como referencia de lo que ya está bien hecho, y solo se propone tocarlo en la última fase.

## B. Resumen en cifras

| Qué se cuenta | Hoy | Debería ser |
|---|---|---|
| Colores principales distintos | 3 (teal `#2b5c75` y azul `#0b57d0` en claro; azul `#8ab4f8` en oscuro) | 1 por tema (2 en total): azul `#0b57d0` en claro y `#8ab4f8` en oscuro (decisión del dueño, 28-oct-2026) |
| Colores hexadecimales distintos escritos a mano | 204 | menos de 40 (solo los de las gráficas) |
| Tamaños de letra distintos | 71 | 9-10 |
| Valores distintos de esquinas redondeadas | 39 | 6 |
| Sombras distintas | 89 | 4 niveles |
| Curvas de animación distintas | 11 | 2 |
| Duraciones de animación distintas | 42 | 4 |
| Niveles de capa (`z-index`) distintos | 23 (hasta 10000) | 8 con nombre |
| Familias de variables CSS propias (`--md`, `--ag`, `--pc`, `--nu`, `--pe`, `--rc`, `--wl`, `--sf`, `--hc`…) | al menos 9 | 1 |
| Alturas de botón principal | 3 (38, 40 y 48 px) | 1 (40 px) |
| Formas de hacer un aviso de confirmación | 5 | 1 |

## C. Incongruencias

Gravedad: **Alta** = se nota a simple vista o rompe algo; **Media** = se nota al comparar dos pantallas; **Baja** = limpieza.

### C1. Color y tema

**I-01 · Dos colores principales según la pestaña. Gravedad: Alta.**
- Usuarios, Valoraciones, Estadísticas, la ficha y la HC usan el teal `#2b5c75` (`--md-primary`, de `ui/CSS_Global`): entre 23 y 27 usos cada una.
- La Agenda usa el azul `#0b57d0` (`--ag-accent`): 92 usos, **ninguno** del teal.
- Los formularios que se abren desde la Agenda (Cita, Editar, Disponibilidad, HC) usan el teal. Resultado en tema claro: **dentro de la Agenda conviven azul (la página) y teal (los formularios) en la misma pantalla**.
- El selector de fecha (`ui/JS_Selector_Fecha`) y el diálogo de WhatsApp tienen el azul como color de respaldo, así que según dónde se abran pueden salir de uno u otro color.
- **Resolución (28-oct-2026)**: el dueño elige el azul `#0b57d0` como único color de marca (D-V1). La Agenda no cambia en tema claro; Usuarios, Valoraciones, Estadísticas, la ficha, la HC y los formularios pasan del teal al azul.

**I-02 · Valoración es una isla con su propia paleta. Gravedad: Alta.**
`valoraciones/Panel_Valoracion` redefine dentro de `.pv` 46 variables (azul `#0b57d0`, superficies `#f8fafd`, comentario «Adaptado a Tema Google Tasks»). No tiene ninguna regla de tema oscuro. Por tanto, **con el tema oscuro, el formulario de Valoración sigue en claro** dentro de una página oscura. **POR CONFIRMAR** mirándolo en pantalla.

**Comprobado por el dueño (28-oct-2026)**: según él, el único sitio donde los paneles salen en claro con la página en oscuro es el panel lateral de la Agenda (ficha de usuario, Dar cita y Valoración). Por tanto la paleta propia de Valoración no es, por sí sola, la causa de lo que se ve: ver `I-24`. Sigue siendo cierto que `Panel_Valoracion` no tiene reglas de tema oscuro propias; se resuelve en V6.

**I-03 · Otra paleta aparte en el formulario de página completa. Gravedad: Media.**
`usuarios/Anadir_Usuario_Vista` define sus propias 46 variables (teal, pero con tonos propios: borde `#737c81`, error `#b63636`, fondo `#fafbfe`) y no tiene tema oscuro. Además **no hay ningún botón que la abra**: solo se llega escribiendo `?page=nuevoPaciente` (los botones «Añadir usuario» abren `Panel_Nuevo`, que hace lo mismo). Ver también I-19.
**Decisión (D-V4, 28-oct-2026)**: el dueño acepta retirar esta página.

**I-04 · El mismo nombre de variable vale cosas distintas. Gravedad: Alta (porque es una trampa).**

| Variable | `ui/CSS_Global` | `Anadir_Usuario_Vista` | `Panel_Valoracion` |
|---|---|---|---|
| `--md-primary` | `#2b5c75` | `#2b5c75` | `#0b57d0` |
| `--md-primary-container` | `#c9e4f5` | `#e0f1fc` | `#c2e7ff` |
| `--md-outline` | `#dadce0` | `#737c81` | `#747775` |
| `--md-error` | `#c5221f` | `#b63636` | `#b3261e` |
| `--md-shape-full` | no existe | `100px` | `1000px` |

Quien edite un formulario creyendo que `--md-outline` es «el borde» obtiene un resultado distinto según el archivo.

**I-05 · El tema oscuro está repetido y cambia la marca. Gravedad: Alta.**
- Las páginas Agenda, Usuarios, Valoraciones y Estadísticas tienen selector claro / oscuro / auto (`data-tema`, clave `temaApp`). Cada una **repite su propio bloque oscuro** (Usuarios lo tiene en 4 sitios). Solo Estadísticas usa `light-dark()` (35 usos), la forma moderna de escribirlo una sola vez.
- En oscuro, Usuarios, Agenda, Valoraciones y Estadísticas pasan al azul `#8ab4f8`: **la marca teal de día pasa a azul de noche**. Sin embargo `historia/HC_Vista` usa en oscuro el teal claro `#8fc7ea`. Resultado: la misma ficha de HC se ve con otro color de acento si se abre en página completa o como cajón dentro de Usuarios.
- `HC_Vista` no tiene selector de tema (solo sigue al sistema) y escribe 39 colores distintos a mano.
- Los formularios heredan el tema de la página donde están. Esto funciona salvo en las excepciones I-02 y I-03 y, según el dueño, en el panel lateral de la Agenda (`I-24`).
- **Resolución (28-oct-2026)**: con el azul como marca (D-V1) y `#8ab4f8` en oscuro (D-V2), de noche ya es el correcto en las páginas que tienen selector; en oscuro solo cambia la HC (de teal claro a azul claro).

**I-06 · Bordes de campo casi invisibles en claro. Gravedad: Media (accesibilidad).**
Los campos de Cita, Editar y Nuevo dibujan su borde con `--md-outline` global (`#dadce0`), que frente al blanco tiene un contraste de **1,4 a 1**. Las pautas de accesibilidad (WCAG 1.4.11) piden 3 a 1 para el borde de un campo. Los formularios de Valoración y de página completa sí usan un gris más oscuro (`#747775`, 4,5 a 1). Es decir, el mismo tipo de campo se ve «tenue» en unos formularios y «marcado» en otros. En oscuro, el borde `#333944` sobre `#1b1e24` también queda en 1,4 a 1.

**I-24 · Los paneles laterales de la Agenda salen en claro con la página en oscuro. Gravedad: Alta.** *(hallazgo del 28-oct-2026)*
- Lo ha visto el dueño: con la Agenda en tema oscuro, el panel lateral se abre en claro tanto con la ficha de usuario como con Dar cita y con Valoración. Según él, en Usuarios y Valoraciones no ocurre.
- **Causa confirmada leyendo el código (28-oct-2026)**: el bloque oscuro de la Agenda (`agenda/Web_Vista.html`, los dos selectores `:root:not([data-tema])` y `:root[data-tema="oscuro"]`) define solo variables `--ag-*` y ninguna `--md-*`. La ficha (`ui/CSS_Ficha`) y los paneles leen `--md-*`, que en la Agenda salen siempre de `ui/CSS_Global` (claras), y por eso se abren claros. Usuarios, Valoraciones y Estadísticas sí redefinen las `--md-*` en oscuro.
- Se corrige de raíz en V2 (hecho el 29-oct-2026 y comprobado por el dueño el mismo día): el tema oscuro se define una sola vez en `CSS_Global`.

### C2. Tipografía

**I-07 · Tres familias de letra y una no llega a cargarse. Gravedad: Media.**
- `--font` global: Google Sans, Segoe UI, Arial.
- `Panel_Valoracion` usa `Roboto Flex` (`--md-font`), pero **solo `Anadir_Usuario_Vista` la descarga**. En Agenda, Usuarios y Valoraciones el navegador no la tiene y cae a `system-ui`: el formulario de Valoración se ve con una letra distinta de las demás.
- `Panel_Editar` pide `Roboto Mono`, que solo carga Usuarios: en la Agenda cae a una monoespaciada cualquiera.
- `dashboard/JS_Graficos` fija `Arial`.
- **POR CONFIRMAR**: comprobar en las herramientas del navegador (pestaña Red / Fuentes) si `Google Sans` llega a cargarse de verdad desde Google Fonts. Si no, toda la app ya se ve con Segoe UI o Arial sin que nadie lo haya decidido.
- **Comprobado (28-oct-2026)**: en la pestaña Red de Usuarios, filtrada por Fuentes, aparece la petición `css2?family=Google+Sans…` y los ficheros de fuente responden 200 (varios desde la caché de memoria). No se ha cotejado el nombre de cada fichero, así que se da por buena la carga de Google Sans (D-V3). Certeza total, opcional: Elements > Computed > Rendered Fonts. También se ve cargar `Roboto Mono` en Usuarios, como decía este punto. La primera prueba, en la Agenda, salió vacía porque DevTools se abrió después de cargar la página.

**I-08 · 71 tamaños de letra. Gravedad: Media.**
Se mezclan `rem` y `px` para lo mismo (`.875rem` frente a `14px`), y hay valores sueltos como `.72rem`, `.78rem`, `.82rem`, `.85rem`, `12px`, `14.5px`. El peso de letra de los botones oscila entre 500 y 600.

### C3. Forma y medidas

**I-09 · 39 valores de esquina. Gravedad: Media.**
Los campos de texto tienen 12 px en Cita, Editar, Nuevo y Valoración, y 16 px en la página completa. Las tarjetas y diálogos usan 8, 10, 12, 14, 16, 18 y 20 px. Los botones «píldora» se escriben de 7 formas (`999px`, `99px`, `100px`, `1000px`, `50px`, `var(--md-shape-full)`, `var(--radius-pill)`).
Un caso concreto: el cuadro de confirmación (`.modal-box`) tiene esquina de 14 px en Agenda y Valoraciones y de 8 px en Usuarios (`var(--radius-md)`).

**I-10 · Botones de tres alturas. Gravedad: Media.**
38 px (Disponibilidad, Recordatorios, HC), 40 px (Cita, Editar, Nuevo, Valoración) y 48 px (página completa). Relleno horizontal de 1,2 a 2 rem; interletrado distinto.

**I-11 · Los campos no tienen una sola forma. Gravedad: Alta.**

| Formulario | Altura | Borde | Etiqueta |
|---|---|---|---|
| Cita | por relleno | 1,5 px | flotante, icono a la izquierda |
| Editar y Nuevo | 52 px | 1,5 px | flotante, icono a la izquierda |
| Página completa | por relleno | 1,5 px | flotante, icono a la izquierda |
| Valoración | por relleno | **1 px** | flotante, icono a la izquierda |
| Disponibilidad y Recordatorios | sin medir | sin medir | **fija encima del campo** (`.dsp-campo > span`) |
| WhatsApp (mensaje) | libre | 1 px | sin etiqueta, esquina 14 px |
| HC | filas sin borde | — | etiqueta a la izquierda |

### C4. Botones

**I-12 · Dos jerarquías de botón sin regla. Gravedad: Alta.**
- Cita, Editar, Nuevo, Valoración y página completa: la acción principal es **tonal** (fondo `--md-primary-container`) y las secundarias son de texto o «fantasma» (sin relleno).
- Disponibilidad, Recordatorios, HC, el diálogo de WhatsApp y el listado de Valoraciones: **todas** las acciones son de **contorno**, incluida la principal («Aplicar», «Añadir»). En esas pantallas no se distingue qué botón es el importante.

**I-13 · Rotulado de los botones. Gravedad: Baja.**
«Guardar usuario» (Panel_Nuevo) frente a «Guardar Usuario» (página completa); «Guardar Valoración» con mayúscula; «Guardar» a secas en Valoraciones; «Aplicar» y «Añadir» en Disponibilidad. Conviene una regla: verbo + sustantivo en minúscula («Guardar usuario», «Guardar valoración»).

### C5. Efectos y movimiento

**I-14 · Cada formulario reacciona de una forma distinta al pulsar. Gravedad: Alta (es lo que más se nota al usar la app).**

| Formulario | Al pasar el ratón / pulsar |
|---|---|
| Cita | onda («ripple») + oscurece 3 % + sombra |
| Editar, Nuevo | oscurece 3 % |
| Valoración | capa translúcida (`::after`) + escalado leve |
| Página completa | onda + capa translúcida + 21 usos de escalado y 19 de desplazamiento (`translateY`) |
| HC | onda + fondo suave |
| Disponibilidad, Recordatorios | solo fondo suave |
| WhatsApp | se eleva 1 px + sombra |

**I-15 · Movimiento sin criterio común. Gravedad: Media.**
- 11 curvas distintas, 42 duraciones (de 0,03 s a 1,8 s). Varias con «rebote» (`cubic-bezier(.34,1.56,.64,1)` y parecidas) en Editar, Página completa y, más leve, Valoración, que contrastan con el resto, que es sobrio.
- El **girador de carga está escrito 5 veces** (`pc-spin`, `pe-spin`, `nu-spin`, `pv-spin`, `spin`).
- Las entradas «fade-up / fade-down» se repiten con otro nombre en `Anadir_Usuario_Vista` (`md-fade-*`) y `Panel_Valoracion` (`pv-fade-*`).
- **`prefers-reduced-motion`** (respeto a quien desactiva animaciones en su sistema) solo se aplica en 7 archivos (Agenda, Estadísticas, HC, ficha, selector de fecha, WhatsApp, gráficas). **No** se aplica en Cita, Editar, Nuevo, Valoración, página completa, ni en las páginas Usuarios y Valoraciones.

**I-16 · Sombras sin escala. Gravedad: Media.**
89 variantes. Unas están teñidas de teal (`rgba(43,92,117,…)`, en Cita y Nuevo), otras son grises neutras (`rgba(60,64,67,…)`, en Editar) y los avisos usan negro puro. Hay además nombres propios para lo mismo (`--pc-elev-1`, `--nu-elev-2`, `--elev-3`, `--md-elev-1`).

### C6. Iconos y foco

**I-17 · Iconos de dos orígenes. Gravedad: Baja.**
Toda la app usa Material Symbols (tipografía de iconos), salvo `historia/Panel_HC` que dibuja **20 iconos SVG a mano**, y `Panel_Disponibilidad`, que no usa ninguno. Los SVG de la HC no heredan el grosor ni el relleno del resto.

**I-18 · El anillo de foco por teclado cambia de un formulario a otro. Gravedad: Media (accesibilidad).**
Entre los formularios, `:focus-visible` aparece en 8 (Disponibilidad, Recordatorios, Nuevo, página completa, Valoración, Valoraciones, WhatsApp y selector de fecha) y con tres estilos: contorno de 2 px con separación (Valoración, Disponibilidad, WhatsApp), de 3 px (página completa) y sombra circular (Nuevo). **Cita, Editar y HC no tienen ninguna regla `:focus-visible`**, así que con el teclado un botón puede no mostrar dónde está el foco.

### C7. Avisos, diálogos y capas

**I-19 · Cinco maneras de pedir confirmación o avisar. Gravedad: Alta.**
1. `modal-overlay / modal-box / toast-aviso` copiados en Agenda, Usuarios y Valoraciones, con diferencias (esquina 14 px frente a 8 px; fondo del aviso `var(--ag-toast-bg)` frente a `#323232`).
2. `*-dup` en `Anadir_Usuario_Vista`.
3. `.nu-aviso` y `.nu-conf` en `Panel_Nuevo`.
4. `.pvs-conf` en `Panel_Valoraciones`.
5. El mensaje interno de `Panel_Cita` (`mostrarFeedback`).

**I-20 · 23 niveles de capa. Gravedad: Baja (pero riesgo de «esto sale tapado»).**
Desde 1 hasta 10000 (selector de fecha) y 2000 (página completa), pasando por 900, 1000, 1100, 1190, 1200, 1300, 1400, 1500. No hay orden escrito de quién queda encima de quién.

### C8. Textos y código sobrante

**I-21 · Un texto contradice la app. Gravedad: Media.**
`Anadir_Usuario_Vista` ofrece «Crear documento de HC», pero la HC es ya una ficha web sin Docs (`CONTEXTO.md`, sección 10).

**I-22 · Código repetido que dificulta mantener el diseño. Gravedad: Baja.**
- `usuarios/Anadir_Usuario_Vista` (68 KB) y `usuarios/Panel_Nuevo` (52 KB) hacen lo mismo con aspecto distinto (I-03).
- `ui/JS_Paneles_Diferidos.html` y `historia/JS_Paneles_Diferidos.html` son **idénticos byte a byte** (comprobado con `cmp`). No es visual, pero conviene saberlo antes de tocar la carga de paneles.

**I-23 · Ocho puntos de corte para pantallas pequeñas. Gravedad: Baja.**
`420, 480, 600, 720, 760, 900, 1200, 1499` px. Los formularios (Cita, Editar, Disponibilidad, Recordatorios, Valoración) no tienen ningún `@media`; la HC usa `@container`. No se sabe si es voluntario.
- **Respuesta del dueño (28-oct-2026)**: usa la app solo en ordenador. I-23 queda como «no aplica»: no se unifican puntos de corte ni se trabaja la versión móvil; las reglas de pantalla pequeña que ya existen se dejan como están.

## D. Lo que ya está bien (conviene copiarlo, no cambiarlo)

- **Estadísticas** define sus tonos con `light-dark()` una sola vez y respeta `prefers-reduced-motion`. Es el modelo técnico para el tema.
- **Ningún emoji** en la interfaz (decisión del 27-oct-2026): los iconos vienen de una sola fuente.
- Los avisos deducen su tono (ok / aviso / error) de la primera línea del texto (`tonoAviso_`). Es un buen mecanismo y se conserva.
- Los formularios van **acotados** a su clase (`.pc`, `.pe`, `.nu`, `.pv`): un cambio de estilo en uno no se escapa a otro. Esto hace segura la migración de uno en uno.
- Las etiquetas flotantes con icono a la izquierda (Cita, Editar, Nuevo, Valoración, página completa) son un patrón reconocible común: se mantiene como forma de campo estándar.
- `ui/CSS_Global` ya existe y ya lo incluyen cuatro páginas: es el sitio natural para el sistema único.

## E. Mapa de dependencias (qué toca a qué)

```
ui/CSS_Global  <-- incluida por: agenda/Web_Vista, usuarios/BaseDatos_Vista,
                                 valoraciones/Web_Vista, dashboard/Web_Vista
                   NO incluida por: historia/HC_Vista, usuarios/Anadir_Usuario_Vista

Panel_Cita, Panel_Disponibilidad, Panel_Valoracion(es), Panel_Editar, Panel_HC
   --> viven dentro de Agenda y Usuarios (y Valoraciones/HC los suyos)
   --> heredan variables de la página donde se abren
Panel_Nuevo --> solo dentro de Usuarios
```

Consecuencia: **un formulario puede verse distinto según desde qué pestaña se abra**, y esa es la razón de fondo de I-01, I-05 y I-07.

## F. Comprobaciones del dueño (28-oct-2026)

Respuestas a los cinco puntos «POR CONFIRMAR» de la Fase V0 (`HOJA_DE_RUTA.md`):

| Comprobación | Resultado |
|---|---|
| 1. Fuente (I-07) | Google Sans se pide a Google Fonts y los ficheros responden 200 (ver I-07). |
| 2. Valoración en oscuro (I-02) | Solo falla el panel lateral de la Agenda (ficha, Dar cita, Valoración). Hallazgo nuevo `I-24`. |
| 3. Agenda en claro (I-01) | Sin respuesta explícita. No bloquea: D-V1 resuelve la mezcla azul/teal. |
| 4. Pantalla (I-23) | Solo ordenador. I-23 queda como «no aplica». |
| 5. `?page=nuevoPaciente` (I-03) | Sin respuesta sobre marcadores; el dueño acepta retirarla (D-V4). En V4, antes de borrarla, se le pregunta una vez si la tiene en un marcador. |
