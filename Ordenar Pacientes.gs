function ordenarPacientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Base de Datos Maestra");
  const data = sheet.getDataRange().getValues();

  const headers = data[0].map(h => h.toString().trim().toLowerCase());

  function findColumnIndex(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
  }

  const idxEstado = findColumnIndex(headers, "estado");
  const idxIngreso = findColumnIndex(headers, "ingreso");
  const idxGravedad = findColumnIndex(headers, "gravedad");
  const idxUltimaVisita = findColumnIndex(headers, "última");
  const idxFechaInscripcion = findColumnIndex(headers, "inscripción");

  if (idxEstado === -1 || idxIngreso === -1 || idxGravedad === -1 || idxUltimaVisita === -1 || idxFechaInscripcion === -1) {
    Logger.log("No se encontraron todas las columnas necesarias");
    ss.toast("Error de configuración: revisa los encabezados requeridos en 'Base de Datos Maestra'.", "Error", 8);
    return;
  }

  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estado = row[idxEstado].toString().trim();
    const ingreso = row[idxIngreso].toString().trim();
    const gravedad = row[idxGravedad].toString().trim();
    const fechaUlt = parseFecha(row[idxUltimaVisita]);
    const fechaIns = parseFecha(row[idxFechaInscripcion]);

    let score = 0;

    switch (estado) {
      case "🟢 Activo": score += 5000; break;
      case "🟡 En espera": score += 4000; break;
      case "✔️ Alta": score += 3000; break;
      case "🕐 Contactará": score += 2000; break;
      case "🚫 No responde": score += 1000; break;
    }

    if (ingreso === "📄 Volante" || ingreso === "🔁 Derivación propia") {
      score += 200;
    } else if (ingreso === "🕰️ Antiguo paciente") {
      score += 100;
    }

    if (gravedad === "🟢 Leve") score += 10;
    if (gravedad === "🟠 Moderado") score += 20;
    if (gravedad === "🔴 Urgente") score += 30;

    if (fechaIns) {
      let diffDays = Math.floor((now - fechaIns) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) diffDays = 0;
      score += diffDays * 0.02;
    } else if (fechaUlt) {
      let diffDays2 = Math.floor((now - fechaUlt) / (1000 * 60 * 60 * 24));
      if (diffDays2 < 0) diffDays2 = 0;
      score += diffDays2 * 0.01;
    }

    sheet.getRange(i + 1, 1).setNumberFormat("0.00");
    sheet.getRange(i + 1, 1).setValue(Number(score.toFixed(2)));
  }

  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
       .sort({column: 1, ascending: false});

  ss.toast("Usuarios ordenados correctamente.", "Completado", 5);
}

function parseFecha(valor) {
  if (!valor && valor !== 0) return null;
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    return valor;
  }
  if (typeof valor === "number") {
    return new Date(Math.round((valor - 25569) * 86400 * 1000));
  }
  if (typeof valor === "string") {
    var partes = valor.split("/");
    if (partes.length === 3) {
      var dia = parseInt(partes[0], 10);
      var mes = parseInt(partes[1], 10) - 1;
      var año = parseInt(partes[2], 10);
      return new Date(año, mes, dia);
    }
  }
  return null;
}