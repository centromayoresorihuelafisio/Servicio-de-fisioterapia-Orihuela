/**
 * Agenda web — escrituras sobre la tabla "Citas" (fase 3c, tanda 1: editar campos, eliminar, deshacer,
 * dar de alta y WhatsApp; tanda 2: mover e intercambiar; tanda 3: lo que CREA citas — asignar hueco, copiar citas o semana y el
 * formulario de varias horas de agenda/Cita.gs).
 *
 * Cada función de agenda/Web.gs delega aquí (`return xxxDesdeCitasWeb_(...)`). El parámetro `fila` que sigue enviando el
 * cliente es en realidad el ID de la cita (en la lectura, `_fila` vale el ID de la cita: agenda/Web_Semana_Citas.gs). Con el
 * interruptor CITAS_MODO_NUEVO apagado (agenda/Citas_Datos.gs) la capa de datos rechaza toda escritura.
 *
 * Las funciones de este archivo NO toman LockService: la capa (agenda/Citas_Datos.gs) lo toma por dentro en cada
 * escritura y los llamadores no deben tenerlo ya.
 */

/** Cita (objeto de citasLeer_) con ese ID, o null. Una sola lectura de la tabla. */
function citaPorIdDesdeCitasWeb_(idCita) {
  const id = String(idCita === null || idCita === undefined ? '' : idCita).trim();
  if (!id) return null;
  const todas = citasLeer_();
  for (let i = 0; i < todas.length; i++) if (todas[i].id === id) return todas[i];
  return null;
}

/**
 * Edita Asistencia, Notas o Sesión de una cita. "Quitar asistencia" llega como '' (clic sobre el chip activo):
 * la capa lo rechazaría, así que aquí se convierte en Pendiente. Devuelve además `asistencia` (el texto que debe
 * mostrar el cliente: '' para Pendiente, igual que la lectura) cuando el campo es Asistencia.
 */
function actualizarCampoDesdeCitasWeb_(idCita, campo, valor) {
  let nuevo = valor;
  const esAsistencia = campo === COLUMNAS.CITAS.ASISTENCIA;
  if (esAsistencia && (nuevo === null || nuevo === undefined || String(nuevo).trim() === '')) {
    nuevo = ASISTENCIA_CITA.PENDIENTE;
  }
  const r = citasCambiarCampo_(String(idCita === null || idCita === undefined ? '' : idCita).trim(), campo, nuevo);
  if (r && r.success && esAsistencia) {
    const categoria = citasCategoriaAsistencia_(nuevo).categoria;
    r.asistencia = categoria === ASISTENCIA_CITA.PENDIENTE ? '' : categoria;
  }
  return r;
}

/**
 * Elimina una o varias citas (borra su fila). La respuesta lleva `snapshots` (citas completas, con ID y "Creada el")
 * que el cliente guarda para Deshacer y devuelve tal cual a restaurarCitasWeb.
 */
function eliminarDesdeCitasWeb_(ids) {
  const lista = (Array.isArray(ids) ? ids : [ids])
    .map(function(x) { return String(x === null || x === undefined ? '' : x).trim(); })
    .filter(function(x) { return x; });
  return citasEliminar_(lista);
}

/** Deshacer: vuelve a escribir las citas de `snapshots` (los que devolvió eliminarDesdeCitasWeb_). */
function restaurarDesdeCitasWeb_(snapshots) {
  return citasRestaurar_(snapshots);
}

/** Da de alta al paciente de la cita: por su ID paciente, sin buscar por nombre. */
function darDeAltaDesdeCitasWeb_(idCita) {
  const cita = citaPorIdDesdeCitasWeb_(idCita);
  if (!cita) return { success: false, message: 'La cita ya no existe (¿la ha cambiado otra persona?).' };
  if (!cita.idPaciente) return { success: false, message: 'Esa cita no tiene un paciente enlazado (falta el ID paciente).' };
  return darDeAltaPacienteWeb(cita.idPaciente);
}

/**
 * Datos para el asistente de WhatsApp desde la Agenda: de cada cita se toma su ID paciente y se reutiliza
 * datosWhatsappMaestraWeb (usuarios/Whatsapp.gs), que devuelve la misma forma que el camino viejo
 * ({success, plantilla, items, duplicados}). Las citas sin paciente enlazado salen como elementos con error.
 */
function datosWhatsappLoteDesdeCitasWeb_(ids) {
  const todas = citasLeer_();
  const porId = Object.create(null);
  todas.forEach(function(c) { porId[c.id] = c; });

  const idsPaciente = [];
  const errores = [];
  (ids || []).forEach(function(raw) {
    const id = String(raw === null || raw === undefined ? '' : raw).trim();
    const c = id ? porId[id] : null;
    if (!c) { errores.push({ fila: '', nombre: '', primerNombre: '', telefono: '', error: 'La cita ya no existe.' }); return; }
    if (!c.idPaciente) { errores.push({ fila: '', nombre: c.nombre || '', primerNombre: '', telefono: '', error: 'Esa cita no tiene un paciente enlazado.' }); return; }
    idsPaciente.push(c.idPaciente);
  });

  const r = idsPaciente.length ? datosWhatsappMaestraWeb(idsPaciente) : { success: true, plantilla: _plantillaWhatsapp_(), items: [], duplicados: 0 };
  if (!r.success) return r;
  return { success: true, plantilla: r.plantilla, items: r.items.concat(errores), duplicados: r.duplicados };
}

/** URL de WhatsApp de la persona de una cita (la usa generarUrlWhatsappParaAgendaWeb; hoy el cliente no la llama). */
function generarUrlWhatsappDesdeCitasWeb_(idCita) {
  const cita = citaPorIdDesdeCitasWeb_(idCita);
  if (!cita) return { success: false, message: 'La cita ya no existe.' };
  if (!cita.idPaciente) return { success: false, message: 'Esa cita no tiene un paciente enlazado.' };
  return generarUrlWhatsappWeb(cita.idPaciente);
}

// ============================================================================= Tanda 2: mover e intercambiar

/**
 * Mueve una cita a un hueco libre. `claveDestino` es la clave del hueco que da la lectura nueva
 * ("hueco AAAA-MM-DD HH:mm", agenda/Web_Semana_Citas.gs); la capa valida la parrilla, Disponibilidad y que esté libre.
 * La cita conserva su ID, su paciente, su Sesión y sus Notas (solo cambian fecha y hora).
 */
function moverDesdeCitasWeb_(idCita, claveDestino) {
  const clave = String(claveDestino === null || claveDestino === undefined ? '' : claveDestino).trim();
  const m = /^hueco (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(clave);
  if (!m) return { success: false, message: 'El destino no es un hueco horario válido.' };
  return citasMover_(String(idCita === null || idCita === undefined ? '' : idCita).trim(), m[1], m[2]);
}

/** Intercambia la fecha y la hora de dos citas ocupadas (cada una conserva su ID y sus datos). */
function intercambiarDesdeCitasWeb_(idA, idB) {
  const t = function(x) { return String(x === null || x === undefined ? '' : x).trim(); };
  return citasIntercambiar_(t(idA), t(idB));
}

// ============================================================================= Tanda 3: lo que crea citas

/**
 * Usuario de la Maestra a partir de un NOMBRE (el desplegable de la Agenda y el formulario de Cita trabajan con nombres: su lista es
 * nombre → teléfono). La comparación ignora tildes y mayúsculas, como el resto del proyecto. Si el nombre no existe o es ambiguo (homónimos)
 * se rechaza con un mensaje claro: ya no se admiten nombres que no estén en la Maestra (la capa de citas exige un ID paciente).
 * @return {{ok:true, idPaciente:string, nombre:string, telefono:string, hc:string}|{ok:false, message:string}}
 */
function pacientePorNombreDesdeCitasWeb_(nombreBruto) {
  const crudo = String(nombreBruto === null || nombreBruto === undefined ? '' : nombreBruto).trim();
  if (!crudo) return { ok: false, message: 'Escribe el nombre del paciente.' };
  const clave = function (x) { return normalizarTexto(x).replace(/\s+/g, ' '); };
  const buscados = [clave(crudo), clave(normalizarNombreUsuario(crudo))];
  const hoja = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!hoja || hoja.getLastRow() < 2) return { ok: false, message: 'No se encontró la Base de Datos Maestra.' };
  const cNom = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE), cId = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.ID_PACIENTE);
  if (cNom === -1 || cId === -1) return { ok: false, message: 'Faltan las columnas "Nombre" o "ID paciente" en la Maestra.' };
  const n = hoja.getLastRow() - 1;
  const nombres = hoja.getRange(2, cNom + 1, n, 1).getValues(), ids = hoja.getRange(2, cId + 1, n, 1).getValues();
  const coincidencias = [];
  for (let i = 0; i < n; i++) {
    const nom = String(nombres[i][0] || '').trim();
    if (nom && buscados.indexOf(clave(nom)) !== -1) coincidencias.push({ nombre: nom, id: String(ids[i][0] || '').trim() });
  }
  if (!coincidencias.length) return { ok: false, message: 'No hay ningún usuario con ese nombre en la Base de Datos Maestra. Elige uno de la lista.' };
  if (coincidencias.length > 1) return { ok: false, message: 'Hay ' + coincidencias.length + ' usuarios con ese nombre: no se puede saber a cuál te refieres.' };
  const c = coincidencias[0];
  if (!c.id) return { ok: false, message: 'Ese usuario no tiene ID paciente (ejecuta asignarIdsPaciente).' };
  const u = agendaSemanaUsuariosPorId_([c.id])[c.id] || { nombre: c.nombre, telefono: '', hc: '' };
  return { ok: true, idPaciente: c.id, nombre: u.nombre || c.nombre, telefono: u.telefono || '', hc: u.hc || '' };
}

/** Pone el Estado de un usuario (por ID paciente, no por nombre) y lo anota en el historial.
 * Devuelve false si falla, 'igual' si ya tenía ese Estado (no escribe) y 'cambiado' si lo ha cambiado. */
function actualizarEstadoPorIdDesdeCitasWeb_(idPaciente, nuevoEstado, origen) {
  try {
    const hoja = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!hoja) return false;
    const fila = filaMaestraPorId_(hoja, idPaciente);
    if (!fila) return false;
    const celda = hoja.getRange(fila, COLUMNAS_NUM.MAESTRA.ESTADO);
    const antes = celda.getValue();
    if (textoSinEmoji_(antes) === textoSinEmoji_(nuevoEstado)) return 'igual';   // ya tenía ese Estado: no se escribe nada
    celda.setValue(nuevoEstado);
    historialRegistrar_([{ id: idPaciente, campo: COLUMNAS.MAESTRA.ESTADO, antes: antes, despues: nuevoEstado }], origen);
    return 'cambiado';
  } catch (e) {
    Logger.log('actualizarEstadoPorIdDesdeCitasWeb_: ' + e.message);
    return false;
  }
}

/**
 * Asigna un paciente a un hueco libre de la Agenda. `claveHueco` es la clave que da la lectura nueva ("hueco AAAA-MM-DD HH:mm"; si
 * llega el ID de una cita, el hueco ya no está libre). Crea la cita con Sesión vacía (como antes: la Sesión se escribe a mano) y registra
 * el ingreso del episodio si es la primera cita. Pone el Estado del usuario en Activo (con historial, origen "Asignar hueco") y, si cambió,
 * reordena la Maestra, como hace el formulario de Cita (decisión del dueño, 21-oct-2026; la asignación vieja no lo hacía).
 * Devuelve la misma forma que la vieja ({success, usuario, telefono, historiaClinica, ingresoRegistrado}) más `id` (de la cita nueva).
 */
function asignarPacienteDesdeCitasWeb_(claveHueco, nombrePaciente) {
  try {
    const clave = String(claveHueco === null || claveHueco === undefined ? '' : claveHueco).trim();
    const m = /^hueco (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(clave);
    if (!m) return { success: false, message: 'Ese hueco ya no está libre (alguien acaba de poner una cita).' };
    const p = pacientePorNombreDesdeCitasWeb_(nombrePaciente);
    if (!p.ok) return { success: false, message: p.message };
    const r = citasCrear_({ fechaISO: m[1], hora: m[2], idPaciente: p.idPaciente });
    if (!r.success) return r;
    const cambioEstado = actualizarEstadoPorIdDesdeCitasWeb_(p.idPaciente, ESTADOS_PACIENTE.ACTIVO, 'Asignar hueco');
    let ingresoRegistrado = false;
    try { if (p.hc) ingresoRegistrado = hcRegistrarPrimeraCita_(p.hc, m[1]); } catch (eIng) { Logger.log('asignarPacienteDesdeCitasWeb_: ingreso automático: ' + eIng.message); }
    if (cambioEstado === 'cambiado') { try { ordenarPacientes(); } catch (eOrd) { Logger.log('asignarPacienteDesdeCitasWeb_: ordenar: ' + eOrd.message); } }
    return { success: true, usuario: p.nombre, telefono: p.telefono, historiaClinica: p.hc, ingresoRegistrado: ingresoRegistrado, id: r.cita.id };
  } catch (e) {
    Logger.log('Error en asignarPacienteDesdeCitasWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * PARTE PURA (no toca hojas). Destinos de la copia de una cita: mismas reglas que tenía la copia de la hoja vieja.
 * Simple: lunes y martes +2 días, miércoles y jueves +5, viernes +7. Doble: lunes y martes [+2, +5], miércoles y jueves [+5, +2]
 * (cada salto cuenta desde el anterior). La Sesión de cada destino es la de la cita origen + 1, + 2 (si la del origen no es un número
 * >= 1 se cuenta desde 0, como antes).
 * @param {{fecha:string, sesion:*}} cita
 * @return {{error:string}|{destinos:Array<{fechaISO:string, sesion:number}>}}
 */
function copiaDestinosDesdeCitasWeb_(cita, doble) {
  const p = String(cita.fecha || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return { error: 'No se pudo determinar la fecha de esta cita.' };
  const dia = new Date(p[0], p[1] - 1, p[2]).getDay();
  let saltos;
  if (!doble) {
    if (dia === 1 || dia === 2) saltos = [2];
    else if (dia === 3 || dia === 4) saltos = [5];
    else if (dia === 5) saltos = [7];
    else return { error: 'Esta acción solo funciona con citas de lunes a viernes.' };
  } else {
    if (dia === 1 || dia === 2) saltos = [2, 5];
    else if (dia === 3 || dia === 4) saltos = [5, 2];
    else return { error: 'Esta acción solo funciona con citas de lunes a jueves (pacientes de doble sesión semanal).' };
  }
  let sesionActual = typeof cita.sesion === 'number' && cita.sesion >= 1 ? cita.sesion : (parseInt(cita.sesion, 10) || 0);
  const destinos = [];
  let acumulado = 0;
  saltos.forEach(function (salto, i) {
    acumulado += salto;
    const d = new Date(p[0], p[1] - 1, p[2] + acumulado);
    const iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    destinos.push({ fechaISO: iso, sesion: sesionActual + i + 1 });
  });
  return { destinos: destinos };
}

/**
 * Copia citas a su(s) fecha(s) siguiente(s) (botones Copiar, Copiar ×2 y Copiar Semana). `items` = [{fila, doble}], donde `fila` es el ID
 * de la cita. Igual que antes: primero se comprueba TODO y, si algún destino está ocupado y `forzar` no es true, se devuelve `ocupado:true`
 * con la lista de conflictos y NO se escribe nada. Con `forzar`, la cita que ocupaba el destino se sustituye por la copia. Cada copia lleva
 * Notas y Sesión (origen + 1, + 2) y nace Pendiente; no cambia el Estado ni el ingreso (como antes). Una cita con más de un destino se copia
 * entera o no se copia (si un destino es inválido, ninguno). Las citas sin ID paciente no se pueden copiar (la capa nueva lo exige).
 */
function copiarVariasDesdeCitasWeb_(items, forzar) {
  try {
    if (!items || !items.length) return { success: false, message: 'No hay ninguna cita que copiar.' };
    const todas = citasLeer_();
    const porId = Object.create(null), ocupante = Object.create(null);
    todas.forEach(function (c) { porId[c.id] = c; if (!(c.fecha + '|' + c.hora in ocupante)) ocupante[c.fecha + '|' + c.hora] = c; });

    const lista = [], errores = [], conflictos = [];
    const fechaTexto = function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); };
    items.forEach(function (item) {
      const id = String(item && item.fila !== null && item.fila !== undefined ? item.fila : '').trim();
      if (!id || /^hueco /.test(id)) return;   // un hueco libre no se copia (la copia vieja también lo saltaba sin avisar)
      const origen = porId[id];
      if (!origen) { errores.push('Una cita ya no existe (¿la ha cambiado otra persona?).'); return; }
      const nombre = origen.nombre || 'Cita';
      if (!origen.idPaciente) { errores.push(nombre + ': la cita no tiene un paciente enlazado (falta el ID paciente).'); return; }
      const plan = copiaDestinosDesdeCitasWeb_(origen, !!item.doble);
      if (plan.error) { errores.push(nombre + ': ' + plan.error); return; }
      const propias = [];
      for (let i = 0; i < plan.destinos.length; i++) {
        const d = plan.destinos[i];
        const v = citasHuecoValido_(d.fechaISO, origen.hora);
        if (!v.ok) { errores.push(nombre + ' → ' + fechaTexto(d.fechaISO) + ' a las ' + origen.hora + ': ' + v.motivo); return; }
        propias.push({ fechaISO: d.fechaISO, hora: v.hora, idPaciente: origen.idPaciente, sesion: d.sesion, notas: origen.notas, nombre: nombre });
      }
      propias.forEach(function (x) {
        lista.push(x);
        const ocupa = ocupante[x.fechaISO + '|' + x.hora];
        if (ocupa) conflictos.push(nombre + ' → ' + fechaTexto(x.fechaISO) + ' a las ' + x.hora + ' (ocupado por ' + (ocupa.nombre || 'otra cita') + ')');
      });
    });

    if (conflictos.length > 0 && !forzar) {
      return {
        success: false, ocupado: true,
        message: (conflictos.length === 1 ? 'Ya hay una cita en el destino:\n' : conflictos.length + ' de las citas ya tienen destino ocupado:\n') + conflictos.join('\n') + '\n¿Sobrescribir de todas formas?'
      };
    }

    let copiadas = 0, nombreUnico = '';
    if (lista.length) {
      const r = citasCrearVarias_(lista, { sustituir: !!forzar });
      if (!r.success) return { success: false, message: r.message || 'No se pudo copiar.' };
      copiadas = r.creadas.length;
      nombreUnico = r.creadas.length === 1 ? r.creadas[0].nombre : '';
      (r.errores || []).forEach(function (e) { errores.push((lista[e.indice].nombre || 'Cita') + ': ' + e.message); });
    }
    if (!copiadas) return { success: false, message: errores.length ? 'No se pudo copiar ninguna cita:\n' + errores.join('\n') : 'No hay ninguna cita que copiar.' };

    let mensaje = copiadas === 1 ? 'Cita de ' + nombreUnico + ' copiada correctamente.' : copiadas + ' citas copiadas correctamente.';
    if (errores.length) mensaje += '\n' + errores.length + ' no se pudieron copiar:\n' + errores.join('\n');
    return { success: true, message: mensaje, copiadas: copiadas, errores: errores.length };
  } catch (e) {
    Logger.log('Error en copiarVariasDesdeCitasWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}

// ----------------------------------------------------------------------------- formulario de Cita (agenda/Cita.gs)

/**
 * Semanas y huecos libres para el formulario de Cita (Panel_Cita.html y Cita_Vista.html), con la MISMA forma que daba la hoja vieja:
 * { semanas: [{ label, dias: { 'dd/MM/yyyy': { label: 'Lunes dd/MM/yyyy', huecos: [{hora, value}] } } }], index }. Los huecos se calculan
 * (parrilla menos citas menos horas cerradas) y `value` es un JSON { date, time, fechaISO } que el formulario devuelve tal cual a
 * guardarCitasMultiples. Se ofrecen desde la semana de la cita más antigua (o la actual si no hay ninguna) hasta 40 semanas después de la
 * actual; un día sin huecos sale vacío ("Completo"). El cliente elige solo la semana inicial con las fechas, no con `index`.
 */
function obtenerSemanasYHuecosDesdeCitasWeb_() {
  try {
    const SEMANAS_ADELANTE = 40;
    const iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    const lunesDe = function (d) { const dow = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + (dow === 0 ? -6 : 1)); };
    const hoy = new Date();
    const lunesHoy = lunesDe(hoy);
    const cerrados = leerDisponibilidad_();
    const citas = citasLeer_();
    const ocupadas = {};
    citas.forEach(function (c) { ocupadas[c.fecha + '|' + c.hora] = true; });
    let lunes = lunesHoy;
    if (citas.length) { const pf = citas[0].fecha.split('-').map(Number); const primero = lunesDe(new Date(pf[0], pf[1] - 1, pf[2])); if (primero < lunes) lunes = primero; }   // citasLeer_ ya devuelve ordenado
    const ultimo = new Date(lunesHoy.getFullYear(), lunesHoy.getMonth(), lunesHoy.getDate() + 7 * SEMANAS_ADELANTE);
    const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

    const semanas = [];
    let index = 0;
    for (let l = lunes; l <= ultimo; l = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7)) {
      const viernes = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 4);
      const dias = {};
      for (let k = 0; k < 5; k++) {
        const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + k), f = iso(d);
        const clave = f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4);
        const huecos = [];
        citasHorasDelDia_(f).forEach(function (h) {
          if (ocupadas[f + '|' + h] || disponibilidadCerrada_(cerrados, f, h)) return;
          huecos.push({ hora: h, value: JSON.stringify({ date: clave, time: h, fechaISO: f }) });
        });
        dias[clave] = { label: NOMBRES[k] + ' ' + clave, huecos: huecos };
      }
      if (iso(l) === iso(lunesHoy)) index = semanas.length;
      semanas.push({ label: 'Semana ' + formatearRangoSemanaEs_(l, viernes), dias: dias });
    }
    return { semanas: semanas, index: index };
  } catch (e) {
    Logger.log('Error en obtenerSemanasYHuecosDesdeCitasWeb_: ' + e.message);
    return { semanas: [{ error: 'Error: ' + e.message }], index: 0 };
  }
}

/**
 * Guarda las citas del formulario de Cita (una por hueco elegido). El paciente llega por NOMBRE (el formulario trabaja con la lista
 * nombre → teléfono) y se resuelve a su ID paciente; el teléfono que envía el formulario se ignora (se consulta en la Maestra). Sesión: si es un
 * número, la primera hora lleva ese número y cada una siguiente +1; si es texto, todas llevan ese texto; vacía = sin Sesión. Después, igual que antes:
 * el usuario pasa a Activo (con historial), la fecha de la PRIMERA cita es el ingreso del episodio si aún no tiene, y se reordena la Maestra.
 * Si algún hueco no se pudo guardar (ocupado, cerrado) se avisa en el mensaje; los demás sí se guardan.
 */
function guardarCitasMultiplesDesdeCitasWeb_(formData) {
  try {
    const datos = formData || {};
    const huecosJson = datos.huecosJson;
    if (!huecosJson || huecosJson.length === 0) return { success: false, message: 'No se seleccionó ningún hueco.' };

    const p = pacientePorNombreDesdeCitasWeb_(datos.nombreUsuario);
    if (!p.ok) return { success: false, message: p.message };

    const huecos = [];
    for (let i = 0; i < huecosJson.length; i++) {
      let h;
      try { h = typeof huecosJson[i] === 'string' ? JSON.parse(huecosJson[i]) : huecosJson[i]; } catch (eJson) { return { success: false, message: 'Uno de los huecos elegidos no es válido.' }; }
      if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(String(h.fechaISO || '')) || !h.time) return { success: false, message: 'Uno de los huecos elegidos no es válido.' };
      huecos.push({ fechaISO: h.fechaISO, hora: h.time });
    }
    huecos.sort(function (a, b) { return (a.fechaISO + ' ' + a.hora) < (b.fechaISO + ' ' + b.hora) ? -1 : 1; });

    const textoSesion = datos.numSesion === null || datos.numSesion === undefined ? '' : String(datos.numSesion).trim();
    const base = parseInt(textoSesion, 10);
    const sesionNumerica = !isNaN(base) && String(base) === textoSesion;
    const lista = huecos.map(function (h, i) {
      return { fechaISO: h.fechaISO, hora: h.hora, idPaciente: p.idPaciente, sesion: sesionNumerica ? base + i : textoSesion, notas: datos.notas || '' };
    });

    const r = citasCrearVarias_(lista);
    if (!r.success) return { success: false, message: 'No se pudo guardar ninguna cita: ' + (r.message || '') };

    actualizarEstadoPorIdDesdeCitasWeb_(p.idPaciente, ESTADOS_PACIENTE.ACTIVO, 'Dar cita');
    let ingresoRegistrado = false;
    try { ingresoRegistrado = !!(p.hc && hcRegistrarPrimeraCita_(p.hc, lista[0].fechaISO)); } catch (eIng) { Logger.log('guardarCitasMultiplesDesdeCitasWeb_: ingreso automático: ' + eIng.message); }
    try { ordenarPacientes(); } catch (eOrd) { Logger.log('guardarCitasMultiplesDesdeCitasWeb_: ordenar: ' + eOrd.message); }

    let message = 'Registro exitoso de **' + r.creadas.length + '** cita(s).';
    message += '<br>Estado de **' + p.nombre + '** actualizado a **' + ESTADOS_PACIENTE.ACTIVO + '** e Historia Clínica vinculada.';
    if (r.errores && r.errores.length) {
      message += '<br>' + r.errores.length + ' hora(s) no se pudieron guardar: ' + r.errores.map(function (e) { return lista[e.indice].fechaISO + ' ' + lista[e.indice].hora + ' (' + e.message + ')'; }).join('; ');
    }
    return { success: true, message: message, ingresoRegistrado: ingresoRegistrado };
  } catch (e) {
    Logger.log('Error en guardarCitasMultiplesDesdeCitasWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}
