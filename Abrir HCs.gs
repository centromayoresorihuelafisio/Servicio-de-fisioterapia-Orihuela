/**
 * Abre automáticamente las historias clínicas de los pacientes de la jornada actual.
 * OPTIMIZADO: Usa getDisplayValues para evitar errores de formato de fecha/hora.
 */
function prepararJornada() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  if (!sheet.getName().startsWith("Agenda ")) {
    ui.alert("Error", "Esta función solo se puede usar en una hoja de 'Agenda AAAA-AAAA'.", ui.ButtonSet.OK);
    return;
  }

  // 1. Configuración de tiempo
  const timeZone = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const todayString = Utilities.formatDate(now, timeZone, "dd/MM/yyyy");
  const currentHour = now.getHours();
  const isMorningShift = currentHour < 14;

  // 2. Extracción de datos (DISPLAY VALUES para obtener texto real)
  const dataRange = sheet.getDataRange();
  const displayValues = dataRange.getDisplayValues(); // <--- CAMBIO CRÍTICO
  const richTextValues = dataRange.getRichTextValues();

  const headers = displayValues[0];
  const colTimeIndex = headers.findIndex(h => h.toString().trim() === 'Hora');
  const colHCIndex = headers.findIndex(h => h.toString().trim() === 'Historia clínica');

  if (colTimeIndex === -1 || colHCIndex === -1) {
    ui.alert("Error", "No se encontraron las columnas 'Hora' o 'Historia clínica'.", ui.ButtonSet.OK);
    return;
  }

  let currentDateContext = "";
  let linksToOpen = [];

  // 3. Procesamiento de filas
  for (let i = 1; i < displayValues.length; i++) {
    const row = displayValues[i];
    const firstColValue = row[0].trim();

    // Actualizar el contexto de fecha si la celda parece una fecha dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(firstColValue)) {
      currentDateContext = firstColValue;
    }

    if (currentDateContext === todayString) {
      const timeString = row[colTimeIndex].trim();
      
      if (timeString && timeString.includes(":")) {
        const rowHour = parseInt(timeString.split(":")[0], 10);
        const isRowMorning = rowHour < 14;

        // Filtrar por turno (Mañana < 14:00, Tarde >= 14:00)
        if ((isMorningShift && isRowMorning) || (!isMorningShift && !isRowMorning)) {
          const richTextCell = richTextValues[i][colHCIndex];
          const url = richTextCell.getLinkUrl();
          
          // Verificación flexible del texto del enlace
          if (url && richTextCell.getText().toLowerCase().includes("historia clínica")) {
            linksToOpen.push(url);
          }
        }
      }
    } else if (currentDateContext !== "" && currentDateContext !== todayString && linksToOpen.length > 0) {
      // Si ya pasamos hoy y tenemos links, salimos para ahorrar recursos
      break;
    }
  }

  if (linksToOpen.length === 0) {
    ui.alert("Información", `No se encontraron enlaces para el turno de ${isMorningShift ? 'mañana' : 'tarde'} de hoy (${todayString}).`, ui.ButtonSet.OK);
    return;
  }

  // 4. Lanzamiento de la interfaz
  const htmlTemplate = HtmlService.createTemplateFromFile('Lanzador');
  htmlTemplate.urls = JSON.stringify(linksToOpen);
  const htmlOutput = htmlTemplate.evaluate().setWidth(400).setHeight(200);
  ui.showModalDialog(htmlOutput, "Abriendo Jornada...");
}