// acceso/Editor.gs
// Lo que el propietario ejecuta a mano desde el editor de Apps Script. Las funciones sin _ final son públicas
// (si no, no salen en el desplegable del editor), así que todas empiezan con soloPropietario_().
// ================================================================================

const ACCESO_ADMIN_INICIAL_ = 'administrador';

/** Corta la ejecución si quien la lanza no es el propietario del script. */
function soloPropietario_() {
  const activo = Session.getActiveUser().getEmail();
  if (!activo || activo !== Session.getEffectiveUser().getEmail()) {
    throw new Error('Esta función solo puede ejecutarla el propietario desde el editor.');
  }
}

/** Crea una hoja con sus cabeceras y una protección con aviso, si aún no existe. */
function accesoCrearHoja_(nombre, cabeceras) {
  const ss = getSS();
  let hoja = ss.getSheetByName(nombre);
  if (hoja) { Logger.log('La hoja «' + nombre + '» ya existía: no se toca.'); return; }
  hoja = ss.insertSheet(nombre);
  hoja.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.protect().setDescription('Hoja de control de acceso: no editar a mano').setWarningOnly(true);
  Logger.log('Hoja «' + nombre + '» creada.');
}

/** Paso 1. Crea las hojas "Accesos" y "Registro". Se puede repetir: no toca las que ya existen. */
function accesoPrepararHojas() {
  soloPropietario_();
  accesoCrearHoja_(SHEETS.ACCESOS, ACCESO_CABECERAS_);
  accesoCrearHoja_(SHEETS.REGISTRO, REGISTRO_CABECERAS_);
}

/** Paso 2. Comprueba desde el editor que se reconoce al propietario. */
function accesoComprobarPropietario() {
  soloPropietario_();
  Logger.log('Correcto: se reconoce al propietario.');
}

/** Paso 3. Mide cuántas iteraciones caben en unos 600 ms de login y las guarda en las propiedades del script. */
function accesoMedirIteraciones() {
  soloPropietario_();
  const muestra = 500;
  const inicio = Date.now();
  accesoHash_('medicion', Utilities.getUuid(), muestra);
  const ms = Math.max(1, Date.now() - inicio);
  const iteraciones = Math.min(20000, Math.max(100, Math.floor(muestra * 600 / ms)));
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.ACCESO_ITERACIONES, String(iteraciones));
  Logger.log(muestra + ' iteraciones tardan ' + ms + ' ms. Guardadas ' + iteraciones + ' iteraciones.');
}

/**
 * Paso 4, y también vía de recuperación: crea la cuenta de administrador o, si ya existe, la reactiva y la desbloquea.
 * En ambos casos pone una contraseña temporal que se ve en el registro de ejecución y que obliga a cambiarla al entrar.
 */
function accesoCrearAdministrador() {
  soloPropietario_();
  const temporal = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const credencial = accesoCredencial_(temporal);
  const cuenta = accesoBuscarCuenta_(ACCESO_ADMIN_INICIAL_);
  if (cuenta) {
    accesoEscribirCuenta_(cuenta, {
      hash: credencial.hash, sal: credencial.sal, rol: 'administrador', activo: true,
      debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: ''
    });
  } else {
    const fila = { usuario: ACCESO_ADMIN_INICIAL_, nombre: 'Administrador', hash: credencial.hash, sal: credencial.sal,
      rol: 'administrador', activo: true, caduca: '', debeCambiarPassword: true, creado: new Date(),
      ultimoAcceso: '', intentosFallidos: 0, bloqueadoHasta: '' };
    accesoHoja_().appendRow(ACCESO_CABECERAS_.map(c => fila[c]));
  }
  registroAnotar_(ACCESO_ADMIN_INICIAL_, 'administrador', 'contrasena_temporal', 'Accesos', 'Desde el editor', 'ok');
  Logger.log('Usuario: ' + ACCESO_ADMIN_INICIAL_ + '  Contraseña temporal: ' + temporal);
}

/** Acción de administrador para la página de prueba: dice si esta ejecución se reconoce como propietario. */
function accesoDiagnostico_() {
  let propietario = true;
  try { soloPropietario_(); } catch (e) { propietario = false; }
  return { propietario: propietario, iteraciones: accesoIteraciones_() };
}
