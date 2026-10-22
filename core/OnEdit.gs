
/**
 * Se activa automáticamente al editar cualquier celda de la hoja de cálculo.
 */
function onEdit(e) {
  if (!e) return; // Evita errores al ejecutar manualmente
  onEditPrincipal_(e);
}

function onEditPrincipal_(e) {
  if (!e) return;

  var hoja = e.range.getSheet();
  var fila = e.range.getRow();
  var col = e.range.getColumn();
  
  // 0️⃣ Formato unificado de nombre/DNI al escribir a mano en la hoja (core/Utils.gs).
  // Guardamos el valor editado una sola vez, ya con el formato aplicado.
  aplicarFormatoEscrituraDirecta_(hoja, e.range, e.range.getValue());

  // ==========================
  // 1️⃣ Calcular edad según fecha de nacimiento
  // ==========================
  if (fila > 1) { 
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colNacimiento = encabezados.indexOf(COLUMNAS.MAESTRA.FECHA_NACIMIENTO) + 1;
    var colEdad = encabezados.indexOf(COLUMNAS.MAESTRA.EDAD) + 1;

    if (colNacimiento !== 0 && colEdad !== 0 && col === colNacimiento) {
      var celdaEdad = hoja.getRange(fila, colEdad);
      var edadCalculada = calcularEdadDesdeFecha_(e.range.getValue());

      if (edadCalculada === "") {
        celdaEdad.clearContent();
      } else {
        celdaEdad.setValue(edadCalculada);
      }
    }
  }
}

/**
 * Aplica la regla única de formato cuando alguien escribe directamente en la hoja:
 *  - Maestra · Nombre  -> normalizarNombreUsuario (mayúsculas, sin tildes, solo letras y espacios)
 *  - Maestra · DNI     -> mayúsculas
 * Solo actúa sobre ediciones de UNA celda con texto (los pegados de varias celdas, fechas y
 * borrados no se tocan). Devuelve el valor que queda en la celda.
 */
function aplicarFormatoEscrituraDirecta_(hoja, rango, valor) {
  if (rango.getNumRows() !== 1 || rango.getNumColumns() !== 1 || rango.getRow() < 2) return valor;
  if (typeof valor !== 'string' || !valor) return valor;

  const nombreHoja = hoja.getName();
  const col = rango.getColumn();
  let nuevo = valor;

  if (nombreHoja === SHEETS.MAESTRA) {
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    if (col === cabecera.indexOf(COLUMNAS.MAESTRA.NOMBRE) + 1) {
      nuevo = normalizarNombreUsuario(valor);
      if (!nuevo) return valor; // sin letras (p. ej. solo números): no se borra lo escrito
    } else if (col === cabecera.indexOf(COLUMNAS.MAESTRA.DNI) + 1) {
      nuevo = normalizarDniUsuario(valor);
    }
  }

  if (nuevo !== valor) rango.setValue(nuevo);
  return nuevo;
}
