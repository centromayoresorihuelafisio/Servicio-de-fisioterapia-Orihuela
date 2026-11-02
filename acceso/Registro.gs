// acceso/Registro.gs
// Hoja "Registro": solo se añaden filas. Nunca guarda contraseñas ni los datos enviados al entrar (CONTEXTO.md, sección 17.6).
// ================================================================================

const REGISTRO_CABECERAS_ = ['fecha', 'usuario', 'rol', 'accion', 'entidad', 'detalle', 'resultado'];
const REGISTRO_MAX_CELDA_ = 49000;

/** Un texto que empiece por = + - @ se guarda como texto: en la hoja no debe convertirse en fórmula. */
function registroTexto_(v) {
  const s = String(v === null || v === undefined ? '' : v).slice(0, REGISTRO_MAX_CELDA_);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Añade una fila. Si falla, la operación sigue, igual que en historialRegistrar_. */
function registroAnotar_(usuario, rol, accion, entidad, detalle, resultado) {
  try {
    const hoja = getSS().getSheetByName(SHEETS.REGISTRO);
    if (!hoja) return;
    hoja.appendRow([new Date()].concat([usuario, rol, accion, entidad, detalle, resultado].map(registroTexto_)));
  } catch (e) {
    console.error('registroAnotar_: ' + e.message);
  }
}
