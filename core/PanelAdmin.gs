/**
 * Mensaje predefinido de WhatsApp. Se ejecuta a mano desde el editor: muestra en el registro de ejecución el mensaje
 * que había y deja el de por defecto, sin nombres (decisión 6 de la sección 17.8). Otro texto se guarda desde la web,
 * en el diálogo de WhatsApp, con «Guardar como plantilla» (guardarPlantillaWhatsappWeb_, usuarios/Whatsapp.gs).
 */
function configurarMensajeWhatsapp() {
  soloPropietario_('configurarMensajeWhatsapp');
  const scriptProperties = PropertiesService.getScriptProperties();
  const anterior = scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE);
  scriptProperties.setProperty(PROP_KEYS.WHATSAPP_MESSAGE, WHATSAPP_PLANTILLA_POR_DEFECTO_);
  registroAnotar_('(propietario)', 'administrador', 'configurarMensajeWhatsapp', 'Propiedades', 'Desde el editor', 'ok');
  Logger.log('Mensaje anterior: ' + (anterior || '(ninguno: se usaba el de por defecto)'));
  Logger.log('Mensaje nuevo: ' + WHATSAPP_PLANTILLA_POR_DEFECTO_);
}
