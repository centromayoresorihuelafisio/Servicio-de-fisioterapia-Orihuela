/**
 * Fase 4 (corte) del paso 6 de CONTEXTO.md, sección 11: deja la hoja "Agenda AAAA-AAAA" del curso actual como ARCHIVO, es decir,
 * protegida con aviso ante cualquier edición manual. No borra ni cambia ningún dato y se puede repetir. Ejecutar DESPUÉS de poner
 * CITAS_MODO_NUEVO = true y desplegar la nueva versión de la Web App. Se retira junto con el resto de lo viejo.
 */
function congelarAgendaAnterior() {
  const hoja = obtenerHojaAgenda();
  if (!hoja) throw new Error('No se encuentra la hoja de Agenda del curso actual.');
  if (!citasModoNuevo_()) throw new Error('CITAS_MODO_NUEVO sigue en false: no se congela la Agenda mientras la app siga escribiendo en ella.');
  const protecciones = hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  const p = protecciones.length ? protecciones[0] : hoja.protect();
  p.setDescription('ARCHIVO: la Agenda ahora vive en la hoja "' + SHEETS.CITAS + '". No editar a mano.');
  p.setWarningOnly(true);
  hoja.setTabColor('#9e9e9e');
  getSS().toast('"' + hoja.getName() + '" congelada como archivo (aviso ante ediciones).', 'Agenda', 8);
  Logger.log('Agenda congelada: ' + hoja.getName());
  return hoja.getName();
}
