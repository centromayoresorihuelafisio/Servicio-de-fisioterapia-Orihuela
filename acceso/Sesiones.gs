// acceso/Sesiones.gs
// Sesiones en CacheService: token aleatorio, caducidad por inactividad y máximo absoluto (CONTEXTO.md, sección 17.6).
// ================================================================================

const SESION_INACTIVIDAD_S_ = 3600;              // 60 minutos sin actividad
const SESION_MAXIMO_MS_ = 12 * 3600 * 1000;      // decisión del dueño (17.8): 12 horas como máximo absoluto

// Sesión de la ejecución en curso: la pone api() y la leen las acciones.
let sesionEnCurso_ = null;

function sesionActual_() {
  return sesionEnCurso_;
}

function sesionCrear_(usuario) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('ses_' + token, JSON.stringify({ usuario: usuario, creada: Date.now() }), SESION_INACTIVIDAD_S_);
  return token;
}

/** Devuelve la sesión del token, o null si no existe, ha caducado o el token no tiene la forma esperada. */
function sesionLeer_(token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const cache = CacheService.getScriptCache();
  const guardada = cache.get('ses_' + token);
  if (!guardada) return null;
  const sesion = JSON.parse(guardada);
  if (Date.now() - sesion.creada > SESION_MAXIMO_MS_) { cache.remove('ses_' + token); return null; }
  sesion.token = token;
  return sesion;
}

function sesionRenovar_(sesion) {
  const copia = { usuario: sesion.usuario, creada: sesion.creada, verComo: sesion.verComo || '' };
  CacheService.getScriptCache().put('ses_' + sesion.token, JSON.stringify(copia), SESION_INACTIVIDAD_S_);
}

function sesionBorrar_(token) {
  CacheService.getScriptCache().remove('ses_' + token);
}

/** Acción de la puerta única: cierra la sesión actual. */
function sesionCerrar_() {
  const sesion = sesionActual_();
  sesionBorrar_(sesion.token);
  registroAnotar_(sesion.usuario, sesion.rolAnotar, 'logout', 'Accesos', '', 'ok');
  return { hecho: true };
}

/** Acción de la puerta única: confirma que la sesión vale y dice quién es (rol = el que se aplica; rolReal = el de su cuenta). */
function sesionComprobar_() {
  const sesion = sesionActual_();
  return { usuario: sesion.usuario, nombre: sesion.nombre, rol: sesion.rol, rolReal: sesion.rolReal, verComo: sesion.rol !== sesion.rolReal };
}

/**
 * Acción de la puerta única: «Ver como usuario» (17.6). Con un rol, la sesión pasa a usarlo; sin él, vuelve al de la cuenta.
 * Solo puede rebajar el rol y vale para todas las ventanas de la sesión. «Registro» sigue anotando al usuario real.
 */
function sesionVerComo_(rol) {
  const sesion = sesionActual_();
  const pedido = String(rol || '');
  if (pedido && !(ACCESO_ROLES_[pedido] < ACCESO_ROLES_[sesion.rolReal])) {
    throw new Error('Solo se puede ver la aplicación con un rol inferior al tuyo.');
  }
  sesion.verComo = pedido;
  sesionRenovar_(sesion);
  sesion.rol = pedido || sesion.rolReal;
  return sesionComprobar_();
}
