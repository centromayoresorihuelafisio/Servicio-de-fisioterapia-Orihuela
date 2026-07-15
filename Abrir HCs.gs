/**
 * Abre automáticamente las historias clínicas buscando la hoja de Agenda correspondiente al curso escolar.
 */
function prepararJornada() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Determinar el nombre de la hoja según el curso escolar (Septiembre - Julio)
  const now = new Date();
  const month = now.getMonth(); // 0 = Enero, 8 = Septiembre
  const year = now.getFullYear();
  
  let cursoNombre = "";
  if (month >= 8) { // Septiembre a Diciembre
    cursoNombre = `Agenda ${year}-${year + 1}`;
  } else { // Enero a Agosto
    cursoNombre = `Agenda ${year - 1}-${year}`;
  }

  const sheet = ss.getSheetByName(cursoNombre);

  if (!sheet) {
    ui.alert("Error", `No se encontró la hoja con el nombre: "${cursoNombre}". Por favor, verifica el nombre de la pestaña.`, ui.ButtonSet.OK);
    return;
  }

  // 2. Configuración de tiempo
  const timeZone = ss.getSpreadsheetTimeZone();
  const todayString = Utilities.formatDate(now, timeZone, "dd/MM/yyyy");
  const currentHour = now.getHours();
  const isMorningShift = currentHour < 14;

  // 3. Extracción de datos
  const dataRange = sheet.getDataRange();
  const displayValues = dataRange.getDisplayValues(); 
  const richTextValues = dataRange.getRichTextValues();

  const headers = displayValues[0];
  const colTimeIndex = headers.findIndex(h => h.toString().trim() === COLUMNAS.AGENDA.HORA);
  const colHCIndex = headers.findIndex(h => h.toString().trim() === COLUMNAS.AGENDA.HISTORIA_CLINICA);

  if (colTimeIndex === -1 || colHCIndex === -1) {
    ui.alert("Error", `En la hoja "${cursoNombre}" no se encontraron las columnas 'Hora' o 'Historia clínica'.`, ui.ButtonSet.OK);
    return;
  }

  let currentDateContext = "";
  let linksToOpen = [];

  // 4. Procesamiento de filas
  for (let i = 1; i < displayValues.length; i++) {
    const row = displayValues[i];
    const firstColValue = row[0].trim();

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(firstColValue)) {
      currentDateContext = firstColValue;
    }

    if (currentDateContext === todayString) {
      const timeString = row[colTimeIndex].trim();
      
      if (timeString && timeString.includes(":")) {
        const rowHour = parseInt(timeString.split(":")[0], 10);
        const isRowMorning = rowHour < 14;

        if ((isMorningShift && isRowMorning) || (!isMorningShift && !isRowMorning)) {
          const richTextCell = richTextValues[i][colHCIndex];
          const url = richTextCell.getLinkUrl();
          
          if (url && richTextCell.getText().toLowerCase().includes("historia clínica")) {
            linksToOpen.push(url);
          }
        }
      }
    } else if (currentDateContext !== "" && currentDateContext !== todayString && linksToOpen.length > 0) {
      break;
    }
  }

  if (linksToOpen.length === 0) {
    ui.alert("Información", `No se encontraron enlaces para el turno de ${isMorningShift ? 'mañana' : 'tarde'} en la hoja "${cursoNombre}" para hoy (${todayString}).`, ui.ButtonSet.OK);
    return;
  }

  // 5. Lanzamiento de la interfaz
  const htmlTemplate = HtmlService.createTemplateFromFile('Lanzador HCs');
  htmlTemplate.urls = JSON.stringify(linksToOpen);
  const htmlOutput = htmlTemplate.evaluate().setWidth(400).setHeight(200);
  ui.showModalDialog(htmlOutput, "Abriendo Jornada...");
}