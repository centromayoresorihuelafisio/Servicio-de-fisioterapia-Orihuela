/**
 * Crea los menús personalizados en la interfaz de la hoja de cálculo,
 * separando las funcionalidades principales en tres menús de nivel superior (Toolbar Menus).
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // 1. Menú AGENDA (📅): solo queda WhatsApp (opera sobre la Maestra). El resto de entradas operaban sobre la
  //    hoja "Agenda AAAA-AAAA", que desde el corte (21-oct-2026) es solo archivo; la Agenda vive en la web app.
  ui.createMenu("📅")
    .addItem('💬 WhatsApp', 'abrirChatWhatsapp')
    .addToUi();

  // 2. Menú PACIENTES (🧍)
  ui.createMenu("🧍")
    .addItem("➕ Nuevo Paciente", "abrirFormularioPaciente")
    .addItem("📋 Valoración", "abrirFormularioValoracion")
    .addItem("🗃️ Añadir Historia Clínica", "generarHistoriaClinica")
    .addSeparator() // Separador
    .addItem("✔️ Alta Paciente", "darDeAltaPaciente")
    .addItem("🔄 Ordenar", "ordenarPacientes")
    .addItem("🔍 Buscar", "mostrarDialogoBusqueda")
    .addSeparator() // Separador
    .addItem('👥 Sincronizar contactos con Google', 'sincronizarContactosGoogle')
    .addToUi();
  // 3. Menú CONFIGURACIÓN
  ui.createMenu("⚙️")
    .addItem('1️⃣ Cambiar Mensaje WhatsApp', 'configurarMensajeWhatsapp')
    .addItem('⬇️ Exportar Código', 'exportarProyectoAUnicoArchivo')
    .addToUi();
 }