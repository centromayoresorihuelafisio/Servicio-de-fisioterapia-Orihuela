/**
 * Ficha de historia clínica (HC) en HTML dentro de la Web App (?page=hc).
 *
 * Lee y guarda en las hojas que creó la migración (herramientas/Migrar_HC.gs):
 *   "Historias Clínicas"  → ID HC | Nombre (referencia) | Historia | Tratamiento | Modificado (Doc) | Origen | Doc original
 *   "Episodios HC"        → ID HC | Ingreso | Alta | Nota
 * Los datos personales se leen de la Maestra, las escalas de "Valoraciones" y la asistencia de la Agenda.
 * No escribe NUNCA en la Maestra, en la Agenda, en Valoraciones ni en los Docs.
 *
 * FASE 1 (coexistencia): los Docs siguen siendo la fuente que usan Alta.gs / Generar.gs. Mientras
 * HC_WEB_MODO_PRUEBA sea true, la ficha avisa de que lo que se edite aquí vive solo en la nueva hoja.
 */

const HC_WEB_ = {
  HOJA_HC: 'Historias Clínicas',
  HOJA_EPI: 'Episodios HC',
  MAX_CARACTERES: 45000,         // límite de una celda de Sheets: 50.000
  COL: { ID: 1, NOMBRE: 2, HISTORIA: 3, TRATAMIENTO: 4, MODIFICADO: 5, ORIGEN: 6, DOC: 7, ID_PACIENTE: 8 }  // 8 = "ID paciente" (paso 3b, CONTEXTO.md sección 11): a qué usuario de la Maestra pertenece la historia
};

/**
 * true  → FASE PRUEBA: la ficha avisa de que lo editado no llega al Doc, y las HC nuevas / altas siguen yendo a Google Docs.
 * false → DEFINITIVO: la historia vive en las hojas "Historias Clínicas" / "Episodios HC". Las HC nuevas se crean ahí,
 *         el alta escribe en "Episodios HC" y el enlace de la Maestra apunta a la ficha web. Los Docs no se tocan más.
 * Es el interruptor para deshacer: con true vuelve el comportamiento anterior (los enlaces ya cambiados se restauran
 * con revertirEnlacesHCaDocs() de herramientas/Enlazar_HC_Web.gs).
 */
const HC_WEB_MODO_PRUEBA = false;

// Misma clasificación que ESTILOS_ASISTENCIA de agenda/Web_Vista.html (sobre texto sin tildes y en minúsculas).
const HC_ESTILOS_ASISTENCIA_ = [
  { clase: 'mal',    patron: /^no\b|^sin asist|falt|ausen|plant|no (vino|asist|acud|se present)/ },
  { clase: 'neutro', patron: /pendient|por confirmar|sin confirmar|sin registrar/ },
  { clase: 'aviso',  patron: /cancel|anul|aplaz|recuper|justific|retras/ },
  { clase: 'ok',     patron: /asist|vino|presente|realiz|acudi|^si$|^ok$/ }
];

/** Sirve la página de la ficha: ?page=hc&id=ID_HC  (o &idPaciente=ID_PACIENTE si no hay ID HC). */
function servirFichaHCWeb(parametros) {
  const t = HtmlService.createTemplateFromFile('historia/HC_Vista');
  t.idHC = (parametros && parametros.id) || '';                       // ID HC (?page=hc&id=)
  t.idPaciente = (parametros && parametros.idPaciente) || '';         // ID paciente (?page=hc&idPaciente=), si no hay ID HC
  t.modoPrueba = HC_WEB_MODO_PRUEBA;
  t.imprimir = !!(parametros && String(parametros.imprimir) === '1');
  t.baseUrl = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle('Historia clínica').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ----------------------------------------------------------------------------- utilidades

function hcNorm_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}
function hcDigitos_(s) { return String(s || '').replace(/\D/g, '').slice(-9); }
function hcDocId_(txt) { const m = String(txt || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }
function hcAISO_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function hcDeISO_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : '';
}
/** Orden de episodios por Ingreso; los que aún no tienen ingreso (episodio sin empezar) van al final, como el más reciente. */
function hcCmpEpisodios_(a, b) {
  if (a.ingreso === b.ingreso) return 0;
  if (!a.ingreso) return 1;
  if (!b.ingreso) return -1;
  return a.ingreso < b.ingreso ? -1 : 1;
}
function hcMs_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v) ? v.getTime() : 0;
}

function hcHojas_() {
  const ss = getSS();
  const hc = ss.getSheetByName(HC_WEB_.HOJA_HC), epi = ss.getSheetByName(HC_WEB_.HOJA_EPI);
  if (!hc || !epi) throw new Error('Faltan las hojas "' + HC_WEB_.HOJA_HC + '" / "' + HC_WEB_.HOJA_EPI + '" (ejecuta la migración).');
  return { ss: ss, hc: hc, epi: epi };
}

/** Fila de la Maestra del usuario con ese ID paciente (columna "ID paciente"); 0 si no existe. Es la ÚNICA forma de localizar a un usuario desde la HC. */
function hcFilaMaestraPorIdPaciente_(maestra, idPaciente) { return filaMaestraPorId_(maestra, idPaciente); }

// ----------------------------------------------------------------------------- lectura

/**
 * Todo lo que necesita pintar la ficha, en una sola llamada. La historia y el usuario se localizan SOLO por ID, nunca por
 * nombre ni por número de fila.
 * @param {string} idHC ID de la historia (col. 1 de "Historias Clínicas"; el que lleva el enlace ?page=hc&id=).
 * @param {string=} idPaciente ID paciente (Maestra). Se usa si no hay ID HC: la historia es la que lleva ese ID en su col. 8.
 * @param {string=} enlaceAntiguo URL de un Doc antiguo (solo para enlaces de la Agenda aún sin convertir): se resuelve por el
 *   ID del Doc guardado en la historia (col. 7).
 */
function obtenerHCWeb(idHC, idPaciente, enlaceAntiguo) {
  try {
    idHC = String(idHC || '').replace(/[^\w-]/g, '');
    idPaciente = String(idPaciente || '').trim();
    const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
    const maestra = h.ss.getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };

    // --- 1) la historia, por ID HC; si no, por ID paciente (col. 8); si no, por el ID del Doc de un enlace antiguo
    const ultHC = h.hc.getLastRow();
    if (ultHC < 2) return { success: false, message: 'La hoja "' + HC_WEB_.HOJA_HC + '" está vacía.' };
    const iIdP = HC_WEB_.COL.ID_PACIENTE - 1, iDoc = HC_WEB_.COL.DOC - 1;
    const filasHC = h.hc.getRange(2, 1, ultHC - 1, HC_WEB_.COL.ID_PACIENTE).getValues();
    let idx = -1;
    if (idHC) {
      for (let i = 0; i < filasHC.length; i++) if (String(filasHC[i][0]) === idHC) { idx = i; break; }
    } else if (idPaciente) {
      const c = [];
      filasHC.forEach(function (r, i) { if (String(r[iIdP] || '').trim() === idPaciente) c.push(i); });
      if (c.length > 1) return { success: false, message: 'Hay ' + c.length + ' historias con el mismo ID paciente: hay que revisarlo.' };
      if (c.length === 1) idx = c[0];
    } else if (enlaceAntiguo) {
      const d = hcDocId_(enlaceAntiguo);
      if (d) for (let i = 0; i < filasHC.length; i++) if (hcDocId_(filasHC[i][iDoc]) === d) { idx = i; break; }
    }

    // --- 2) el usuario: por el ID paciente de la historia (o el recibido). Respaldo, también por ID: el enlace de la Maestra a ese ID HC.
    const idPUsuario = idx !== -1 ? String(filasHC[idx][iIdP] || '').trim() : idPaciente;
    let filaM = hcFilaMaestraPorIdPaciente_(maestra, idPUsuario);
    if (!filaM && idHC) filaM = hcLocalizarUsuarioPorId_(h, maestra, idHC);
    if (!filaM) return { success: false, message: 'No se encontró al usuario en la Base de Datos.' };

    // --- datos personales (una fila de la Maestra)
    const cab = maestra.getRange(1, 1, 1, maestra.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim().toLowerCase(); });
    const valores = maestra.getRange(filaM, 1, 1, cab.length).getValues()[0];
    const dato = function (col) {
      const i = cab.indexOf(String(col).trim().toLowerCase());
      if (i === -1) return '';
      let v = valores[i];
      if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      return v === null || v === undefined ? '' : String(v).trim();
    };
    const iHC = cab.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
    let docUrl = '';
    if (iHC !== -1) {
      const c = maestra.getRange(filaM, iHC + 1);
      docUrl = extraerUrlHistoriaClinica(valores[iHC], c.getRichTextValue(), c.getFormula());
    }
    const usuario = {
      idPaciente: dato(COLUMNAS.MAESTRA.ID_PACIENTE),
      nombre: dato(COLUMNAS.MAESTRA.NOMBRE), dni: dato(COLUMNAS.MAESTRA.DNI),
      nacimiento: dato(COLUMNAS.MAESTRA.FECHA_NACIMIENTO), edad: dato(COLUMNAS.MAESTRA.EDAD),
      telefono: dato(COLUMNAS.MAESTRA.TELEFONO_1), telefono2: dato(COLUMNAS.MAESTRA.TELEFONO_2),
      inscripcion: dato(COLUMNAS.MAESTRA.FECHA_INSCRIPCION), estado: dato(COLUMNAS.MAESTRA.ESTADO),
      fila: filaM
    };

    // --- 3) si con los datos recibidos no apareció la historia, se prueba con la que enlaza la Maestra a ese usuario (ID HC o Doc original)
    if (idx === -1 && !idHC) {
      const idLink = hcIdDeUrl_(docUrl), docId = idLink ? '' : hcDocId_(docUrl);
      if (idLink) for (let i = 0; i < filasHC.length; i++) if (String(filasHC[i][0]) === idLink) { idx = i; break; }
      if (idx === -1 && docId) for (let i = 0; i < filasHC.length; i++) if (hcDocId_(filasHC[i][iDoc]) === docId) { idx = i; break; }
    }
    if (idx === -1) return { success: false, usuario: usuario, message: 'Este usuario no tiene historia migrada.' };
    const filaHC = idx + 2;
    const fila7 = filasHC[idx];
    const id = String(fila7[0]);

    // --- episodios
    const episodios = [];
    const ultE = h.epi.getLastRow();
    if (ultE > 1) h.epi.getRange(2, 1, ultE - 1, 4).getValues().forEach(function (r) {
      if (String(r[0]) === id) episodios.push({ ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz), nota: String(r[3] || '') });
    });
    episodios.sort(hcCmpEpisodios_);

    const resp = {
      success: true, id: id, usuario: usuario, docOriginal: String(fila7[6] || (hcEsFichaWeb_(docUrl) ? '' : docUrl) || ''),
      historia: String(fila7[2] || ''), tratamiento: String(fila7[3] || ''), modificado: hcMs_(fila7[4]),
      episodios: episodios, modoPrueba: HC_WEB_MODO_PRUEBA
    };
    // Las dos fuentes externas no deben impedir ver la historia si fallan.
    try { resp.valoraciones = hcLeerValoraciones_(h.ss, usuario, tz); } catch (e1) { resp.valoraciones = []; resp.avisoValoraciones = e1.message; }
    try {
      const desde = episodios.length ? episodios[episodios.length - 1].ingreso : '';
      resp.asistencia = hcContarAsistencia_(usuario, desde, tz);
    } catch (e2) { resp.asistencia = null; resp.avisoAsistencia = e2.message; }
    return resp;
  } catch (e) {
    Logger.log('Error en obtenerHCWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Lee UNA vez la hoja Valoraciones y deja cada fila ya normalizada (nombre, DNI, escalas), para poder filtrarla
 * por usuario sin volver a leer la hoja. Lo usan la ficha individual y la carga masiva de HC activas.
 */
function hcLeerFilasValoraciones_(ss, tz) {
  const hoja = ss.getSheetByName(SHEETS.VALORACIONES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const C = COLUMNAS_NUM.VALORACIONES;
  const ncol = Math.min(hoja.getLastColumn(), C.DNI);
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ncol).getValues();
  const num = function (v) { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  return filas.map(function (r) {
    const peg = [num(r[C.PEG_DOLOR - 1]), num(r[C.PEG_ACTIVIDAD - 1]), num(r[C.PEG_VIDA - 1])].filter(function (x) { return x !== null; });
    return {
      nom: hcNorm_(r[C.NOMBRE - 1]), dni: String(r[C.DNI - 1] || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
      fecha: hcAISO_(r[C.FECHA - 1], tz), tipo: String(r[C.TIPO - 1] || ''),
      dolor: peg.length ? Math.round(peg.reduce(function (a, b) { return a + b; }, 0) / peg.length * 10) / 10 : null,
      funcion: num(r[C.FUNCION_GLOBAL - 1]), analg: num(r[C.ANALGESICOS - 1])
    };
  });
}

/** Valoraciones de un usuario a partir de las filas ya leídas, de la más antigua a la más reciente. Si la fila trae DNI y el usuario también, manda el DNI; si no, el nombre. */
function hcValoracionesDeUsuario_(filas, usuario) {
  const nom = hcNorm_(usuario.nombre), dni = String(usuario.dni || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const out = [];
  filas.forEach(function (r) {
    const coincide = (r.dni && dni) ? r.dni === dni : r.nom === nom;
    if (coincide) out.push({ fecha: r.fecha, tipo: r.tipo, dolor: r.dolor, funcion: r.funcion, analg: r.analg });
  });
  out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  return out;
}

/**
 * Valoraciones del usuario, de la más antigua a la más reciente. Si la fila trae DNI (columna 14, desde
 * 05/10/2026) y el usuario también, manda el DNI; si no, el nombre normalizado.
 */
function hcLeerValoraciones_(ss, usuario, tz) {
  return hcValoracionesDeUsuario_(hcLeerFilasValoraciones_(ss, tz), usuario);
}

/**
 * Lee UNA vez las hojas de Agenda necesarias y deja cada cita clasificada (nombre, fecha, teléfono, clase de asistencia),
 * agrupada por nombre. `desdeISO` solo sirve para decidir si hace falta el curso anterior; si se omite (undefined),
 * el curso anterior se lee siempre (carga masiva, cada usuario decide luego con su propio desde).
 */
function hcLeerDatosAgenda_(tz, desdeISO) {
  const actual = obtenerHojaAgenda();
  const datos = { hoy: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), actual: hcCitasPorNombre_(actual, tz), previo: null, limitePrevio: '' };
  const m = actual.getName().match(/(\d{4})-(\d{4})/);
  if (m) {
    const prev = getSS().getSheetByName('Agenda ' + (+m[1] - 1) + '-' + (+m[2] - 1));
    const limite = (+m[1]) + '-09-01';
    if (prev && (desdeISO === undefined || !desdeISO || desdeISO < limite)) { datos.previo = hcCitasPorNombre_(prev, tz); datos.limitePrevio = limite; }
  }
  return datos;
}

function hcCitasPorNombre_(hoja, tz) {
  const porNombre = {};
  const ult = hoja.getLastRow(); if (ult < 2) return porNombre;
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  const cF = cab.indexOf(COLUMNAS.AGENDA.FECHA), cU = cab.indexOf(COLUMNAS.AGENDA.USUARIO),
        cT = cab.indexOf(COLUMNAS.AGENDA.TELEFONO), cA = cab.indexOf(COLUMNAS.AGENDA.ASISTENCIA);
  if (cF === -1 || cU === -1 || cA === -1) return porNombre;
  const filas = hoja.getRange(2, 1, ult - 1, Math.max(cF, cU, cT, cA) + 1).getValues();
  filas.forEach(function (f) {
    const nom = hcNorm_(f[cU]); if (!nom) return;
    const fecha = hcAISO_(f[cF], tz); if (!fecha) return;
    const v = hcNorm_(f[cA]).toLowerCase();
    let clase = 'neutro';
    if (v) for (let i = 0; i < HC_ESTILOS_ASISTENCIA_.length; i++) if (HC_ESTILOS_ASISTENCIA_[i].patron.test(v)) { clase = HC_ESTILOS_ASISTENCIA_[i].clase; break; }
    (porNombre[nom] = porNombre[nom] || []).push({ fecha: fecha, tel: cT === -1 ? '' : hcDigitos_(f[cT]), clase: clase });
  });
  return porNombre;
}

/** Cuenta las citas de un usuario con los datos de Agenda ya leídos (misma lógica de siempre: nombre + teléfono, solo hasta hoy). */
function hcContarAsistenciaDe_(datos, usuario, desdeISO) {
  const nom = hcNorm_(usuario.nombre);
  const tels = [hcDigitos_(usuario.telefono), hcDigitos_(usuario.telefono2)].filter(Boolean);
  const r = { asistidas: 0, noAsistidas: 0, justificadas: 0, pendientes: 0, otras: 0, telefonoDistinto: 0 };
  const fuentes = [datos.actual];
  if (datos.previo && (!desdeISO || desdeISO < datos.limitePrevio)) fuentes.push(datos.previo);
  fuentes.forEach(function (porNombre) {
    (porNombre[nom] || []).forEach(function (c) {
      if (desdeISO && c.fecha < desdeISO) return;
      if (c.tel && tels.length && tels.indexOf(c.tel) === -1) { r.telefonoDistinto++; return; }  // mismo nombre, otro teléfono: no se cuenta
      if (c.fecha > datos.hoy || c.clase === 'neutro') { r.pendientes++; return; }
      if (c.clase === 'ok') r.asistidas++; else if (c.clase === 'mal') r.noAsistidas++; else if (c.clase === 'aviso') r.justificadas++; else r.otras++;
    });
  });
  return r;
}

/**
 * Cuenta las citas del usuario en la Agenda del curso activo (y la del curso anterior si el episodio empezó antes),
 * por nombre + teléfono. Cuenta solo hasta hoy; lo pendiente va aparte y no entra en el porcentaje.
 */
function hcContarAsistencia_(usuario, desdeISO, tz) {
  return hcContarAsistenciaDe_(hcLeerDatosAgenda_(tz, desdeISO || ''), usuario, desdeISO);
}

// ----------------------------------------------------------------------------- carga masiva (precarga en el navegador)

/**
 * Las historias clínicas de TODOS los usuarios en estado Activo, en una sola llamada, con exactamente el mismo
 * formato que devuelve obtenerHCWeb para cada una. La usa ui/JS_HC_Cache.html para precargarlas en segundo plano
 * (Base de Datos y Agenda) y que la ficha se abra al instante.
 *
 * Cada hoja (Maestra, Historias Clínicas, Episodios HC, Valoraciones, Agenda) se lee UNA sola vez, en vez de una vez
 * por usuario. Es SOLO LECTURA: no escribe nada. Si un usuario falla, se salta y el resto sigue.
 * @return {{success:boolean, items?:Object[], generado?:number, message?:string}}
 */
function obtenerHCsActivasWeb() {
  try {
    const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
    const maestra = h.ss.getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };
    const ultM = maestra.getLastRow(), nCol = maestra.getLastColumn();
    const ultHC = h.hc.getLastRow();
    if (ultM < 2 || nCol < 1 || ultHC < 2) return { success: true, items: [], generado: Date.now() };

    // --- Maestra completa (una lectura) + columna del enlace a la historia (texto enriquecido y fórmulas)
    const cab = maestra.getRange(1, 1, 1, nCol).getValues()[0].map(function (x) { return String(x).trim().toLowerCase(); });
    const valores = maestra.getRange(2, 1, ultM - 1, nCol).getValues();
    const col = function (nombre) { return cab.indexOf(String(nombre).trim().toLowerCase()); };
    const iHC = col(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
    let ricos = null, formulas = null;
    if (iHC !== -1) {
      const rg = maestra.getRange(2, iHC + 1, ultM - 1, 1);
      ricos = rg.getRichTextValues(); formulas = rg.getFormulas();
    }
    const iNombre = col(COLUMNAS.MAESTRA.NOMBRE), iEstado = col(COLUMNAS.MAESTRA.ESTADO);
    if (iNombre === -1 || iEstado === -1) return { success: false, message: 'Faltan las columnas Nombre / Estado en la Maestra.' };

    // --- Historias clínicas (una lectura) con índices por ID HC, por ID paciente y por Doc original (nunca por nombre)
    const filasHC = h.hc.getRange(2, 1, ultHC - 1, HC_WEB_.COL.ID_PACIENTE).getValues();
    const porId = {}, porDoc = {}, porIdPaciente = {};
    filasHC.forEach(function (r, i) {
      const id = String(r[0]);
      if (id && porId[id] === undefined) porId[id] = i;
      const d = hcDocId_(r[HC_WEB_.COL.DOC - 1]);
      if (d && porDoc[d] === undefined) porDoc[d] = i;
      const p = String(r[HC_WEB_.COL.ID_PACIENTE - 1] || '').trim();
      if (p) (porIdPaciente[p] = porIdPaciente[p] || []).push(i);
    });

    // --- Episodios (una lectura), agrupados por ID de HC
    const epiPorId = {};
    const ultE = h.epi.getLastRow();
    if (ultE > 1) h.epi.getRange(2, 1, ultE - 1, 4).getValues().forEach(function (r) {
      const id = String(r[0]); if (!id) return;
      (epiPorId[id] = epiPorId[id] || []).push({ ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz), nota: String(r[3] || '') });
    });
    Object.keys(epiPorId).forEach(function (id) {
      epiPorId[id].sort(hcCmpEpisodios_);
    });

    // --- Valoraciones y Agenda (una lectura cada una). Si alguna falla, la ficha sale igual, como en obtenerHCWeb.
    let filasVal = null, avisoVal = '', agenda = null, avisoAg = '';
    try { filasVal = hcLeerFilasValoraciones_(h.ss, tz); } catch (e1) { avisoVal = e1.message; }
    try { agenda = hcLeerDatosAgenda_(tz); } catch (e2) { avisoAg = e2.message; }

    const items = [];
    valores.forEach(function (row, i) {
      try {
        if (!String(row[iNombre] || '').trim()) return;
        if (hcNorm_(row[iEstado]).indexOf('ACTIV') === -1) return;          // solo usuarios Activos

        const dato = function (nombreCol) {
          const k = col(nombreCol); if (k === -1) return '';
          let v = row[k];
          if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
          return v === null || v === undefined ? '' : String(v).trim();
        };
        let docUrl = '';
        if (iHC !== -1) docUrl = extraerUrlHistoriaClinica(row[iHC], ricos[i][0], formulas[i][0]);
        const usuario = {
          idPaciente: dato(COLUMNAS.MAESTRA.ID_PACIENTE),
          nombre: dato(COLUMNAS.MAESTRA.NOMBRE), dni: dato(COLUMNAS.MAESTRA.DNI),
          nacimiento: dato(COLUMNAS.MAESTRA.FECHA_NACIMIENTO), edad: dato(COLUMNAS.MAESTRA.EDAD),
          telefono: dato(COLUMNAS.MAESTRA.TELEFONO_1), telefono2: dato(COLUMNAS.MAESTRA.TELEFONO_2),
          inscripcion: dato(COLUMNAS.MAESTRA.FECHA_INSCRIPCION), estado: dato(COLUMNAS.MAESTRA.ESTADO),
          fila: i + 2
        };

        // Misma búsqueda de la HC que obtenerHCWeb: por ID paciente (col. 8 de la historia); si ninguna lo lleva, por el ID HC
        // del enlace de la Maestra o por el Doc original. Nunca por nombre. Sin historia o ambigua: se abre por el camino normal.
        const candidatas = usuario.idPaciente ? (porIdPaciente[usuario.idPaciente] || []) : [];
        const idLink = hcIdDeUrl_(docUrl);
        const docId = idLink ? '' : hcDocId_(docUrl);
        let idx = -1;
        if (candidatas.length === 1) idx = candidatas[0];
        else if (candidatas.length === 0) {
          if (idLink && porId[idLink] !== undefined) idx = porId[idLink];
          else if (docId && porDoc[docId] !== undefined) idx = porDoc[docId];
        }
        if (idx === -1) return;
        const f7 = filasHC[idx], id = String(f7[0]);
        const episodios = (epiPorId[id] || []).map(function (e) { return { ingreso: e.ingreso, alta: e.alta, nota: e.nota }; });

        const resp = {
          success: true, id: id, usuario: usuario,
          docOriginal: String(f7[6] || (hcEsFichaWeb_(docUrl) ? '' : docUrl) || ''),
          historia: String(f7[2] || ''), tratamiento: String(f7[3] || ''), modificado: hcMs_(f7[4]),
          episodios: episodios, modoPrueba: HC_WEB_MODO_PRUEBA
        };
        if (filasVal) resp.valoraciones = hcValoracionesDeUsuario_(filasVal, usuario); else { resp.valoraciones = []; resp.avisoValoraciones = avisoVal; }
        if (agenda) {
          const desde = episodios.length ? episodios[episodios.length - 1].ingreso : '';
          resp.asistencia = hcContarAsistenciaDe_(agenda, usuario, desde);
        } else { resp.asistencia = null; resp.avisoAsistencia = avisoAg; }
        items.push(resp);
      } catch (eU) {
        Logger.log('obtenerHCsActivasWeb: se omite la fila ' + (i + 2) + ': ' + eU.message);
      }
    });
    return { success: true, items: items, generado: Date.now() };
  } catch (e) {
    Logger.log('Error en obtenerHCsActivasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

// ----------------------------------------------------------------------------- escritura

/**
 * Guarda Historia o Tratamiento. `modificadoBase` es el valor de "modificado" que tenía la ficha al cargar:
 * si otra pestaña lo cambió entretanto, NO se sobrescribe y se avisa del conflicto.
 * @return {{success:boolean, conflicto?:boolean, modificado?:number, message?:string}}
 */
function guardarTextoHCWeb(id, campo, texto, modificadoBase) {
  const col = campo === 'historia' ? HC_WEB_.COL.HISTORIA : campo === 'tratamiento' ? HC_WEB_.COL.TRATAMIENTO : 0;
  if (!col) return { success: false, message: 'Campo no válido.' };
  texto = String(texto === null || texto === undefined ? '' : texto);
  if (texto.length > HC_WEB_.MAX_CARACTERES) return { success: false, message: 'El texto supera el límite de ' + HC_WEB_.MAX_CARACTERES + ' caracteres.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'La hoja está ocupada. Inténtalo de nuevo.' };
  try {
    const h = hcHojas_(), fila = hcFilaPorId_(h.hc, id);
    if (!fila) return { success: false, message: 'No se encontró la historia (ID no válido).' };
    const celdaMod = h.hc.getRange(fila, HC_WEB_.COL.MODIFICADO);
    const actual = hcMs_(celdaMod.getValue());
    if (modificadoBase && actual && Math.abs(actual - modificadoBase) > 1500) {
      return { success: false, conflicto: true, modificado: actual,
        message: 'Esta historia se ha modificado desde otra pestaña. Recarga la ficha para no perder cambios.' };
    }
    const celda = h.hc.getRange(fila, col);
    celda.setNumberFormat('@');          // texto plano: que Sheets no convierta "=..." en fórmula ni fechas en fecha
    celda.setValue(texto);
    const ahora = new Date();
    celdaMod.setNumberFormat('dd/MM/yyyy HH:mm:ss').setValue(ahora);
    SpreadsheetApp.flush();
    // Comprobación: lo escrito debe leerse igual.
    if (String(celda.getValue()) !== texto) return { success: false, message: 'La hoja no guardó el texto tal cual. No se ha perdido el original en pantalla.' };
    return { success: true, modificado: hcMs_(celdaMod.getValue()) };
  } catch (e) {
    Logger.log('Error en guardarTextoHCWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Firma de una lista de episodios: texto que no depende del orden. Panel_HC calcula la misma (firmaEpi) con lo que
 * cree que hay guardado; si no coincide con lo que hay ahora en la hoja, otra ventana ha cambiado los episodios.
 */
function hcFirmaEpisodios_(lista) {
  return lista.map(function (e) { return [e.ingreso || '', e.alta || '', e.nota || ''].join('|'); }).sort().join('\n');
}

/**
 * Sustituye los episodios de una historia por la lista recibida [{ingreso:'yyyy-MM-dd', alta:'yyyy-MM-dd'|'', nota}].
 * `firmaBase` (opcional) es la firma de los episodios tal como la ficha los tenía al cargar o al guardar por última vez:
 * si no coincide con lo que hay en la hoja, NO se escribe y se devuelve {conflicto:true, episodios:[...actuales]}.
 */
function guardarEpisodiosHCWeb(id, episodios, firmaBase) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'La hoja está ocupada. Inténtalo de nuevo.' };
  try {
    const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
    if (!hcFilaPorId_(h.hc, id)) return { success: false, message: 'No se encontró la historia (ID no válido).' };
    const lista = (episodios || []).map(function (e) {
      return { ingreso: /^\d{4}-\d{2}-\d{2}$/.test(e.ingreso) ? e.ingreso : '', alta: /^\d{4}-\d{2}-\d{2}$/.test(e.alta) ? e.alta : '', nota: String(e.nota || '') };
    });
    if (lista.some(function (e) { return e.ingreso && e.alta && e.alta < e.ingreso; })) return { success: false, message: 'Un alta no puede ser anterior a su ingreso.' };

    // Se reescriben solo las filas de ESTA historia: las de las demás no se tocan.
    const ult = h.epi.getLastRow();
    const todas = ult > 1 ? h.epi.getRange(2, 1, ult - 1, 4).getValues() : [];
    const filasId = [];
    todas.forEach(function (r, i) { if (String(r[0]) === id) filasId.push(i + 2); });

    // Control de conflicto: ¿siguen los episodios como la ficha cree que están?
    if (typeof firmaBase === 'string') {
      const actuales = filasId.map(function (f) {
        const r = todas[f - 2];
        return { ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz), nota: String(r[3] || '') };
      });
      if (hcFirmaEpisodios_(actuales) !== firmaBase) {
        actuales.sort(hcCmpEpisodios_);
        return { success: false, conflicto: true, episodios: actuales,
          message: 'Los episodios se habían cambiado desde otra ventana.' };
      }
    }

    const nuevas = lista.map(function (e) { return [id, hcDeISO_(e.ingreso), hcDeISO_(e.alta), e.nota]; });
    // 1) se escriben en las filas que ya tenía (reutilizadas), 2) lo que sobre se añade al final, 3) las sobrantes se vacían.
    for (let k = 0; k < Math.min(nuevas.length, filasId.length); k++) {
      h.epi.getRange(filasId[k], 1, 1, 4).setValues([nuevas[k]]);
      h.epi.getRange(filasId[k], 2, 1, 2).setNumberFormat('dd/MM/yyyy');
    }
    if (nuevas.length > filasId.length) {
      const ini = h.epi.getLastRow() + 1, resto = nuevas.slice(filasId.length);
      if (h.epi.getMaxRows() < ini + resto.length - 1) h.epi.insertRowsAfter(h.epi.getMaxRows(), ini + resto.length - 1 - h.epi.getMaxRows());
      h.epi.getRange(ini, 1, resto.length, 4).setValues(resto);
      h.epi.getRange(ini, 2, resto.length, 2).setNumberFormat('dd/MM/yyyy');
    }
    for (let k = nuevas.length; k < filasId.length; k++) h.epi.getRange(filasId[k], 1, 1, 4).clearContent();
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log('Error en guardarEpisodiosHCWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function hcFilaPorId_(hojaHC, id) {
  const ult = hojaHC.getLastRow();
  if (ult < 2 || !id) return 0;
  const ids = hojaHC.getRange(2, 1, ult - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

// ----------------------------------------------------------------------------- enlace de la Maestra → ficha web

/** URL de la ficha web de una HC. Es lo que se guarda en la columna "Historia clínica" de la Maestra. */
function hcUrlFicha_(id) { return ScriptApp.getService().getUrl() + '?page=hc&id=' + id; }
function hcEsFichaWeb_(url) { return /[?&]page=hc&id=[\w-]+/.test(String(url || '')); }
function hcIdDeUrl_(url) { const m = String(url || '').match(/[?&]page=hc&id=([\w-]+)/); return m ? m[1] : ''; }

/**
 * Fila de la Maestra del usuario dueño de una historia, a partir del ID HC: el "ID paciente" que lleva la historia (col. 8)
 * apunta a la Maestra. Respaldo, también por ID: la fila cuyo enlace de Historia clínica contiene ese ID HC. Nunca por nombre.
 */
function hcLocalizarUsuarioPorId_(h, maestra, idHC) {
  const filaHC = hcFilaPorId_(h.hc, idHC);
  if (filaHC) {
    const f = hcFilaMaestraPorIdPaciente_(maestra, h.hc.getRange(filaHC, HC_WEB_.COL.ID_PACIENTE).getValue());
    if (f) return f;
  }
  const ult = maestra.getLastRow();
  if (ult < 2) return 0;
  const iHC = obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  if (iHC !== -1) {
    const ricos = maestra.getRange(2, iHC + 1, ult - 1, 1).getRichTextValues();
    for (let i = 0; i < ricos.length; i++) {
      const u = ricos[i][0] && ricos[i][0].getLinkUrl();
      if (u && hcIdDeUrl_(u) === idHC) return i + 2;
    }
  }
  return 0;
}

/**
 * Crea una HC nueva (sin Doc): una fila en "Historias Clínicas" y un episodio abierto SIN fecha de ingreso.
 * Fechas por episodio: inscripción (se añade al usuario a la base de datos, vive en la Maestra) ≠ ingreso (el
 * paciente recibe su primera cita) ≠ alta. El ingreso nace vacío y lo rellena hcRegistrarPrimeraCita_ con la
 * fecha de la primera cita; NUNCA se copia de la inscripción.
 * @param {string} nombre
 * @param {string=} ingresoISO 'yyyy-MM-dd'. Normalmente se omite (ingreso vacío); solo para altas con ingreso ya conocido.
 * @param {string=} idPaciente ID paciente del usuario en la Maestra (columna "ID paciente"): se guarda en la historia para que sepa de quién es.
 * @return {{id:string, url:string}}
 */
function hcCrearHC_(nombre, ingresoISO, idPaciente) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada. Inténtalo de nuevo.');
  try {
    const h = hcHojas_(), id = Utilities.getUuid();
    const fila = Math.max(h.hc.getLastRow(), 1) + 1;
    if (h.hc.getMaxRows() < fila) h.hc.insertRowsAfter(h.hc.getMaxRows(), fila - h.hc.getMaxRows());
    if (h.hc.getMaxColumns() < HC_WEB_.COL.ID_PACIENTE) h.hc.insertColumnsAfter(h.hc.getMaxColumns(), HC_WEB_.COL.ID_PACIENTE - h.hc.getMaxColumns());
    h.hc.getRange(fila, 1, 1, HC_WEB_.COL.ID_PACIENTE).setNumberFormat('@').setValues([[id, String(nombre || '').trim(), '', '', new Date(), 'Web', '', String(idPaciente || '').trim()]]);
    h.hc.getRange(fila, HC_WEB_.COL.MODIFICADO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(ingresoISO || '') ? ingresoISO : '';   // vacío = sin empezar
    const fe = Math.max(h.epi.getLastRow(), 1) + 1;
    if (h.epi.getMaxRows() < fe) h.epi.insertRowsAfter(h.epi.getMaxRows(), fe - h.epi.getMaxRows());
    h.epi.getRange(fe, 1, 1, 4).setValues([[id, hcDeISO_(iso), '', '']]);
    h.epi.getRange(fe, 2, 1, 2).setNumberFormat('dd/MM/yyyy');
    SpreadsheetApp.flush();
    return { id: id, url: hcUrlFicha_(id) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Primera cita de un paciente: si su episodio abierto (sin alta) tiene el Ingreso vacío, lo rellena con la fecha
 * de esa cita. Si el episodio ya empezó (tiene ingreso), o no hay episodio abierto (p. ej. todos con alta), no hace
 * nada. Es "de mejor esfuerzo": nunca lanza error ni impide guardar la cita.
 * @param {string} url Enlace de la Historia clínica del usuario (el de la Maestra / la Agenda)
 * @param {string} fechaISO Fecha de la cita, 'yyyy-MM-dd' (si son varias citas, la primera)
 * @return {boolean} true si escribió el ingreso
 */
function hcRegistrarPrimeraCita_(url, fechaISO) {
  try {
    const id = hcIdDeUrl_(url);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO || '')) return false;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return false;
    try {
      const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
      const ult = h.epi.getLastRow();
      if (ult < 2) return false;
      const filas = h.epi.getRange(2, 1, ult - 1, 3).getValues();
      let objetivo = 0, yaEmpezado = false;
      filas.forEach(function (r, i) {
        if (String(r[0]) !== id || hcAISO_(r[2], tz)) return;      // otra HC, o episodio ya cerrado
        if (hcAISO_(r[1], tz)) yaEmpezado = true; else if (!objetivo) objetivo = i + 2;
      });
      if (yaEmpezado || !objetivo) return false;
      h.epi.getRange(objetivo, 2).setNumberFormat('dd/MM/yyyy').setValue(hcDeISO_(fechaISO));
      SpreadsheetApp.flush();
      return true;
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    Logger.log('Error en hcRegistrarPrimeraCita_: ' + e.message);
    return false;
  }
}

/** Alta médica: escribe hoy como fecha de alta del episodio abierto (el último sin alta). Devuelve el mensaje para el usuario. */
function hcAltaEnHoja_(url) {
  const id = hcIdDeUrl_(url);
  if (!id) return '⚠️ El enlace de la historia clínica no es válido.';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return '⚠️ La hoja de historias está ocupada: no se anotó la fecha de alta.';
  try {
    const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
    const ult = h.epi.getLastRow();
    const filas = ult > 1 ? h.epi.getRange(2, 1, ult - 1, 3).getValues() : [];
    let objetivo = 0, ingresoMax = '';
    filas.forEach(function (r, i) {
      if (String(r[0]) !== id || hcAISO_(r[2], tz)) return;       // otra HC, o ya tiene alta
      const ing = hcAISO_(r[1], tz);
      if (!objetivo || ing >= ingresoMax) { objetivo = i + 2; ingresoMax = ing; }
    });
    if (!objetivo) return '⚠️ No hay ningún ingreso abierto en la historia clínica: no se anotó la fecha de alta.';
    const hoy = new Date();
    h.epi.getRange(objetivo, 3).setNumberFormat('dd/MM/yyyy').setValue(hoy);
    SpreadsheetApp.flush();
    return '📅 Fecha de alta (' + Utilities.formatDate(hoy, tz, 'dd/MM/yyyy') + ').';
  } catch (e) {
    return '❌ No se pudo anotar el alta en la historia: ' + e.message;
  } finally {
    lock.releaseLock();
  }
}
