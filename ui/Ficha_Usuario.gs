/**
 * Ficha de usuario para el panel lateral de la Agenda web.
 *
 * RENDIMIENTO: antes cada clic en un nombre llamaba al servidor, que releía la
 * La Maestra completa (con todas sus columnas y el rich text de Historia
 * clínica) solo para devolver UNA ficha. Ahora el cliente (agenda/Web_Vista.html)
 * pide TODAS las fichas de una vez, en segundo plano, con obtenerFichasUsuariosWeb()
 * y abre el panel desde memoria. obtenerFichaUsuarioWeb() queda solo como
 * respaldo (usuario dado de alta después de la última carga, o carga aún en curso).
 *
 * El cliente puede pedir solo algunas columnas (parámetro `campos`). Hoy la ficha
 * muestra también "Otros datos" (como la de Usuarios), así que la Agenda las
 * pide todas; sigue sin leerse el rich text de Historia clínica: el enlace a la
 * historia se abre desde la fila de la Agenda, no desde estos datos.
 *
 * Cada ficha lleva siempre "ID paciente" (aunque `campos` no lo pida) para poder cambiar el Estado
 * desde la ficha con cambiarEstadoPacienteWeb(idPaciente, estado): el servidor localiza la fila
 * por ese ID, así que no importa que la hoja se haya reordenado desde la carga.
 */

/**
 * Todas las fichas, indexadas por nombre normalizado (mayúsculas, sin tildes,
 * espacios simples). Si hay nombres duplicados en la Maestra se queda con el
 * primero, igual que hacía la búsqueda individual.
 * @param {string[]=} campos Cabeceras que necesita el cliente. Si se omite, todas.
 */
function obtenerFichasUsuariosWeb(campos) {
  try {
    const bd = leerMaestraParaFicha_(campos);
    if (bd.error) return { success: false, message: bd.error };

    const colNombre = COLUMNAS.MAESTRA.NOMBRE;
    const fichas = {};
    bd.pacientes.forEach(function(p) {
      const clave = normalizarNombreFicha_(p[colNombre]);
      if (clave && !Object.prototype.hasOwnProperty.call(fichas, clave)) fichas[clave] = p;
    });

    const respuesta = { success: true, headers: bd.headers, fichas: fichas, generado: Date.now() };
    // Sin lista de columnas (la Agenda) se añade también la lista de TODOS los usuarios para el selector de huecos
    // (agenda/JS_Agenda_Edicion.html → SelectorUsuario). `fichas` se indexa por nombre y descarta a los homónimos; esta lista no.
    if (!(campos && campos.length)) respuesta.usuarios = usuariosParaSelectorDesdeMaestra_(bd.pacientes).usuarios;
    return respuesta;
  } catch (e) {
    Logger.log('Error en obtenerFichasUsuariosWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Lista ligera de usuarios para el selector de huecos de la Agenda, en el MISMO orden que la Maestra (prioridad: activos y en
 * espera primero). Recibe las filas que devuelve leerMaestraParaFicha_ (con ID paciente, Nombre, DNI, teléfonos y Estado).
 * Un usuario sin ID paciente no se puede asignar (la capa de citas lo exige): no entra en la lista y se cuenta en `sinId`.
 * Teléfonos en su forma de guardado (telefonoNormalizar_); el cliente los muestra con Telefono.formato. Estado sin emoji.
 * @return {{usuarios: Array<{id:string, nombre:string, dni:string, tel1:string, tel2:string, estado:string}>, sinId:number}}
 */
function usuariosParaSelectorDesdeMaestra_(pacientes) {
  const C = COLUMNAS.MAESTRA;
  const t = function(v) { return String(v === null || v === undefined ? '' : v).trim(); };
  const usuarios = [];
  let sinId = 0;
  (pacientes || []).forEach(function(p) {
    const nombre = t(p[C.NOMBRE]);
    if (!nombre) return;
    const id = t(p[C.ID_PACIENTE]);
    if (!id) { sinId++; return; }
    usuarios.push({
      id: id, nombre: nombre, dni: t(p[C.DNI]),
      tel1: telefonoNormalizar_(p[C.TELEFONO_1]), tel2: telefonoNormalizar_(p[C.TELEFONO_2]),
      estado: textoSinEmoji_(p[C.ESTADO])
    });
  });
  return { usuarios: usuarios, sinId: sinId };
}

/**
 * Respaldo: una sola ficha por nombre. Mismo formato de respuesta que siempre
 * ({ success, headers, paciente }), de modo que el cliente la trata igual.
 * @param {string} nombre
 * @param {string[]=} campos Cabeceras que necesita el cliente. Si se omite, todas.
 */
function obtenerFichaUsuarioWeb(nombre, campos) {
  try {
    const objetivo = normalizarNombreFicha_(nombre);
    if (!objetivo) return { success: false, message: 'La cita no tiene usuario asignado.' };

    const bd = leerMaestraParaFicha_(campos);
    if (bd.error) return { success: false, message: bd.error };

    const colNombre = COLUMNAS.MAESTRA.NOMBRE;
    const paciente = bd.pacientes.filter(function(p) { return normalizarNombreFicha_(p[colNombre]) === objetivo; })[0];
    if (!paciente) return { success: false, message: 'No se encontró a este usuario en Usuarios.' };

    return { success: true, headers: bd.headers, paciente: paciente };
  } catch (e) {
    Logger.log('Error en obtenerFichaUsuarioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Lee la Maestra una sola vez y devuelve { headers, pacientes } con SOLO las
 * columnas pedidas (más Nombre, que siempre hace falta para identificar la fila).
 * Las fechas se formatean dd/MM/yyyy, como en obtenerBaseDatosCompletaWeb. La "Edad" no se lee de la hoja: se calcula
 * con la fecha de nacimiento (valor crudo de la celda) y se añade si el cliente la pide o no filtra columnas.
 */
function leerMaestraParaFicha_(campos) {
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { headers: [], pacientes: [], error: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };

  const lastRow = sheet.getLastRow();
  const lastColRaw = sheet.getLastColumn();
  if (lastRow < 2 || lastColRaw < 1) return { headers: [], pacientes: [] };

  const headersRaw = sheet.getRange(1, 1, 1, lastColRaw).getValues()[0];
  const pedidos = (campos && campos.length)
    ? campos.concat([COLUMNAS.MAESTRA.NOMBRE, COLUMNAS.MAESTRA.ID_PACIENTE]).map(normalizarNombreFicha_)
    : null;

  // Columnas a conservar: (índice 0-based, cabecera). Se ignoran las columnas sin cabecera.
  const cols = [];
  headersRaw.forEach(function(h, idx) {
    const t = String(h === null || h === undefined ? '' : h).trim();
    if (t && (!pedidos || pedidos.indexOf(normalizarNombreFicha_(t)) !== -1)) cols.push({ idx: idx, h: t });
  });
  if (!cols.length) return { headers: [], pacientes: [] };

  // Edad calculada (no se guarda). La columna de nacimiento se lee aunque el cliente no la pida.
  const claveEdad = normalizarNombreFicha_(COLUMNAS.MAESTRA.EDAD);
  const claveNacimiento = normalizarNombreFicha_(COLUMNAS.MAESTRA.FECHA_NACIMIENTO);
  const idxNacimiento = headersRaw.findIndex(function(h) { return normalizarNombreFicha_(h) === claveNacimiento; });
  const calcularEdad = idxNacimiento !== -1 && (!pedidos || pedidos.indexOf(claveEdad) !== -1);
  const colEdadHoja = cols.filter(function(c) { return normalizarNombreFicha_(c.h) === claveEdad; })[0];
  const nombreEdad = colEdadHoja ? colEdadHoja.h : COLUMNAS.MAESTRA.EDAD;

  // Una única lectura, hasta la última columna necesaria (no hasta el final de la hoja).
  const ultimaCol = Math.max(cols[cols.length - 1].idx + 1, calcularEdad ? idxNacimiento + 1 : 0);
  const datos = sheet.getRange(2, 1, lastRow - 1, ultimaCol).getValues();
  const tz = Session.getScriptTimeZone();
  const colNombre = COLUMNAS.MAESTRA.NOMBRE;

  const pacientes = [];
  datos.forEach(function(row, i) {
    const p = { _fila: i + 2 };   // fila real en la hoja (los datos empiezan en la 2)
    cols.forEach(function(c) {
      let v = row[c.idx];
      if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      p[c.h] = v;
    });
    if (calcularEdad) p[nombreEdad] = calcularEdadDesdeFecha_(row[idxNacimiento]);
    // Ignorar filas vacías (huecos en la hoja)
    if (p[colNombre] && String(p[colNombre]).trim() !== '') pacientes.push(p);
  });

  const headersSalida = cols.map(function(c) { return c.h; });
  if (calcularEdad && !colEdadHoja) headersSalida.push(nombreEdad);
  return { headers: headersSalida, pacientes: pacientes };
}

function normalizarNombreFicha_(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
