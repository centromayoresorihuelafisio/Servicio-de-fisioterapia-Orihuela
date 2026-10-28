
// ARCHIVO: core/Utils.gs
// Funciones compartidas y consolidadas (antes duplicadas en varios archivos).
// Creado el 2026-07-09 para eliminar colisiones de nombres en Apps Script.
// ================================================================================

/**
 * Normaliza un valor de celda/columna a un objeto Date (o null si no es fecha válida).
 * Soporta: objetos Date, strings "dd/mm/aaaa" o "dd/mm/aa" (incluso embebidos en texto),
 * y números seriales de Google Sheets. Normaliza siempre a medianoche (00:00:00).
 *
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
 * Usada para normalizar nombres de usuarios antes de guardarlos.
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
 * TELÉFONOS (regla única, F3 del 27-oct-2026). Se GUARDA solo con dígitos, sin espacios, como texto:
 *   · español (9 dígitos, con o sin +34 / 0034 / 34 delante) -> "612345678"
 *   · extranjero (empieza por + o 00) -> "+447911123456"
 *   · cualquier otro (no tiene 9 dígitos y no lleva prefijo) -> solo sus dígitos, sin inventar nada.
 * Si el texto lleva letras u otros signos (p. ej. dos números en una celda) NO se toca: se devuelve tal cual, recortado.
 * Se MUESTRA siempre "123 45 67 89" (lo hace `Telefono.formato`, ui/JS_Telefono.html; si cambias una regla, cambia la otra).
 *
 * telefonoAnalizar_ devuelve { ok, valor, tipo } con tipo = 'vacio' | 'espanol' | 'extranjero' | 'otro' | 'ilegible'.
 * `ok` es false solo en 'ilegible' (en ese caso `valor` es el texto original recortado).
 */
function telefonoAnalizar_(valor) {
  const crudo = (valor === null || valor === undefined) ? '' : String(valor).trim();
  if (!crudo) return { ok: true, valor: '', tipo: 'vacio' };
  if (/[^\d\s+().\-]/.test(crudo)) return { ok: false, valor: crudo, tipo: 'ilegible' };
  let d = crudo.replace(/\D/g, '');
  if (!d || d.length > 15) return { ok: false, valor: crudo, tipo: 'ilegible' };
  const internacional = crudo.charAt(0) === '+' || d.indexOf('00') === 0;
  if (internacional) {
    if (d.indexOf('00') === 0 && crudo.charAt(0) !== '+') d = d.slice(2);
    if (d.indexOf('34') === 0 && d.length === 11) return { ok: true, valor: d.slice(2), tipo: 'espanol' };
    return { ok: true, valor: '+' + d, tipo: 'extranjero' };
  }
  if (d.length === 9) return { ok: true, valor: d, tipo: 'espanol' };
  if (d.length === 11 && d.indexOf('34') === 0) return { ok: true, valor: d.slice(2), tipo: 'espanol' };
  return { ok: true, valor: d, tipo: 'otro' };
}

/** Teléfono en su forma de guardado (ver telefonoAnalizar_). Un texto ilegible se devuelve tal cual. */
function telefonoNormalizar_(valor) {
  return telefonoAnalizar_(valor).valor;
}

/**
 * Número para wa.me / WhatsApp Web: país + número, solo dígitos ("34612345678"). Un español de 9 dígitos lleva el 34 delante;
 * un extranjero ("+44…") va sin el +; lo demás va tal cual (solo dígitos). '' si no hay número.
 */
function telefonoWhatsapp_(valor) {
  const t = telefonoNormalizar_(valor);
  if (!t) return '';
  if (/^\d{9}$/.test(t)) return '34' + t;
  return t.replace(/\D/g, '');
}

/** Pone formato de texto (@) a una celda para que Sheets no convierta el teléfono en número ni se coma ceros ni el "+". */
function telefonoFormatoTexto_(hoja, fila, columna1) {
  if (columna1 > 0) hoja.getRange(fila, columna1).setNumberFormat('@');
}

/**
 * Extrae la URL de un enlace de Historia Clínica de una celda, sin importar
 * cómo se guardó: como Rich Text (formato usado por la creación de la HC,
 * guardarCitasMultiples), como fórmula
 * =HIPERVINCULO()/=HYPERLINK() (por si alguna celda antigua la tuviera así),
 * o como texto plano con una URL. Devuelve '' si no hay ningún enlace válido.
 *
 * Se usa en obtenerBaseDatosCompletaWeb y _ejecutarAltaEnFila (y en las historias clínicas)
 * para no duplicar esta lógica en varios sitios.
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
 * columna D en otro sitio...), y cualquier cambio de cabecera rompía solo una
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


// ================================================================================

/**
 * Calcula la edad (años cumplidos) a partir de una fecha de nacimiento.
 * La edad NO se guarda en la hoja: la calculan al leer los lectores de la Maestra
 * (obtenerBaseDatosCompletaWeb, leerMaestraParaFicha_, obtenerHCWeb y obtenerHCsActivasWeb).
 *
 * Lo preferible es pasarle el valor crudo de la celda (un Date), antes de convertirlo a texto.
 * También acepta un texto "aaaa-mm-dd" o "dd/mm/aaaa" y un número de serie de Sheets
 * (estos dos últimos, a través de parseFecha).
 * Devuelve "" si no se puede interpretar como una fecha válida.
 */
function calcularEdadDesdeFecha_(fechaNacimiento) {
  var fecha = fechaNacimiento;

  if (Object.prototype.toString.call(fecha) !== "[object Date]") {
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
      var partes = fecha.trim().split('-'); // "aaaa-mm-dd"
      fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    } else {
      fecha = parseFecha(fecha); // "dd/mm/aaaa", número de serie, o null
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

/**
 * Quita los emojis o símbolos que haya AL PRINCIPIO de un texto de etiqueta ("🟢 Activo" → "Activo", "🕰️ Antiguo paciente" →
 * "Antiguo paciente"). Un texto que ya viene limpio se devuelve igual (con los espacios de los extremos recortados).
 * Se usa para comparar Estado, Gravedad y Tipo de ingreso sin depender de si la celda aún lleva emoji.
 */
function textoSinEmoji_(valor) {
  const s = String(valor === null || valor === undefined ? '' : valor).trim();
  return s.replace(/^[^\p{L}\p{N}]+/u, '').trim() || s;
}
