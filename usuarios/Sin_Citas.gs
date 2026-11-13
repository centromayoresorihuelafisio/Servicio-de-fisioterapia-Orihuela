/**
 * Aviso «sin citas» (decisión del dueño, 13-nov-2026; sección 23 de CONTEXTO.md): usuarios con el último episodio de la historia
 * clínica abierto que llevan SIN_CITAS_DIAS días o más sin citas y no tienen ninguna cita de hoy en adelante. Es para que no vuelvan a
 * quedarse episodios abiertos por olvido. Lo manda obtenerBaseDatosCompletaWeb_ (usuarios/BaseDatos.gs) en `sinCitas`.
 * Solo lee: «Historias Clínicas» (2 columnas), «Episodios HC» y «Citas» (citasLeer_). Prefijo sinCitas para el ámbito global.
 */

/**
 * Parte PURA (se prueba en comprobar/sin_citas.mjs). `episodios` = { idPaciente: [{ ingreso, alta }] } (ISO o ''), `citas` =
 * { idPaciente: ['yyyy-MM-dd', ...] }, `hoyISO`, `umbral` en días. Devuelve { idPaciente: { dias, desde, porInicio } }: `desde` es la
 * fecha desde la que se cuenta (la última cita o, si no tuvo ninguna desde el inicio, el inicio) y `porInicio` dice cuál de las dos.
 */
function sinCitasCalcular_(episodios, citas, hoyISO, umbral) {
  const dia = function (iso) { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; };
  const res = {};
  Object.keys(episodios).forEach(function (id) {
    const lista = episodios[id].slice().sort(hcCmpEpisodios_);
    const ult = lista[lista.length - 1];
    if (!ult || !ult.ingreso || ult.alta) return;                 // sin episodio, sin empezar o cerrado
    const fechas = citas[id] || [];
    if (fechas.some(function (f) { return f >= hoyISO; })) return;  // tiene cita hoy o más adelante
    let desde = ult.ingreso, porInicio = true;
    fechas.forEach(function (f) { if (f >= desde && f < hoyISO) { desde = f; porInicio = false; } });
    const dias = dia(hoyISO) - dia(desde);
    if (dias >= umbral) res[id] = { dias: dias, desde: desde, porInicio: porInicio };
  });
  return res;
}

/** Lee las hojas y devuelve el mapa de sinCitasCalcular_ para todos los usuarios con historia clínica en la ficha web. */
function sinCitasPorPaciente_() {
  const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
  const ultHC = h.hc.getLastRow(), ultE = h.epi.getLastRow();
  if (ultHC < 2 || ultE < 2) return {};
  // ID HC → ID paciente. Un usuario con dos historias distintas no entra (no se sabe cuál vale), como en el aviso de faltas.
  const pacienteDe = {}, hcDe = {}, repetidos = {};
  h.hc.getRange(2, 1, ultHC - 1, HC_WEB_.COL.ID_PACIENTE).getValues().forEach(function (r) {
    const p = String(r[HC_WEB_.COL.ID_PACIENTE - 1] || '').trim(), idHC = String(r[0] || '').trim();
    if (!p || !idHC) return;
    if (hcDe[p] && hcDe[p] !== idHC) repetidos[p] = true; else hcDe[p] = idHC;
    pacienteDe[idHC] = p;
  });
  const episodios = {};
  h.epi.getRange(2, 1, ultE - 1, 3).getValues().forEach(function (r) {
    const p = pacienteDe[String(r[0] || '').trim()];
    if (!p || repetidos[p]) return;
    (episodios[p] = episodios[p] || []).push({ ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz) });
  });
  const citas = {};
  citasLeer_().forEach(function (c) { if (episodios[c.idPaciente]) (citas[c.idPaciente] = citas[c.idPaciente] || []).push(c.fecha); });
  return sinCitasCalcular_(episodios, citas, Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), SIN_CITAS_DIAS);
}
