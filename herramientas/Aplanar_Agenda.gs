/**
 * Sheet Architect Pro: Extractor y Sanitizador de Agenda a Base de Datos Plana
 * * Este script procesa la agenda visual, propaga fechas/días vacíos hacia abajo,
 * limpia los números telefónicos de saltos de línea y normaliza las horas (evitando el bug de 1899).
 */

function aplanarYLimpiarAgenda() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const nombreHojaOrigen = "Agenda 2025-2026";
  const hojaOrigen = libro.getSheetByName(nombreHojaOrigen);
  
  // 1. Validación de existencia
  if (!hojaOrigen) {
    SpreadsheetApp.getUi().alert("❌ Error: No se encontró la hoja con el nombre: " + nombreHojaOrigen);
    return;
  }
  
  const nombreHojaDestino = "Registro de datos " + nombreHojaOrigen;
  let hojaDestino = libro.getSheetByName(nombreHojaDestino);
  
  // 2. Preparación de la hoja de destino (Idempotencia)
  if (!hojaDestino) {
    hojaDestino = libro.insertSheet(nombreHojaDestino);
  } else {
    hojaDestino.clear(); 
  }
  
  // 3. Definición de la estructura limpia de Base de Datos
  const datosPlanos = [];
  const encabezados = ["Fecha", "Día", "Hora", "Usuario", "Teléfono", "Nº Sesión", "Asistencia"];
  datosPlanos.push(encabezados);
  
  // 4. Carga de datos de origen en memoria (Single API Call)
  const matrizVisual = hojaOrigen.getDataRange().getValues();
  const zonaHoraria = libro.getSpreadsheetTimeZone();
  
  // Variables de control para propagar la Fecha y el Día hacia abajo
  let fechaActual = null;
  let diaActual = "";
  
  // 5. Bucle de extracción con sanitización exhaustiva
  for (let i = 1; i < matrizVisual.length; i++) {
    const fila = matrizVisual[i];
    
    // --- PASO A: Capturar y Propagar Fecha y Día ---
    let celdaFecha = fila[0];
    let celdaDia = fila[1];
    
    // Si la celda contiene una Fecha válida, actualizamos nuestro acumulador
    if (celdaFecha && celdaFecha instanceof Date) {
      // Verificamos que no sea el bug de la hora 1899 (las fechas reales de agenda serán de 2025/2026)
      if (celdaFecha.getFullYear() > 1900) {
        fechaActual = celdaFecha;
      }
    } else if (celdaFecha && String(celdaFecha).trim() !== "") {
      // Si viene como String (ej. "15/06/2026"), intentamos parsearlo o guardarlo
      const textoFecha = String(celdaFecha).trim();
      if (!textoFecha.toUpperCase().includes("FECHA") && !textoFecha.includes("/")) {
        // Ignoramos textos de cabecera que no sean fechas reales
      } else {
        fechaActual = textoFecha;
      }
    }
    
    if (celdaDia && String(celdaDia).trim() !== "") {
      const textoDia = String(celdaDia).trim();
      // Evitamos guardar cabeceras del sistema como "Día"
      if (textoDia.toUpperCase() !== "DIA" && textoDia.toUpperCase() !== "DÍA") {
        diaActual = textoDia;
      }
    }
    
    // --- PASO B: Identificación del Usuario y Filtrado de Basura ---
    const usuarioBruto = fila[3];
    if (!usuarioBruto) continue; // Si no hay usuario, es un slot vacío
    
    const usuarioLimpio = String(usuarioBruto).trim();
    const usuarioUpper = usuarioLimpio.toUpperCase();
    
    // Filtro de exclusión de cabeceras visuales e indicaciones de impresión
    if (
      usuarioLimpio === "" ||
      usuarioUpper === "USUARIO" ||
      usuarioUpper === "MAÑANA" ||
      usuarioUpper === "TARDE" ||
      usuarioUpper.startsWith("SEMANA") ||
      usuarioUpper.includes("HISTORIA CLINICA") ||
      usuarioUpper.includes("ENCUESTA")
    ) {
      continue; // Ignoramos estas filas y pasamos a la siguiente
    }
    
    // --- PASO C: Normalización de la Hora (Solución al Bug 1899) ---
    let horaCelda = fila[2];
    let horaLimpia = "";
    
    if (horaCelda instanceof Date) {
      // Si Apps Script lo leyó como un objeto Date (con año 1899), extraemos solo HH:mm
      horaLimpia = Utilities.formatDate(horaCelda, zonaHoraria, "HH:mm");
    } else if (horaCelda && String(horaCelda).trim() !== "") {
      horaLimpia = String(horaCelda).trim();
      // Corregimos caracteres tipográficos específicos del PDF
      horaLimpia = horaLimpia.replace('ǵ', ':');
      // Filtramos textos como "MAÑANA" o "TARDE" que se hayan colado en la columna de horas
      if (horaLimpia.toUpperCase() === "MAÑANA" || horaLimpia.toUpperCase() === "TARDE") {
        horaLimpia = ""; 
      }
    }
    
    // --- PASO D: Sanitización de Teléfono (Evitar saltos de línea) ---
    let telefonoCelda = fila[4];
    let telefonoLimpio = "";
    if (telefonoCelda !== null && telefonoCelda !== undefined) {
      // Removemos saltos de línea (\n, \r), tabuladores y recortamos espacios exteriores
      telefonoLimpio = String(telefonoCelda).replace(/[\r\n\t]+/g, " ").trim();
    }
    
    // --- PASO E: Sanitización del Nº de Sesión ---
    let sesionCelda = fila[5];
    let sesionLimpia = (sesionCelda !== null && sesionCelda !== undefined) ? String(sesionCelda).trim() : "";
    
    // --- PASO F: Sanitización de Asistencia ---
    let asistenciaCelda = fila[6];
    let asistenciaLimpia = (asistenciaCelda !== null && asistenciaCelda !== undefined) ? String(asistenciaCelda).trim() : "";
    
    // --- PASO G: Formateo final de la Fecha para presentación limpia ---
    let fechaFormateada = fechaActual;
    if (fechaActual instanceof Date) {
      fechaFormateada = Utilities.formatDate(fechaActual, zonaHoraria, "dd/MM/yyyy");
    }
    
    // Guardamos la fila perfectamente estructurada
    datosPlanos.push([
      fechaFormateada,
      diaActual,
      horaLimpia,
      usuarioLimpio,
      telefonoLimpio,
      sesionLimpia,
      asistenciaLimpia
    ]);
  }
  
  // 6. Escritura masiva en la hoja de destino
  if (datosPlanos.length > 1) {
    const rangoDestino = hojaDestino.getRange(1, 1, datosPlanos.length, encabezados.length);
    rangoDestino.setValues(datosPlanos);
    
    // --- DISEÑO PROFESIONAL ---
    // Estilo elegante para la cabecera (Azul pizarra suave y texto blanco)
    const rangoCabecera = hojaDestino.getRange(1, 1, 1, encabezados.length);
    rangoCabecera.setFontWeight("bold")
                  .setBackground("#2F4F4F")
                  .setFontColor("#FFFFFF")
                  .setHorizontalAlignment("center");
                  
    // Formatear columna de Teléfonos como texto para no perder ceros a la izquierda
    const rangoTelefonos = hojaDestino.getRange(2, 5, datosPlanos.length - 1, 1);
    rangoTelefonos.setNumberFormat("@");
    
    // Formatear alineaciones para mejor legibilidad
    hojaDestino.getRange(2, 1, datosPlanos.length - 1, 3).setHorizontalAlignment("center"); // Fecha, Día, Hora
    hojaDestino.getRange(2, 6, datosPlanos.length - 1, 2).setHorizontalAlignment("center"); // Sesión, Asistencia
    
    // Auto-ajustar el ancho de las columnas
    hojaDestino.autoResizeColumns(1, encabezados.length);
    
    SpreadsheetApp.getUi().alert("✅ Base de datos unificada, depurada y formateada con éxito.");
  } else {
    SpreadsheetApp.getUi().alert("⚠️ No se encontraron citas válidas para procesar.");
  }
}