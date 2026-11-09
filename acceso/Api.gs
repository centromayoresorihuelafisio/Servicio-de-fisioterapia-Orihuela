// acceso/Api.gs
// Puerta única del navegador: api(token, accion, datos). Plan y reglas en CONTEXTO.md, sección 17.
// ================================================================================

/**
 * Lista blanca de acciones. Se construye dentro de una función porque Apps Script carga los archivos
 * en orden y las funciones de otros archivos podrían no existir todavía.
 *   rol:      'publica' (sin sesión) | 'usuario' | 'administrador'
 *   registrar: anota la acción en "Registro"
 *   entidad:  (args, resultado) => a quién afecta, para la columna "entidad" de "Registro" (si falta, 'api')
 *   detalle:  (args, resultado) => texto breve para "detalle"
 *   renueva:  false si la llamada no debe alargar la sesión (preguntas automáticas de las pantallas)
 *   conTemporal: se admite mientras la contraseña sea temporal
 * Una acción puede devolver `_registro: [{ entidad, detalle }]` para anotar una fila por elemento (p. ej. la copia de
 * cada usuario eliminado); api lo quita antes de responder al navegador.
 */
function accesoAcciones_() {
  const id = COLUMNAS.MAESTRA.ID_PACIENTE;
  return {
    iniciarSesion:     { fn: accesoIniciarSesion_, rol: 'publica' },
    conectarPWA:       { fn: pwaComprobarConexion_, rol: 'publica' },   // la app instalable comprueba la dirección /exec (sección 20)
    comprobarSesion:   { fn: sesionComprobar_, rol: 'usuario' },
    cerrarSesion:      { fn: sesionCerrar_, rol: 'usuario', conTemporal: true },
    cambiarPassword:   { fn: accesoCambiarPassword_, rol: 'usuario', conTemporal: true },
    verComo:           { fn: sesionVerComo_, rol: 'usuario', registrar: true, entidad: () => 'Accesos', detalle: a => a[0] || 'volver a su rol' },

    // Piezas comunes
    obtenerPanelWeb:            { fn: obtenerPanelWeb_, rol: 'usuario' },
    obtenerHCsActivasWeb:       { fn: obtenerHCsActivasWeb_, rol: 'usuario', renueva: false },
    datosWhatsappMaestraWeb:    { fn: datosWhatsappMaestraWeb_, rol: 'usuario' },
    datosWhatsappLoteAgendaWeb: { fn: datosWhatsappLoteAgendaWeb_, rol: 'usuario' },
    guardarPlantillaWhatsappWeb: { fn: guardarPlantillaWhatsappWeb_, rol: 'usuario', registrar: true, entidad: () => 'Plantilla WhatsApp', detalle: (a, r) => r && r.plantilla },

    // Estadísticas
    obtenerDashboardWeb: { fn: obtenerDashboardWeb_, rol: 'administrador' },

    // Valoraciones
    obtenerValoracionesWeb:            { fn: obtenerValoracionesWeb_, rol: 'usuario' },
    obtenerValoracionesUsuarioWeb:     { fn: obtenerValoracionesUsuarioWeb_, rol: 'usuario' },
    obtenerPacientesParaAutocompletar: { fn: obtenerPacientesParaAutocompletar_, rol: 'usuario' },
    procesarValoracion:                { fn: procesarValoracion_, rol: 'usuario' },
    actualizarValoracionWeb:           { fn: actualizarValoracionWeb_, rol: 'usuario' },
    eliminarValoracionWeb:             { fn: eliminarValoracionWeb_, rol: 'usuario', registrar: true },
    restaurarValoracionWeb:            { fn: restaurarValoracionWeb_, rol: 'usuario', registrar: true },

    // Usuarios (eliminar es solo del administrador: decisión 2 de 17.8)
    obtenerBaseDatosCompletaWeb: { fn: obtenerBaseDatosCompletaWeb_, rol: 'usuario' },
    obtenerDatosEdicionPaciente: { fn: obtenerDatosEdicionPaciente_, rol: 'usuario' },
    actualizarPaciente:          { fn: actualizarPaciente_, rol: 'usuario', registrar: true, entidad: a => a[1] },
    guardarPaciente:             { fn: guardarPaciente_, rol: 'usuario', registrar: true, entidad: (a, r) => r && r.idPaciente },
    eliminarPacienteWeb:         { fn: eliminarPacienteWeb_, rol: 'administrador', registrar: true },
    eliminarPacientesLoteWeb:    { fn: eliminarPacientesLoteWeb_, rol: 'administrador', registrar: true },
    restaurarPacienteWeb:        { fn: restaurarPacienteWeb_, rol: 'usuario', registrar: true, entidad: a => a[0] && a[0][id] },
    cambiarEstadoPacienteWeb:    { fn: cambiarEstadoPacienteWeb_, rol: 'usuario' },
    cambiarGravedadPacienteWeb:  { fn: cambiarGravedadPacienteWeb_, rol: 'usuario' },
    cambiarDatoFichaPacienteWeb: { fn: cambiarDatoFichaPacienteWeb_, rol: 'usuario', registrar: true, entidad: a => a[0], detalle: a => a[1] },
    cambiarEstadoLoteWeb:        { fn: cambiarEstadoLoteWeb_, rol: 'usuario', registrar: true, entidad: a => (a[0] || []).join(', '), detalle: a => a[1] },
    ordenarPacientes:            { fn: ordenarPacientes_, rol: 'usuario' },
    darDeAltaPacienteWeb:        { fn: darDeAltaPacienteWeb_, rol: 'usuario', registrar: true, entidad: a => a[0] },
    obtenerFichasUsuariosWeb:    { fn: obtenerFichasUsuariosWeb_, rol: 'usuario', renueva: false },
    obtenerFichaUsuarioWeb:      { fn: obtenerFichaUsuarioWeb_, rol: 'usuario' },

    // Historia clínica (los textos se anotan agrupados desde guardarTextoHCWeb_: 17.3, punto 9)
    obtenerHCWeb:                          { fn: obtenerHCWeb_, rol: 'usuario' },
    guardarTextoHCWeb:                     { fn: guardarTextoHCWeb_, rol: 'usuario' },
    guardarEpisodiosHCWeb:                 { fn: guardarEpisodiosHCWeb_, rol: 'usuario', registrar: true, entidad: a => a[0], detalle: a => JSON.stringify(a[1] || []) },
    generarHistoriaClinicaWeb:             { fn: generarHistoriaClinicaWeb_, rol: 'usuario', registrar: true, entidad: a => a[0] },
    generarHistoriaClinicaRegistroUsuario: { fn: generarHistoriaClinicaRegistroUsuario_, rol: 'usuario', registrar: true, entidad: a => a[0] && a[0].idPaciente },

    // Agenda (las citas van por su ID; se anotan las borradas, con su copia para recuperarlas, y las acciones en bloque)
    obtenerAgendaSemanaWeb:         { fn: obtenerAgendaSemanaWeb_, rol: 'usuario' },
    refrescarAgendaSemanaWeb:       { fn: obtenerAgendaSemanaWeb_, rol: 'usuario', renueva: false },   // recarga silenciosa: la puede lanzar el sondeo
    obtenerVersionAgendaWeb:        { fn: obtenerVersionAgendaWeb_, rol: 'usuario', renueva: false },
    actualizarCampoAgendaWeb:       { fn: actualizarCampoAgendaWeb_, rol: 'usuario' },
    asignarPacienteHuecoWeb:        { fn: asignarPacienteHuecoWeb_, rol: 'usuario' },
    obtenerUsuariosParaCitaWeb:     { fn: obtenerUsuariosParaCitaWeb_, rol: 'usuario' },
    moverCitaWeb:                   { fn: moverCitaWeb_, rol: 'usuario' },
    intercambiarCitasWeb:           { fn: intercambiarCitasWeb_, rol: 'usuario' },
    previsualizarCopiaCitasWeb:     { fn: previsualizarCopiaCitasWeb_, rol: 'usuario' },   // solo lee: no se anota
    copiarVariasCitasWeb:           { fn: copiarVariasCitasWeb_, rol: 'usuario', registrar: true, entidad: a => (a[0] || []).map(x => x && x.fila).join(', '), detalle: (a, r) => r && r.message },
    eliminarDatosFilaAgendaWeb:     { fn: eliminarDatosFilaAgendaWeb_, rol: 'usuario', registrar: true, entidad: a => a[0], detalle: (a, r) => JSON.stringify(r && r.snapshots || []) },
    eliminarVariasCitasWeb:         { fn: eliminarVariasCitasWeb_, rol: 'usuario', registrar: true, entidad: a => (a[0] || []).join(', '), detalle: (a, r) => JSON.stringify(r && r.snapshots || []) },
    restaurarCitasWeb:              { fn: restaurarCitasWeb_, rol: 'usuario', registrar: true, entidad: a => (a[0] || []).map(x => x && x.id).join(', '), detalle: (a, r) => r && r.message },
    darDeAltaPacienteParaAgendaWeb: { fn: darDeAltaPacienteParaAgendaWeb_, rol: 'usuario', registrar: true, entidad: a => a[0] },
    obtenerSemanasYHuecos:          { fn: obtenerSemanasYHuecos_, rol: 'usuario' },
    guardarCitasMultiples:          { fn: guardarCitasMultiples_, rol: 'usuario' },
    obtenerDisponibilidadWeb:       { fn: obtenerDisponibilidadWeb_, rol: 'usuario' },
    aplicarDisponibilidadWeb:       { fn: aplicarDisponibilidadWeb_, rol: 'usuario' },
    obtenerRecordatoriosWeb:        { fn: obtenerRecordatoriosWeb_, rol: 'usuario', renueva: false },
    guardarRecordatorioWeb:         { fn: guardarRecordatorioWeb_, rol: 'usuario' },
    alternarRecordatorioWeb:        { fn: alternarRecordatorioWeb_, rol: 'usuario' },
    eliminarRecordatorioWeb:        { fn: eliminarRecordatorioWeb_, rol: 'usuario' },

    // Configuración (acceso/Administrar.gs). Nunca se anota una contraseña: las temporales solo van a la pantalla.
    accesosListar:            { fn: accesosListar_, rol: 'administrador' },
    accesosCrear:             { fn: accesosCrear_, rol: 'administrador', registrar: true, entidad: a => a[0] && a[0].usuario, detalle: a => 'rol: ' + (a[0] && a[0].rol) + (a[0] && a[0].caduca ? '; caduca: ' + a[0].caduca : '') },
    accesosCambiar:           { fn: accesosCambiar_, rol: 'administrador', registrar: true, entidad: a => a[0], detalle: (a, r) => r && r.detalle },
    accesosRestablecer:       { fn: accesosRestablecer_, rol: 'administrador', registrar: true, entidad: a => a[0], detalle: () => 'contraseña temporal nueva' },
    accesosEliminar:          { fn: accesosEliminar_, rol: 'administrador', registrar: true, entidad: a => a[0], detalle: (a, r) => r && r.detalle },
    registroConsultar:        { fn: registroConsultar_, rol: 'administrador' },
    registroRecuperarUsuario: { fn: registroRecuperarUsuario_, rol: 'administrador', registrar: true, entidad: (a, r) => r && r.idPaciente, detalle: (a, r) => 'desde la fila ' + a[0] + ' de Registro' + (r && r.nombre ? ': ' + r.nombre : '') },
    interruptoresLeer:        { fn: interruptoresLeer_, rol: 'administrador' },
    suspenderUsuarios:        { fn: interruptorSuspender_, rol: 'administrador', registrar: true, entidad: () => 'Accesos', detalle: a => a[0] === true ? 'suspender a los no administradores' : 'reanudar a los no administradores' }
  };
}

/** Anota en "Registro" una acción con `registrar`, con su entidad y detalle si la acción los define. */
function apiRegistrar_(def, sesion, nombre, args, resultado, filas) {
  const fallo = resultado && resultado.success === false;
  if (fallo) { registroAnotar_(sesion.usuario, sesion.rolAnotar, nombre, 'api', resultado.message, 'error'); return; }
  if (Array.isArray(filas) && filas.length) {
    filas.forEach(f => registroAnotar_(sesion.usuario, sesion.rolAnotar, nombre, f.entidad || 'api', f.detalle, 'ok'));
    return;
  }
  const leer = fn => { try { return fn ? fn(args, resultado) : ''; } catch (e) { return ''; } };
  registroAnotar_(sesion.usuario, sesion.rolAnotar, nombre, leer(def.entidad) || 'api', leer(def.detalle), 'ok');
}

/** Prepara la sesión de la llamada con los datos actuales de su cuenta, o devuelve null si ya no vale. */
function apiResolverSesion_(token) {
  const sesion = sesionLeer_(token);
  if (!sesion) return null;
  const perfil = accesoPerfil_(sesion.usuario);
  if (!accesoVigente_(perfil)) { sesionBorrar_(sesion.token); return null; }
  sesion.nombre = perfil.nombre;
  sesion.rolReal = perfil.rol;
  // «Ver como usuario» solo rebaja el rol; «Registro» anota el real y, si hace falta, con cuál se estaba viendo.
  const rebajado = sesion.verComo && ACCESO_ROLES_[sesion.verComo] < ACCESO_ROLES_[perfil.rol];
  sesion.rol = rebajado ? sesion.verComo : perfil.rol;
  sesion.rolAnotar = rebajado ? perfil.rol + ' (como ' + sesion.verComo + ')' : perfil.rol;
  sesion.debeCambiar = perfil.debeCambiar;
  return sesion;
}

/** Respuesta de la acción pública conectarPWA: solo confirma que la dirección es esta aplicación. Ningún dato. */
function pwaComprobarConexion_() {
  return { app: 'Fisioterapia Orihuela' };
}

/**
 * Puerta de la app instalable (PWA, CONTEXTO.md, sección 20). La PWA no tiene google.script.run: envía con fetch un
 * POST en text/plain (así el navegador no hace la consulta previa de CORS) con { token, accion, datos }, y aquí se pasa
 * tal cual a api(), que ya pone la lista blanca, los roles, «Registro», la sesión y el cierre de emergencia.
 * Responde lo mismo que api(), en JSON.
 */
function doPost(e) {
  let respuesta;
  try {
    let p = null;
    try { p = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (err) { p = null; }
    respuesta = p && typeof p === 'object'
      ? api(p.token, p.accion, p.datos)
      : { ok: false, error: 'Petición no válida.' };
  } catch (err) {
    respuesta = { ok: false, error: 'No se pudo atender la petición: ' + (err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta)).setMimeType(ContentService.MimeType.JSON);
}

function api(token, accion, datos) {
  const nombre = String(accion || '').slice(0, 80);
  const args = Array.isArray(datos) ? datos : [];
  let sesion = null;
  try {
    // Plan de emergencia, nivel 3 (17.9): con la app cerrada no se atiende nada, ni siquiera el login.
    if (accesoInterruptores_().cerrada) return { ok: false, error: APP_CERRADA_MSG_, codigo: 'CERRADA' };
    const acciones = accesoAcciones_();
    const def = Object.prototype.hasOwnProperty.call(acciones, nombre) ? acciones[nombre] : null;
    sesion = apiResolverSesion_(token);
    const quien = sesion ? sesion.usuario : '(sin sesión)';
    const rol = sesion ? sesion.rolAnotar : '';

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
    const filas = resultado && resultado._registro;
    if (filas) delete resultado._registro;
    if (def.registrar) apiRegistrar_(def, sesion, nombre, args, resultado, filas);
    return { ok: true, datos: resultado, rol: sesion.rol };   // el rol que se aplica: la pantalla oculta lo que no le toca (17.6)
  } catch (e) {
    if (sesion && sesionEnCurso_) registroAnotar_(sesion.usuario, sesion.rolAnotar, nombre, 'api', e.message, 'error');
    return { ok: false, error: e.message };
  }
}
