// acceso/Cuentas.gs
// Cuentas de la hoja "Accesos": contraseñas, entrada, bloqueo por intentos fallidos y cambio de contraseña.
// Plan completo en CONTEXTO.md, sección 17.
// ================================================================================

const ACCESO_CABECERAS_ = ['usuario', 'nombre', 'hash', 'sal', 'rol', 'activo', 'caduca', 'debeCambiarPassword',
  'creado', 'ultimoAcceso', 'intentosFallidos', 'bloqueadoHasta'];
const ACCESO_ROLES_ = { usuario: 1, administrador: 2 };
const ACCESO_MIN_PASSWORD_ = 4;           // decisión del dueño (17.8): vale un PIN de 4 dígitos
const ACCESO_MAX_PASSWORD_ = 200;
const ACCESO_MAX_FALLOS_ = 5;
const ACCESO_BLOQUEO_MIN_ = 15;
const ACCESO_CACHE_PERFIL_S_ = 60;
const ACCESO_ITERACIONES_DEFECTO_ = 1000; // se sustituye al ejecutar accesoMedirIteraciones

const ACCESO_MSG_INCORRECTO_ = 'Usuario o contraseña incorrectos.';
const ACCESO_MSG_BLOQUEO_ = 'Demasiados intentos. Espera ' + ACCESO_BLOQUEO_MIN_ + ' minutos y vuelve a probar.';

function accesoClave_(usuario) {
  return String(usuario || '').trim().toLowerCase();
}

function accesoIteraciones_() {
  const n = Number(PropertiesService.getScriptProperties().getProperty(PROP_KEYS.ACCESO_ITERACIONES));
  return n > 0 ? n : ACCESO_ITERACIONES_DEFECTO_;
}

/** Resumen de una contraseña. Guarda las iteraciones junto al resultado para poder cambiarlas sin invalidar las cuentas. */
function accesoHash_(password, sal, iteraciones) {
  const salBytes = Utilities.newBlob(sal).getBytes();
  let d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ':' + password, Utilities.Charset.UTF_8);
  for (let i = 0; i < iteraciones; i++) {
    d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salBytes.concat(d));
  }
  return iteraciones + '$' + Utilities.base64Encode(d);
}

function accesoPasswordCorrecta_(password, cuenta) {
  const iteraciones = Number(String(cuenta.hash).split('$')[0]);
  return !!iteraciones && accesoHash_(password, cuenta.sal, iteraciones) === cuenta.hash;
}

/** Sal y resumen nuevos para una contraseña, listos para escribir en la fila. */
function accesoCredencial_(password) {
  const sal = Utilities.getUuid();
  return { sal: sal, hash: accesoHash_(password, sal, accesoIteraciones_()) };
}

function accesoHoja_() {
  const hoja = getSS_().getSheetByName(SHEETS.ACCESOS);
  if (!hoja) throw new Error('La app aún no está preparada: falta la hoja «' + SHEETS.ACCESOS + '». Ejecuta accesoPrepararHojas desde el editor.');
  return hoja;
}

/** Busca una cuenta por nombre de usuario (sin distinguir mayúsculas). Devuelve sus campos y `fila`, o null. */
function accesoBuscarCuenta_(usuario) {
  const clave = accesoClave_(usuario);
  const filas = accesoHoja_().getDataRange().getValues();
  const cab = filas[0].map(String);
  for (let f = 1; f < filas.length; f++) {
    if (accesoClave_(filas[f][cab.indexOf('usuario')]) !== clave) continue;
    const cuenta = { fila: f + 1, cabeceras: cab };
    ACCESO_CABECERAS_.forEach(c => { cuenta[c] = filas[f][cab.indexOf(c)]; });
    return cuenta;
  }
  return null;
}

/** Escribe campos de una cuenta por nombre de cabecera y limpia su copia en caché. */
function accesoEscribirCuenta_(cuenta, campos) {
  const hoja = accesoHoja_();
  Object.keys(campos).forEach(c => hoja.getRange(cuenta.fila, cuenta.cabeceras.indexOf(c) + 1).setValue(campos[c]));
  CacheService.getScriptCache().remove('acc_' + accesoClave_(cuenta.usuario));
}

function accesoVerdadero_(v) {
  return v === true || /^(true|verdadero|s[ií])$/i.test(String(v).trim());
}

function accesoFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v) ? v : null;
}

function accesoPerfilDeCuenta_(c) {
  const caduca = accesoFecha_(c.caduca);
  return {
    usuario: String(c.usuario), nombre: String(c.nombre), rol: String(c.rol).trim().toLowerCase(),
    activo: accesoVerdadero_(c.activo), caduca: caduca ? caduca.getTime() : 0,
    debeCambiar: accesoVerdadero_(c.debeCambiarPassword)
  };
}

/** Lo que una sesión necesita saber de su cuenta, con caché corta (rol y activo se recomprueban así, 17.6). */
function accesoPerfil_(usuario) {
  const cache = CacheService.getScriptCache();
  const clave = 'acc_' + accesoClave_(usuario);
  const guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);
  const c = accesoBuscarCuenta_(usuario);
  if (!c) return null;
  const perfil = accesoPerfilDeCuenta_(c);
  cache.put(clave, JSON.stringify(perfil), ACCESO_CACHE_PERFIL_S_);
  return perfil;
}

/** La fecha de caducidad se cuenta entera: el acceso sirve hasta el final de ese día. */
function accesoCaducada_(perfil) {
  return !!perfil.caduca && Date.now() >= perfil.caduca + 24 * 3600 * 1000;
}

/** ¿Puede entrar? Activa, con rol conocido, sin caducar y, si están suspendidos los no administradores (17.9, nivel 2), administrador. */
function accesoVigente_(perfil) {
  return !!perfil && perfil.activo && !!ACCESO_ROLES_[perfil.rol] && !accesoCaducada_(perfil) &&
    (perfil.rol === 'administrador' || !accesoInterruptores_().suspendidos);
}

function accesoBloqueado_(usuario, cuenta) {
  if (!cuenta) return !!CacheService.getScriptCache().get('bloq_' + accesoClave_(usuario));
  const hasta = accesoFecha_(cuenta.bloqueadoHasta);
  return !!hasta && hasta.getTime() > Date.now();
}

/**
 * Cuenta un fallo y bloquea al llegar al máximo. Los usuarios que no existen se cuentan en la caché, para que
 * el comportamiento no revele qué nombres son reales. Devuelve true si este fallo ha provocado el bloqueo.
 */
function accesoAnotarFallo_(usuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cuenta = accesoBuscarCuenta_(usuario);
    if (cuenta) {
      const n = (Number(cuenta.intentosFallidos) || 0) + 1;
      if (n < ACCESO_MAX_FALLOS_) { accesoEscribirCuenta_(cuenta, { intentosFallidos: n }); return false; }
      accesoEscribirCuenta_(cuenta, { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + ACCESO_BLOQUEO_MIN_ * 60000) });
      return true;
    }
    const cache = CacheService.getScriptCache();
    const clave = accesoClave_(usuario);
    const n = (Number(cache.get('fallos_' + clave)) || 0) + 1;
    if (n < ACCESO_MAX_FALLOS_) { cache.put('fallos_' + clave, String(n), ACCESO_BLOQUEO_MIN_ * 60); return false; }
    cache.remove('fallos_' + clave);
    cache.put('bloq_' + clave, '1', ACCESO_BLOQUEO_MIN_ * 60);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function accesoAvisarBloqueo_(usuario) {
  registroAnotar_(usuario, '', 'bloqueo', 'Accesos', 'Bloqueo de ' + ACCESO_BLOQUEO_MIN_ + ' minutos', 'aviso');
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Fisioterapia Orihuela: acceso bloqueado',
      'El usuario «' + usuario + '» ha fallado ' + ACCESO_MAX_FALLOS_ + ' veces seguidas y queda bloqueado ' +
      ACCESO_BLOQUEO_MIN_ + ' minutos. Si no has sido tú ni la persona que te sustituye, revisa la hoja «' + SHEETS.REGISTRO + '».');
  } catch (e) {
    registroAnotar_(usuario, '', 'bloqueo', 'Accesos', 'No se pudo enviar el correo: ' + e.message, 'error');
  }
}

/** Acción pública de la puerta única: comprueba usuario y contraseña y abre la sesión. */
function accesoIniciarSesion_(usuario, password) {
  const inicio = Date.now();
  const nombre = String(usuario || '').trim().slice(0, 60);
  const clave = String(password || '').slice(0, ACCESO_MAX_PASSWORD_);
  if (!nombre || !clave) throw new Error('Escribe el usuario y la contraseña.');

  const cuenta = accesoBuscarCuenta_(nombre);
  if (accesoBloqueado_(nombre, cuenta)) {
    registroAnotar_(nombre, '', 'login_fallido', 'Accesos', 'Intento durante un bloqueo', 'denegado');
    throw new Error(ACCESO_MSG_BLOQUEO_);
  }

  // Sin cuenta también se calcula el resumen, para que tarde lo mismo que un fallo real.
  const correcta = cuenta ? accesoPasswordCorrecta_(clave, cuenta) : !accesoHash_(clave, 'sin-cuenta', accesoIteraciones_());
  if (!correcta) {
    registroAnotar_(nombre, '', 'login_fallido', 'Accesos', '', 'denegado');
    if (accesoAnotarFallo_(nombre)) { accesoAvisarBloqueo_(nombre); throw new Error(ACCESO_MSG_BLOQUEO_); }
    throw new Error(ACCESO_MSG_INCORRECTO_);
  }

  const perfil = accesoPerfilDeCuenta_(cuenta);
  if (!accesoVigente_(perfil)) {
    const suspendido = perfil.activo && !accesoCaducada_(perfil) && accesoInterruptores_().suspendidos;
    registroAnotar_(perfil.usuario, perfil.rol, 'login_fallido', 'Accesos', suspendido ? 'Accesos suspendidos' : 'Cuenta desactivada o caducada', 'denegado');
    throw new Error(suspendido ? 'El acceso está suspendido por ahora. Habla con el administrador.' : 'Este acceso está desactivado. Habla con el administrador.');
  }

  // Solo se escribe lo que cambia: cada celda escrita alarga la entrada.
  const cambios = { ultimoAcceso: new Date() };
  if (cuenta.intentosFallidos) cambios.intentosFallidos = 0;
  if (cuenta.bloqueadoHasta) cambios.bloqueadoHasta = '';
  // Una contraseña guardada con otras iteraciones se actualiza sola al entrar.
  if (Number(String(cuenta.hash).split('$')[0]) !== accesoIteraciones_()) Object.assign(cambios, accesoCredencial_(clave));
  accesoEscribirCuenta_(cuenta, cambios);
  const token = sesionCrear_(perfil.usuario);
  const ms = Date.now() - inicio;
  registroAnotar_(perfil.usuario, perfil.rol, 'login', 'Accesos', JSON.stringify({ ms: ms }), 'ok');
  return { token: token, usuario: perfil.usuario, nombre: perfil.nombre, rol: perfil.rol, debeCambiar: perfil.debeCambiar, ms: ms };
}

/** Cambia la contraseña de quien tiene la sesión. Es la única acción que admite una contraseña temporal. */
function accesoCambiarPassword_(actual, nueva) {
  const sesion = sesionActual_();
  const cuenta = accesoBuscarCuenta_(sesion.usuario);
  const clave = String(nueva || '');
  if (!cuenta || !accesoPasswordCorrecta_(String(actual || '').slice(0, ACCESO_MAX_PASSWORD_), cuenta)) {
    throw new Error('La contraseña actual no es correcta.');
  }
  if (clave.length < ACCESO_MIN_PASSWORD_ || clave.length > ACCESO_MAX_PASSWORD_) {
    throw new Error('La contraseña nueva debe tener al menos ' + ACCESO_MIN_PASSWORD_ + ' caracteres.');
  }
  if (clave === actual) throw new Error('La contraseña nueva debe ser distinta de la actual.');
  const credencial = accesoCredencial_(clave);
  accesoEscribirCuenta_(cuenta, { hash: credencial.hash, sal: credencial.sal, debeCambiarPassword: false });
  registroAnotar_(cuenta.usuario, cuenta.rol, 'cambio_password', 'Accesos', '', 'ok');
  return { hecho: true };
}
