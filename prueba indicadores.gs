function probarIndicadoresVisuales() {
  const interfaz = HtmlService.createHtmlOutputFromFile('Prueba_Indicadores')
      .setWidth(520)
      .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(interfaz, "Visualizador de Diseños Stitch");
}