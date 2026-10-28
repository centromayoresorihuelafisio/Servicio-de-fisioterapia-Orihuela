/**
 * ASIGNAR ID DE PACIENTE EN LA MAESTRA
 * Paso 3 del "Orden de trabajo" de CONTEXTO.md, sección 11 (decisiones 2 y 3).
 *
 * Qué hace: añade a la Maestra una columna "ID paciente" (COLUMNAS.MAESTRA.ID_PACIENTE) y rellena cada
 * usuario que aún no tenga uno con un identificador único (UUID, como el ID HC). El ID no depende del
 * DNI ni del nombre, así que no cambia nunca. Para los usuarios que se creen después, lo genera
 * guardarPaciente (usuarios/Anadir_Usuario.gs).
 *
 * Seguridad:
 *   - ANTES de asignar, busca pares sospechosos de duplicado (mismo DNI, mismo teléfono o nombres casi
 *     iguales, con la misma lógica y puntos que buscarPosiblesDuplicadosWeb). Esa parte es SOLO LECTURA:
 *     solo escribe la hoja de informe "IDs Paciente".
 *   - Si hay pares, la primera ejecución de asignarIdsPaciente se detiene y los muestra. Tras revisarlos,
 *     una segunda ejecución asigna (siempre que el nº de pares siga igual; si la hoja ha cambiado, avisa de nuevo).
 *   - Solo escribe en la columna del ID. No toca ninguna otra celda (ni el enlace de "Historia clínica").
 *   - NUNCA cambia un ID que ya existe: se puede ejecutar de nuevo sin riesgo (solo rellena los vacíos).
 *   - Comprueba que la hoja no se ha movido mientras trabaja y verifica lo escrito al terminar.
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú; mejor sin usar la web app durante unos segundos):
 *   1. (Opcional) `revisarParesIdsPaciente`: solo mira y escribe el informe, no asigna nada.
 *   2. `asignarIdsPaciente`: si hay pares, se detiene y deja el informe; revisa la hoja "IDs Paciente" y
 *      vuelve a ejecutarla para asignar. Si no hay pares, asigna directamente.
 *   3. Cuando termine, la hoja "IDs Paciente" muestra el resumen y la verificación.
 *
 * Reutiliza SIN modificar: _palabrasNombre_ y _nombresParecidos_ (usuarios/Anadir_Usuario.gs),
 * normalizarTelefono (usuarios/Contactos_Google.gs), normalizarDniUsuario y resolverColumnaTelefono_
 * (core/Utils.gs), getSS (core/WebApp.gs), SHEETS y COLUMNAS (core/Config.gs).
 *
 * Archivo nuevo en herramientas/. Todos los nombres llevan el prefijo idPac_ / ID_PAC_ para no chocar
 * con el ámbito global compartido del proyecto. Se puede borrar cuando ya no haga falta (la hoja
 * "IDs Paciente" también).
 */

const ID_PAC_ = {
  HOJA: 'IDs Paciente',
  PROP_AVISADOS: 'ID_PAC_PARES_AVISADOS', // nº de pares que se le han mostrado al dueño en la última revisión
  MAX_PARES_LISTA: 500,                   // tope de pares escritos en el informe (el recuento es siempre completo)
  ANCHO_INFORME: 12
};

// ----------------------------------------------------------------------------- puntos de entrada

/** SOLO LECTURA. Busca pares sospechosos de duplicado y escribe el informe. No asigna nada. */
function revisarParesIdsPaciente() {
  const ss = getSS();
  const maestra = idPac_leerMaestra_(ss);
  const pares = idPac_buscarPares_(maestra.usuarios);

  PropertiesService.getScriptProperties().setProperty(ID_PAC_.PROP_AVISADOS, String(pares.length));

  const resumen = idPac_resumenBase_('Revisión previa (no se ha asignado ningún ID)', maestra, pares);
  resumen.push(['Siguiente paso', pares.length
    ? 'Revisa los pares de abajo. Si todo es correcto, ejecuta asignarIdsPaciente.'
    : 'No hay pares sospechosos. Ejecuta asignarIdsPaciente.']);
  idPac_escribirInforme_(ss, resumen, pares);
  idPac_avisar_(ss, pares.length
    ? 'Hay ' + pares.length + ' pares sospechosos. Revisa la hoja "' + ID_PAC_.HOJA + '".'
    : 'Sin pares sospechosos. Ya puedes ejecutar asignarIdsPaciente.');
}

/**
 * Asigna el ID a cada usuario que no lo tenga. Si hay pares sospechosos que aún no se han revisado,
 * se detiene SIN escribir en la Maestra y deja el informe; al volver a ejecutarla (con los mismos pares) asigna.
 */
function asignarIdsPaciente() {
  const t0 = Date.now();
  const ss = getSS();
  const props = PropertiesService.getScriptProperties();

  const maestra = idPac_leerMaestra_(ss);
  const pares = idPac_buscarPares_(maestra.usuarios);
  const avisados = props.getProperty(ID_PAC_.PROP_AVISADOS);

  if (pares.length > 0 && avisados !== String(pares.length)) {
    props.setProperty(ID_PAC_.PROP_AVISADOS, String(pares.length));
    const resumen = idPac_resumenBase_('DETENIDO antes de asignar: hay pares sospechosos (no se ha escrito nada en la Maestra)', maestra, pares);
    resumen.push(['Siguiente paso', 'Revisa los pares de abajo. Si todo es correcto, vuelve a ejecutar asignarIdsPaciente: esta vez asignará.']);
    idPac_escribirInforme_(ss, resumen, pares);
    idPac_avisar_(ss, 'Detenido: ' + pares.length + ' pares sospechosos. Revisa la hoja "' + ID_PAC_.HOJA + '" y vuelve a ejecutar.');
    return;
  }

  const r = idPac_asignar_(ss); // lanza un error claro si algo no cuadra (no deja la hoja a medias)
  props.deleteProperty(ID_PAC_.PROP_AVISADOS);

  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  const resumen = idPac_resumenBase_('Asignación terminada', maestra, pares);
  resumen.push(['Columna del ID', r.letra + (r.columnaCreada ? ' (columna nueva creada ahora)' : ' (ya existía)')]);
  resumen.push(['Usuarios que ya tenían ID (no se tocan)', r.yaTenian]);
  resumen.push(['IDs asignados ahora', r.asignados]);
  resumen.push(['Filas sin nombre (huecos, sin ID)', r.sinNombre]);
  resumen.push(['Verificación tras escribir', r.verificacion]);
  resumen.push(['Duración', segundos + ' s']);
  idPac_escribirInforme_(ss, resumen, pares);
  idPac_avisar_(ss, r.verificacion === 'OK' ? 'IDs asignados: ' + r.asignados + '. Verificación OK.' : 'Terminado con avisos: mira la hoja "' + ID_PAC_.HOJA + '".');
  Logger.log('asignarIdsPaciente: ' + r.asignados + ' asignados, ' + r.yaTenian + ' ya tenían, verificación ' + r.verificacion + ' (' + segundos + ' s).');
}

// ----------------------------------------------------------------------------- lectura y pares

function idPac_avisar_(ss, texto) {
  Logger.log(texto);
  try { ss.toast(texto, 'IDs de usuario', 10); } catch (e) { /* sin interfaz */ }
}

/** 1 = A, 27 = AA. */
function idPac_letra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Lee la Maestra una sola vez (SOLO LECTURA) y devuelve { usuarios, filasConNombre, conId, totalFilas }.
 * Cada usuario: fila real, nombre, dni, teléfonos (originales y normalizados con el criterio de
 * buscarPosiblesDuplicadosWeb), palabras del nombre y estado.
 */
function idPac_leerMaestra_(ss) {
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  const ult = hoja.getLastRow(), nc = hoja.getLastColumn();
  if (ult < 2) return { usuarios: [], filasConNombre: 0, conId: 0, totalFilas: 0 };

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
  const cId = idx(COLUMNAS.MAESTRA.ID_PACIENTE);

  const celda = function (fila, c) {
    return (c === -1 || fila[c] === null || fila[c] === undefined) ? '' : fila[c].toString().trim();
  };

  const usuarios = [];
  let conId = 0;
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    const nombre = celda(f, cNombre);
    if (!nombre) continue; // huecos
    const tel1 = celda(f, cT1), tel2 = celda(f, cT2);
    if (cId !== -1 && celda(f, cId)) conId++;
    usuarios.push({
      fila: i + 1,
      nombre: nombre,
      dni: normalizarDniUsuario(celda(f, cDni)),
      tel1: tel1,
      tel2: tel2,
      telsDup: [tel1, tel2].map(normalizarTelefono).filter(function (t) { return t.length >= 9; }), // criterio de buscarPosiblesDuplicadosWeb
      palabras: _palabrasNombre_(nombre),
      estado: celda(f, cEstado)
    });
  }
  return { usuarios: usuarios, filasConNombre: usuarios.length, conId: conId, totalFilas: ult - 1 };
}

/**
 * Pares sospechosos de duplicado con los mismos criterios y puntos que buscarPosiblesDuplicadosWeb
 * (DNI = 4, teléfono = 2, nombre = 1), comparando a todos entre sí. Orden: más puntos primero.
 * Devuelve [{ a, b, motivos:[...], puntos }] donde a y b son usuarios de la lista.
 */
function idPac_buscarPares_(us) {
  const pares = {}; // 'i|j' (i<j) -> { i, j, motivos:[], puntos }
  const anotar = function (i, j, motivo, puntos) {
    const k = i < j ? i + '|' + j : j + '|' + i;
    const p = pares[k] || (pares[k] = { i: Math.min(i, j), j: Math.max(i, j), motivos: [], puntos: 0 });
    if (p.motivos.indexOf(motivo) === -1) { p.motivos.push(motivo); p.puntos += puntos; }
  };

  // DNI repetido
  const porDni = {};
  us.forEach(function (u, i) { if (u.dni) (porDni[u.dni] = porDni[u.dni] || []).push(i); });
  Object.keys(porDni).forEach(function (d) {
    const l = porDni[d];
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) anotar(l[a], l[b], 'DNI', 4);
  });

  // Teléfono (1 o 2) compartido
  const porTel = {};
  us.forEach(function (u, i) {
    u.telsDup.filter(function (t, k, arr) { return arr.indexOf(t) === k; })
      .forEach(function (t) { (porTel[t] = porTel[t] || []).push(i); });
  });
  Object.keys(porTel).forEach(function (t) {
    const l = porTel[t];
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) anotar(l[a], l[b], 'Teléfono', 2);
  });

  // Nombres parecidos: solo se comparan los que comparten alguna palabra (índice por palabra).
  const porPalabra = {};
  us.forEach(function (u, i) { u.palabras.forEach(function (w) { (porPalabra[w] = porPalabra[w] || []).push(i); }); });
  const vistos = {};
  us.forEach(function (u, i) {
    u.palabras.forEach(function (w) {
      porPalabra[w].forEach(function (j) {
        if (j <= i) return;
        const k = i + '|' + j;
        if (vistos[k]) return;
        vistos[k] = true;
        if (_nombresParecidos_(u.palabras, us[j].palabras)) anotar(i, j, 'Nombre', 1);
      });
    });
  });

  return Object.keys(pares).map(function (k) {
    const p = pares[k];
    return { a: us[p.i], b: us[p.j], motivos: p.motivos, puntos: p.puntos };
  }).sort(function (x, y) {
    return y.puntos - x.puntos || x.a.fila - y.a.fila || x.b.fila - y.b.fila;
  });
}

// ----------------------------------------------------------------------------- asignación

/**
 * Crea la columna del ID si no existe y rellena los vacíos. Solo escribe en esa columna.
 * Devuelve { letra, columnaCreada, yaTenian, asignados, sinNombre, verificacion }.
 */
function idPac_asignar_(ss) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Otra operación está escribiendo en la hoja. Espera unos segundos y vuelve a ejecutar.');
  try {
    const hoja = ss.getSheetByName(SHEETS.MAESTRA);
    if (!hoja) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
    const ult = hoja.getLastRow(), nc = hoja.getLastColumn();
    if (ult < 2) throw new Error('La Maestra no tiene usuarios.');

    const cab = hoja.getRange(1, 1, 1, nc).getValues()[0].map(function (h) { return String(h).trim(); });
    const cabN = cab.map(function (h) { return h.toLowerCase(); });
    const cNombre = cabN.indexOf(COLUMNAS.MAESTRA.NOMBRE.toLowerCase());
    if (cNombre === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.NOMBRE + '".');

    // --- columna del ID: se reutiliza si existe; si no, va justo detrás de la última cabecera con nombre
    // (la hoja suele tener columnas con formato pero sin cabecera al final: no se deja un hueco entre medias,
    // porque obtenerBaseDatosCompletaWeb las recortaría solo si están DESPUÉS de la última cabecera).
    let cId = cabN.indexOf(COLUMNAS.MAESTRA.ID_PACIENTE.toLowerCase()); // 0-based
    let columnaCreada = false;
    if (cId === -1) {
      let ultimaConNombre = -1;
      cab.forEach(function (h, i) { if (h) ultimaConNombre = i; });
      cId = ultimaConNombre + 1;
      if (cId < nc) { // la columna destino ya existe (sin cabecera): debe estar totalmente vacía
        const ocupada = hoja.getRange(2, cId + 1, ult - 1, 1).getValues()
          .some(function (f) { return f[0] !== '' && f[0] !== null; });
        if (ocupada) throw new Error('La columna ' + idPac_letra_(cId + 1) + ' no tiene cabecera pero sí datos; no se escribe encima. Revísala o vacíala y vuelve a ejecutar.');
      }
      if (hoja.getMaxColumns() < cId + 1) hoja.insertColumnsAfter(hoja.getMaxColumns(), cId + 1 - hoja.getMaxColumns());
      hoja.getRange(1, cId + 1).setValue(COLUMNAS.MAESTRA.ID_PACIENTE);
      if (cId > 0) { // mismo aspecto que la cabecera anterior (si falla, no pasa nada)
        try { hoja.getRange(1, cId).copyTo(hoja.getRange(1, cId + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e) { /* solo estética */ }
      }
      columnaCreada = true;
    }

    // --- foto de la hoja: nombres e IDs actuales
    const nFilas = ult - 1;
    const leerNombres = function () {
      return hoja.getRange(2, cNombre + 1, nFilas, 1).getValues().map(function (f) { return String(f[0]).trim(); });
    };
    const nombres = leerNombres();
    const idsAntes = hoja.getRange(2, cId + 1, nFilas, 1).getValues().map(function (f) { return String(f[0]).trim(); });

    const usados = {};
    idsAntes.forEach(function (id) {
      if (!id) return;
      if (usados[id]) throw new Error('El ID "' + id + '" está repetido en la Maestra. No se asigna nada hasta revisarlo.');
      usados[id] = true;
    });

    let yaTenian = 0, asignados = 0, sinNombre = 0;
    const salida = idsAntes.map(function (id, i) {
      if (id) { yaTenian++; return [id]; }
      if (!nombres[i]) { sinNombre++; return ['']; }
      let nuevo;
      do { nuevo = Utilities.getUuid(); } while (usados[nuevo]);
      usados[nuevo] = true;
      asignados++;
      return [nuevo];
    });

    if (asignados === 0) {
      return { letra: idPac_letra_(cId + 1), columnaCreada: columnaCreada, yaTenian: yaTenian, asignados: 0, sinNombre: sinNombre, verificacion: 'OK (no había nada que asignar)' };
    }

    // --- justo antes de escribir: si alguien ha movido o cambiado filas desde la foto, no se escribe nada
    const ahora = leerNombres();
    for (let i = 0; i < nFilas; i++) {
      if (ahora[i] !== nombres[i]) {
        throw new Error('La Maestra ha cambiado mientras se preparaban los IDs (fila ' + (i + 2) + '). No se ha escrito ningún ID; vuelve a ejecutar sin usar la web app.');
      }
    }

    hoja.getRange(2, cId + 1, nFilas, 1).setValues(salida); // SOLO la columna del ID
    SpreadsheetApp.flush();

    // --- verificación: mismos nombres en las mismas filas, todos con ID y sin repetidos
    const nombresDespues = leerNombres();
    const idsDespues = hoja.getRange(2, cId + 1, nFilas, 1).getValues().map(function (f) { return String(f[0]).trim(); });
    const vistos = {};
    const fallos = [];
    for (let i = 0; i < nFilas; i++) {
      if (nombresDespues[i] !== nombres[i]) fallos.push('fila ' + (i + 2) + ': el nombre cambió durante la escritura');
      if (nombresDespues[i] && !idsDespues[i]) fallos.push('fila ' + (i + 2) + ': usuario sin ID');
      if (idsDespues[i]) {
        if (vistos[idsDespues[i]]) fallos.push('fila ' + (i + 2) + ': ID repetido');
        vistos[idsDespues[i]] = true;
      }
      if (idsDespues[i] !== salida[i][0]) fallos.push('fila ' + (i + 2) + ': el ID leído no coincide con el escrito');
    }
    return {
      letra: idPac_letra_(cId + 1), columnaCreada: columnaCreada, yaTenian: yaTenian, asignados: asignados, sinNombre: sinNombre,
      verificacion: fallos.length ? 'REVISAR: ' + fallos.slice(0, 5).join('; ') + (fallos.length > 5 ? ' (y ' + (fallos.length - 5) + ' más)' : '') : 'OK'
    };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------- informe

/** Primeras líneas del informe (título, fecha, cifras de la Maestra y recuento de pares por motivo). */
function idPac_resumenBase_(accion, maestra, pares) {
  const tz = Session.getScriptTimeZone();
  const cuenta = function (f) { return pares.filter(f).length; };
  const tieneM = function (p, m) { return p.motivos.indexOf(m) !== -1; };
  return [
    ['ID DE PACIENTE EN LA MAESTRA (paso 3)', ''],
    ['Ejecutado', Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss')],
    ['Acción', accion],
    ['Usuarios con nombre en la Maestra', maestra.filasConNombre],
    ['Ya tenían ID antes de esta ejecución', maestra.conId],
    ['Pares sospechosos (total)', pares.length],
    ['   · con DNI repetido', cuenta(function (p) { return tieneM(p, 'DNI'); })],
    ['   · con el mismo teléfono Y nombre parecido (los más sospechosos)', cuenta(function (p) { return tieneM(p, 'Teléfono') && tieneM(p, 'Nombre'); })],
    ['   · solo mismo teléfono (típico: familiares con el mismo móvil)', cuenta(function (p) { return p.motivos.length === 1 && tieneM(p, 'Teléfono'); })],
    ['   · solo nombre parecido (típico: familiares con los mismos apellidos)', cuenta(function (p) { return p.motivos.length === 1 && tieneM(p, 'Nombre'); })]
  ];
}

/** Reescribe la hoja "IDs Paciente": resumen arriba y, debajo, la lista de pares (más sospechosos primero). */
function idPac_escribirInforme_(ss, resumen, pares) {
  const A = ID_PAC_.ANCHO_INFORME;
  const rellenar = function (f) { const r = f.slice(); while (r.length < A) r.push(''); return r.slice(0, A); };

  const filas = resumen.map(rellenar);
  filas.push(rellenar([]));
  const filaTitulo = filas.length + 1;
  const mostrados = Math.min(pares.length, ID_PAC_.MAX_PARES_LISTA);
  filas.push(rellenar(['PARES SOSPECHOSOS (' + pares.length + ')' + (pares.length > mostrados ? ' — se muestran los ' + mostrados + ' primeros' : '') +
    '. Las filas son las de la Maestra en este momento (cambian al ordenar).']));
  const filaCab = filas.length + 1;
  filas.push(rellenar(['Motivos', 'Puntos', 'Fila A', 'Nombre A', 'DNI A', 'Teléfono A', 'Estado A', 'Fila B', 'Nombre B', 'DNI B', 'Teléfono B', 'Estado B']));
  const tel = function (u) { return [u.tel1, u.tel2].filter(Boolean).join(' / '); };
  pares.slice(0, mostrados).forEach(function (p) {
    filas.push(rellenar([p.motivos.join(' + '), p.puntos,
      p.a.fila, p.a.nombre, p.a.dni, tel(p.a), p.a.estado,
      p.b.fila, p.b.nombre, p.b.dni, tel(p.b), p.b.estado]));
  });

  let hoja = ss.getSheetByName(ID_PAC_.HOJA);
  if (hoja) hoja.clear(); else hoja = ss.insertSheet(ID_PAC_.HOJA);
  if (hoja.getMaxRows() < filas.length) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length - hoja.getMaxRows());
  if (hoja.getMaxColumns() < A) hoja.insertColumnsAfter(hoja.getMaxColumns(), A - hoja.getMaxColumns());

  const rango = hoja.getRange(1, 1, filas.length, A);
  rango.setNumberFormat('@'); // todo como texto: teléfonos y DNI tal cual, sin conversiones
  rango.setValues(filas.map(function (f) { return f.map(function (v) { return v === null || v === undefined ? '' : v; }); }));
  hoja.getRange(1, 1, 1, A).setFontWeight('bold');
  hoja.getRange(filaTitulo, 1, 1, A).setFontWeight('bold');
  hoja.getRange(filaCab, 1, 1, A).setFontWeight('bold');
  hoja.setColumnWidth(1, 420);
  hoja.setColumnWidth(2, 260);
  hoja.setFrozenRows(0);
}
