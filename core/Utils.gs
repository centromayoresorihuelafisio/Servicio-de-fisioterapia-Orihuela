
// ARCHIVO: core/Utils.gs
// Funciones compartidas y consolidadas (antes duplicadas en varios archivos).
// Creado el 2026-07-09 para eliminar colisiones de nombres en Apps Script.
// ================================================================================

/**
 * Normaliza un valor de celda/columna a un objeto Date (o null si no es fecha válida).
 * Soporta: objetos Date, strings "dd/mm/aaaa" o "dd/mm/aa" (incluso embebidos en texto),
 * y números seriales de Google Sheets. Normaliza siempre a medianoche (00:00:00).
 *
 * GANADORA de: "agenda/Ir_A_Fecha.gs" (superset funcional de la versión de "usuarios/Ordenar.gs").
 * Elimina la función parseFecha de "usuarios/Ordenar.gs" tras pegar esto.
 */
function parseFecha(valor) {
  if (!valor && valor !== 0) return null;

  // 1. Si ya es un objeto Date válido (el caso más probable para celdas de fecha)
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    const d = new Date(valor.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 2. Si es un string que parece una fecha (e.g., "13/11/2025" o "13/11/25")
  if (typeof valor === "string") {
    const match = valor.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    let datePart = valor;

    if (match) {
      datePart = match[1];
    }

    var partes = datePart.split("/");
    if (partes.length === 3) {
      var dia = parseInt(partes[0], 10);
      var mes = parseInt(partes[1], 10) - 1;
      var año = parseInt(partes[2], 10);

      if (año < 100) {
        const currentYear = new Date().getFullYear();
        año = año < 50 ? 2000 + año : 1900 + año;
        if (año > currentYear + 10) {
          año -= 100;
        }
      }

      const d = new Date(año, mes, dia);
      d.setHours(0, 0, 0, 0);

      if (d.getFullYear() === año && d.getMonth() === mes && d.getDate() === dia) {
        return d;
      }
    }
  }

  // 3. Si es un número (formato serial de Sheets)
  if (typeof valor === "number" && valor > 1000) {
    const d = new Date(Math.round((valor - 25569) * 86400 * 1000));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
}

/**
 * Convierte texto a minúsculas sin acentos/diacríticos, para comparaciones robustas
 * (búsquedas, coincidencia de nombres, etc.).
 *
 * GANADORA de: "usuarios/Contactos_Google.gs" (añade .trim() respecto a la de "usuarios/Buscar.gs").
 * Elimina la función normalizarTexto de "usuarios/Buscar.gs" tras pegar esto.
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Elimina acentos/diacríticos
    .trim();
}

/**
 * Convierte un texto a formato MAYÚSCULA sin espacios sobrantes (Ej: "juan pérez" -> "JUAN PÉREZ").
 * Usada para normalizar nombres de pacientes antes de guardarlos.
 * (No estaba duplicada, se traslada aquí desde "valoraciones/Guardar.gs" por coherencia;
 * puedes dejarla también donde estaba, JavaScript no se queja de que exista en ambos
 * sitios siempre que solo haya UNA definición de función con este nombre en todo el proyecto.)
 */
function normalizarFormatoNombre(texto) {
  if (!texto) return '';
  return texto.toString().trim().toUpperCase();
}

/**
 * REGLA ÚNICA para escribir el nombre de un usuario: MAYÚSCULAS, sin tildes (la Ñ se
 * conserva), solo letras y espacios, sin espacios dobles ni en los extremos.
 * Es la misma regla que aplica el navegador al escribir (ui/JS_Formato_Nombre.html →
 * formatoNombreFinal): si cambias una, cambia la otra.
 *   "María  Pérez-Núñez" -> "MARIA PEREZNUNEZ"   (el guion se elimina, igual que en el formulario)
 */
function normalizarNombreUsuario(texto) {
  if (!texto) return '';
  return texto.toString().normalize('NFC').toUpperCase()
    .replace(/Ñ/g, '\u0001')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'Ñ')
    .replace(/[^A-ZÑ ]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** DNI (o SIP) siempre en mayúsculas y sin espacios en los extremos. */
function normalizarDniUsuario(texto) {
  return texto ? texto.toString().trim().toUpperCase() : '';
}

/**
 * Elimina espacios, guiones y prefijos de país comunes de un número de teléfono,
 * para poder comparar teléfonos de forma robusta.
 * (Se deja aquí como referencia; su única definición sigue estando en
 * "usuarios/Contactos_Google.gs" — no la borres de allí, es la única copia.)
 */
// function normalizarTelefono(telefono) { ... } // -> ya vive solo en usuarios/Contactos_Google.gs

/**
 * Devuelve la hoja de Agenda del curso académico ACTUAL (no la primera que contenga "Agenda").
 * El curso va de Septiembre a Agosto: sep-dic -> año actual/año+1; ene-jul -> año-1/año actual.
 *
 * GANADORA de: "agenda/Cita.gs" (más robusta que la de "agenda/Eventos.gs", que cogía cualquier
 * hoja que contuviera "Agenda" en el nombre, arriesgando coger el curso equivocado).
 * Elimina la función obtenerHojaAgenda de "agenda/Eventos.gs" tras pegar esto.
 */
function obtenerHojaAgenda() {
  const ss = getSS();
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12

  let cursoInicio, cursoFin;

  if (month >= 9) { // Septiembre - Diciembre
    cursoInicio = today.getFullYear();
    cursoFin = cursoInicio + 1;
  } else { // Enero - Julio
    cursoFin = today.getFullYear();
    cursoInicio = cursoFin - 1;
  }

  // OPTIMIZACIÓN DE RENDIMIENTO: esta función se llama en CADA carga de la
  // Agenda Web, cada cambio de semana y cada edición de un dato (Asistencia,
  // Notas, Sesión, asignar paciente...). Antes, cada una de esas llamadas
  // hacía ss.getSheets(), que recorre y crea un objeto Sheet para TODAS las
  // pestañas del libro (Base de Datos Maestra, cada Agenda de cada curso,
  // etc.) solo para tirar casi todas y quedarnos con una. Con muchas
  // pestañas eso se nota en cada clic. Ahora se pide directamente la hoja
  // por su nombre exacto (getSheetByName), que es una búsqueda directa sin
  // tener que instanciar el resto de pestañas.
  const nombreEsperado = `Agenda ${cursoInicio}-${cursoFin}`;
  const hojaDirecta = ss.getSheetByName(nombreEsperado);
  if (hojaDirecta) return hojaDirecta;

  // Respaldo: si el nombre real tiene espacios distintos a uno solo (p.ej.
  // "Agenda  2025-2026" con doble espacio), la búsqueda exacta de arriba no
  // la encuentra. Solo en ese caso recurrimos al escaneo completo de antes.
  const regex = new RegExp(`^Agenda\\s+${cursoInicio}-${cursoFin}$`);
  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (regex.test(sheets[i].getName())) {
      return sheets[i];
    }
  }

  throw new Error(`No se encontró una hoja de Agenda para el curso ${cursoInicio}-${cursoFin}.`);
}

/**
 * Extrae la URL de un enlace de Historia Clínica de una celda, sin importar
 * cómo se guardó: como Rich Text (formato usado por generarHistoriaClinica,
 * guardarCitasMultiples e insertarEnlaceHistoriaClinica), como fórmula
 * =HIPERVINCULO()/=HYPERLINK() (por si alguna celda antigua la tuviera así),
 * o como texto plano con una URL. Devuelve '' si no hay ningún enlace válido.
 *
 * Se usa en cargarMapaHistoriasClinicas, obtenerBaseDatosCompletaWeb y
 * _ejecutarAltaEnFila para no duplicar esta lógica en varios sitios.
 */
function extraerUrlHistoriaClinica(valorCelda, richTextCell, formula) {
  if (richTextCell) {
    const linkUrl = richTextCell.getLinkUrl();
    if (linkUrl) return linkUrl;
  }
  if (formula) {
    const match = formula.match(/(?:HIPERVINCULO|HYPERLINK)\s*\(\s*"(.*?)"\s*[;,]/i);
    if (match && match[1]) return match[1];
  }
  if (typeof valorCelda === 'string' && valorCelda.trim().toLowerCase().startsWith('http')) {
    return valorCelda.trim();
  }
  return '';
}

/**
 * Devuelve el índice 0-based de una columna por su cabecera EXACTA (ignorando
 * mayúsculas y espacios), o -1 si no la encuentra. Centraliza la búsqueda por
 * nombre de cabecera que antes se repetía con findIndex/indexOf en cada archivo.
 */
function obtenerIndiceColumnaPorNombre_(hoja, nombreColumna) {
  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const objetivo = String(nombreColumna).trim().toLowerCase();
  return headers.findIndex(h => h && String(h).trim().toLowerCase() === objetivo);
}

/**
 * Mapa { idPaciente: fila } de TODA la Maestra (una sola lectura de la columna "ID paciente"). Es la única forma de
 * localizar a un usuario en la Maestra: el nombre, el DNI y el número de fila que tenía el cliente al cargar no sirven
 * (la hoja se reordena y puede haber homónimos).
 */
function mapaFilasMaestraPorId_(sheet) {
  const mapa = Object.create(null);
  const ult = sheet.getLastRow();
  if (ult < 2) return mapa;
  const c = obtenerIndiceColumnaPorNombre_(sheet, COLUMNAS.MAESTRA.ID_PACIENTE);
  if (c === -1) return mapa;
  const ids = sheet.getRange(2, c + 1, ult - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] || '').trim();
    if (id && !(id in mapa)) mapa[id] = i + 2;
  }
  return mapa;
}

/** Fila de la Maestra del usuario con ese ID paciente; 0 si no existe (o si el ID viene vacío). */
function filaMaestraPorId_(sheet, idPaciente) {
  const id = String(idPaciente || '').trim();
  return id ? (mapaFilasMaestraPorId_(sheet)[id] || 0) : 0;
}

/**
 * Localiza la columna de teléfono principal de la Maestra, intentando las
 * cabeceras conocidas en orden y cayendo a una búsqueda difusa ("tel"/"mov")
 * como último recurso. Devuelve el índice 0-based o -1.
 *
 * Unifica el acceso al teléfono en un solo sitio: antes cada consumidor lo
 * buscaba a su manera (getRange("B:D") fijo en usuarios/Whatsapp.gs, fallback a la
 * columna D en onEdit...), y cualquier cambio de cabecera rompía solo una
 * parte de la app. Aquí se resuelve una vez.
 */
function resolverColumnaTelefono_(hoja, encabezados) {
  const encab = encabezados || hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];

  const candidatos = [COLUMNAS.MAESTRA.TELEFONO, COLUMNAS.MAESTRA.TELEFONO_1, COLUMNAS.MAESTRA.TELEFONO_FORM];
  for (let i = 0; i < candidatos.length; i++) {
    const objetivo = String(candidatos[i]).trim().toLowerCase();
    const idx = encab.findIndex(h => h && String(h).trim().toLowerCase() === objetivo);
    if (idx !== -1) return idx;
  }

  // Fallback difuso: mismo criterio que usaba usuarios/Contactos_Google.gs.
  return encab.findIndex(h => {
    if (!h) return false;
    const t = String(h).toLowerCase();
    return t.includes('tel') || t.includes('mov');
  });
}

/**
 * Construye un mapa { nombrePacienteEnMinuscula: { url: enlaceHistoriaClinica } }
 * leyendo la hoja "Base de Datos Maestra". Comprueba null de forma defensiva
 * antes de leer getLinkUrl() para no lanzar excepción con celdas vacías.
 *
 * GANADORA de: "HC Agenda.gs" (más defensiva que la de "agenda/Cita.gs", que no comprobaba
 * null antes de leer richTextCell.getLinkUrl() y dependía de la constante global
 * HOJA_MAESTRA_NOMBRE definida en otro archivo).
 * Elimina la función cargarMapaHistoriasClinicas de "agenda/Cita.gs" tras pegar esto.
 */
function cargarMapaHistoriasClinicas(ss) {
  const HOJA_MAESTRA = SHEETS.MAESTRA;
  const sheetMaestra = ss.getSheetByName(HOJA_MAESTRA);

  if (!sheetMaestra) {
    throw new Error("No se encontró la hoja 'Base de Datos Maestra'.");
  }

  const dataRange = sheetMaestra.getDataRange();
  const values = dataRange.getValues();
  const richTextValues = dataRange.getRichTextValues();
  const formulas = dataRange.getFormulas();

  if (values.length < 2) return null;

  const headers = values[0].map(h => h.toString().trim());
  const colNombre = headers.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  const colHC = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

  if (colNombre === -1 || colHC === -1) {
    throw new Error("Columnas 'Nombre' o 'Historia clínica' no halladas en la Maestra.");
  }

  const mapa = {};

  for (let i = 1; i < values.length; i++) {
    const nombre = values[i][colNombre] ? values[i][colNombre].toString().trim() : '';
    if (!nombre) continue;

    const url = extraerUrlHistoriaClinica(values[i][colHC], richTextValues[i][colHC], formulas[i][colHC]);
    if (url) {
      mapa[nombre.toLowerCase()] = { url: url };
    }
  }

  return mapa;
}

/**
 * Inserta un enlace a la Historia Clínica en la columna correspondiente de la
 * hoja de Agenda activa, para todas las filas seleccionadas (soporta selección
 * múltiple con Ctrl+Click). Busca las columnas "Hora", "Usuario" e
 * "Historia clínica" por NOMBRE de cabecera (no por número fijo), por lo que
 * no se rompe si reordenas columnas.
 *
 * GANADORA de: "HC Agenda.gs" (más robusta que la de "agenda/Cita.gs", que usaba
 * columnas fijas por número y solo soportaba un único rango de selección).
 * Elimina la función insertarEnlaceHistoriaClinica de "agenda/Cita.gs" tras pegar esto.
 */
function insertarEnlaceHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    const sheetAgenda = ss.getActiveSheet();
    const sheetName = sheetAgenda.getName();

    // 1. Validar si es una hoja de Agenda
    if (!sheetName.startsWith("Agenda ")) {
      ui.alert("Error", "Esta función solo se puede usar en una hoja de 'Agenda AAAA-AAAA'.", ui.ButtonSet.OK);
      return;
    }

    // Obtener todos los rangos seleccionados (Ctrl + Click)
    const rangeList = sheetAgenda.getActiveRangeList();
    if (!rangeList) return;
    const ranges = rangeList.getRanges();

    const headersAgenda = sheetAgenda.getRange(1, 1, 1, sheetAgenda.getMaxColumns()).getValues()[0];

    // 2. Determinar los índices de columna por nombre
    const COL_INDICES = {
      HORA: headersAgenda.findIndex(h => h.toString().trim() === COLUMNAS.AGENDA.HORA) + 1,
      USUARIO: headersAgenda.findIndex(h => h.toString().trim() === COLUMNAS.AGENDA.USUARIO) + 1,
      HC_CLINICA: headersAgenda.findIndex(h => h.toString().trim() === COLUMNAS.AGENDA.HISTORIA_CLINICA) + 1
    };

    if (COL_INDICES.HORA === 0 || COL_INDICES.USUARIO === 0 || COL_INDICES.HC_CLINICA === 0) {
      ui.alert("Error", "No se encontraron las columnas 'Hora', 'Usuario' o 'Historia clínica'.", ui.ButtonSet.OK);
      return;
    }

    // --- OPTIMIZACIÓN: CARGA ÚNICA DE MAESTRA ---
    const mapaHistorias = cargarMapaHistoriasClinicas(ss);
    if (!mapaHistorias) return;

    let enlacesInsertados = 0;

    // 3. Iterar por cada rango seleccionado
    ranges.forEach(range => {
      const startRow = range.getRow();
      const numRows = range.getNumRows();

      for (let i = 0; i < numRows; i++) {
        const currentRow = startRow + i;

        // Validación de seguridad basada en tipo de dato (evita separadores/vacíos)
        const valorHora = sheetAgenda.getRange(currentRow, COL_INDICES.HORA).getValue();

        if (!(valorHora instanceof Date) || isNaN(valorHora.getTime())) {
          continue;
        }

        // Obtener el nombre del paciente
        const nombrePacienteRaw = sheetAgenda.getRange(currentRow, COL_INDICES.USUARIO).getValue().toString().trim();

        if (!nombrePacienteRaw) continue;

        // Buscar en el mapa cargado en memoria
        const enlaceInfo = mapaHistorias[nombrePacienteRaw.toLowerCase()];

        if (enlaceInfo) {
          const richTextValue = SpreadsheetApp.newRichTextValue()
            .setText("Ver Historia Clínica")
            .setLinkUrl(enlaceInfo.url)
            .build();

          sheetAgenda.getRange(currentRow, COL_INDICES.HC_CLINICA).setRichTextValue(richTextValue);
          enlacesInsertados++;
        }
      }
    });

    if (enlacesInsertados > 0) {
      ss.toast(`Se han insertado ${enlacesInsertados} enlaces de Historia Clínica.`, "Éxito", 3);
    } else {
      ui.alert("Información", "No se encontraron pacientes válidos o coincidencias en la Maestra.", ui.ButtonSet.OK);
    }

  } catch (e) {
    ui.alert("Error Crítico", e.message, ui.ButtonSet.OK);
  }
}


// ================================================================================

/**
 * Calcula la edad (años cumplidos) a partir de una fecha de nacimiento.
 * Misma lógica que ya usa recalcularEdades() (herramientas/Edad_Manual.gs) y el
 * disparador onEdit (core/OnEdit.gs) — centralizada aquí para no
 * tenerla triplicada en tres archivos.
 *
 * Acepta tanto un objeto Date (como el que devuelve una celda de Sheets) como
 * un texto "aaaa-mm-dd" (como el que manda el <input type="date"> del
 * formulario web: FormData siempre lo envía como texto, nunca como Date).
 * Devuelve "" si no se puede interpretar como una fecha válida.
 */
function calcularEdadDesdeFecha_(fechaNacimiento) {
  var fecha = fechaNacimiento;

  if (Object.prototype.toString.call(fecha) !== "[object Date]") {
    if (typeof fecha === 'string' && fecha.trim() !== '') {
      var partes = fecha.split('-'); // "aaaa-mm-dd"
      if (partes.length === 3) {
        fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
      }
    }
  }

  if (Object.prototype.toString.call(fecha) !== "[object Date]" || isNaN(fecha)) {
    return "";
  }

  var hoy = new Date();
  var edad = hoy.getFullYear() - fecha.getFullYear();
  if (
    hoy.getMonth() < fecha.getMonth() ||
    (hoy.getMonth() === fecha.getMonth() && hoy.getDate() < fecha.getDate())
  ) {
    edad--;
  }
  return edad;
}


