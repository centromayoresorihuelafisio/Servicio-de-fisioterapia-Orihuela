/**
 * OPCIÓN 1: Cambiar directamente el mensaje predefinido de WhatsApp.
 */
function configurarMensajeWhatsapp() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentWhatsapp = scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || 'Hola, soy Fabio...';
  
  const promptWhatsapp = ui.prompt(
    'Configurar: Mensaje de WhatsApp',
    'Introduce el nuevo texto base para los envíos de WhatsApp:\n\n' +
    'Actual: "' + currentWhatsapp + '"',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (promptWhatsapp.getSelectedButton() === ui.Button.OK) {
    const nuevoMsj = promptWhatsapp.getResponseText().trim();
    if (nuevoMsj !== '') {
      scriptProperties.setProperty(PROP_KEYS.WHATSAPP_MESSAGE, nuevoMsj);
      SpreadsheetApp.getActiveSpreadsheet().toast("Mensaje de WhatsApp actualizado.", "Configuración");
    }
  }
}