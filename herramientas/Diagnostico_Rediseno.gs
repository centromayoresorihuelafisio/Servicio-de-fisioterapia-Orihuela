/**
 * DIAGNÓSTICO PREVIO AL REDISEÑO DE DATOS (SOLO LECTURA)
 * Paso 1 del "Orden de trabajo" de CONTEXTO.md, sección 11.
 *
 * NO modifica ninguna hoja existente (ni la Maestra, ni las Agendas, ni las HC, ni nada).
 * Lo único que escribe es UNA hoja nueva llamada "Diagnóstico Rediseño" (si ya existe, la
 * vacía y la vuelve a rellenar). Se puede borrar cuando ya no haga falta.
 *
 * Qué mide:
 *   1. Maestra: total de usuarios, sin DNI, sin teléfono, DNI repetidos y pares sospechosos
 *      de duplicado (mismo DNI, mismo teléfono o nombres casi iguales).
 *   2. Agenda (solo la hoja del curso actual, la que devuelve obtenerHojaAgenda): cuántas citas con usuario
 *      enlazan con un usuario de la Maestra, clasificadas en seguro / probable / ambiguo / sin enlace.
 *   3. Episodios HC: de los de Origen "Web" y de los de origen migrado, por separado, cuántos
 *      tienen el Ingreso idéntico a la "Fecha inscripción" del usuario en la Maestra.
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú):
 *   1. Elige la función `diagnosticarRediseno` y pulsa Ejecutar.
 *   2. Se crea (o se rehace) la hoja "Diagnóstico Rediseño": resumen arriba, listas debajo.
 *   3. Cópiame el resumen (las primeras filas, hasta la línea "DETALLE").
 *
 * Reutiliza SIN modificar: hcCitasPorNombre_, hcNorm_, hcDigitos_, hcAISO_, hcIdDeUrl_ (historia/HC_Web.gs),
 * normalizarTelefono (usuarios/Contactos_Google.gs), normalizarDniUsuario, resolverColumnaTelefono_ y
 * extraerUrlHistoriaClinica y obtenerHojaAgenda (core/Utils.gs), _palabrasNombre_ y _nombresParecidos_ (usuarios/Anadir_Usuario.gs,
 * la misma lógica de nombres de buscarPosiblesDuplicadosWeb), getSS, SHEETS, COLUMNAS y HC_WEB_.
 *
 * Archivo nuevo en herramientas/. Todos los nombres llevan el prefijo diagRed_ / DIAG_RED_ para no
 * chocar con el ámbito global compartido del proyecto.
 */

const DIAG_RED_ = {
  HOJA: 'Diagnóstico Rediseño',
  MAX_PARES_LISTA: 500,          // tope de pares que se escriben en la lista de duplicados (el recuento es siempre completo)
  MARGEN_NOMBRES_MS: 2 * 60 * 1000 // si la comparación de nombres pasa de 2 min, se corta y se avisa (el límite de Apps Script es 6 min)
};

/** PUNTO DE ENTRADA: ejecútalo desde el editor. */
function diagnosticarRediseno() {
  const t0 = Date.now();
  const ss = getSS();
  const tz = ss.getSpreadsheetTimeZone();

  const usuarios = diagRed_leerMaestra_(ss, tz);
  const maestra = diagRed_analizarMaestra_(usuarios);
  const agenda = diagRed_analizarAgenda_(ss, tz, usuarios);
  const hc = diagRed_analizarHC_(ss, tz, usuarios);

  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  const informe = diagRed_montarInforme_(usuarios, maestra, agenda, hc, tz, segundos);
  diagRed_escribir_(ss, informe);

  Logger.log('Diagnóstico Rediseño terminado en ' + segundos + ' s.');
  try { ss.toast('Hoja "' + DIAG_RED_.HOJA + '" lista (' + segundos + ' s).', 'Diagnóstico', 8); } catch (e) { /* sin interfaz */ }
}

// ----------------------------------------------------------------------------- utilidades

function diagRed_pct_(n, total) {
  return total ? (Math.round(n * 1000 / total) / 10).toString().replace('.', ',') + ' %' : '';
}

/** 'yyyy-MM-dd' -> 'dd/MM/yyyy' (vacío si no es una fecha ISO). */
function diagRed_fechaES_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function diagRed_cmp_(a, b) { return String(a).localeCompare(String(b), 'es'); }

// ----------------------------------------------------------------------------- 1. Maestra

/**
 * Lee la Maestra una sola vez y devuelve una lista de usuarios (una por fila con nombre).
 * Cada usuario: fila real, nombre, nombreNorm (misma clave que usa hcCitasPorNombre_), dni, teléfonos
 * (texto original, normalizados para duplicados y "últimos 9 dígitos" para enlazar citas), palabras del
 * nombre, estado, fecha de inscripción (ISO) e ID HC (sacado del enlace de la columna "Historia clínica").
 */
function diagRed_leerMaestra_(ss, tz) {
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  const ult = hoja.getLastRow(), nc = hoja.getLastColumn();
  if (ult < 2) return [];

  const valores = hoja.getRange(1, 1, ult, nc).getValues();
  const cab = valores[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = function (n) { return cab.indexOf(String(n).trim().toLowerCase()); };
  const cNombre = idx(COLUMNAS.MAESTRA.NOMBRE);
  if (cNombre === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.NOMBRE + '".');
  const cDni = idx(COLUMNAS.MAESTRA.DNI);
  let cT1 = idx(COLUMNAS.MAESTRA.TELEFONO_1);
  if (cT1 === -1) cT1 = resolverColumnaTelefono_(hoja, valores[0]);
  const cT2 = idx(COLUMNAS.MAESTRA.TELEFONO_2);
  const cEstado = idx(COLUMNAS.MAESTRA.ESTADO);
  const cInsc = idx(COLUMNAS.MAESTRA.FECHA_INSCRIPCION);
  const cHC = idx(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

  // Enlaces de la columna "Historia clínica": texto con hipervínculo, así que se leen valores enriquecidos y fórmulas.
  let ricos = null, formulas = null;
  if (cHC !== -1) {
    const rango = hoja.getRange(2, cHC + 1, ult - 1, 1);
    ricos = rango.getRichTextValues();
    formulas = rango.getFormulas();
  }

  const celda = function (fila, c) {
    return (c === -1 || fila[c] === null || fila[c] === undefined) ? '' : fila[c].toString().trim();
  };

  const usuarios = [];
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    const nombre = celda(f, cNombre);
    if (!nombre) continue; // huecos
    const tel1 = celda(f, cT1), tel2 = celda(f, cT2);
    const url = cHC === -1 ? '' : extraerUrlHistoriaClinica(f[cHC], ricos[i - 1][0], formulas[i - 1][0]);
    usuarios.push({
      fila: i + 1,
      nombre: nombre,
      nombreNorm: hcNorm_(nombre),
      dni: normalizarDniUsuario(celda(f, cDni)),
      tel1: tel1,
      tel2: tel2,
      telsDup: [tel1, tel2].map(normalizarTelefono).filter(function (t) { return t.length >= 9; }), // criterio de buscarPosiblesDuplicadosWeb
      digs: [hcDigitos_(tel1), hcDigitos_(tel2)].filter(Boolean),                                  // criterio de hcCitasPorNombre_
      palabras: _palabrasNombre_(nombre),
      estado: celda(f, cEstado),
      inscISO: cInsc === -1 ? '' : hcAISO_(f[cInsc], tz),
      url: url,
      idHC: hcIdDeUrl_(url)
    });
  }
  return usuarios;
}

/**
 * Cuenta carencias y busca pares sospechosos de duplicado con los mismos criterios y puntos que
 * buscarPosiblesDuplicadosWeb (DNI = 4, teléfono = 2, nombre = 1), pero comparando a todos entre sí.
 */
function diagRed_analizarMaestra_(us) {
  const r = { total: us.length, sinDni: 0, sinTel1: 0, sinTelNinguno: 0, tel1Corto: 0, dniRepetidos: [], pares: [], nombresIncompleto: false };

  us.forEach(function (u) {
    if (!u.dni) r.sinDni++;
    const d1 = hcDigitos_(u.tel1);
    if (!d1) r.sinTel1++;
    else if (d1.length < 9) r.tel1Corto++;
    if (!u.digs.length) r.sinTelNinguno++;
  });

  // --- DNI repetidos
  const porDni = {};
  us.forEach(function (u, i) { if (u.dni) (porDni[u.dni] = porDni[u.dni] || []).push(i); });
  Object.keys(porDni).forEach(function (d) { if (porDni[d].length > 1) r.dniRepetidos.push({ dni: d, indices: porDni[d] }); });

  // --- pares sospechosos
  const pares = {}; // 'i|j' (i<j) -> { i, j, motivos:[], puntos }
  const anotar = function (i, j, motivo, puntos) {
    const k = i < j ? i + '|' + j : j + '|' + i;
    const p = pares[k] || (pares[k] = { i: Math.min(i, j), j: Math.max(i, j), motivos: [], puntos: 0 });
    if (p.motivos.indexOf(motivo) === -1) { p.motivos.push(motivo); p.puntos += puntos; }
  };

  r.dniRepetidos.forEach(function (g) {
    for (let a = 0; a < g.indices.length; a++) for (let b = a + 1; b < g.indices.length; b++) anotar(g.indices[a], g.indices[b], 'dni', 4);
  });

  const porTel = {};
  us.forEach(function (u, i) {
    u.telsDup.filter(function (t, k, arr) { return arr.indexOf(t) === k; })
      .forEach(function (t) { (porTel[t] = porTel[t] || []).push(i); });
  });
  Object.keys(porTel).forEach(function (t) {
    const l = porTel[t];
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) anotar(l[a], l[b], 'telefono', 2);
  });

  // Nombres: solo se comparan los que comparten alguna palabra (índice por palabra) para no hacer todos contra todos.
  const porPalabra = {};
  us.forEach(function (u, i) { u.palabras.forEach(function (w) { (porPalabra[w] = porPalabra[w] || []).push(i); }); });
  const vistos = {};
  const inicioNombres = Date.now();
  us.forEach(function (u, i) {
    if (r.nombresIncompleto) return;
    if (i % 200 === 0 && Date.now() - inicioNombres > DIAG_RED_.MARGEN_NOMBRES_MS) { r.nombresIncompleto = true; return; }
    u.palabras.forEach(function (w) {
      porPalabra[w].forEach(function (j) {
        if (j <= i) return;
        const k = i + '|' + j;
        if (vistos[k]) return;
        vistos[k] = true;
        if (_nombresParecidos_(u.palabras, us[j].palabras)) anotar(i, j, 'nombre', 1);
      });
    });
  });

  r.pares = Object.keys(pares).map(function (k) { return pares[k]; })
    .sort(function (a, b) { return b.puntos - a.puntos || us[a.i].fila - us[b.i].fila || us[a.j].fila - us[b.j].fila; });
  return r;
}

// ----------------------------------------------------------------------------- 2. Agenda

/**
 * Clasifica una cita (nombre normalizado + últimos 9 dígitos del teléfono) frente a la Maestra.
 *   seguro   = nombre y teléfono coinciden con un único usuario
 *   probable = el nombre existe una sola vez en la Maestra, pero el teléfono no lo confirma
 *   ambiguo  = varios usuarios posibles (mismo nombre) y el teléfono no decide
 *   sin      = ningún usuario con ese nombre
 */
function diagRed_clasificarCita_(candidatos, tel) {
  if (!candidatos.length) return { clase: 'sin', detalle: '' };
  const filasTxt = candidatos.map(function (u) { return u.fila; }).join(', ');
  const conTel = tel ? candidatos.filter(function (u) { return u.digs.indexOf(tel) !== -1; }) : [];
  if (conTel.length === 1) return { clase: 'seguro', detalle: '' };
  if (conTel.length > 1) return { clase: 'ambiguo', detalle: 'Varios usuarios con ese nombre y ese teléfono (filas ' + filasTxt + ')' };
  if (candidatos.length === 1) {
    const u = candidatos[0];
    const motivo = !tel ? 'La cita no trae teléfono'
      : !u.digs.length ? 'El usuario no tiene teléfono en la Maestra'
      : 'El teléfono de la cita no coincide con el de la Maestra';
    return { clase: 'probable', detalle: motivo + ' (Maestra: fila ' + u.fila + ')' };
  }
  return { clase: 'ambiguo', detalle: 'Hay ' + candidatos.length + ' usuarios con ese nombre (filas ' + filasTxt + ') y el teléfono no decide' };
}

/** Pistas para revisar a mano una cita sin enlace: usuarios con el mismo teléfono o con nombre parecido. */
function diagRed_pistas_(nombreNorm, tel, us, porTel) {
  const pistas = [];
  if (tel && porTel[tel]) porTel[tel].forEach(function (u) { pistas.push('mismo teléfono: ' + u.nombre + ' (fila ' + u.fila + ')'); });
  const pal = _palabrasNombre_(nombreNorm);
  us.forEach(function (u) {
    if (_nombresParecidos_(pal, u.palabras) && !(tel && porTel[tel] && porTel[tel].indexOf(u) !== -1)) {
      pistas.push('nombre parecido: ' + u.nombre + ' (fila ' + u.fila + ')');
    }
  });
  return pistas.slice(0, 4).join(' · ');
}

function diagRed_analizarAgenda_(ss, tz, us) {
  const res = { hojas: [], total: { filas: 0, citas: 0, seguro: 0, probable: 0, ambiguo: 0, sin: 0 }, subProbable: {}, listas: { sin: [], ambiguo: [], probable: [] }, avisos: [] };

  const porNombre = {}, porTel = {};
  us.forEach(function (u) {
    (porNombre[u.nombreNorm] = porNombre[u.nombreNorm] || []).push(u);
    u.digs.forEach(function (t) { (porTel[t] = porTel[t] || []).push(u); });
  });

  // Solo el curso actual (el anterior se descarta a propósito).
  let hojaCurso = null;
  try { hojaCurso = obtenerHojaAgenda(); } catch (e) { hojaCurso = null; }
  const hojas = hojaCurso ? [hojaCurso] : [];
  if (!hojas.length) res.avisos.push('No se ha encontrado la hoja de Agenda del curso actual.');

  const combos = {}; // 'clase|nombre|tel' -> fila de lista (agrupa todas las hojas)

  hojas.forEach(function (hoja) {
    const h = { nombre: hoja.getName(), filas: 0, citas: 0, seguro: 0, probable: 0, ambiguo: 0, sin: 0 };

    // Filas con usuario (recuento independiente, para detectar citas que hcCitasPorNombre_ no pueda leer por falta de fecha).
    const ult = hoja.getLastRow();
    let colUsuarioOK = true;
    if (ult >= 2) {
      const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
      const cU = cab.indexOf(COLUMNAS.AGENDA.USUARIO);
      if (cU === -1) colUsuarioOK = false;
      else h.filas = hoja.getRange(2, cU + 1, ult - 1, 1).getValues().filter(function (r) { return String(r[0] === null || r[0] === undefined ? '' : r[0]).trim(); }).length;
    }
    if (!colUsuarioOK) res.avisos.push('La hoja "' + h.nombre + '" no tiene la columna "' + COLUMNAS.AGENDA.USUARIO + '".');

    const citasPorNombre = hcCitasPorNombre_(hoja, tz); // { NOMBRE_NORM: [{fecha, tel, clase}] }
    Object.keys(citasPorNombre).forEach(function (nom) {
      const candidatos = porNombre[nom] || [];
      citasPorNombre[nom].forEach(function (c) {
        const cl = diagRed_clasificarCita_(candidatos, c.tel);
        h.citas++; h[cl.clase]++;
        if (cl.clase === 'probable') {
          const tipo = cl.detalle.replace(/ \(Maestra: fila \d+\)$/, '');
          res.subProbable[tipo] = (res.subProbable[tipo] || 0) + 1;
        }
        if (cl.clase === 'seguro') return;
        const clave = cl.clase + '|' + nom + '|' + c.tel;
        const e = combos[clave] || (combos[clave] = {
          clase: cl.clase, nombre: nom, tel: c.tel, n: 0, cursos: [], min: '', max: '',
          detalle: cl.clase === 'sin' ? diagRed_pistas_(nom, c.tel, us, porTel) : cl.detalle
        });
        e.n++;
        const curso = h.nombre.replace('Agenda ', '');
        if (e.cursos.indexOf(curso) === -1) e.cursos.push(curso);
        if (!e.min || c.fecha < e.min) e.min = c.fecha;
        if (!e.max || c.fecha > e.max) e.max = c.fecha;
      });
    });

    if (h.filas > h.citas) res.avisos.push('En "' + h.nombre + '" hay ' + (h.filas - h.citas) + ' fila(s) con usuario pero sin fecha legible: no entran en la clasificación.');
    res.hojas.push(h);
    ['filas', 'citas', 'seguro', 'probable', 'ambiguo', 'sin'].forEach(function (k) { res.total[k] += h[k]; });
  });

  Object.keys(combos).forEach(function (k) {
    const e = combos[k];
    res.listas[e.clase].push(e);
  });
  Object.keys(res.listas).forEach(function (k) {
    res.listas[k].sort(function (a, b) { return diagRed_cmp_(a.nombre, b.nombre) || diagRed_cmp_(a.tel, b.tel); });
  });
  return res;
}

// ----------------------------------------------------------------------------- 3. Episodios HC

function diagRed_analizarHC_(ss, tz, us) {
  const hHC = ss.getSheetByName(HC_WEB_.HOJA_HC), hEpi = ss.getSheetByName(HC_WEB_.HOJA_EPI);
  if (!hHC || !hEpi) return { faltan: true };

  // Historias Clínicas: ID -> nombre de referencia y origen
  const hcs = {};
  const ultHC = hHC.getLastRow();
  if (ultHC > 1) hHC.getRange(2, 1, ultHC - 1, 7).getValues().forEach(function (r) {
    const id = String(r[HC_WEB_.COL.ID - 1] || '').trim();
    if (id) hcs[id] = { nombre: String(r[HC_WEB_.COL.NOMBRE - 1] || '').trim(), origen: String(r[HC_WEB_.COL.ORIGEN - 1] || '').trim() };
  });

  // Usuarios por ID HC (enlace de la columna "Historia clínica" de la Maestra)
  const porId = {};
  const enlaces = { web: 0, otro: 0, ninguno: 0 };
  us.forEach(function (u) {
    if (u.idHC) { enlaces.web++; (porId[u.idHC] = porId[u.idHC] || []).push(u); }
    else if (u.url) enlaces.otro++;
    else enlaces.ninguno++;
  });
  const idsCompartidos = Object.keys(porId).filter(function (id) { return porId[id].length > 1; }).length;
  const hcSinUsuario = Object.keys(hcs).filter(function (id) { return !porId[id]; }).length;

  // Episodios agrupados por ID HC
  const episodios = {};
  const ultE = hEpi.getLastRow();
  if (ultE > 1) hEpi.getRange(2, 1, ultE - 1, 4).getValues().forEach(function (r) {
    const id = String(r[0] || '').trim();
    if (!id) return; // fila vacía (episodio borrado)
    (episodios[id] = episodios[id] || []).push({ ing: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz) });
  });

  const nuevo = function () { return { episodios: 0, hcs: 0, conUsuario: 0, sinUsuario: 0, sinFecha: 0, comparables: 0, identicos: 0, identicosPrimero: 0, distintos: 0 }; };
  const c = { web: nuevo(), migrada: nuevo(), otro: nuevo(), sinHC: nuevo() };
  const otrosOrigenes = {};
  const listaWeb = [];

  Object.keys(episodios).forEach(function (id) {
    const hc = hcs[id];
    let clave = 'sinHC';
    if (hc) {
      const o = hcNorm_(hc.origen).toLowerCase();
      if (o === 'web') clave = 'web';
      else if (o.indexOf('migrad') === 0) clave = 'migrada';
      else { clave = 'otro'; otrosOrigenes[hc.origen || '(vacío)'] = true; }
    }
    const cnt = c[clave];
    cnt.hcs++;

    // orden de episodios por Ingreso (los vacíos al final) y cuál es el primero
    const orden = episodios[id].slice().sort(function (a, b) {
      if (!a.ing && !b.ing) return 0; if (!a.ing) return 1; if (!b.ing) return -1;
      return a.ing < b.ing ? -1 : a.ing > b.ing ? 1 : 0;
    });
    const usuarios = porId[id] || [];
    const u = usuarios.length === 1 ? usuarios[0] : null;

    orden.forEach(function (e, k) {
      cnt.episodios++;
      let estado; // 'identico' | 'distinto' | 'sin fecha' | 'sin usuario'
      if (!u) { cnt.sinUsuario++; estado = 'sin usuario'; }
      else {
        cnt.conUsuario++;
        if (!e.ing || !u.inscISO) { cnt.sinFecha++; estado = 'sin fecha'; }
        else {
          cnt.comparables++;
          if (e.ing === u.inscISO) { cnt.identicos++; if (k === 0) cnt.identicosPrimero++; estado = 'identico'; }
          else { cnt.distintos++; estado = 'distinto'; }
        }
      }
      if (clave === 'web') listaWeb.push({
        nombre: u ? u.nombre : (hc.nombre || ''), filaMaestra: u ? u.fila : '', id: id, n: k + 1, de: orden.length,
        ing: e.ing, alta: e.alta, insc: u ? u.inscISO : '', estado: estado
      });
    });
  });

  const rango = { 'identico': 0, 'distinto': 1, 'sin fecha': 2, 'sin usuario': 3 };
  listaWeb.sort(function (a, b) { return rango[a.estado] - rango[b.estado] || diagRed_cmp_(a.nombre, b.nombre) || a.n - b.n; });

  return { faltan: false, c: c, otrosOrigenes: Object.keys(otrosOrigenes), listaWeb: listaWeb, enlaces: enlaces, idsCompartidos: idsCompartidos, hcSinUsuario: hcSinUsuario, totalHC: Object.keys(hcs).length };
}

// ----------------------------------------------------------------------------- montaje de la hoja

function diagRed_montarInforme_(us, m, ag, hc, tz, segundos) {
  const filas = [], titulos = [], cabeceras = [];
  let inicioDetalle = 0;
  const add = function (celdas, tipo) {
    filas.push(celdas);
    if (tipo === 'titulo') titulos.push(filas.length);
    else if (tipo === 'cab') cabeceras.push(filas.length);
  };
  const vacia = function () { add([]); };

  add(['DIAGNÓSTICO PREVIO AL REDISEÑO (solo lectura)'], 'titulo');
  add(['Generado', Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'), 'Duración: ' + segundos + ' s']);
  vacia();

  // ---- 1. Maestra
  add(['1. MAESTRA', 'Nº', 'Notas'], 'titulo');
  add(['Total de usuarios', m.total, 'Filas con nombre']);
  add(['Sin DNI', m.sinDni, diagRed_pct_(m.sinDni, m.total)]);
  add(['Sin teléfono 1', m.sinTel1, diagRed_pct_(m.sinTel1, m.total)]);
  add(['Sin ningún teléfono (ni 1 ni 2)', m.sinTelNinguno, diagRed_pct_(m.sinTelNinguno, m.total)]);
  add(['Teléfono 1 con menos de 9 dígitos (dudoso)', m.tel1Corto, 'Informativo']);
  const usuariosDniRep = m.dniRepetidos.reduce(function (s, g) { return s + g.indices.length; }, 0);
  add(['DNI repetidos (valores distintos)', m.dniRepetidos.length, 'Afectan a ' + usuariosDniRep + ' usuarios']);
  add(['Pares sospechosos de duplicado (total)', m.pares.length, 'Mismo DNI, mismo teléfono o nombres casi iguales' + (m.pares.length > DIAG_RED_.MAX_PARES_LISTA ? ' · en la lista de abajo solo caben los ' + DIAG_RED_.MAX_PARES_LISTA + ' primeros (los más fiables)' : '')]);
  const cuenta = function (f) { return m.pares.filter(f).length; };
  add(['   · con el mismo DNI', cuenta(function (p) { return p.motivos.indexOf('dni') !== -1; }), '']);
  add(['   · con algún teléfono en común', cuenta(function (p) { return p.motivos.indexOf('telefono') !== -1; }), 'Ojo: familiares pueden compartir teléfono']);
  add(['   · con nombres casi iguales', cuenta(function (p) { return p.motivos.indexOf('nombre') !== -1; }), '']);
  add(['   · con 2 o más motivos a la vez', cuenta(function (p) { return p.motivos.length >= 2; }), 'Los más fiables']);
  if (m.nombresIncompleto) add(['AVISO: la comparación de nombres se cortó por tiempo; el recuento de pares por nombre está incompleto.']);
  vacia();

  // ---- 2. Agenda
  add(['2. AGENDA (citas con usuario)', 'Filas con usuario', 'Citas leídas', 'Seguro', 'Probable', 'Ambiguo', 'Sin enlace'], 'titulo');
  ag.hojas.forEach(function (h) { add([h.nombre, h.filas, h.citas, h.seguro, h.probable, h.ambiguo, h.sin]); });
  add(['TOTAL', ag.total.filas, ag.total.citas, ag.total.seguro, ag.total.probable, ag.total.ambiguo, ag.total.sin]);
  add(['% sobre citas leídas', '', '', diagRed_pct_(ag.total.seguro, ag.total.citas), diagRed_pct_(ag.total.probable, ag.total.citas), diagRed_pct_(ag.total.ambiguo, ag.total.citas), diagRed_pct_(ag.total.sin, ag.total.citas)]);
  add(['Seguro = nombre y teléfono coinciden con un único usuario. Probable = el nombre existe una sola vez pero el teléfono no lo confirma. Ambiguo = varios usuarios posibles. Sin enlace = ningún usuario con ese nombre.']);
  Object.keys(ag.subProbable).sort().forEach(function (k) { add(['   · Probable: ' + k, ag.subProbable[k]]); });
  add(['Nombres distintos sin enlace (para revisar a mano)', new Set(ag.listas.sin.map(function (e) { return e.nombre; })).size, 'Lista abajo (C)']);
  ag.avisos.forEach(function (a) { add(['AVISO: ' + a]); });
  vacia();

  // ---- 3. Episodios HC
  if (hc.faltan) {
    add(['3. EPISODIOS HC'], 'titulo');
    add(['AVISO: faltan las hojas "' + HC_WEB_.HOJA_HC + '" / "' + HC_WEB_.HOJA_EPI + '". No se ha medido esta parte.']);
  } else {
    add(['3. EPISODIOS HC: Ingreso = Fecha inscripción', 'Episodios', 'HC distintas', 'Con usuario enlazado', 'Sin usuario enlazado', 'Sin fecha para comparar', 'Comparables', 'Ingreso = Inscripción', '…de ellos, 1.er episodio', '% idénticos', 'Ingreso ≠ Inscripción'], 'titulo');
    const fila = function (etiqueta, x) {
      add([etiqueta, x.episodios, x.hcs, x.conUsuario, x.sinUsuario, x.sinFecha, x.comparables, x.identicos, x.identicosPrimero, diagRed_pct_(x.identicos, x.comparables), x.distintos]);
    };
    fila('Origen Web', hc.c.web);
    fila('Origen migrado (Migrada de Doc)', hc.c.migrada);
    if (hc.c.otro.episodios) fila('Otro origen: ' + hc.otrosOrigenes.join(', '), hc.c.otro);
    if (hc.c.sinHC.episodios) fila('ID HC que no existe en "' + HC_WEB_.HOJA_HC + '"', hc.c.sinHC);
    add(['Comparables = episodios con usuario enlazado, Ingreso y Fecha inscripción rellenos. El enlace HC→usuario se hace por el ID HC del enlace de la columna "Historia clínica" de la Maestra.']);
    add(['Usuarios de la Maestra según su enlace de Historia clínica', hc.enlaces.web + ' web · ' + hc.enlaces.otro + ' Doc/otro · ' + hc.enlaces.ninguno + ' sin enlace']);
    add(['HC (de ' + hc.totalHC + ') a las que no apunta ningún usuario', hc.hcSinUsuario]);
    add(['ID HC enlazados desde varios usuarios a la vez', hc.idsCompartidos]);
  }
  vacia();

  // ---- DETALLE
  add(['DETALLE (las listas completas, debajo del resumen)'], 'titulo');
  vacia();
  inicioDetalle = filas.length + 1;

  // A. Pares sospechosos
  add(['A. PARES SOSPECHOSOS DE DUPLICADO (' + m.pares.length + (m.pares.length > DIAG_RED_.MAX_PARES_LISTA ? ', se muestran ' + DIAG_RED_.MAX_PARES_LISTA : '') + ')'], 'titulo');
  add(['Nombre A', 'Fila A', 'DNI A', 'Teléfono A', 'Estado A', 'Nombre B', 'Fila B', 'DNI B', 'Teléfono B', 'Estado B', 'Motivos (puntos)'], 'cab');
  if (!m.pares.length) add(['(ninguno)']);
  m.pares.slice(0, DIAG_RED_.MAX_PARES_LISTA).forEach(function (p) {
    const a = us[p.i], b = us[p.j];
    add([a.nombre, a.fila, a.dni, a.tel1 || a.tel2, a.estado, b.nombre, b.fila, b.dni, b.tel1 || b.tel2, b.estado, p.motivos.join(' + ') + ' (' + p.puntos + ')']);
  });
  vacia();

  // B. DNI repetidos
  add(['B. DNI REPETIDOS (' + m.dniRepetidos.length + ')'], 'titulo');
  add(['DNI', 'Nº usuarios', 'Filas de la Maestra', 'Nombres'], 'cab');
  if (!m.dniRepetidos.length) add(['(ninguno)']);
  m.dniRepetidos.forEach(function (g) {
    add([g.dni, g.indices.length, g.indices.map(function (i) { return us[i].fila; }).join(', '), g.indices.map(function (i) { return us[i].nombre; }).join(' / ')]);
  });
  vacia();

  // C, D, E. Citas por clasificar
  const listaCitas = function (titulo, lista) {
    add([titulo + ' (' + lista.length + ' combinaciones nombre+teléfono)'], 'titulo');
    add(['Nombre en la cita', 'Teléfono en la cita', 'Nº citas', 'Cursos', 'Primera cita', 'Última cita', 'Pista / detalle'], 'cab');
    if (!lista.length) add(['(ninguna)']);
    lista.forEach(function (e) { add([e.nombre, e.tel, e.n, e.cursos.join(', '), diagRed_fechaES_(e.min), diagRed_fechaES_(e.max), e.detalle]); });
    vacia();
  };
  listaCitas('C. CITAS SIN ENLACE: revisar a mano', ag.listas.sin);
  listaCitas('D. CITAS AMBIGUAS', ag.listas.ambiguo);
  listaCitas('E. CITAS PROBABLES (solo el nombre, único)', ag.listas.probable);

  // F. Episodios Web
  if (!hc.faltan) {
    add(['F. EPISODIOS DE ORIGEN WEB (' + hc.listaWeb.length + ')'], 'titulo');
    add(['Nombre', 'Fila Maestra', 'Nº episodio (por ingreso)', 'Ingreso', 'Alta', 'Fecha inscripción (Maestra)', 'Ingreso = Inscripción', 'ID HC'], 'cab');
    if (!hc.listaWeb.length) add(['(ninguno)']);
    hc.listaWeb.forEach(function (e) {
      const etiqueta = e.estado === 'identico' ? 'SÍ' : e.estado === 'distinto' ? 'No' : e.estado === 'sin fecha' ? 'Sin fecha para comparar' : 'HC sin usuario enlazado';
      add([e.nombre, e.filaMaestra, e.n + ' de ' + e.de, diagRed_fechaES_(e.ing), diagRed_fechaES_(e.alta), diagRed_fechaES_(e.insc), etiqueta, e.id]);
    });
  }

  return { filas: filas, titulos: titulos, cabeceras: cabeceras, inicioDetalle: inicioDetalle };
}

/** Escribe el informe en la hoja propia (la crea o la vacía). Es lo único que escribe todo el script. */
function diagRed_escribir_(ss, inf) {
  const hoja = ss.getSheetByName(DIAG_RED_.HOJA) || ss.insertSheet(DIAG_RED_.HOJA);
  hoja.clear();

  const nf = inf.filas.length;
  const nc = inf.filas.reduce(function (mx, f) { return Math.max(mx, f.length); }, 1);
  if (hoja.getMaxRows() < nf) hoja.insertRowsAfter(hoja.getMaxRows(), nf - hoja.getMaxRows());
  if (hoja.getMaxColumns() < nc) hoja.insertColumnsAfter(hoja.getMaxColumns(), nc - hoja.getMaxColumns());

  const matriz = inf.filas.map(function (f) {
    const r = f.slice();
    while (r.length < nc) r.push('');
    return r;
  });

  // La zona de detalle va como texto para que los teléfonos no se conviertan en números ni se pierdan ceros.
  if (nf >= inf.inicioDetalle) hoja.getRange(inf.inicioDetalle, 1, nf - inf.inicioDetalle + 1, nc).setNumberFormat('@');
  hoja.getRange(1, 1, nf, nc).setValues(matriz);

  hoja.getRange(1, 1, nf, nc).setVerticalAlignment('top').setFontFamily('Arial').setFontSize(10);
  const a1 = function (fila) { return fila + ':' + fila; };
  if (inf.titulos.length) hoja.getRangeList(inf.titulos.map(a1)).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  if (inf.cabeceras.length) hoja.getRangeList(inf.cabeceras.map(a1)).setFontWeight('bold').setBackground('#e8eaed');

  hoja.setColumnWidth(1, 330);
  if (nc > 1) hoja.setColumnWidths(2, nc - 1, 135);
  hoja.setColumnWidth(Math.min(nc, 11), 260);
  hoja.setFrozenRows(0);
  try { ss.setActiveSheet(hoja); } catch (e) { /* sin interfaz */ }
}
