// acceso/Api.gs
// Puerta única del navegador: api(token, accion, datos). Plan y reglas en CONTEXTO.md, sección 17.
// Por ahora solo pasan por aquí las acciones de acceso: las funciones antiguas siguen abiertas hasta la fase 2.
// ================================================================================

/**
 * Lista blanca de acciones. Se construye dentro de una función porque Apps Script carga los archivos
 * en orden y las funciones de otros archivos podrían no existir todavía.
 *   rol:      'publica' (sin sesión) | 'usuario' | 'administrador'
 *   registrar: anota la acción en "Registro"
 *   renueva:  false si la llamada no debe alargar la sesión (preguntas automáticas de las pantallas)
 *   conTemporal: se admite mientras la contraseña sea temporal
 */
function accesoAcciones_() {
  return {
    iniciarSesion:     { fn: accesoIniciarSesion_, rol: 'publica' },
    comprobarSesion:   { fn: sesionComprobar_, rol: 'usuario' },
    cerrarSesion:      { fn: sesionCerrar_, rol: 'usuario', conTemporal: true },
    cambiarPassword:   { fn: accesoCambiarPassword_, rol: 'usuario', conTemporal: true },
    diagnosticoAcceso: { fn: accesoDiagnostico_, rol: 'administrador', registrar: true }
  };
}

/** Prepara la sesión de la llamada con los datos actuales de su cuenta, o devuelve null si ya no vale. */
function apiResolverSesion_(token) {
  const sesion = sesionLeer_(token);
  if (!sesion) return null;
  const perfil = accesoPerfil_(sesion.usuario);
  if (!accesoVigente_(perfil)) { sesionBorrar_(sesion.token); return null; }
  sesion.nombre = perfil.nombre;
  sesion.rol = perfil.rol;
  sesion.debeCambiar = perfil.debeCambiar;
  return sesion;
}

function api(token, accion, datos) {
  const nombre = String(accion || '').slice(0, 80);
  const args = Array.isArray(datos) ? datos : [];
  let sesion = null;
  try {
    const acciones = accesoAcciones_();
    const def = Object.prototype.hasOwnProperty.call(acciones, nombre) ? acciones[nombre] : null;
    sesion = apiResolverSesion_(token);
    const quien = sesion ? sesion.usuario : '(sin sesión)';
    const rol = sesion ? sesion.rol : '';

    if (!def) {
      registroAnotar_(quien, rol, 'accion_desconocida', 'api', nombre, 'denegado');
      return { ok: false, error: 'Acción no permitida.', codigo: 'ACCION' };
    }
    if (def.rol === 'publica') return { ok: true, datos: def.fn.apply(null, args) };

    if (!sesion) {
      if (def.renueva !== false) registroAnotar_(quien, '', 'sesion_invalida', 'api', nombre, 'denegado');
      return { ok: false, error: 'La sesión ha caducado. Vuelve a entrar.', codigo: 'SESION' };
    }
    if (sesion.debeCambiar && !def.conTemporal) {
      return { ok: false, error: 'Debes cambiar la contraseña temporal.', codigo: 'CAMBIO_PASSWORD' };
    }
    if (ACCESO_ROLES_[sesion.rol] < ACCESO_ROLES_[def.rol]) {
      registroAnotar_(quien, rol, 'accion_denegada', 'api', nombre, 'denegado');
      return { ok: false, error: 'No tienes permiso para esta acción.', codigo: 'DENEGADO' };
    }

    sesionEnCurso_ = sesion;
    if (def.renueva !== false) sesionRenovar_(sesion);
    const resultado = def.fn.apply(null, args);
    if (def.registrar) registroAnotar_(quien, rol, nombre, 'api', '', 'ok');
    return { ok: true, datos: resultado, rol: sesion.rol };
  } catch (e) {
    if (sesion && sesionEnCurso_) registroAnotar_(sesion.usuario, sesion.rol, nombre, 'api', e.message, 'error');
    return { ok: false, error: e.message };
  }
}
