/**
 * CAPA ÚNICA DE ACCESO A CITAS (tabla plana "Citas")
 * Paso 6 del "Orden de trabajo" de CONTEXTO.md, sección 11 (decisión 8). FASE 1: lectura. FASE 2: escritura (al final del archivo).
 *
 * La hoja "Citas" (SHEETS.CITAS) tiene una fila por cita real: ID cita (UUID, no el número de fila), Fecha (fecha real),
 * Hora ("HH:mm", texto), ID paciente, Nombre (referencia), Sesión, Asistencia (una de ASISTENCIA_CITA), Notas
 * y Creada el. (La columna "ID Evento Calendar" de la hoja real ya no se usa: se puede borrar, el código la ignora.) No hay filas de huecos libres (los huecos se calculan con la parrilla y `Disponibilidad`),
 * y teléfono y enlace a la HC no se copian: se consultan por ID paciente. Cabeceras en COLUMNAS.CITAS (core/Config.gs).
 *
 * LECTURA (fase 1): `citasLeer_`, `citasDeSemana_`, `citasDePaciente_`, `citasCategoriaAsistencia_`, `citasSesionPropuesta_`.
 * ESCRITURA (fase 2): `citasCrear_`, `citasCrearVarias_` (3c, tanda 3), `citasMover_`, `citasIntercambiar_`, `citasCambiarCampo_`, `citasEliminar_`,
 *   `citasRestaurar_`. Son las ÚNICAS funciones que deben escribir en "Citas" (y las que rellenan
 *   "Creada el"). Devuelven { success, message, ... } como el resto de la API web.
 *
 * INTERRUPTOR: CITAS_MODO_NUEVO (más abajo) está en true desde el corte (21-oct-2026): la Agenda web lee y escribe solo en "Citas" y la
 * hoja `Agenda AAAA-AAAA` quedó congelada como archivo. Con false, NINGUNA función de escritura toca la hoja
 * (devuelven success:false con un aviso). La migración inicial (`migrarCitas`) ya se ejecutó y se retiró del proyecto.
 *
 * Reglas de la capa nueva (sustituyen a lo que antes eran "huecos" con fila fija):
 *   - Un hueco es válido si cae en la parrilla (lunes a viernes, 08:00-14:00 y, de lunes a jueves, 16:00-20:00, cada 30 min;
 *     el último bloque empieza 30 min antes del final, como la antigua `generarBloques`, ya retirada) y esa hora no está
 *     cerrada en `Disponibilidad`. Mover o crear una cita a una hora cerrada se rechaza; una cita que ya está en una hora que se cerró después se respeta.
 *   - Un hueco admite UNA sola cita (misma fecha y hora = ocupado).
 *   - Se crea siempre con ID paciente de un usuario que existe en la Maestra; el nombre se toma de ahí.
 *   - Cada escritura va bajo bloqueo (LockService) y NO debe llamarse desde código que ya tenga el bloqueo del script.
 *   - Cada escritura sube `citasVersion_()`: es la versión de caché que usa la Agenda web (`obtenerVersionAgendaWeb`) para saber si hay cambios.
 *
 * Reutiliza SIN modificar: getSS (core/WebApp.gs), SHEETS, COLUMNAS, COLUMNAS_NUM, ASISTENCIA_CITA (core/Config.gs), hcAISO_ y hcNorm_
 * (historia/HC_Web.gs), mapaFilasMaestraPorId_ (core/Utils.gs), leerDisponibilidad_ y disponibilidadCerrada_ (agenda/Disponibilidad.gs).
 * Prefijo citas para no chocar en el ámbito global.
 */

/** Interruptor de la escritura en "Citas". true desde el corte (21-oct-2026, CONTEXTO.md, sección 11, paso 6, fase 4). Para volver atrás, false + clasp push + nueva versión de la Web App (la Agenda vieja queda intacta, pero no recibirá lo hecho después del corte). */
const CITAS_MODO_NUEVO = true;
function citasModoNuevo_() { return CITAS_MODO_NUEVO === true; }

function citasCabeceras_() {
  const c = COLUMNAS.CITAS;
  return [c.ID, c.FECHA, c.HORA, c.ID_PACIENTE, c.NOMBRE, c.SESION, c.ASISTENCIA, c.NOTAS, c.CREADA];
}

/** Hoja "Citas". Con crear = true la crea (con cabeceras) si no existe; si no, devuelve null cuando falta. */
function citasHoja_(crear) {
  const ss = getSS();
  let hoja = ss.getSheetByName(SHEETS.CITAS);
  if (!hoja && crear) {
    const cab = citasCabeceras_();
    hoja = ss.insertSheet(SHEETS.CITAS, ss.getNumSheets());
    hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    [280, 100, 70, 280, 220, 70, 110, 300, 150].forEach((ancho, i) => hoja.setColumnWidth(i + 1, ancho));
  }
  return hoja;
}

function citasTexto_(v) { return String(v === null || v === undefined ? '' : v).trim(); }

/** "HH:mm" a partir de una celda de hora (Date de Sheets con fecha base 1899) o de un texto "H:mm"/"HH:mm"; '' si no se entiende. */
function citasHoraTexto_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'HH:mm');
  const m = citasTexto_(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

/**
 * Categoría de Asistencia de un texto. Los 4 valores oficiales (sin importar mayúsculas ni tildes) se reconocen tal cual; el
 * texto antiguo se clasifica con las mismas reglas y el mismo orden que ESTILOS_ASISTENCIA (agenda/Web_Vista.html).
 * @return {{categoria:string, estandar:boolean, vacio:boolean, desconocido:boolean}} `estandar` = era exactamente uno de los 4;
 *   `vacio` = celda vacía (cuenta como Pendiente); `desconocido` = no encaja en nada (se deja Pendiente y debe revisarse).
 */
function citasCategoriaAsistencia_(texto) {
  const A = ASISTENCIA_CITA;
  const v = hcNorm_(texto).toLowerCase();
  if (!v) return { categoria: A.PENDIENTE, estandar: false, vacio: true, desconocido: false };
  const exacto = { 'pendiente': A.PENDIENTE, 'asistido': A.ASISTIDO, 'no asistido': A.NO_ASISTIDO, 'justificada': A.JUSTIFICADA };
  if (exacto[v]) return { categoria: exacto[v], estandar: true, vacio: false, desconocido: false };
  let categoria = '';
  if (/^no\b|^sin asist|falt|ausen|plant|no (vino|asist|acud|se present)/.test(v)) categoria = A.NO_ASISTIDO;
  else if (/pendient|por confirmar|sin confirmar|sin registrar/.test(v)) categoria = A.PENDIENTE;
  else if (/cancel|anul|aplaz|recuper|justific|retras/.test(v)) categoria = A.JUSTIFICADA;
  else if (/asist|vino|presente|realiz|acudi|^si$|^ok$/.test(v)) categoria = A.ASISTIDO;
  return { categoria: categoria || A.PENDIENTE, estandar: false, vacio: false, desconocido: !categoria };
}

/**
 * Los 4 textos de Asistencia que acepta la capa de escritura, en orden de uso. El cliente (desplegable, chips) debe tomarlos de aquí
 * y NO del desplegable de la hoja Agenda (que lleva emojis y la capa rechaza); el color y el icono los pone la interfaz.
 */
function citasOpcionesAsistencia_() {
  const A = ASISTENCIA_CITA;
  return [A.PENDIENTE, A.ASISTIDO, A.NO_ASISTIDO, A.JUSTIFICADA];
}

/** Fila de la hoja (valores) → objeto cita; null si la fila no tiene ID o no tiene fecha legible. */
function citasObjetoDeFila_(f, idx, tz) {
  const celda = k => idx[k] === -1 ? '' : f[idx[k]];
  const id = citasTexto_(f[idx.ID]);
  if (!id) return null;
  const fecha = hcAISO_(f[idx.FECHA], tz);
  if (!fecha) return null;
  const creada = celda('CREADA');
  return {
    id: id,
    fecha: fecha,
    hora: citasHoraTexto_(f[idx.HORA], tz),
    idPaciente: citasTexto_(celda('ID_PACIENTE')),
    nombre: citasTexto_(celda('NOMBRE')),
    sesion: celda('SESION'),
    asistencia: citasTexto_(celda('ASISTENCIA')),
    notas: citasTexto_(celda('NOTAS')),
    creada: Object.prototype.toString.call(creada) === '[object Date]' && !isNaN(creada) ? Utilities.formatDate(creada, tz, 'yyyy-MM-dd HH:mm:ss') : citasTexto_(creada)
  };
}

/**
 * Las citas de la hoja "Citas" (una lectura de toda la tabla), ordenadas por fecha y hora.
 * @param {{desdeISO?:string, hastaISO?:string, idPaciente?:string}=} filtro Fechas 'yyyy-MM-dd' inclusivas.
 * @return {Array<{id:string, fecha:string, hora:string, idPaciente:string, nombre:string, sesion:*, asistencia:string,
 *   notas:string, creada:string}>} `fecha` en 'yyyy-MM-dd'; `creada` en 'yyyy-MM-dd HH:mm:ss' o ''.
 */
function citasLeer_(filtro) {
  filtro = filtro || {};
  const hoja = citasHoja_(false);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const idx = {};
  Object.keys(COLUMNAS.CITAS).forEach(k => { idx[k] = cab.indexOf(COLUMNAS.CITAS[k]); });
  if (idx.ID === -1 || idx.FECHA === -1 || idx.HORA === -1) throw new Error('La hoja "' + SHEETS.CITAS + '" no tiene las columnas "' + COLUMNAS.CITAS.ID + '", "' + COLUMNAS.CITAS.FECHA + '" y "' + COLUMNAS.CITAS.HORA + '".');
  const tz = Session.getScriptTimeZone();
  const salida = [];
  hoja.getRange(2, 1, hoja.getLastRow() - 1, cab.length).getValues().forEach(f => {
    const c = citasObjetoDeFila_(f, idx, tz);
    if (!c) return;
    if (filtro.desdeISO && c.fecha < filtro.desdeISO) return;
    if (filtro.hastaISO && c.fecha > filtro.hastaISO) return;
    if (filtro.idPaciente && c.idPaciente !== citasTexto_(filtro.idPaciente)) return;
    salida.push(c);
  });
  salida.sort((a, b) => a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : (a.fecha < b.fecha ? -1 : 1));
  return salida;
}

/** Todas las citas agrupadas por ID paciente (UNA sola lectura de la tabla). Las que no tienen ID paciente no entran. */
function citasPorPaciente_() {
  const mapa = {};
  citasLeer_().forEach(c => { if (c.idPaciente) (mapa[c.idPaciente] = mapa[c.idPaciente] || []).push(c); });
  return mapa;
}

/** Citas entre dos fechas 'yyyy-MM-dd' (inclusivas): "dame las citas de esta semana". */
function citasDeSemana_(lunesISO, viernesISO) { return citasLeer_({ desdeISO: lunesISO, hastaISO: viernesISO }); }

/** Todas las citas de un usuario, por su ID paciente (nunca por nombre ni teléfono). */
function citasDePaciente_(idPaciente) {
  if (!citasTexto_(idPaciente)) return [];
  return citasLeer_({ idPaciente: idPaciente });
}

/**
 * Sesión propuesta para la próxima cita de un usuario: la Sesión numérica de su cita más reciente (por fecha y hora) + 1.
 * Devuelve '' si no tiene ninguna con Sesión numérica (al empezar un tratamiento la Sesión se escribe a mano, decisión 7).
 */
function citasSesionPropuesta_(idPaciente) {
  const conSesion = citasDePaciente_(idPaciente).filter(c => /^\d+$/.test(String(c.sesion).trim()));
  if (!conSesion.length) return '';
  return parseInt(conSesion[conSesion.length - 1].sesion, 10) + 1;   // citasLeer_ ya devuelve ordenado por fecha y hora
}

// ============================================================================= ESCRITURA (fase 2)

/** Versión de caché de las citas (sube con cada escritura); la usa `obtenerVersionAgendaWeb` para detectar cambios. */
function citasVersion_() {
  const v = CacheService.getScriptCache().get('citasVersion');
  return v ? parseInt(v, 10) : 0;
}
function citasInvalidarCache_() {
  CacheService.getScriptCache().put('citasVersion', String(citasVersion_() + 1), 21600);   // 6 h, el máximo de CacheService
}

function citasBloques_(ini, fin) {
  const salida = [];
  let [h, m] = ini.split(':').map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  while (h < hf || (h === hf && m < mf)) {
    salida.push(('0' + h).slice(-2) + ':' + ('0' + m).slice(-2));
    m += 30; if (m >= 60) { m -= 60; h++; }
  }
  return salida;
}

/** Horas ("HH:mm") de la parrilla de una fecha 'yyyy-MM-dd'. Vacío si la fecha no existe o es fin de semana. */
function citasHorasDelDia_(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO));
  if (!m) return [];
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return [];
  const dia = d.getDay();
  if (dia < 1 || dia > 5) return [];
  const horas = citasBloques_('08:00', '14:00');
  if (dia <= 4) citasBloques_('16:00', '20:00').forEach(h => horas.push(h));
  return horas;
}

/** ¿Se puede poner una cita en esa fecha y hora? (parrilla + Disponibilidad; la ocupación se comprueba aparte). */
function citasHuecoValido_(fechaISO, hora) {
  const h = citasHoraTexto_(hora, Session.getScriptTimeZone());
  if (!h) return { ok: false, motivo: 'La hora no es válida.' };
  if (citasHorasDelDia_(fechaISO).indexOf(h) === -1) {
    return { ok: false, motivo: 'No es un hueco horario (la agenda es de lunes a viernes, 08:00-14:00 y, de lunes a jueves, 16:00-20:00, cada 30 minutos).' };
  }
  if (disponibilidadCerrada_(leerDisponibilidad_(), fechaISO, h)) return { ok: false, motivo: 'Esa hora está cerrada en Disponibilidad.' };
  return { ok: true, hora: h };
}

/** Lee la tabla UNA vez para una operación de escritura (columnas por cabecera, no por posición). */
function citasContexto_() {
  const hoja = citasHoja_(false);
  if (!hoja) throw new Error('No existe la hoja "' + SHEETS.CITAS + '".');
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const idx = {};
  Object.keys(COLUMNAS.CITAS).forEach(k => { idx[k] = cab.indexOf(COLUMNAS.CITAS[k]); });
  const faltan = Object.keys(idx).filter(k => idx[k] === -1).map(k => COLUMNAS.CITAS[k]);
  if (faltan.length) throw new Error('A la hoja "' + SHEETS.CITAS + '" le faltan columnas: ' + faltan.join(', ') + '.');
  const ultima = hoja.getLastRow();
  return { hoja: hoja, cab: cab, idx: idx, n: cab.length, filas: ultima >= 2 ? hoja.getRange(2, 1, ultima - 1, cab.length).getValues() : [] };
}

/** Ejecuta una escritura: respeta el interruptor, toma el bloqueo, atrapa errores y sube la versión de caché si salió bien. */
function citasOperar_(nombre, fn) {
  if (!citasModoNuevo_()) {
    return { success: false, message: 'La escritura en la hoja "' + SHEETS.CITAS + '" está desactivada (interruptor CITAS_MODO_NUEVO en agenda/Citas_Datos.gs).' };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const r = fn(citasContexto_(), Session.getScriptTimeZone());
    SpreadsheetApp.flush();
    if (r && r.success) citasInvalidarCache_();
    return r;
  } catch (e) {
    Logger.log('Error en ' + nombre + ': ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/** Posición (0-based en ctx.filas) de la cita con ese ID; -1 si no existe. */
function citasPosicion_(ctx, idCita) {
  const id = citasTexto_(idCita);
  if (!id) return -1;
  for (let i = 0; i < ctx.filas.length; i++) if (citasTexto_(ctx.filas[i][ctx.idx.ID]) === id) return i;
  return -1;
}

/** ¿Hay alguna cita (distinta de `ignorarId`) en esa fecha y hora? */
function citasOcupada_(ctx, tz, fechaISO, hora, ignorarId) {
  const ign = citasTexto_(ignorarId);
  return ctx.filas.some(f => {
    const id = citasTexto_(f[ctx.idx.ID]);
    if (!id || id === ign) return false;
    return hcAISO_(f[ctx.idx.FECHA], tz) === fechaISO && citasHoraTexto_(f[ctx.idx.HORA], tz) === hora;
  });
}

function citasFechaDeISO_(fechaISO) {
  const p = String(fechaISO).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function citasFechaHoraDeTexto_(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(citasTexto_(t));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : '';
}

/** Añade citas (objetos con la forma de citasLeer_) al final de la hoja, con los mismos formatos que la migración. */
function citasEscribirFilas_(ctx, citas) {
  if (!citas.length) return;
  const { hoja, idx, n } = ctx;
  const inicio = hoja.getLastRow() + 1;
  const filas = citas.map(c => {
    const f = new Array(n).fill('');
    f[idx.ID] = c.id;
    f[idx.FECHA] = citasFechaDeISO_(c.fecha);
    f[idx.HORA] = c.hora;
    f[idx.ID_PACIENTE] = c.idPaciente;
    f[idx.NOMBRE] = c.nombre;
    f[idx.SESION] = c.sesion === null || c.sesion === undefined ? '' : c.sesion;
    f[idx.ASISTENCIA] = c.asistencia;
    f[idx.NOTAS] = c.notas || '';
    f[idx.CREADA] = citasFechaHoraDeTexto_(c.creada);
    return f;
  });
  ['ID', 'HORA', 'ID_PACIENTE', 'NOMBRE', 'ASISTENCIA', 'NOTAS'].forEach(k => hoja.getRange(inicio, idx[k] + 1, filas.length, 1).setNumberFormat('@'));
  hoja.getRange(inicio, idx.FECHA + 1, filas.length, 1).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(inicio, idx.CREADA + 1, filas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  hoja.getRange(inicio, 1, filas.length, n).setValues(filas);
}

/** Escribe la fecha y la hora de una cita ya existente (fila real = posición + 2). */
function citasEscribirFechaHora_(ctx, posicion, fechaISO, hora) {
  const fila = posicion + 2;
  ctx.hoja.getRange(fila, ctx.idx.FECHA + 1).setNumberFormat('dd/MM/yyyy').setValue(citasFechaDeISO_(fechaISO));
  ctx.hoja.getRange(fila, ctx.idx.HORA + 1).setNumberFormat('@').setValue(hora);
}

function citasError_(message) { return { success: false, message: message }; }

/**
 * Crea una cita.
 * @param {{fechaISO:string, hora:string, idPaciente:string, sesion?:*, asistencia?:string, notas?:string}} datos
 * @return {{success:boolean, message?:string, cita?:Object}} `cita` con la forma de citasLeer_ (incluye `id` y `creada`).
 */
function citasCrear_(datos) {
  return citasOperar_('citasCrear_', function (ctx, tz) {
    datos = datos || {};
    const fechaISO = citasTexto_(datos.fechaISO);
    const v = citasHuecoValido_(fechaISO, datos.hora);
    if (!v.ok) return citasError_(v.motivo);

    const idPaciente = citasTexto_(datos.idPaciente);
    if (!idPaciente) return citasError_('Falta el ID del usuario.');
    const maestra = getSS().getSheetByName(SHEETS.MAESTRA);
    const fila = maestra ? mapaFilasMaestraPorId_(maestra)[idPaciente] : null;
    if (!fila) return citasError_('No existe ningún usuario con ese ID paciente.');
    const nombre = citasTexto_(maestra.getRange(fila, COLUMNAS_NUM.MAESTRA.NOMBRE).getValue());

    if (citasOcupada_(ctx, tz, fechaISO, v.hora, '')) return citasError_('Ese hueco ya está ocupado.');

    let asistencia = ASISTENCIA_CITA.PENDIENTE;
    if (citasTexto_(datos.asistencia)) {
      const cat = citasCategoriaAsistencia_(datos.asistencia);
      if (!cat.estandar) return citasError_('La asistencia debe ser una de: ' + Object.keys(ASISTENCIA_CITA).map(k => ASISTENCIA_CITA[k]).join(', ') + '.');
      asistencia = cat.categoria;
    }

    const cita = {
      id: Utilities.getUuid(), fecha: fechaISO, hora: v.hora, idPaciente: idPaciente, nombre: nombre,
      sesion: datos.sesion === null || datos.sesion === undefined ? '' : datos.sesion, asistencia: asistencia,
      notas: datos.notas ? String(datos.notas) : '', creada: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss')
    };
    citasEscribirFilas_(ctx, [cita]);
    return { success: true, cita: cita };
  });
}

/**
 * Crea VARIAS citas de una vez (3c, tanda 3: copiar citas o semana, y el formulario de varias horas): una sola lectura de la
 * tabla, un solo bloqueo y una sola escritura, en vez de un `citasCrear_` por cita. Cada elemento se valida con las mismas reglas
 * que `citasCrear_` (parrilla, Disponibilidad, hueco libre, usuario existente en la Maestra); el que no pasa NO impide crear los demás
 * y sale en `errores` con su posición en la lista. Dos elementos para el mismo hueco: solo entra el primero.
 *
 * @param {Array<{fechaISO:string, hora:string, idPaciente:string, sesion?:*, notas?:string, asistencia?:string}>} lista
 * @param {{sustituir?:boolean}=} opciones `sustituir` = true: si el hueco ya tiene una cita, esa cita se BORRA y se crea la nueva
 *   (es lo que hace "Sobrescribir" al copiar; las citas sustituidas vuelven en `sustituidas` por si se quisiera avisar o deshacer).
 *   false (por defecto): un hueco ocupado es un error de ese elemento.
 * @return {{success:boolean, message?:string, creadas?:Object[], sustituidas?:Object[], errores?:Array<{indice:number, message:string}>}}
 *   `success` = se creó al menos una; `creadas` con la forma de citasLeer_ (incluye `id` y `creada`).
 */
function citasCrearVarias_(lista, opciones) {
  return citasOperar_('citasCrearVarias_', function (ctx, tz) {
    if (!lista || !lista.length) return citasError_('No hay ninguna cita que crear.');
    const sustituir = !!(opciones && opciones.sustituir);
    const maestra = getSS().getSheetByName(SHEETS.MAESTRA);
    const mapaMaestra = maestra ? mapaFilasMaestraPorId_(maestra) : {};
    const nombres = {};   // ID paciente -> nombre actual de la Maestra (una lectura por usuario distinto)

    // Hueco (fecha|hora) -> posición (0-based en ctx.filas) de la cita que lo ocupa.
    const ocupadas = {};
    ctx.filas.forEach(function (f, i) {
      if (!citasTexto_(f[ctx.idx.ID])) return;
      const clave = hcAISO_(f[ctx.idx.FECHA], tz) + '|' + citasHoraTexto_(f[ctx.idx.HORA], tz);
      if (!(clave in ocupadas)) ocupadas[clave] = i;
    });

    const ahora = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const creadas = [], errores = [], reservadas = {}, filasABorrar = {}, sustituidas = [];

    lista.forEach(function (d, indice) {
      d = d || {};
      const fechaISO = citasTexto_(d.fechaISO);
      const v = citasHuecoValido_(fechaISO, d.hora);
      if (!v.ok) { errores.push({ indice: indice, message: v.motivo }); return; }
      const idPaciente = citasTexto_(d.idPaciente);
      if (!idPaciente) { errores.push({ indice: indice, message: 'Falta el ID del usuario.' }); return; }
      const fila = mapaMaestra[idPaciente];
      if (!fila) { errores.push({ indice: indice, message: 'No existe ningún usuario con ese ID paciente.' }); return; }
      let asistencia = ASISTENCIA_CITA.PENDIENTE;
      if (citasTexto_(d.asistencia)) {
        const cat = citasCategoriaAsistencia_(d.asistencia);
        if (!cat.estandar) { errores.push({ indice: indice, message: 'La asistencia debe ser una de: ' + Object.keys(ASISTENCIA_CITA).map(k => ASISTENCIA_CITA[k]).join(', ') + '.' }); return; }
        asistencia = cat.categoria;
      }
      const clave = fechaISO + '|' + v.hora;
      if (reservadas[clave]) { errores.push({ indice: indice, message: 'Ese hueco ya está ocupado.' }); return; }   // otra cita de esta misma tanda
      if (clave in ocupadas) {
        if (!sustituir) { errores.push({ indice: indice, message: 'Ese hueco ya está ocupado.' }); return; }
        const pos = ocupadas[clave];
        if (!filasABorrar[pos]) {
          filasABorrar[pos] = true;
          const previa = citasObjetoDeFila_(ctx.filas[pos], ctx.idx, tz);
          if (previa) sustituidas.push(previa);
        }
      }
      if (!(idPaciente in nombres)) nombres[idPaciente] = citasTexto_(maestra.getRange(fila, COLUMNAS_NUM.MAESTRA.NOMBRE).getValue());
      reservadas[clave] = true;
      creadas.push({
        id: Utilities.getUuid(), fecha: fechaISO, hora: v.hora, idPaciente: idPaciente, nombre: nombres[idPaciente],
        sesion: d.sesion === null || d.sesion === undefined ? '' : d.sesion, asistencia: asistencia,
        notas: d.notas ? String(d.notas) : '', creada: ahora
      });
    });

    if (!creadas.length) return { success: false, message: errores.map(e => e.message).join('\n') || 'No se creó ninguna cita.', creadas: [], sustituidas: [], errores: errores };

    // Primero se añaden las nuevas y después se borran las sustituidas (por número de fila, de abajo arriba): si algo fallara a medias,
    // nunca se pierde una cita sin haber escrito la que la reemplaza.
    citasEscribirFilas_(ctx, creadas);
    Object.keys(filasABorrar).map(Number).sort((a, b) => b - a).forEach(pos => ctx.hoja.deleteRow(pos + 2));
    return { success: true, message: creadas.length === 1 ? 'Cita creada.' : creadas.length + ' citas creadas.', creadas: creadas, sustituidas: sustituidas, errores: errores };
  });
}

/** Mueve una cita a otra fecha y hora (conserva su ID y todos sus datos). El destino debe ser un hueco válido y libre. */
function citasMover_(idCita, fechaISO, hora) {
  return citasOperar_('citasMover_', function (ctx, tz) {
    const pos = citasPosicion_(ctx, idCita);
    if (pos === -1) return citasError_('La cita ya no existe (¿la ha cambiado otra persona?).');
    fechaISO = citasTexto_(fechaISO);
    const v = citasHuecoValido_(fechaISO, hora);
    if (!v.ok) return citasError_(v.motivo);
    const actual = citasObjetoDeFila_(ctx.filas[pos], ctx.idx, tz);
    if (actual && actual.fecha === fechaISO && actual.hora === v.hora) return { success: true, message: 'Misma fecha y hora, sin cambios.' };
    if (citasOcupada_(ctx, tz, fechaISO, v.hora, idCita)) return citasError_('El hueco de destino ya está ocupado.');
    citasEscribirFechaHora_(ctx, pos, fechaISO, v.hora);
    return { success: true, message: 'Cita reubicada correctamente.' };
  });
}

/** Intercambia la fecha y la hora de dos citas (cada una conserva su ID y su usuario). */
function citasIntercambiar_(idA, idB) {
  return citasOperar_('citasIntercambiar_', function (ctx, tz) {
    if (citasTexto_(idA) === citasTexto_(idB)) return { success: true, message: 'Misma cita, sin cambios.' };
    const pA = citasPosicion_(ctx, idA), pB = citasPosicion_(ctx, idB);
    if (pA === -1 || pB === -1) return citasError_('Alguna de las citas ya no existe (¿la ha cambiado otra persona?).');
    const a = citasObjetoDeFila_(ctx.filas[pA], ctx.idx, tz), b = citasObjetoDeFila_(ctx.filas[pB], ctx.idx, tz);
    if (!a || !b) return citasError_('Alguna de las citas no tiene una fecha válida.');
    citasEscribirFechaHora_(ctx, pA, b.fecha, b.hora);
    citasEscribirFechaHora_(ctx, pB, a.fecha, a.hora);
    return { success: true, message: 'Citas intercambiadas correctamente.' };
  });
}

/**
 * Cambia un campo suelto de una cita: Asistencia (una de las 4 categorías), Notas o Sesión. `campo` es la cabecera
 * (COLUMNAS.CITAS.ASISTENCIA, .NOTAS o .SESION). Cualquier otro campo se rechaza.
 */
function citasCambiarCampo_(idCita, campo, valor) {
  return citasOperar_('citasCambiarCampo_', function (ctx) {
    const permitidos = [COLUMNAS.CITAS.ASISTENCIA, COLUMNAS.CITAS.NOTAS, COLUMNAS.CITAS.SESION];
    if (permitidos.indexOf(campo) === -1) return citasError_('Ese campo no se puede editar desde aquí.');
    const pos = citasPosicion_(ctx, idCita);
    if (pos === -1) return citasError_('La cita ya no existe (¿la ha cambiado otra persona?).');
    let nuevo = valor === null || valor === undefined ? '' : valor;
    if (campo === COLUMNAS.CITAS.ASISTENCIA) {
      const cat = citasCategoriaAsistencia_(nuevo);
      if (!cat.estandar) return citasError_('La asistencia debe ser una de: ' + Object.keys(ASISTENCIA_CITA).map(k => ASISTENCIA_CITA[k]).join(', ') + '.');
      nuevo = cat.categoria;
    }
    const columna = ctx.idx[Object.keys(COLUMNAS.CITAS).filter(k => COLUMNAS.CITAS[k] === campo)[0]] + 1;
    const celda = ctx.hoja.getRange(pos + 2, columna);
    if (campo !== COLUMNAS.CITAS.SESION) celda.setNumberFormat('@');
    celda.setValue(nuevo);
    return { success: true };
  });
}

/**
 * Elimina citas (borra su fila). Devuelve `snapshots` (una cita completa por cada eliminada, con la forma de citasLeer_) para que
 * el cliente pueda deshacer con citasRestaurar_, igual que hoy con la Agenda.
 * @param {string[]} idsCita
 */
function citasEliminar_(idsCita) {
  return citasOperar_('citasEliminar_', function (ctx, tz) {
    if (!idsCita || !idsCita.length) return citasError_('No hay ninguna cita que eliminar.');
    const filas = [], snapshots = [], errores = [];
    idsCita.forEach(id => {
      const pos = citasPosicion_(ctx, id);
      const c = pos === -1 ? null : citasObjetoDeFila_(ctx.filas[pos], ctx.idx, tz);
      if (!c) { errores.push('Cita ' + id + ': no existe.'); return; }
      if (filas.indexOf(pos + 2) === -1) { filas.push(pos + 2); snapshots.push(c); }
    });
    filas.sort((a, b) => b - a).forEach(fila => ctx.hoja.deleteRow(fila));   // de abajo arriba para que no se muevan las pendientes
    let message = snapshots.length === 1 ? 'Cita eliminada correctamente.' : snapshots.length + ' citas eliminadas correctamente.';
    if (errores.length) message += '\n' + errores.length + ' no se pudieron eliminar:\n' + errores.join('\n');
    return { success: snapshots.length > 0, message: snapshots.length ? message : errores.join('\n'), eliminadas: snapshots.length, snapshots: snapshots };
  });
}

/**
 * Deshace un "Eliminar": vuelve a escribir las citas de `snapshots` (los que devolvió citasEliminar_) con su ID y su "Creada el"
 * originales. Salta las que ya existen o cuyo hueco se ha ocupado entretanto, y lo cuenta.
 */
function citasRestaurar_(snapshots) {
  return citasOperar_('citasRestaurar_', function (ctx, tz) {
    if (!snapshots || !snapshots.length) return citasError_('No hay nada que deshacer.');
    const aEscribir = [], errores = [];
    snapshots.forEach(s => {
      if (!s || !citasTexto_(s.id) || !citasTexto_(s.fecha) || !citasTexto_(s.hora)) { errores.push('Una cita no tiene los datos necesarios.'); return; }
      if (citasPosicion_(ctx, s.id) !== -1 || aEscribir.some(x => x.id === s.id)) { errores.push((s.nombre || s.id) + ': ya existe.'); return; }
      if (citasOcupada_(ctx, tz, s.fecha, s.hora, '') || aEscribir.some(x => x.fecha === s.fecha && x.hora === s.hora)) { errores.push((s.nombre || s.id) + ' (' + s.fecha + ' ' + s.hora + '): el hueco ya está ocupado.'); return; }
      aEscribir.push(s);
    });
    citasEscribirFilas_(ctx, aEscribir);
    let message = aEscribir.length ? 'Cita(s) restaurada(s) correctamente.' : 'No se pudo restaurar nada.';
    if (errores.length) message += '\n' + errores.join('\n');
    return { success: aEscribir.length > 0, message: message, restauradas: aEscribir.length };
  });
}
