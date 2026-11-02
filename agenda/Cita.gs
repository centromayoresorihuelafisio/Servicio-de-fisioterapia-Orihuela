/**
 * Semanas, días y huecos libres para el formulario de Cita (agenda/Panel_Cita.html).
 * Los huecos se calculan desde la tabla "Citas" (agenda/Web_Escritura_Citas.gs). Si falla, devuelve el aviso dentro de `semanas`
 * para que el formulario lo muestre.
 */
function obtenerSemanasYHuecos_() {
  try {
    return obtenerSemanasYHuecosDesdeCitasWeb_();
  } catch (e) {
    console.error(e);
    return { semanas: [{ error: `Error: ${e.message}` }], index: 0 };
  }
}

/**
 * Guarda las citas del formulario de Cita en la tabla "Citas" (agenda/Web_Escritura_Citas.gs): pone al usuario en Activo,
 * lo anota en el historial de Estado y registra el ingreso si es su primera cita.
 */
function guardarCitasMultiples_(formData) {
  return guardarCitasMultiplesDesdeCitasWeb_(formData);
}
