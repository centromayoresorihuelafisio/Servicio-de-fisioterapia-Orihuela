// core/Copias_Seguridad.gs
// Copias de seguridad de la hoja de cálculo, que es toda la base de datos (CONTEXTO.md, sección 21).
// Cada semana, un activador hace una copia completa del archivo en una carpeta propia de Drive, con la fecha en el
// nombre, y manda a la papelera las que pasen de COPIAS_GUARDAR_. Si la copia automática falla, avisa por correo.
// Se maneja desde Configuración (sección «Copias de seguridad», solo administrador) o desde el editor.
// ================================================================================

const COPIAS_GUARDAR_ = 8;                                        // copias que se conservan: unas 8 semanas
const COPIAS_CARPETA_NOMBRE_ = 'Copias de seguridad - Fisioterapia Orihuela';
const COPIAS_PREFIJO_ = 'Copia Fisioterapia Orihuela ';           // solo se cuentan (y se podan) los archivos con este principio
const COPIAS_FUNCION_SEMANAL_ = 'copiaSeguridadSemanal';          // la que lanza el activador
const COPIAS_HORA_ = 3;                                           // los domingos, entre las 3 y las 4 de la madrugada
const COPIAS_CUANDO_ = 'los domingos, de 3 a 4 de la madrugada';

/**
 * La carpeta de las copias. Se guarda su ID en las propiedades del script; si falta o está en la papelera, se busca
 * por nombre y, con `crear`, se crea. Sin `crear` puede devolver null.
 */
function copiasCarpeta_(crear) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_KEYS.COPIAS_CARPETA);
  if (id) {
    try {
      const guardada = DriveApp.getFolderById(id);
      if (!guardada.isTrashed()) return guardada;
    } catch (e) { /* borrada o sin acceso: se busca otra por nombre */ }
  }
  let carpeta = null;
  const halladas = DriveApp.getFoldersByName(COPIAS_CARPETA_NOMBRE_);
  while (!carpeta && halladas.hasNext()) {
    const c = halladas.next();
    if (!c.isTrashed()) carpeta = c;
  }
  if (!carpeta && crear) carpeta = DriveApp.createFolder(COPIAS_CARPETA_NOMBRE_);
  if (carpeta) props.setProperty(PROP_KEYS.COPIAS_CARPETA, carpeta.getId());
  return carpeta;
}

/** Nombre de una copia: prefijo, fecha y hora (así dos copias del mismo día no se llaman igual) y si se hizo a mano. */
function copiasNombre_(fecha, motivo) {
  return COPIAS_PREFIJO_ + Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm') +
    (motivo === 'manual' ? ' (a mano)' : '');
}

/** Las copias de la carpeta, de la más nueva a la más vieja. Lo que no empiece por el prefijo no se toca. */
function copiasListar_(carpeta) {
  const lista = [];
  if (!carpeta) return lista;
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const a = archivos.next();
    if (a.isTrashed() || a.getName().indexOf(COPIAS_PREFIJO_) !== 0) continue;
    lista.push({ archivo: a, nombre: a.getName(), fecha: a.getDateCreated() });
  }
  return lista.sort((x, y) => y.fecha.getTime() - x.fecha.getTime());
}

/** Manda a la papelera (no borra del todo) las copias que pasen de COPIAS_GUARDAR_. Devuelve cuántas. */
function copiasPodar_(carpeta) {
  const sobran = copiasListar_(carpeta).slice(COPIAS_GUARDAR_);
  sobran.forEach(c => c.archivo.setTrashed(true));
  return sobran.length;
}

/** Hace una copia completa del archivo de la hoja y poda las viejas. `motivo`: 'semanal' o 'manual'. */
function copiasHacer_(motivo) {
  const ss = getSS_();
  const carpeta = copiasCarpeta_(true);
  SpreadsheetApp.flush();   // que la copia lleve lo último que se haya escrito
  const nombre = copiasNombre_(new Date(), motivo);
  const copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  const borradas = copiasPodar_(carpeta);
  return { nombre: nombre, url: copia.getUrl(), borradas: borradas };
}

/** Los activadores de la copia semanal que hay ahora (debería haber uno o ninguno). */
function copiasActivadores_() {
  return ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === COPIAS_FUNCION_SEMANAL_);
}

/**
 * true si `e` es el aviso de un activador de verdad de este proyecto. copiaSeguridadSemanal tiene que ser pública para
 * que la lance el activador; con esto, nadie más puede llamarla (no sabe el número interno del activador).
 */
function copiasEsActivador_(e) {
  const uid = e && e.triggerUid;
  if (!uid) return false;
  return ScriptApp.getProjectTriggers().some(t => String(t.getUniqueId()) === String(uid));
}

/** Correo a la propietaria cuando falla la copia automática. Si el correo también falla, queda en el registro de ejecuciones. */
function copiasAvisarFallo_(err) {
  const mensaje = err && err.message ? err.message : String(err);
  try {
    let destino = Session.getEffectiveUser().getEmail();
    if (!destino) { const duena = getSS_().getOwner(); destino = duena ? duena.getEmail() : ''; }
    if (!destino) throw new Error('no se sabe a qué dirección escribir');
    MailApp.sendEmail(destino, 'Fisioterapia Orihuela: la copia de seguridad semanal ha fallado',
      'La copia de seguridad automática de la hoja de Fisioterapia Orihuela no se ha podido hacer.\n\n' +
      'Motivo: ' + mensaje + '\n\n' +
      'Los datos de la hoja no se han tocado. Puedes probar a hacer una copia a mano desde la aplicación: ' +
      'Configuración › Copias de seguridad › «Hacer una copia ahora». Si vuelve a fallar, guarda este correo y pide ayuda.');
  } catch (e) {
    console.error('copiasAvisarFallo_: no se pudo mandar el correo (' + e.message + '). Fallo de la copia: ' + mensaje);
  }
}

/**
 * La lanza el activador semanal. Es pública (sin _ final) para que el activador la encuentre, pero solo trabaja si la
 * llama un activador de este proyecto (copiasEsActivador_).
 */
function copiaSeguridadSemanal(e) {
  if (!copiasEsActivador_(e)) throw new Error('Esta función solo la lanza el activador semanal de copias de seguridad.');
  try {
    const r = copiasHacer_('semanal');
    registroAnotar_('sistema', '', 'copia_seguridad', 'Copias de seguridad',
      r.nombre + (r.borradas ? '; a la papelera: ' + r.borradas : ''), 'ok');
  } catch (err) {
    registroAnotar_('sistema', '', 'copia_seguridad', 'Copias de seguridad', err && err.message ? err.message : String(err), 'error');
    copiasAvisarFallo_(err);
  }
}

/** Instala el activador semanal. Antes quita los que hubiera, así nunca queda duplicado. Crea ya la carpeta. */
function copiasInstalarActivador_() {
  return conBloqueoScript_(() => {
    copiasActivadores_().forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger(COPIAS_FUNCION_SEMANAL_).timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(COPIAS_HORA_).create();
    copiasCarpeta_(true);
  });
}

/** Quita el activador semanal (las copias ya hechas no se tocan). */
function copiasQuitarActivador_() {
  return conBloqueoScript_(() => { copiasActivadores_().forEach(t => ScriptApp.deleteTrigger(t)); });
}

// ---------- Acciones de Configuración (acceso/Api.gs, rol administrador) ----------

/** Acción: cómo están las copias, para la sección de Configuración. */
function copiasEstado_() {
  const carpeta = copiasCarpeta_(false);
  const tz = Session.getScriptTimeZone();
  return {
    activa: copiasActivadores_().length > 0,
    cuando: COPIAS_CUANDO_,
    guardar: COPIAS_GUARDAR_,
    carpetaNombre: COPIAS_CARPETA_NOMBRE_,
    carpetaUrl: carpeta ? carpeta.getUrl() : '',
    copias: copiasListar_(carpeta).map(c => ({
      nombre: c.nombre, url: c.archivo.getUrl(), fecha: Utilities.formatDate(c.fecha, tz, 'dd/MM/yyyy HH:mm')
    }))
  };
}

/** Acción: con true instala (o reinstala) el activador semanal; con false lo quita. */
function copiasActivar_(activar) {
  if (activar === true) copiasInstalarActivador_();
  else copiasQuitarActivador_();
  return copiasEstado_();
}

/** Acción: «Hacer una copia ahora». Si falla, el error sale en pantalla (no hace falta correo). */
function copiasHacerAhora_() {
  const r = copiasHacer_('manual');
  const estado = copiasEstado_();
  estado.hecha = r;
  return estado;
}

// ---------- Desde el editor de Apps Script ----------

/**
 * Instala (o reinstala, sin duplicar) la copia semanal. Al ejecutarla la primera vez, Google pide los permisos que
 * faltan (activadores).
 */
function copiasActivarSemanal() {
  soloPropietario_('copiasActivarSemanal');
  copiasInstalarActivador_();
  Logger.log('Copia semanal activada: ' + COPIAS_CUANDO_ + '. Se guardan las ' + COPIAS_GUARDAR_ + ' últimas en la carpeta «' +
    COPIAS_CARPETA_NOMBRE_ + '» de tu Drive.');
}

/** Hace una copia ahora mismo. */
function copiaSeguridadAhora() {
  soloPropietario_('copiaSeguridadAhora');
  const r = copiasHacer_('manual');
  Logger.log('Copia hecha: ' + r.nombre + ' (' + r.url + ').' + (r.borradas ? ' Enviadas a la papelera: ' + r.borradas + '.' : ''));
}
