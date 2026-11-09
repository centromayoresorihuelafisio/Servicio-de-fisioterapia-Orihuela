// sim/pwa-mock.js — Simulación del servidor para probar la app instalable sin Google (CONTEXTO.md, sección 20).
// `node pwa/build.js --sim` la carga en cada página antes de pwa.js. Contesta al fetch de la PWA a script.google.com
// como lo haría doPost → api(), con datos INVENTADOS (ningún dato real). No ejecuta la lógica del servidor: sirve para
// probar la parte de la PWA (arranque, conexión, login, pestañas, enlaces, paneles, HC, cierre, fallos de red).
//
// Servir:  python -m http.server 8941 --bind 127.0.0.1 --directory sim
// Abrir:   http://127.0.0.1:8941/pwa/   (usuario «prueba», contraseña «1234»)
// Parámetros de la dirección (se recuerdan en esta pestaña): ?rol=usuario · ?cerrada=1 · ?sinconexion=1 (pantalla
// «Conectar la app»; dirección válida: la de SIM.url) · ?lento=1500 (ms por llamada) · ?limpiar=1 (olvida todo).
// En la consola: SIM.offline = true (sin red), SIM.peticiones (lo enviado, sin el token).
(function () {
  'use strict';
  var URL_SIM = 'https://script.google.com/macros/s/SIMULACION/exec';
  var q = new URLSearchParams(location.search);
  var opc = {};
  try { opc = JSON.parse(sessionStorage.getItem('sim|opciones') || '{}'); } catch (e) { opc = {}; }
  if (q.get('limpiar') === '1') { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* se ignora */ } opc = {}; }
  ['rol', 'cerrada', 'sinconexion', 'lento'].forEach(function (k) { if (q.has(k)) opc[k] = q.get(k); });
  try { sessionStorage.setItem('sim|opciones', JSON.stringify(opc)); } catch (e) { /* se ignora */ }

  var SIM = window.SIM = { url: URL_SIM, offline: false, peticiones: [], opciones: opc };
  if (opc.sinconexion !== '1') {
    try { if (!localStorage.getItem('fisioterapia|conexionPWA')) localStorage.setItem('fisioterapia|conexionPWA', JSON.stringify({ url: URL_SIM })); } catch (e) { /* se ignora */ }
  }

  // ---------- Datos inventados ----------
  var HC = function (id) { return URL_SIM + '?page=hc&id=' + id; };
  var HEADERS = ['Nº', 'Nombre', 'DNI', 'Teléfono 1', 'Teléfono 2', 'Fecha nacimiento', 'Estado', 'Tipo de Ingreso', 'Gravedad',
    'Fecha inscripción', 'Historia clínica', 'Observaciones', 'ID paciente', 'Edad'];
  var PERSONAS = [
    ['Ana Prueba Uno', '00000001A', '600000001', '', '01/02/1950', 'Activo', 'Volante', 'Leve', '01/09/2026', HC('HC-1'), 'Usuario inventado', 'P-1', 76],
    ['Benito Ficticio Dos', '00000002B', '600000002', '965000002', '15/06/1948', 'Activo', 'Derivación propia', 'Moderado', '05/09/2026', HC('HC-2'), '', 'P-2', 78],
    ['Carmen Ejemplo Tres', '00000003C', '600000003', '', '20/11/1955', 'En espera', 'Volante', 'Grave', '10/10/2026', '', '', 'P-3', 70],
    ['Daniel Simulado Cuatro', '00000004D', '600000004', '', '03/03/1945', 'Alta', 'Antiguo paciente', '', '01/06/2026', HC('HC-4'), '', 'P-4', 81],
    ['Elena Demo Cinco', '00000005E', '', '', '30/07/1960', 'Contactará', 'Volante', 'Leve', '20/10/2026', '', '', 'P-5', 66],
    ['Félix Inventado Seis', '00000006F', '600000006', '', '12/12/1952', 'No responde', 'Volante', '', '25/10/2026', '', '', 'P-6', 73]
  ];
  var pacientes = PERSONAS.map(function (r, i) {
    var p = { _fila: i + 2, 'Nº': i + 1 };
    HEADERS.slice(1).forEach(function (h, j) { p[h] = r[j]; });
    return p;
  });
  var porId = {};
  pacientes.forEach(function (p) { porId[p['ID paciente']] = p; });

  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function semana(fechaISO) {
    var b = fechaISO ? new Date(+fechaISO.slice(0, 4), +fechaISO.slice(5, 7) - 1, +fechaISO.slice(8, 10)) : new Date();
    var dow = b.getDay();
    var lunes = new Date(b.getFullYear(), b.getMonth(), b.getDate() - dow + (dow === 0 ? -6 : 1));
    var fechas = [];
    for (var i = 0; i < 5; i++) fechas.push(iso(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i)));
    var filas = [];
    fechas.forEach(function (f, di) {
      var horas = [];
      for (var h = 8; h < 14; h++) { horas.push(('0' + h).slice(-2) + ':00'); horas.push(('0' + h).slice(-2) + ':30'); }
      horas.forEach(function (hora, hi) {
        var idp = (hi + di) % 3 === 0 ? ['P-1', 'P-2', 'P-3', 'P-5'][(hi + di) % 4] : '';
        var fila = { _fila: '', _id: '', _idPaciente: '', _fechaISO: f, _horaOrden: hora, _hueco: !idp,
          'Fecha': f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4), 'Día': DIAS[new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)).getDay()],
          'Hora': hora, 'Usuario': '', 'Teléfono': '', 'Sesión': '', 'Asistencia': '', 'Historia clínica': '', 'Notas': '' };
        if (idp) {
          var p = porId[idp];
          fila._fila = fila._id = 'C-' + f + '-' + hora; fila._idPaciente = idp;
          fila['Usuario'] = p['Nombre']; fila['Teléfono'] = p['Teléfono 1']; fila['Sesión'] = 1 + hi % 5; fila['Historia clínica'] = p['Historia clínica'];
          if (f < iso(new Date())) fila['Asistencia'] = hi % 3 ? 'Asistido' : 'No asistido';
        } else fila._fila = 'hueco ' + f + ' ' + hora;
        filas.push(fila);
      });
    });
    return { citas: filas, semana: { lunes: fechas[0], viernes: fechas[4], etiqueta: 'Semana del ' + fechas[0] + ' (simulación)' },
      headers: ['Fecha', 'Día', 'Hora', 'Usuario', 'Teléfono', 'Sesión', 'Asistencia', 'Historia clínica', 'Notas'],
      opcionesAsistencia: ['Pendiente', 'Asistido', 'No asistido', 'Justificada'], umbralAbsentismo: 3 };
  }
  function clave(n) { return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // ---------- Acciones ----------
  var ROL = opc.rol === 'usuario' ? 'usuario' : 'administrador';
  var PERFIL = { usuario: 'prueba', nombre: 'Persona de prueba', rol: ROL, rolReal: ROL, verComo: false };
  var ACC = {
    conectarPWA: function () { return { app: 'Fisioterapia Orihuela' }; },
    iniciarSesion: function (u, c) {
      if (u !== 'prueba' || c !== '1234') throw new Error('Usuario o contraseña incorrectos.');
      return { token: 'tok-sim-' + Date.now(), usuario: PERFIL.usuario, nombre: PERFIL.nombre, rol: ROL, debeCambiar: false, ms: 5 };
    },
    comprobarSesion: function () { return PERFIL; },
    cerrarSesion: function () { return { success: true }; },
    obtenerBaseDatosCompletaWeb: function () { return { headers: HEADERS, pacientes: pacientes }; },
    obtenerAgendaSemanaWeb: function (f) { return semana(f); },
    refrescarAgendaSemanaWeb: function (f) { return semana(f); },
    obtenerVersionAgendaWeb: function () { return { sheetId: 'citas', version: 1 }; },
    obtenerFichasUsuariosWeb: function () {
      var fichas = {};
      pacientes.forEach(function (p) { fichas[clave(p['Nombre'])] = p; });
      return { success: true, headers: HEADERS, fichas: fichas, generado: Date.now(),
        usuarios: pacientes.map(function (p) { return { id: p['ID paciente'], nombre: p['Nombre'], estado: p['Estado'], telefono: p['Teléfono 1'] }; }) };
    },
    obtenerFichaUsuarioWeb: function (nombre) {
      var p = pacientes.filter(function (x) { return clave(x['Nombre']) === clave(nombre); })[0];
      return p ? { success: true, headers: HEADERS, paciente: p } : { success: false, message: 'No se encontró a este usuario en Usuarios.' };
    },
    datosWhatsappMaestraWeb: function () { return { success: true, items: [] }; },
    datosWhatsappLoteAgendaWeb: function () { return { success: true, items: [] }; },
    obtenerRecordatoriosWeb: function () { return { success: true, recordatorios: [] }; },
    obtenerValoracionesWeb: function () { return { pacientes: [] }; },
    obtenerHCsActivasWeb: function () { return { success: true, historias: [] }; },
    obtenerHCWeb: function () { return { success: false, message: 'La simulación no tiene historias clínicas: aquí solo se comprueba que la página se monta.' }; },
    obtenerDisponibilidadWeb: function () { return { success: true, cerradas: [] }; }
  };

  function responder(cuerpo) {
    if (opc.cerrada === '1') return { ok: false, error: 'La aplicación está cerrada por ahora. Habla con el administrador.', codigo: 'CERRADA' };
    var fn = ACC[cuerpo.accion];
    var publica = cuerpo.accion === 'conectarPWA' || cuerpo.accion === 'iniciarSesion';
    if (!publica && !/^tok-sim-/.test(cuerpo.token || '')) return { ok: false, error: 'La sesión ha caducado. Vuelve a entrar.', codigo: 'SESION' };
    if (!fn) {
      console.info('[simulación] acción sin datos inventados: ' + cuerpo.accion + ' → se responde «hecho correctamente»');
      return { ok: true, datos: { success: true, message: 'Hecho correctamente (simulación: no se ha guardado nada).' }, rol: ROL };
    }
    try { return { ok: true, datos: fn.apply(null, cuerpo.datos || []), rol: ROL }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  var fetchReal = window.fetch.bind(window);
  window.fetch = function (url, op) {
    if (!/^https:\/\/script\.google\.com\//.test(String(url))) return fetchReal(url, op);
    return new Promise(function (resolver, rechazar) {
      setTimeout(function () {
        if (SIM.offline) { rechazar(new TypeError('Failed to fetch')); return; }
        var tipo = op && op.headers && op.headers['Content-Type'];
        if (!op || op.method !== 'POST' || !/^text\/plain/.test(tipo || '')) {
          rechazar(new TypeError('CORS: Google solo acepta aquí un POST text/plain sin consulta previa')); return;
        }
        if (String(url) !== URL_SIM) {   // otra dirección: Google devolvería una página, no JSON
          resolver(new Response('<html>Página no encontrada</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })); return;
        }
        var cuerpo = JSON.parse(op.body);
        SIM.peticiones.push({ accion: cuerpo.accion, datos: cuerpo.datos });
        resolver(new Response(JSON.stringify(responder(cuerpo)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }, +(opc.lento || 150));
    });
  };
})();
