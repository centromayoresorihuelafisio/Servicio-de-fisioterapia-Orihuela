/**
 * Crea los menús personalizados en la interfaz de la hoja de cálculo,
 * separando las funcionalidades principales en tres menús de nivel superior (Toolbar Menus).
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // 1. Menú AGENDA (📅)
  ui.createMenu("📅")
    .addItem('📍 Hoy', 'irAFechaActual')
    .addItem('🔍 Buscar Fecha', 'mostrarSelectorFecha')
    .addItem('🗂️ Jornada', 'prepararJornada')
    .addSeparator() // Separador
    .addItem('📞 Citas', 'mostrarDialogoCita')
    .addItem('💬 WhatsApp', 'abrirChatWhatsapp')
    .addItem("🗓️ Agenda Semanal", "showAgendaModal")
    .addItem("📌 Evento", "mostrarFormularioEvento")
    .addItem('➡️ Siguiente cita', 'copiarSiguienteCita')
    .addSeparator() // Separador
    .addItem("⬆️ Sincronizar con Calendar", "exportSheetAgendaToCalendar")
    .addItem("📕 Nuevo Curso", "generarAgendaCurso")
    .addToUi();

  // 2. Menú PACIENTES (🧍)
  ui.createMenu("🧍")
    .addItem("➕ Nuevo Paciente", "abrirFormularioPaciente")
    .addItem("📋 Valoración", "abrirFormularioValoracion")
    .addItem("🗃️ Añadir Historia Clínica", "generarHistoriaClinica")
    .addItem("🔗 Enlace HC", "insertarEnlaceHistoriaClinica")
    .addSeparator() // Separador
    .addItem("✔️ Alta Paciente", "darDeAltaPaciente")
    .addItem("🔄 Ordenar", "ordenarPacientes")
    .addItem("🔍 Buscar", "mostrarDialogoBusqueda")
    .addSeparator() // Separador
    .addItem('👥 Sincronizar contactos con Google', 'sincronizarContactosGoogle')
    .addToUi();
  // 3. Menú CONFIGURACIÓN
  ui.createMenu("⚙️")
    .addItem('1️⃣ Cambiar Plantilla Historia Clínica', 'configurarPlantillaHC')
    .addItem('2️⃣ Cambiar Carpeta Destino Drive', 'configurarCarpetaDrive')
    .addItem('3️⃣ Cambiar Mensaje WhatsApp', 'configurarMensajeWhatsapp')
    .addItem('⬇️ Exportar Código', 'exportarProyectoAUnicoArchivo')
    .addToUi();
 }
