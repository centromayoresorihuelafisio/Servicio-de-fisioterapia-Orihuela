/**
 * Agenda web — escrituras sobre la tabla "Citas" (fase 3c, tanda 1: editar campos, eliminar, deshacer,
 * dar de alta y WhatsApp).
 *
 * Cada función de agenda/Web.gs que antes tocaba la hoja Agenda por número de fila empieza ahora con una línea:
 *     if (citasModoNuevo_()) return xxxDesdeCitasWeb_(...);
 * así que con el interruptor CITAS_MODO_NUEVO apagado (agenda/Citas_Datos.gs) NADA de este archivo se ejecuta y la
 * Agenda funciona exactamente como antes. Con el interruptor encendido, el parámetro `fila` que sigue enviando el
 * cliente es en realidad el ID de la cita (en la lectura nueva, `_fila` vale el ID de la cita: agenda/Web_Semana_Citas.gs).
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
 * NO borra el evento de Calendar enlazado (igual que antes).
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
