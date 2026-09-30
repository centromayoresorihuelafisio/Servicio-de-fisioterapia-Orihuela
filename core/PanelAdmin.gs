/**
 * OPICÓN 1: Cambiar directamente la plantilla de Google Docs.
 */
function configurarPlantillaHC() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentTemplate = scriptProperties.getProperty(PROP_KEYS.DOC_TEMPLATE_ID) || '';
  
  const promptTemplate = ui.prompt(
    '⚙️ Configurar: Plantilla HC',
    'Introduce el ID de la plantilla de Google Docs para Historias Clínicas:\n\n' +
    'Actual: ' + (currentTemplate ? currentTemplate : '[No configurado]'),
    ui.ButtonSet.OK_CANCEL
  );
  
  if (promptTemplate.getSelectedButton() === ui.Button.OK) {
    const nuevoTemplateId = promptTemplate.getResponseText().trim();
    if (nuevoTemplateId !== '') {
      scriptProperties.setProperty(PROP_KEYS.DOC_TEMPLATE_ID, nuevoTemplateId);
      SpreadsheetApp.getActiveSpreadsheet().toast("✅ Plantilla de Google Docs actualizada.", "Configuración");
    }
  }
}

/**
 * OPCIÓN 2: Cambiar directamente la carpeta de destino de Google Drive.
 */
function configurarCarpetaDrive() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentFolder = scriptProperties.getProperty(PROP_KEYS.DRIVE_FOLDER_ID) || '';
  
  const promptFolder = ui.prompt(
    '⚙️ Configurar: Carpeta Drive',
    'Introduce el ID de la carpeta destino de Google Drive donde se guardarán las HCs:\n\n' +
    'Actual: ' + (currentFolder ? currentFolder : '[No configurado]'),
    ui.ButtonSet.OK_CANCEL
  );
  
  if (promptFolder.getSelectedButton() === ui.Button.OK) {
    const nuevaFolderId = promptFolder.getResponseText().trim();
    if (nuevaFolderId !== '') {
      scriptProperties.setProperty(PROP_KEYS.DRIVE_FOLDER_ID, nuevaFolderId);
      SpreadsheetApp.getActiveSpreadsheet().toast("✅ Carpeta de Google Drive actualizada.", "Configuración");
    }
  }
}

/**
 * OPCIÓN 3: Cambiar directamente el mensaje predefinido de WhatsApp.
 */
function configurarMensajeWhatsapp() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentWhatsapp = scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || 'Hola, soy Fabio...';
  
  const promptWhatsapp = ui.prompt(
    '⚙️ Configurar: Mensaje de WhatsApp',
    'Introduce el nuevo texto base para los envíos de WhatsApp:\n\n' +
    'Actual: "' + currentWhatsapp + '"',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (promptWhatsapp.getSelectedButton() === ui.Button.OK) {
    const nuevoMsj = promptWhatsapp.getResponseText().trim();
    if (nuevoMsj !== '') {
      scriptProperties.setProperty(PROP_KEYS.WHATSAPP_MESSAGE, nuevoMsj);
      SpreadsheetApp.getActiveSpreadsheet().toast("✅ Mensaje de WhatsApp actualizado.", "Configuración");
    }
  }
}