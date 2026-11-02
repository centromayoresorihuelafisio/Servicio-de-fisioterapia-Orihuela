// acceso/Administrar.gs
// Lo que hace la pestaña Configuración (?page=configuracion), solo para el administrador: cuentas de "Accesos",
// consulta de "Registro", recuperar un usuario eliminado e interruptores del plan de emergencia (CONTEXTO.md, 17.9 y 17.10).
// Todas son acciones de accesoAcciones_ (acceso/Api.gs) con rol 'administrador'. Nunca devuelven el hash ni la sal.
// ================================================================================

const ACCESO_USUARIO_VALIDO_ = /^[A-Za-z0-9._-]{3,40}$/;
const ACCESO_TEMPORAL_LETRAS_ = 'abcdefghjkmnpqrstuvwxyz23456789';   // sin 0/o ni 1/l/i, para dictarla sin errores

// ---------- Interruptores (17.9) ----------

const APP_CERRADA_MSG_ = 'La aplicación está cerrada por ahora. Habla con el administrador.';
let accesoInterruptoresMemo_ = null;   // se leen una vez por ejecución: cada llamada a api es una ejecución nueva

/** Estado de los interruptores del plan de emergencia: suspendidos (nivel 2) y cerrada (nivel 3). */
function accesoInterruptores_() {
  if (!accesoInterruptoresMemo_) {
    const p = PropertiesService.getScriptProperties();
    accesoInterruptoresMemo_ = {
      suspendidos: p.getProperty(PROP_KEYS.ACCESOS_SUSPENDIDOS) === 'si',
      cerrada: p.getProperty(PROP_KEYS.APP_CERRADA) === 'si'
    };
  }
  return accesoInterruptoresMemo_;
}

/** Pone o quita un interruptor en las propiedades del script. */
function accesoPonerInterruptor_(clave, encendido) {
  const p = PropertiesService.getScriptProperties();
  if (encendido) p.setProperty(clave, 'si'); else p.deleteProperty(clave);
  accesoInterruptoresMemo_ = null;
}

/** Acción: lo que la sección «Emergencia» necesita saber. La app cerrada no se ve aquí: con ella, esta página no abre. */
function interruptoresLeer_() {
  return { suspendidos: accesoInterruptores_().suspendidos };
}

/** Acción: nivel 2 de 17.9. Con true, solo entra el administrador; las sesiones de los demás caducan en su siguiente acción. */
function interruptorSuspender_(encendido) {
  accesoPonerInterruptor_(PROP_KEYS.ACCESOS_SUSPENDIDOS, encendido === true);
  return interruptoresLeer_();
}

// ---------- Cuentas de "Accesos" ----------

/** Todas las cuentas, con sus campos por nombre de cabecera y su `fila`. */
function accesoLeerCuentas_() {
  const filas = accesoHoja_().getDataRange().getValues();
  const cab = filas[0].map(String);
  const cuentas = [];
  for (let f = 1; f < filas.length; f++) {
    if (!String(filas[f][cab.indexOf('usuario')] || '').trim()) continue;
    const c = { fila: f + 1, cabeceras: cab };
    ACCESO_CABECERAS_.forEach(k => { c[k] = filas[f][cab.indexOf(k)]; });
    cuentas.push(c);
  }
  return cuentas;
}

/** ¿Queda algún administrador activo y sin caducar si a `clave` se le aplican `cambios` (o se elimina, con null)? */
function accesoQuedaAdministrador_(cuentas, clave, cambios) {
  return cuentas.some(c => {
    if (accesoClave_(c.usuario) === clave) {
      if (cambios === null) return false;
      c = Object.assign({}, c, cambios);
    }
    const p = accesoPerfilDeCuenta_(c);
    return p.rol === 'administrador' && accesoVigente_(p);
  });
}

function accesoFechaTexto_(v, formato) {
  const d = accesoFecha_(v);
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), formato) : '';
}

/** Una cuenta tal como la ve la pantalla (sin hash ni sal). */
function accesoCuentaParaPantalla_(c, yo) {
  const p = accesoPerfilDeCuenta_(c);
  const bloqueo = accesoFecha_(c.bloqueadoHasta);
  return {
    usuario: p.usuario, nombre: p.nombre, rol: p.rol, activo: p.activo,
    caduca: accesoFechaTexto_(c.caduca, 'yyyy-MM-dd'),
    caducada: accesoCaducada_(p),
    debeCambiar: p.debeCambiar,
    creado: accesoFechaTexto_(c.creado, 'dd/MM/yyyy'),
    ultimoAcceso: accesoFechaTexto_(c.ultimoAcceso, 'dd/MM/yyyy HH:mm'),
    bloqueadoHasta: bloqueo && bloqueo.getTime() > Date.now() ? accesoFechaTexto_(bloqueo, 'HH:mm') : '',
    yo: accesoClave_(p.usuario) === yo
  };
}

/** Acción: lista de cuentas para la sección «Accesos». */
function accesosListar_() {
  const yo = accesoClave_(sesionActual_().usuario);
  return accesoLeerCuentas_().map(c => accesoCuentaParaPantalla_(c, yo));
}

/** Contraseña temporal de 8 letras y cifras fáciles de dictar. Obliga a cambiarla al entrar. */
function accesoTemporal_() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  let s = '';
  for (let i = 0; i < 8; i++) s += ACCESO_TEMPORAL_LETRAS_[(bytes[i] + 256) % ACCESO_TEMPORAL_LETRAS_.length];
  return s;
}

function accesoRolValido_(rol) {
  const r = String(rol || '').trim().toLowerCase();
  if (!ACCESO_ROLES_[r]) throw new Error('El rol debe ser «usuario» o «administrador».');
  return r;
}

/** Fecha de caducidad del formulario (aaaa-mm-dd) como fecha de la hoja; '' si no tiene. */
function accesoCaducaValida_(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  if (!d || d.getMonth() !== Number(m[2]) - 1) throw new Error('La fecha de caducidad no es válida.');
  return d;
}

function accesoNombreValido_(nombre, usuario) {
  const n = String(nombre || '').trim().slice(0, 80);
  return n || usuario;
}

/** Acción: crea una cuenta con contraseña temporal. Devuelve la contraseña UNA vez, para dársela a la persona. */
function accesosCrear_(datos) {
  const d = datos || {};
  const usuario = String(d.usuario || '').trim();
  if (!ACCESO_USUARIO_VALIDO_.test(usuario)) {
    throw new Error('El usuario debe tener de 3 a 40 letras o cifras, sin espacios (se admiten . _ -).');
  }
  const rol = accesoRolValido_(d.rol);
  const caduca = accesoCaducaValida_(d.caduca);
  const temporal = accesoTemporal_();
  const credencial = accesoCredencial_(temporal);
  conBloqueoScript_(() => {
    if (accesoBuscarCuenta_(usuario)) throw new Error('Ya existe una cuenta con el usuario «' + usuario + '».');
    const fila = { usuario: usuario, nombre: accesoNombreValido_(d.nombre, usuario), hash: credencial.hash, sal: credencial.sal,
      rol: rol, activo: true, caduca: caduca, debeCambiarPassword: true, creado: new Date(),
      ultimoAcceso: '', intentosFallidos: 0, bloqueadoHasta: '' };
    accesoHoja_().appendRow(ACCESO_CABECERAS_.map(c => fila[c]));
  });
  return { usuario: usuario, temporal: temporal };
}

/** Busca la cuenta o avisa de que ya no existe. */
function accesoCuentaExistente_(cuentas, usuario) {
  const clave = accesoClave_(usuario);
  const c = cuentas.filter(x => accesoClave_(x.usuario) === clave)[0];
  if (!c) throw new Error('Esa cuenta ya no existe. Recarga la lista.');
  return c;
}

/**
 * Acción: cambia el usuario (el nombre con el que se entra), nombre, rol, activo o caducidad de una cuenta, y la desbloquea si se pide.
 * Al cambiar el usuario, las sesiones abiertas de esa cuenta se cierran (tendrá que entrar con el nuevo), salvo la propia,
 * que pasa al nombre nuevo. "Registro" conserva el nombre antiguo en las filas anteriores.
 * Nadie puede quitarse a sí mismo el rol ni el acceso, y nunca puede quedar la app sin un administrador activo.
 * Devuelve la cuenta como la ve la pantalla y `detalle` (lo que cambió, para "Registro").
 */
function accesosCambiar_(usuario, cambios) {
  const pedido = cambios || {};
  const yo = accesoClave_(sesionActual_().usuario);
  return conBloqueoScript_(() => {
    const cuentas = accesoLeerCuentas_();
    const c = accesoCuentaExistente_(cuentas, usuario);
    const clave = accesoClave_(c.usuario);
    const campos = {};
    const notas = [];
    const si = v => accesoVerdadero_(v) ? 'sí' : 'no';

    if ('usuario' in pedido) {
      const u = String(pedido.usuario || '').trim();
      if (u !== String(c.usuario)) {
        if (!ACCESO_USUARIO_VALIDO_.test(u)) throw new Error('El usuario debe tener de 3 a 40 letras o cifras, sin espacios (se admiten . _ -).');
        if (accesoClave_(u) !== clave && cuentas.some(x => accesoClave_(x.usuario) === accesoClave_(u))) {
          throw new Error('Ya existe una cuenta con el usuario «' + u + '».');
        }
        campos.usuario = u; notas.push('usuario: ' + c.usuario + ' → ' + u);
      }
    }
    if ('nombre' in pedido) {
      const n = accesoNombreValido_(pedido.nombre, c.usuario);
      if (n !== String(c.nombre)) { campos.nombre = n; notas.push('nombre: ' + c.nombre + ' → ' + n); }
    }
    if ('rol' in pedido) {
      const r = accesoRolValido_(pedido.rol);
      if (r !== String(c.rol).trim().toLowerCase()) { campos.rol = r; notas.push('rol: ' + c.rol + ' → ' + r); }
    }
    if ('activo' in pedido) {
      const a = pedido.activo === true;
      if (a !== accesoVerdadero_(c.activo)) { campos.activo = a; notas.push('activo: ' + si(c.activo) + ' → ' + si(a)); }
    }
    if ('caduca' in pedido) {
      const d = accesoCaducaValida_(pedido.caduca);
      const antes = accesoFechaTexto_(c.caduca, 'dd/MM/yyyy') || 'sin fecha';
      const despues = d ? accesoFechaTexto_(d, 'dd/MM/yyyy') : 'sin fecha';
      if (antes !== despues) { campos.caduca = d; notas.push('caduca: ' + antes + ' → ' + despues); }
    }
    if (pedido.desbloquear === true && (c.bloqueadoHasta || Number(c.intentosFallidos))) {
      campos.bloqueadoHasta = ''; campos.intentosFallidos = 0; notas.push('desbloqueada');
    }
    if (!notas.length) return { cuenta: accesoCuentaParaPantalla_(c, yo), detalle: 'sin cambios' };

    if (clave === yo && ('rol' in campos || 'activo' in campos || 'caduca' in campos)) {
      throw new Error('No puedes cambiar tu propio rol, tu acceso ni tu caducidad. Pídeselo a otro administrador.');
    }
    if (!accesoQuedaAdministrador_(cuentas, clave, campos)) {
      throw new Error('No se puede: la aplicación se quedaría sin ningún administrador activo.');
    }
    accesoEscribirCuenta_(c, campos);
    let yoAhora = yo;
    if ('usuario' in campos) {
      CacheService.getScriptCache().remove('acc_' + accesoClave_(campos.usuario));
      if (clave === yo) {   // la sesión propia sigue, con el nombre nuevo
        const sesion = sesionActual_();
        sesion.usuario = campos.usuario;
        sesionRenovar_(sesion);
        yoAhora = accesoClave_(campos.usuario);
      }
    }
    return { cuenta: accesoCuentaParaPantalla_(Object.assign({}, c, campos), yoAhora), detalle: notas.join('; '), yo: clave === yo };
  });
}

/** Acción: pone una contraseña temporal nueva (obliga a cambiarla al entrar) y desbloquea la cuenta. */
function accesosRestablecer_(usuario) {
  const temporal = accesoTemporal_();
  const credencial = accesoCredencial_(temporal);
  conBloqueoScript_(() => {
    const c = accesoCuentaExistente_(accesoLeerCuentas_(), usuario);
    accesoEscribirCuenta_(c, { hash: credencial.hash, sal: credencial.sal, debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: '' });
  });
  return { usuario: String(usuario), temporal: temporal };
}

/** Acción: borra la fila de una cuenta. Ni la propia ni la del último administrador activo. Su sesión deja de valer en la siguiente acción. */
function accesosEliminar_(usuario) {
  const yo = accesoClave_(sesionActual_().usuario);
  return conBloqueoScript_(() => {
    const cuentas = accesoLeerCuentas_();
    const c = accesoCuentaExistente_(cuentas, usuario);
    const clave = accesoClave_(c.usuario);
    if (clave === yo) throw new Error('No puedes eliminar tu propia cuenta.');
    if (!accesoQuedaAdministrador_(cuentas, clave, null)) {
      throw new Error('No se puede: la aplicación se quedaría sin ningún administrador activo.');
    }
    accesoHoja_().deleteRow(c.fila);
    CacheService.getScriptCache().remove('acc_' + clave);
    return { usuario: String(c.usuario), detalle: 'nombre: ' + c.nombre + '; rol: ' + c.rol };
  });
}

// ---------- Consulta de "Registro" ----------

const REGISTRO_CONSULTA_MAX_ = 200;       // filas que se devuelven como mucho
const REGISTRO_CONSULTA_BLOQUE_ = 1000;   // se lee de abajo arriba, por bloques
const REGISTRO_CONSULTA_TOPE_ = 20000;    // filas leídas como mucho en una consulta
const REGISTRO_DETALLE_PANTALLA_ = 300;   // caracteres de "detalle" que se mandan a la pantalla
const REGISTRO_ACCIONES_COPIA_ = ['eliminarPacienteWeb', 'eliminarPacientesLoteWeb'];   // su "detalle" es la copia completa del usuario

/** Fecha aaaa-mm-dd del filtro: inicio del día o, con `finDia`, su último instante. null si no hay. */
function registroFechaFiltro_(texto, finDia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || '').trim());
  if (!m) return null;
  return finDia ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999) : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function registroEsCopiaUsuario_(accion, resultado, detalle) {
  return REGISTRO_ACCIONES_COPIA_.indexOf(String(accion)) !== -1 && String(resultado) === 'ok' && /^'?\{/.test(String(detalle));
}

/** Nombre del usuario guardado en la copia de una fila de eliminar ('' si no se puede leer). */
function registroNombreCopia_(detalle) {
  try { return String(JSON.parse(String(detalle).replace(/^'/, ''))[COLUMNAS.MAESTRA.NOMBRE] || ''); } catch (e) { return ''; }
}

/**
 * Acción: filas de "Registro", de la más reciente a la más antigua, filtradas en el servidor (desde, hasta, usuario,
 * accion, texto en entidad o detalle). Solo lee las filas recientes: se para al pasar de `desde`, al juntar 200 filas
 * o tras leer 20 000. Las listas de usuarios y acciones salen de lo leído, para los desplegables de los filtros.
 */
function registroConsultar_(filtros) {
  const f = filtros || {};
  const desde = registroFechaFiltro_(f.desde, false);
  const hasta = registroFechaFiltro_(f.hasta, true);
  const usuario = String(f.usuario || '').trim().toLowerCase();
  const accion = String(f.accion || '').trim();
  const texto = String(f.texto || '').trim().toLowerCase().slice(0, 100);
  const vacio = { filas: [], hayMas: false, usuarios: [], acciones: [] };

  const hoja = getSS_().getSheetByName(SHEETS.REGISTRO);
  if (!hoja) return vacio;
  const tz = Session.getScriptTimeZone();
  const filas = [];
  const usuarios = {};
  const acciones = {};
  let fin = hoja.getLastRow();
  let leidas = 0;
  let parar = false;

  while (fin >= 2 && !parar && leidas < REGISTRO_CONSULTA_TOPE_) {
    const ini = Math.max(2, fin - REGISTRO_CONSULTA_BLOQUE_ + 1);
    const valores = hoja.getRange(ini, 1, fin - ini + 1, REGISTRO_CABECERAS_.length).getValues();
    leidas += valores.length;
    for (let i = valores.length - 1; i >= 0; i--) {
      const v = valores[i];
      const fecha = accesoFecha_(v[0]);
      if (desde && fecha && fecha < desde) { parar = true; break; }   // las filas se añaden en orden: lo de arriba es más antiguo
      const quien = String(v[1]), que = String(v[3]);
      usuarios[quien] = true;
      acciones[que] = true;
      if (hasta && fecha && fecha > hasta) continue;
      if (usuario && quien.toLowerCase() !== usuario) continue;
      if (accion && que !== accion) continue;
      const detalle = String(v[5]);
      if (texto && (String(v[4]) + ' ' + detalle).toLowerCase().indexOf(texto) === -1) continue;
      if (filas.length >= REGISTRO_CONSULTA_MAX_) { parar = true; break; }
      filas.push({
        fila: ini + i,
        fecha: fecha ? Utilities.formatDate(fecha, tz, 'dd/MM/yyyy HH:mm:ss') : String(v[0]),
        usuario: quien, rol: String(v[2]), accion: que, entidad: String(v[4]),
        detalle: detalle.length > REGISTRO_DETALLE_PANTALLA_ ? detalle.slice(0, REGISTRO_DETALLE_PANTALLA_) + '…' : detalle,
        resultado: String(v[6]),
        recuperable: registroEsCopiaUsuario_(que, v[6], detalle),
        nombreCopia: registroEsCopiaUsuario_(que, v[6], detalle) ? registroNombreCopia_(detalle) : ''
      });
    }
    fin = ini - 1;
  }
  const lista = o => Object.keys(o).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  return { filas: filas, hayMas: parar ? filas.length >= REGISTRO_CONSULTA_MAX_ : fin >= 2, usuarios: lista(usuarios), acciones: lista(acciones) };
}

/**
 * Acción: vuelve a añadir a Usuarios a un usuario eliminado, con la copia que guardó "Registro" al borrarlo
 * (decisión 2 de 17.8). Usa restaurarPacienteWeb_, la misma que Deshacer: si ya está en Usuarios, no lo duplica.
 * El enlace de la Historia clínica vuelve como texto (la URL), igual que con Deshacer.
 */
function registroRecuperarUsuario_(fila) {
  const hoja = getSS_().getSheetByName(SHEETS.REGISTRO);
  const n = parseInt(fila, 10);
  if (!hoja || !(n >= 2 && n <= hoja.getLastRow())) throw new Error('Esa fila de «Registro» ya no existe.');
  const v = hoja.getRange(n, 1, 1, REGISTRO_CABECERAS_.length).getValues()[0];
  if (!registroEsCopiaUsuario_(v[3], v[6], v[5])) throw new Error('Esa fila no es la copia de un usuario eliminado.');
  let copia;
  try { copia = JSON.parse(String(v[5]).replace(/^'/, '')); } catch (e) {
    throw new Error('La copia de esa fila no se puede leer (quizá era demasiado larga para una celda).');
  }
  const r = restaurarPacienteWeb_(copia);
  r.idPaciente = String(copia[COLUMNAS.MAESTRA.ID_PACIENTE] || '');
  r.nombre = String(copia[COLUMNAS.MAESTRA.NOMBRE] || '');
  return r;
}
