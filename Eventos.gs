/**
 * Configuración global de estilos y emojis.
 */
const ESTILOS_CONFIG = {
  "Festivo": { emoji: "🚩", color: "#f4cccc" }, 
  "Blog":    { emoji: "📱", color: "#cfe2f3" }, 
  "Nota":    { emoji: "📝", color: "#fff2cc" }  
};

/**
 * Lanza el diálogo modal con el formulario HTML.
 */
function mostrarFormularioEvento() {
  const html = HtmlService.createHtmlOutputFromFile('Formulario eventos')
      .setWidth(450)
      .setHeight(500)
      .setTitle('Gestión de Eventos y Notas');
  SpreadsheetApp.getUi().showModalDialog(html, 'Nueva entrada en Agenda');
}

/**
 * Procesa los datos enviados desde el formulario HTML.
 */
function guardarEventoDesdeForm(datos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetEventos = ss.getSheetByName("Eventos");
  
  if (!sheetEventos) {
    sheetEventos = ss.insertSheet("Eventos");
    // Nuevo orden solicitado: Fecha, Tipo, Evento
    sheetEventos.appendRow(["Fecha", "Tipo", "Evento"]);
    sheetEventos.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#F1F5F9");
  }

  const partes = datos.fecha.split("-");
  const fechaObjeto = new Date(partes[0], partes[1] - 1, partes[2]);

  // Obtener emoji según el tipo configurado
  const config = ESTILOS_CONFIG[datos.tipo] || { emoji: "" };
  const tipoConEmoji = `${config.emoji} ${datos.tipo}`.trim();

  // Inserción en orden A: Fecha, B: Tipo, C: Evento
  sheetEventos.appendRow([fechaObjeto, tipoConEmoji, datos.evento]);
  
  const lr = sheetEventos.getLastRow();
  if (lr > 1) {
    sheetEventos.getRange(2, 1, lr - 1, 3).sort({column: 1, ascending: true});
  }

  sincronizarEventos();
  
  return "Éxito";
}

/**
 * Lee la hoja 'Eventos' y anota avisos en la Agenda.
 * Ajustado para el nuevo orden de columnas y ejecución aislada.
 */
function sincronizarEventos() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); 
  
  try {
    const sheetAgenda = obtenerHojaAgenda();
    const sheetEventos = ss.getSheetByName("Eventos");

    if (!sheetEventos) return;

    const lrEventos = sheetEventos.getLastRow();
    // Leemos las 3 columnas: A (Fecha), B (Tipo), C (Evento)
    const eventos = lrEventos > 1 ? sheetEventos.getRange(2, 1, lrEventos - 1, 3).getValues() : [];

    // 1. Mapa de eventos actuales con índices actualizados
    const mapaEventos = {};
    eventos.forEach(fila => {
      if (fila[0] instanceof Date) {
        const fechaIso = Utilities.formatDate(fila[0], tz, "yyyy-MM-dd");
        // fila[1] es Tipo (B), fila[2] es Evento (C)
        // Extraemos el nombre del tipo sin el emoji para buscar en el objeto de estilos
        const tipoLimpio = fila[1].replace(/🚩|📱|📝/g, "").trim();
        mapaEventos[fechaIso] = { nombre: fila[2], tipo: tipoLimpio, fechaObj: fila[0] };
      }
    });

    const lrAgenda = sheetAgenda.getLastRow();
    if (lrAgenda < 2) return;

    const rangoCitas = sheetAgenda.getRange(2, 1, lrAgenda - 1, 10);
    const datosAgenda = rangoCitas.getValues();
    const backgrounds = rangoCitas.getBackgrounds();
    const fontLines = rangoCitas.getFontLines();

    for (let i = 0; i < datosAgenda.length; i++) {
      const fechaCelda = datosAgenda[i][0];
      
      if (fechaCelda instanceof Date) {
        const fechaKey = Utilities.formatDate(fechaCelda, tz, "yyyy-MM-dd");
        const ev = mapaEventos[fechaKey];
        
        // --- PASO A: LIMPIEZA / REVERSIÓN ---
        // Limpiamos si detectamos cualquiera de los emojis configurados
        if (/🚩|📱|📝/.test(datosAgenda[i][2])) {
          datosAgenda[i][2] = ""; 
          backgrounds[i][2] = backgrounds[i][1]; 
          fontLines[i][2] = "none";
        }

        // --- PASO B: APLICAR EVENTO SI EXISTE ---
        if (ev) {
          const config = ESTILOS_CONFIG[ev.tipo] || ESTILOS_CONFIG["Nota"];
          const esEncabezadoDia = (datosAgenda[i][1] !== "" && datosAgenda[i][2] === "");

          if (esEncabezadoDia) {
            datosAgenda[i][2] = `${config.emoji} ${ev.nombre}`;
            backgrounds[i][2] = config.color;
            
            const fechaEvNormalizada = new Date(ev.fechaObj);
            fechaEvNormalizada.setHours(0,0,0,0);
            
            if (fechaEvNormalizada < hoy) {
              fontLines[i][2] = "line-through";
            } else {
              fontLines[i][2] = "none";
            }
          }
        }
      }
    }

    // --- PASO C: ESCRITURA AISLADA EN COLUMNA C ---
    // Construcción de estructuras vectoriales (Nx1) exclusivas para la columna de Eventos
    const valoresColC = [];
    const backgroundsColC = [];
    const fontLinesColC = [];

    for (let i = 0; i < datosAgenda.length; i++) {
      valoresColC.push([datosAgenda[i][2]]);
      backgroundsColC.push([backgrounds[i][2]]);
      fontLinesColC.push([fontLines[i][2]]);
    }

    // Definición del rango específico: Fila inicial=2, Columna=3 (C), Filas=lrAgenda-1, Columnas=1
    const rangoColC = sheetAgenda.getRange(2, 3, lrAgenda - 1, 1);
    
    rangoColC.setValues(valoresColC);
    rangoColC.setBackgrounds(backgroundsColC);
    rangoColC.setFontLines(fontLinesColC);

    console.log("Sincronización completada con éxito. Hipervínculos protegidos.");

  } catch (error) {
    if (ui) ui.alert("❌ Error en sincronización: " + error.message);
    else console.error(error);
  }
}

/**
 * Función auxiliar para localizar la hoja de agenda.
 */
function obtenerHojaAgenda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ss.getSheets();
  const hoja = hojas.find(h => h.getName().includes("Agenda"));
  if (!hoja) throw new Error("No se encontró la hoja 'Agenda'.");
  return hoja;
}