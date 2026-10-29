# Sistema de diseño objetivo — Servicio de Fisioterapia Orihuela

Este es **el aspecto al que se quiere llegar**. Sirve de referencia para la hoja de ruta (`HOJA_DE_RUTA.md`) y para cualquier formulario futuro. Los problemas actuales están en `AUDITORIA.md` (códigos `I-01`…).

**Estado de los valores**: todo lo de aquí es una **propuesta**. Los valores marcados con ◆ salen de colores que ya existen en el código (no hay nada nuevo que el dueño no haya visto); los marcados con ◇ son nuevos o ajustados y hay que mirarlos en pantalla antes de darlos por buenos. Las decisiones que dependen del gusto del dueño están en la sección 10 de este archivo y en la Fase V0 de la hoja de ruta. **Actualizado el 28-oct-2026** con las decisiones del dueño: marca azul `#0b57d0` (D-V1) y acento oscuro `#8ab4f8` (D-V2); en la familia azul, los ◆ son colores que ya existen en el código (Agenda, Valoración y las páginas en oscuro) y los ◇ son nuevos.

## 1. Principios (la idea en cinco líneas)

1. **Sobrio y clínico**: una sola marca (el azul de Google), mucho blanco, sombras casi invisibles. La pantalla transmite orden y calma, no decoración.
2. **Una forma de hacer cada cosa**: un botón principal, un campo, un aviso. Si algo nuevo parece necesitar otro estilo, primero se pregunta si encaja en uno de los existentes.
3. **El movimiento informa, no entretiene**: solo se anima lo que ayuda a entender un cambio (un panel que entra, un campo que se enfoca). Nada rebota ni se agranda.
4. **Claro y oscuro con el mismo carácter**: los dos temas usan los mismos nombres de variable; cambiar de tema no cambia la marca.
5. **Se puede usar con teclado y con poca vista**: el foco siempre se ve, los bordes se distinguen y el texto tiene contraste suficiente.

## 2. Dónde vive el sistema

- **Un solo archivo**: `ui/CSS_Global.html` (ya lo incluyen Agenda, Usuarios, Valoraciones y Estadísticas; se añadirá a `historia/HC_Vista`). Contiene los tokens (variables), el tema claro/oscuro y los componentes comunes (botón, campo, aviso, diálogo, girador).
- **Los paneles siguen acotados** a su clase (`.pc`, `.pe`, `.nu`, `.pv`, `.hc`…) pero **solo para su disposición** (qué va dónde). Colores, esquinas, sombras, tiempos y alturas salen siempre de las variables globales.
- **Ya no habrá variables propias por formulario** (`--pc-*`, `--nu-*`, `--pe-*`, `--rc-*`, `--wl-*`, `--sf-*`, `--ag-*`): se sustituyen por las globales. Las dos paletas con nombres `--md-*` locales (Valoración y página completa) desaparecen.
- **Nombres**: se conserva el prefijo `--md-` para color (ya está en uso en toda la app) y para forma y sombra, con los nombres que **ya usan** `Valoración` y la página completa (`--md-shape-*`, `--md-elev-*`, con los mismos valores numéricos que tienen hoy). Se añaden `--dur-*`, `--ease`, `--ease-out`, `--fs-*` y `--z-*`. Solo existe un significado por nombre (I-04).
- **Compatibilidad durante la migración**: ningún nombre que ya exista cambia de valor hasta que lo usen solo variables nuevas. Es decir: `--radius-sm`, `--radius-md`, `--radius-pill` y `--transition` (los de `CSS_Global` de hoy, que valen 4 px, **8 px**, 50 px y 150 ms) se quedan como están y se retiran en la última fase; los nuevos no los pisan. Del mismo modo, `--md-primary`, `--md-primary-dark`, `--md-primary-container` y `--md-primary-light` existen hoy con valor teal: **pasan a azul en V2, no en V1** (V1 no cambia nada visible). Los componentes nuevos llevan prefijo `md-` (`.md-btn`, `.md-campo`…) para no chocar con las clases `.btn`, `.field` o `.campo` que ya tienen los formularios.

## 3. Color

### 3.1 Tema claro y oscuro: se escribe una sola vez

Cada variable de color se define **una vez** con `light-dark(claro, oscuro)` (ya lo usa Estadísticas con 35 definiciones), en `:root`, con el selector de tema existente:

```css
:root                         { color-scheme: light dark; }          /* auto: sigue al sistema */
:root[data-tema="claro"]      { color-scheme: light; }
:root[data-tema="oscuro"]     { color-scheme: dark; }
/* --md-primary: light-dark(#0b57d0, #8ab4f8);  ← una línea por variable, sin bloques repetidos */
```

Así desaparecen los bloques oscuros duplicados de cada página (I-05) y el selector claro / oscuro / auto (`temaApp`) sigue funcionando igual.

### 3.2 Tabla de colores

| Variable | Claro | Oscuro | Uso |
|---|---|---|---|
| `--md-primary` | `#0b57d0` ◆ (Agenda y Valoración) | `#8ab4f8` ◆ (páginas en oscuro) | Marca: enlaces, foco, borde de campo activo, icono principal. 6,4 a 1 sobre blanco; 7,9 a 1 el oscuro sobre `surface` |
| `--md-on-primary` | `#ffffff` ◆ | `#0b2544` ◆ (7,3 a 1 sobre `#8ab4f8`) | Texto sobre un fondo `primary` |
| `--md-primary-dark` | `#004a77` ◆ (de la Agenda; 7,2 a 1 sobre `primary-container`) | `#c2e7ff` ◆ (7,0 a 1 sobre `primary-container`) | Texto sobre `primary-container` |
| `--md-primary-container` | `#c2e7ff` ◆ (Agenda y Valoración) | `#274a72` ◆ | **Fondo del botón principal** (tonal), chips seleccionados |
| `--md-primary-light` | `#e8f0fe` ◇ | `#1f3a5a` ◆ | Fondo suave al pasar el ratón, filas seleccionadas |
| `--md-bg` | `#f8f9fa` ◆ | `#121418` ◆ | Fondo de página |
| `--md-surface` | `#ffffff` ◆ | `#1b1e24` ◆ | Tarjetas, paneles, diálogos |
| `--md-surface-variant` | `#f1f3f4` ◆ | `#242830` ◆ | Campos desactivados, cabeceras de tabla, zonas hundidas |
| `--md-on-surface` | `#202124` ◆ | `#e6e8ee` ◆ | Texto principal |
| `--md-on-surface-med` | `#5f6368` ◆ | `#aab1c0` ◆ | Texto secundario |
| `--md-on-surface-low` | `#80868b` ◆ | `#7f8797` ◆ (4,6 a 1) | Texto de ayuda, marcadores (no para información clave: 3,7 a 1) |
| `--md-outline` | `#dadce0` ◆ | `#333944` ◆ | **Solo separadores y bordes de tarjeta** (decorativos) |
| `--md-outline-strong` | `#80868b` ◇ (3,7 a 1 sobre blanco) | `#6b7480` ◇ (3,5 a 1 sobre `#1b1e24`) | **Borde de campos y controles** (soluciona I-06) |
| `--md-success` / `-bg` | `#137333` / `#e6f4ea` ◆ | `#7fd39b` / `#173a24` ◆ | Correcto, Asistido, Activo |
| `--md-error` / `-bg` | `#c5221f` / `#fce8e6` ◆ | `#f2b8b5` / `#3b1f1e` ◆ | Error, No asistido, Eliminar |
| `--md-warning` | `#f29900` ◆ | `#f0c66a` ◆ | Solo **relleno e iconos** (contraste 2,1 con su fondo: no sirve para texto) |
| `--md-warning-text` | `#8a5d1a` ◆ (5,4 a 1) | `#f0c66a` ◆ | **Texto** de aviso (hoy hay 4 marrones distintos: `#8a5d1a`, `#a15c00`, `#b05e00`, `#6b4300`) |
| `--md-warning-bg` | `#fef7e0` ◆ | `#3a3120` ◆ | Fondo de aviso |
| `--md-scrim` | `rgba(32,33,36,.50)` ◆ | `rgba(0,0,0,.60)` ◇ | Velo detrás de diálogos |
| `--md-toast-bg` / `-fg` | `#323232` / `#ffffff` ◆ | `#2d3038` ◆ / `#e6e8ee` ◇ | Aviso emergente |

**Decisión de color (D-V1 y D-V2, 28-oct-2026)**: el dueño elige el **azul `#0b57d0` como único color de marca** (la recomendación inicial era el teal) y, en oscuro, **`#8ab4f8`**, «el color que usa Google». Es el azul que ya usan la Agenda (92 usos) y el formulario de Valoración, y en oscuro el que ya llevan Usuarios, Agenda, Valoraciones y Estadísticas: **la marca no cambia de color por la noche**. La Agenda no cambia en claro; el resto de la app pasa del teal al azul. Contrastes calculados: azul sobre blanco 6,4 a 1 (el teal daba 7,3); `#8ab4f8` sobre `surface` oscura 7,9 a 1; el azul sobre `primary-container` claro, 4,9 a 1.

**Notas de uso del azul**
- En oscuro, `--md-primary` **no** se usa como texto sobre `--md-primary-container` (4,3 a 1, por debajo de 4,5): para texto sobre el botón tonal se usa `--md-primary-dark`.
- Casi toda la familia azul sale del código y por eso en oscuro V2 no cambia nada: `--ag-accent`, `--ag-accent-dark` (`#004a77`) y `--ag-container` (`#c2e7ff`) valen lo mismo que `--md-primary`, `--md-primary-dark` y `--md-primary-container` en claro, y en oscuro los `--ag-*` y los `--md-*` ya coinciden. Pasan a alias en V2. La única excepción es `--ag-accent-soft` (un `rgba`), que no tiene equivalente.
- Los únicos tonos azules nuevos (◇) son `--md-primary-light` en claro (`#e8f0fe`) y los de V1: `--md-outline-strong`, `--md-warning-text`, `--md-scrim`, `--md-toast-bg` y `--md-toast-fg` en oscuro. Se miran en pantalla tras V2.

### 3.3 Colores de datos (gráficas y estados de cita)

Los colores de las gráficas de Estadísticas (`JS_Graficos`) y de las etiquetas de estado (Activo, En espera, Alta, Asistido…) son **datos**, no marca. Se definen también en `CSS_Global` como `--md-data-1`… y `--md-estado-*`, una vez, con sus dos temas. No se cambian en las fases V1-V5 (solo se centralizan en V6).

## 4. Tipografía

| Variable | Valor | Uso |
|---|---|---|
| `--font` | `'Google Sans', 'Segoe UI', system-ui, sans-serif` ◆ | Toda la app (**POR CONFIRMAR**: ver I-07; si Google Sans no llega a cargar, se decide entre quedarse con Segoe UI o cargar otra fuente de Google Fonts) |
| `--font-mono` | `ui-monospace, 'SF Mono', Consolas, monospace` ◇ | Solo identificadores (ID). Se deja de descargar Roboto Mono |

Se retira `Roboto Flex` (Valoración y página completa) y el `Arial` fijo de las gráficas.

**Escala de tamaños** (de 71 valores a 9). Se escribe siempre en `rem`:

| Variable | Tamaño | Uso |
|---|---|---|
| `--fs-2xs` | `.6875rem` (11 px) | Insignias, rótulos sobre tabla |
| `--fs-xs` | `.75rem` (12 px) | Texto de ayuda, errores de campo, pie de tarjeta |
| `--fs-sm` | `.8125rem` (13 px) | Texto secundario, chips, avisos emergentes |
| `--fs-md` | `.875rem` (14 px) | **Cuerpo, botones, celdas de tabla** |
| `--fs-field` | `.9375rem` (15 px) | Valor escrito dentro de un campo |
| `--fs-lg` | `1rem` (16 px) | Texto destacado |
| `--fs-title` | `1.125rem` (18 px) | Título de formulario, de diálogo y de sección |
| `--fs-h` | `1.375rem` (22 px) | Título de página |
| `--fs-kpi` | `1.75rem` (28 px) | Cifras grandes de Estadísticas |

**Pesos**: solo 400 (texto), 500 (etiquetas) y 600 (botones y títulos). **Interlineado**: 1,4 en texto corrido, 1,2 en títulos. Con `font-variant-numeric: tabular-nums` en tablas y cifras (ya lo usa la HC).

## 5. Forma, altura y espacio

| Variable | Valor | Uso |
|---|---|---|
| `--md-shape-xs` | `4px` | Casillas, insignias pequeñas |
| `--md-shape-sm` | `8px` | Avisos emergentes, menús, filas seleccionables |
| `--md-shape-md` | `12px` | **Campos de texto**, tarjetas, hojas inferiores |
| `--md-shape-lg` | `16px` | Diálogos, panel lateral (esquinas visibles) |
| `--md-shape-xl` | `28px` | Reservado (cajón de móvil) |
| `--md-shape-full` | `999px` | **Botones, chips, pastillas** (reemplaza `99px`, `100px`, `1000px`, `50px`) |

Los círculos se siguen escribiendo `50%`. Con esto los 39 valores de esquina quedan en 6. Se corrige además el cuadro de confirmación de Usuarios (de 8 px a `--md-shape-lg`).

**Alturas**: botón 40 px (uso solo en ordenador: no se hace versión táctil de 44 px); campo 52 px; campo compacto 40 px; chip 32 px; botón de icono 40 × 40 px.

**Espacio** (recomendado, no se impone en esta ronda): múltiplos de 4 px (`--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32). Separación estándar entre campos de un formulario: 16 px; entre secciones: 24 px.

## 6. Elevación (sombras)

Cuatro niveles, grises neutros (`rgba(60,64,67,…)`, el valor que ya tiene Editar), sin tinte de color:

| Variable | Valor | Uso |
|---|---|---|
| `--md-elev-0` | `none` | Casi todo: tarjetas planas con borde `--md-outline` |
| `--md-elev-1` | `0 1px 2px rgba(60,64,67,.30), 0 1px 3px 1px rgba(60,64,67,.15)` ◇ | Cabeceras fijas, tarjeta al arrastrar |
| `--md-elev-2` | `0 1px 2px rgba(60,64,67,.30), 0 2px 6px 2px rgba(60,64,67,.15)` ◇ | Menús, selector de fecha y de usuario |
| `--md-elev-3` | `0 4px 8px 3px rgba(60,64,67,.15), 0 1px 3px rgba(60,64,67,.30)` ◆ (de Editar) | Panel lateral abierto, diálogos, avisos emergentes |

En tema oscuro las sombras apenas se ven: se compensa con el borde `--md-outline` y no con más sombra.

## 7. Movimiento

**Regla**: pocas duraciones, dos curvas, y una única llave para quitarlo todo.

| Variable | Valor | Uso |
|---|---|---|
| `--dur-1` | `100ms` | Respuesta inmediata: capa al pasar el ratón, pulsar |
| `--dur-2` | `180ms` | Controles: borde del campo, color, interruptor |
| `--dur-3` | `280ms` | Entrada de paneles, diálogos, etiqueta flotante |
| `--dur-4` | `450ms` | Entradas amplias de Estadísticas (barras, anillos) |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` ◆ (la más usada hoy: 17 veces) | Todo lo que entra, se mueve o cambia |
| `--ease-out` | `cubic-bezier(.4, 0, 1, 1)` ◇ | Lo que sale (cerrar un diálogo) |

- **Sin rebote**: desaparecen `cubic-bezier(.34,1.56,.64,1)` y parecidas.
- **Una sola llave `prefers-reduced-motion`**: en `CSS_Global`, bajo `@media (prefers-reduced-motion: reduce)`, las cuatro `--dur-*` pasan a `0.01ms`. Como todos los formularios usan esas variables, **respetan la preferencia sin escribir nada más** (resuelve I-15). El girador de carga sigue girando (es información, no adorno), más despacio.
- **Un solo girador**, `@keyframes md-spin` (sustituye a `pc-spin`, `pe-spin`, `nu-spin`, `pv-spin`, `spin`).
- **Una sola entrada** de panel: `md-entra` (desplazamiento de 8 px + opacidad, `--dur-3`, `--ease`); sustituye a `md-fade-up/down`, `pv-fade-up/down` y `hc-sube`.

## 8. Capas (z-index)

| Variable | Valor | Qué va a ese nivel |
|---|---|---|
| `--z-base` | 1 | Elementos que se superponen a su vecino (icono sobre campo) |
| `--z-sticky` | 10 | Cabeceras de tabla y de panel fijas |
| `--z-panel` | 30 | Panel lateral / ficha / cajón de HC |
| `--z-popover` | 200 | Selector de fecha, selector de usuario, menús |
| `--z-modal` | 1000 | Diálogo de confirmación y su velo |
| `--z-toast` | 1100 | Aviso emergente (siempre por encima) |
| `--z-max` | 1200 | Reservado; nada va por encima |

Se sustituyen los 23 valores actuales (de 1 a 10000). Regla: **no se escribe un número en `z-index`, siempre una variable**.

## 9. Componentes

### 9.1 Botón

Una sola base `.md-btn` y cinco variantes. Altura 40 px, esquina `--md-shape-full`, letra `--fs-md` a peso 600, icono de 18 px con 8 px de separación.

| Variante | Aspecto | Cuándo |
|---|---|---|
| `.md-btn--tonal` | Fondo `--md-primary-container`, texto `--md-primary-dark` | **La acción principal.** Máximo **uno por formulario** |
| `.md-btn--outline` | Sin fondo, borde `--md-outline-strong`, texto `--md-primary` | Acción secundaria importante (p. ej. «Valoración» en la HC) |
| `.md-btn--text` | Sin fondo ni borde, texto `--md-primary` | Cancelar, cerrar, acciones terciarias |
| `.md-btn--danger` | Fondo `--md-error-bg`, texto `--md-error` | Eliminar. Nunca como acción por defecto |
| `.md-btn--icon` | Círculo de 40 px, solo icono (con `aria-label` y `title`) | Cerrar, volver, imprimir, editar |

**Estados** (iguales para todos):
- **Reposo → pasar el ratón**: capa translúcida del color del texto al 8 % (`color-mix(in srgb, currentColor 8%, transparent)`, que la HC ya usa). **Pulsado**: 12 %. Duración `--dur-1`. **Sin onda (ripple), sin escalado, sin elevación, sin oscurecer con `brightness`.**
- **Foco con teclado**: `outline: 2px solid var(--md-primary); outline-offset: 2px` (ver 9.4).
- **Desactivado**: opacidad .38 y sin puntero. **Cargando**: el texto se mantiene y se añade el girador a la izquierda; el botón queda desactivado.

**Colocación en un formulario**: pie del panel, alineado a la derecha: `Cancelar` (`.md-btn--text`) y a su derecha la acción principal (`.md-btn--tonal`). La versión de móvil (botones a todo el ancho) no se hace: el dueño usa la app solo en ordenador (28-oct-2026).

**Rotulado**: verbo en infinitivo + sustantivo en minúscula, sin signos: «Guardar usuario», «Guardar valoración», «Guardar cambios», «Dar cita», «Aplicar disponibilidad», «Añadir recordatorio», «Cancelar», «Eliminar». Nunca «OK», «Aceptar» ni mayúsculas intermedias.

### 9.2 Campo de texto (estándar)

Contorno, etiqueta flotante, icono opcional a la izquierda (es el patrón que ya usan 5 de los formularios). Clase: `.md-campo` (y `.md-campo--compacto` para el compacto):

| Propiedad | Valor |
|---|---|
| Altura / relleno | 52 px; relleno `0 14px 0 44px` (si lleva icono) o `0 14px` |
| Borde | `1.5px solid var(--md-outline-strong)`; esquina `--md-shape-md` |
| Valor escrito | `--fs-field`, `--md-on-surface` |
| Etiqueta | En reposo, centrada en el campo, `--fs-field`, `--md-on-surface-med`. Con foco o con valor, sube y pasa a `--fs-xs` (`--dur-2`, `--ease`) |
| Pasar el ratón | borde `--md-on-surface` |
| Foco | borde `--md-primary` y `box-shadow: inset 0 0 0 .5px var(--md-primary)` (simula 2 px sin que el campo se mueva); etiqueta en `--md-primary` |
| Error | borde y etiqueta `--md-error`; mensaje debajo en `--fs-xs`, con icono `error` de 16 px (no solo color) |
| Desactivado | fondo `--md-surface-variant`, texto `--md-on-surface-low` |
| Área de texto | mismo estilo; `min-height: 88px`, relleno superior 18 px, `resize: vertical` |
| Lista desplegable | mismo estilo + icono `expand_more` a la derecha |

**Campo compacto** (variante oficial para pantallas densas: Disponibilidad, Recordatorios, filtros): 40 px de alto, etiqueta fija encima (`--fs-xs`, peso 600, `--md-on-surface-med`), mismo borde y mismo foco. Es la única excepción permitida a la etiqueta flotante.

### 9.3 Tarjetas, secciones y chips

- **Tarjeta**: fondo `--md-surface`, borde `1px solid var(--md-outline)`, esquina `--md-shape-md`, **sin sombra**. Cabecera con título `--fs-title` a peso 600. Relleno 16 px.
- **Chip**: 32 px, `--md-shape-full`, `--fs-sm` a peso 500. Normal: borde `--md-outline-strong`. Seleccionado: fondo `--md-primary-container` y marca ✓ delante (el significado no depende solo del color).
- **Insignia de estado**: 11-12 px, `--md-shape-full`, colores semánticos (3.2). El texto es lo que dice el estado; el color lo refuerza.

### 9.4 Foco y accesibilidad (obligatorio)

- Todo elemento interactivo tiene `:focus-visible` con `outline: 2px solid var(--md-primary); outline-offset: 2px`. Una **regla global** en `CSS_Global` lo aplica a `button, a, input, select, textarea, [tabindex]`; los formularios **no** vuelven a escribirla (resuelve I-18). `outline: none` solo se admite si se sustituye por el estilo de foco del campo (9.2).
- El borde de un control tiene al menos 3 a 1 de contraste (`--md-outline-strong`); el texto, al menos 4,5 a 1.
- Un icono que actúa como botón lleva `aria-label`. El estado nunca se transmite solo con color (icono, signo o texto).
- Objetivo de clic mínimo de 40 px (uso solo en ordenador).

### 9.5 Avisos y diálogos (un solo patrón)

Se mueven de las tres páginas a `CSS_Global` y de ahí los usan todos (resuelve I-19):

- **Aviso emergente** (`.toast-aviso`): fondo `--md-toast-bg`, texto `--md-toast-fg`, esquina `--md-shape-sm`, `--fs-sm`, sombra `--md-elev-3`, abajo y centrado, `z-index: var(--z-toast)`. Entra con `md-entra`. Los iconos `ok / aviso / error` siguen saliendo de `tonoAviso_` / `iconoAviso_` (se conserva).
- **Diálogo** (`.modal-overlay` + `.modal-box`): velo `--md-scrim`, caja `--md-surface`, esquina `--md-shape-lg`, relleno 24 px, ancho máximo 400 px, `--md-elev-3`, `z-index: var(--z-modal)`. Título `--fs-title`, texto `--fs-md`, botones a la derecha (`.md-btn--text` + `.md-btn--tonal`, o `.md-btn--danger` si destruye datos). Esc cierra. Foco inicial en el botón menos destructivo.
- **Confirmación dentro de un panel** (lo que hoy son `.nu-conf`, `.pvs-conf`, `*-dup` y el mensaje de Cita): usa el mismo diálogo. No se vuelven a crear variantes.

### 9.6 Panel de formulario (cabecera, cuerpo, pie)

- **Cabecera**: título `--fs-title` (peso 600) y subtítulo opcional `--fs-sm` en `--md-on-surface-med`; a la izquierda `.md-btn--icon` de volver si procede, a la derecha `.md-btn--icon` de cerrar. Separador `--md-outline`.
- **Cuerpo**: desplazable, relleno 16-24 px, campos separados 16 px, secciones separadas 24 px con título `--fs-md` peso 600.
- **Pie**: fijo abajo, borde superior `--md-outline`, botones según 9.1.
- Entrada: `md-entra`. Sin rebote.

### 9.7 Carga y vacío

- **Girador**: 20 px, borde de 2 px, color `--md-primary`, `md-spin`.
- **Esqueleto** (carga de listas y fichas): el de Estadísticas (`pintarEsqueletos`) se generaliza como clase `.md-esqueleto`.
- **Vacío**: icono Material de 32 px en `--md-on-surface-low`, frase en `--fs-md` y, si hay acción, un `.md-btn--outline`.

### 9.8 Iconos

Solo **Material Symbols Outlined** (peso 400, relleno 0; relleno 1 para «seleccionado»). Tamaños 16 (en mensajes), 18 (en botones), 20 (en campos), 24 (en cabeceras). Se retiran los 20 SVG manuales de `Panel_HC` y se sustituyen por su glifo equivalente (decisión D-V6). **Excepción de marca**: el icono de WhatsApp es el SVG oficial y se conserva tal cual, dondequiera que aparezca. Sin emojis (regla del 27-oct-2026).

## 10. Decisiones que dependen del dueño

Se plantean en la Fase V0 de la hoja de ruta; aquí queda la recomendación y su motivo.

| Código | Decisión | Respuesta del dueño (28-oct-2026) | Motivo / nota |
|---|---|---|---|
| D-V1 | Color de marca | **Azul `#0b57d0`** en toda la app (la recomendación inicial era el teal `#2b5c75`) | Es el azul de Google; ya lo usan la Agenda y Valoración; contraste 6,4 a 1 sobre blanco |
| D-V2 | Acento en tema oscuro | **`#8ab4f8`** («el color que usa Google») | Ya lo usan cuatro páginas en oscuro; la marca no cambia de noche |
| D-V3 | Fuente | **Google Sans** | Es la que declara `CSS_Global` y carga desde Google Fonts (I-07); se retira Roboto Flex |
| D-V4 | Página `?page=nuevoPaciente` (`Anadir_Usuario_Vista`) | **Retirarla**; queda `Panel_Nuevo` | No la abre ningún botón y duplica `Panel_Nuevo` (I-03, I-22). Se pide visto bueno para tocar `core/WebApp.gs` en V4 |
| D-V5 | Intensidad del movimiento | **Sobrio**: sin onda, sin escalado, sin rebote | Coherente con el principio 3; el dashboard ya es así |
| D-V6 | Iconos de la HC | **Material Symbols**, salvo WhatsApp: **icono oficial** | Un solo origen y grosor (I-17); el de WhatsApp es de marca |
| D-V7 | Banco de pruebas visual | **Sí**: una página interna con todos los componentes en claro y en oscuro | Permite revisar de un vistazo sin abrir cada formulario |

**Uso en ordenador (28-oct-2026)**: el dueño usa la app solo en ordenador, así que no se diseña la versión móvil ni táctil (I-23, «no aplica»).

**Alternativa a D-V5** (si el dueño echa de menos la onda al pulsar): se implementa **una sola vez** para todos los `.btn` (no por formulario), con la misma intensidad en toda la app. Lo que no se admite es que unos botones la tengan y otros no.
