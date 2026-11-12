// core/Nombres_Oficiales.gs
// Nombres oficiales (CONTEXTO.md, sección 22). ÚNICA lista de diminutivos y abreviaturas del proyecto: la usó la
// herramienta de la fase 2 (ya retirada) y la usan el alta y «Editar» (fase 3): «M» delante = MARIA al guardar
// (normalizarNombreOficial_) y los avisos del nombre (nombresAvisos_). El navegador no tiene copia: incluirNombres_()
// le sirve estas mismas listas y funciones.
// Solo lógica pura (no lee ni escribe la hoja): se prueba fuera de Google con `node comprobar/nombres.mjs`.
// Decisiones del dueño (12-nov-2026): MAMEN y MARICARMEN = MARIA CARMEN; MONSE = MONSERRATE; «M» delante = MARIA.
// ================================================================================

/**
 * Diminutivos de nombre de pila. Un texto = equivalencia segura; una lista = dudoso (lo decide el dueño con el DNI o
 * la SIP; la lista son las opciones que se le enseñan). «MARI» va aparte: delante de otro nombre es MARIA (seguro);
 * sola es dudosa.
 */
const NOMBRES_DIMINUTIVOS_ = {
  MANOLO: 'MANUEL', MANOLI: 'MANUELA',
  PACO: 'FRANCISCO', PAQUI: 'FRANCISCA', PAQUITA: 'FRANCISCA', PACA: 'FRANCISCA',
  PEPE: 'JOSE', PEPA: 'JOSEFA', PEPI: 'JOSEFA', PEPITA: 'JOSEFA',
  LOLA: 'DOLORES', LOLI: 'DOLORES',
  CHARO: 'ROSARIO',
  CONCHI: 'CONCEPCION', CONCHA: 'CONCEPCION', CONCHITA: 'CONCEPCION',
  PURI: 'PURIFICACION',
  TERE: 'TERESA',
  MONSE: 'MONSERRATE',
  REME: 'REMEDIOS',
  ENCARNA: 'ENCARNACION', ENCARNITA: 'ENCARNACION',
  INMA: 'INMACULADA',
  ISA: 'ISABEL',
  MAGDA: 'MAGDALENA',
  JUANI: 'JUANA',
  TRINI: 'TRINIDAD',
  PATRO: 'PATROCINIO',
  ASUN: 'ASUNCION',
  PILI: 'PILAR',
  MERCHE: 'MERCEDES',
  CHELO: 'CONSUELO',
  TOÑI: 'ANTONIA', TOÑO: 'ANTONIO', TONI: 'ANTONIO',
  MARIBEL: 'MARIA ISABEL',
  MAITE: 'MARIA TERESA',
  MARISA: 'MARIA LUISA',
  MARISOL: 'MARIA SOLEDAD',
  MAMEN: 'MARIA CARMEN', MARICARMEN: 'MARIA CARMEN',
  ROSAMARI: 'ROSA MARIA',
  // Dudosos
  FINA: ['JOSEFA', 'JOSEFINA'],
  ANGELINES: ['ANGELES', 'MARIA DE LOS ANGELES'],
  CARMELA: ['CARMEN', 'CARMELA'],
  DORA: ['DOLORES', 'ISIDORA', 'TEODORA'],
  LLANOS: ['MARIA DE LOS LLANOS', 'LLANOS'],
  MARUJA: ['MARIA']
};

/** Abreviaturas de apellido que no son la forma oficial. */
const NOMBRES_ABREVIATURAS_ = {
  GLEZ: 'GONZALEZ', GONZ: 'GONZALEZ',
  FDEZ: 'FERNANDEZ', FERNZ: 'FERNANDEZ',
  HDEZ: 'HERNANDEZ', HERNZ: 'HERNANDEZ',
  RGUEZ: 'RODRIGUEZ', RODGUEZ: 'RODRIGUEZ', RDGUEZ: 'RODRIGUEZ',
  MTNEZ: 'MARTINEZ', MTEZ: 'MARTINEZ', MARTNEZ: 'MARTINEZ',
  SCHEZ: 'SANCHEZ', SANCHZ: 'SANCHEZ',
  GCIA: 'GARCIA',
  JMNEZ: 'JIMENEZ', JIMNEZ: 'JIMENEZ',
  GMEZ: 'GOMEZ',
  DGUEZ: 'DOMINGUEZ',
  VZQUEZ: 'VAZQUEZ',
  GTRREZ: 'GUTIERREZ', GTEZ: 'GUTIERREZ'
};

/** Palabras de enlace de los nombres y apellidos compuestos («MARIA DEL CARMEN», «DE LA CRUZ»). */
const NOMBRES_PARTICULAS_ = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'E'];

/** Formas de escribir «MARIA» abreviado como primera palabra («M», «Mª», «MA.»), ya normalizadas. */
const NOMBRES_M_MARIA_ = ['M', 'MA'];

const NOMBRES_TIPO_ = { SEGURO: 'seguro', DUDOSO: 'dudoso', ERROR: 'error a revisar' };

/**
 * Qué palabras son el nombre de pila: todas menos los dos apellidos (con 2 palabras o menos, solo la primera).
 * Devuelve cuántas palabras del principio forman el nombre.
 */
function nombresLargoDePila_(palabras) {
  return palabras.length >= 3 ? palabras.length - 2 : 1;
}

/**
 * Analiza un nombre de la Maestra y propone su forma oficial. `extra` (opcional) = { erratas, ajenas }:
 *   erratas: { PALABRA: 'CORRECCION' | ['si va en el nombre', 'si va en los apellidos'] } (errores vistos en la hoja);
 *   ajenas: ['PERSONAL', …] palabras que no son parte del nombre (se proponen quitar).
 * Devuelve { actual, propuesta, tipo, motivos[], habitual, cambia }:
 *   tipo '' si no hay nada que revisar; si es dudoso, `propuesta` lleva las opciones separadas por « o ».
 *   habitual: lo que pasaría a «Nombre habitual» (si estaba vacío) cuando el nombre de pila era un diminutivo.
 */
function nombresAnalizar_(nombre, extra) {
  const erratas = (extra && extra.erratas) || {};
  const ajenas = (extra && extra.ajenas) || [];
  const actual = String(nombre === null || nombre === undefined ? '' : nombre).trim();
  const motivos = [];
  let gravedad = 0;   // 0 nada, 1 seguro, 2 dudoso, 3 error
  const subir = function (g, motivo) { motivos.push(motivo); if (g > gravedad) gravedad = g; };

  const norm = normalizarNombreUsuario_(actual);
  if (!norm) return { actual: actual, propuesta: '', tipo: actual ? NOMBRES_TIPO_.ERROR : '', motivos: actual ? ['No tiene letras'] : [], habitual: '', cambia: false };
  if (norm !== actual) subir(1, 'Tildes, signos o espacios de más');

  const originales = norm.split(' ');
  let palabras = originales.slice();
  const largoPila = nombresLargoDePila_(palabras);
  let conDiminutivo = false;
  let dudoso = null;   // { indice, opciones }

  // 1. «M» delante = MARIA (sin nombre habitual). Si detrás va otro diminutivo («M MARUJA»), lo revisa el dueño.
  let conM = false;
  if (palabras.length > 1 && NOMBRES_M_MARIA_.indexOf(palabras[0]) !== -1) {
    conM = true;
    if (NOMBRES_DIMINUTIVOS_[palabras[1]] || palabras[1] === 'MARI') {
      subir(3, '«' + palabras[0] + '» delante de «' + palabras[1] + '»: ¿cuál es el nombre oficial?');
    } else {
      subir(1, '«' + palabras[0] + '» = MARIA');
    }
    palabras[0] = 'MARIA';
  }

  // 2. Diminutivos en el nombre de pila.
  for (let i = conM ? 1 : 0; i < largoPila; i++) {
    const p = palabras[i];
    if (p === 'MARI') {
      conDiminutivo = true;
      if (i + 1 < largoPila) { palabras[i] = 'MARIA'; subir(1, 'MARI = MARIA'); }
      else if (i > 0) { palabras[i] = 'MARIA'; subir(1, 'MARI = MARIA'); }
      else if (!dudoso) { dudoso = { indice: i, opciones: ['MARIA'] }; subir(2, 'MARI sola: ¿es MARIA? Míralo en el DNI o la SIP'); }
      continue;
    }
    const eq = NOMBRES_DIMINUTIVOS_[p];
    if (!eq) continue;
    conDiminutivo = true;
    if (typeof eq === 'string') { palabras[i] = eq; subir(1, p + ' = ' + eq); }
    else if (!dudoso) { dudoso = { indice: i, opciones: eq }; subir(2, p + ': ¿' + eq.join(' o ') + '? Míralo en el DNI o la SIP'); }
    else { subir(3, 'Dos nombres dudosos (' + palabras[dudoso.indice] + ' y ' + p + ')'); }
  }

  // 3. Abreviaturas, erratas vistas y palabras que no son del nombre.
  const salida = [];
  palabras.forEach(function (p, i) {
    if (NOMBRES_ABREVIATURAS_[p]) { subir(3, 'Abreviatura: ' + p + ' = ' + NOMBRES_ABREVIATURAS_[p]); salida.push(NOMBRES_ABREVIATURAS_[p]); return; }
    if (erratas[p]) {
      const e = erratas[p];
      const c = Array.isArray(e) ? (i < largoPila ? e[0] : e[1]) : e;
      subir(3, '¿Error al escribir? ' + p + ' → ' + c); salida.push(c); return;
    }
    if (ajenas.indexOf(p) !== -1) { subir(3, '«' + p + '» no parece parte del nombre'); return; }
    salida.push(p);
  });
  palabras = salida.join(' ').split(' ').filter(Boolean);

  // 4. Letras sueltas en medio («CARMEN M JOSE»), palabras repetidas y apellidos que faltan.
  palabras.forEach(function (p, i) {
    if (i > 0 && p.length === 1 && NOMBRES_PARTICULAS_.indexOf(p) === -1) {
      subir(3, 'Letra suelta «' + p + '»' + (p === 'M' ? ' (¿MARIA?)' : ''));
      if (p === 'M') palabras[i] = 'MARIA';
    }
  });
  const vistas = {};
  const n = palabras.length;
  // Dos apellidos iguales («RUIZ RUIZ») son normales: solo cuenta la repetición fuera de esa pareja («FIFI … FIFI»).
  palabras.slice(0, n >= 3 && palabras[n - 1] === palabras[n - 2] ? n - 1 : n).forEach(function (p) {
    if (NOMBRES_PARTICULAS_.indexOf(p) !== -1) return;
    if (vistas[p] === 1) subir(3, 'Palabra repetida: ' + p);
    vistas[p] = (vistas[p] || 0) + 1;
  });
  const sinParticulas = palabras.filter(function (p) { return NOMBRES_PARTICULAS_.indexOf(p) === -1; }).length;
  if (sinParticulas === 1) subir(3, 'Sin apellidos');
  else if (sinParticulas === 2) subir(3, 'Un solo apellido');

  let propuesta = palabras.join(' ');
  if (dudoso) {
    propuesta = dudoso.opciones.map(function (o) {
      const copia = palabras.slice(); copia[dudoso.indice] = o; return copia.join(' ');
    }).join(' o ');
  }

  // Nombre habitual: el nombre de pila tal como estaba, solo si era un diminutivo (los «M CARMEN» no).
  let habitual = '';
  if (conDiminutivo) {
    const pila = originales.slice(conM ? 1 : 0, largoPila);
    while (pila.length > 1 && NOMBRES_PARTICULAS_.indexOf(pila[pila.length - 1]) !== -1) pila.pop();
    habitual = pila.join(' ');
    if (conM) habitual = '';
  }

  const tipo = ['', NOMBRES_TIPO_.SEGURO, NOMBRES_TIPO_.DUDOSO, NOMBRES_TIPO_.ERROR][gravedad];
  return { actual: actual, propuesta: propuesta, tipo: tipo, motivos: motivos, habitual: habitual, cambia: !dudoso && propuesta !== actual };
}

/** Distancia de edición entre dos textos (cuántas letras hay que cambiar, quitar o poner). */
function nombresDistancia_(a, b) {
  if (a === b) return 0;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Posibles duplicados: mismos apellidos (o con una letra de diferencia) y un nombre de pila que contiene al otro
 * («MARI NIEVES PERAL FENOL» y «MARIA PERAL FENOLL»). `lista` = [{ id, nombre }] con el nombre YA en su forma propuesta
 * (sin diminutivos). Devuelve { id: [ids parecidos] }.
 */
function nombresPosiblesDuplicados_(lista) {
  const fichas = lista.map(function (u) {
    const p = normalizarNombreUsuario_(u.nombre).split(' ').filter(Boolean);
    if (p.length < 3) return null;
    return { id: u.id, pila: p.slice(0, p.length - 2), apellidos: p.slice(p.length - 2).join(' ') };
  }).filter(Boolean);
  const empieza = function (a, b) {   // ¿el nombre de pila corto es el principio del largo?
    const c = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
    return c.every(function (w, i) { return l[i] === w; });
  };
  const salida = {};
  const anotar = function (x, y) { (salida[x] = salida[x] || []).push(y); };
  for (let i = 0; i < fichas.length; i++) {
    for (let j = i + 1; j < fichas.length; j++) {
      const a = fichas[i], b = fichas[j];
      if (Math.abs(a.apellidos.length - b.apellidos.length) > 1) continue;
      if (!empieza(a.pila, b.pila)) continue;
      if (nombresDistancia_(a.apellidos, b.apellidos) > 1) continue;
      anotar(a.id, b.id); anotar(b.id, a.id);
    }
  }
  return salida;
}

/**
 * «M» o «Mª» como primera palabra = MARIA (decisión del dueño, 12-nov-2026). `texto` ya normalizado con la regla del
 * nombre (normalizarNombreUsuario_ / formatoNombreEscribiendo, que dejan «Mª» en «M»). Solo actúa si detrás hay un
 * espacio: así sirve también mientras se escribe («M » → «MARIA ») y deja en paz un «M» suelto o «MANOLO».
 */
function nombresMariaDelante_(texto) {
  const s = String(texto === null || texto === undefined ? '' : texto);
  const i = s.indexOf(' ');
  if (i <= 0) return s;
  return NOMBRES_M_MARIA_.indexOf(s.slice(0, i)) !== -1 ? 'MARIA' + s.slice(i) : s;
}

/**
 * Regla del NOMBRE OFICIAL (alta y «Editar»): la regla común del nombre (normalizarNombreUsuario_, core/Utils.gs) más
 * «M» delante = MARIA. En el navegador es formatoNombreOficialEscribiendo / formatoNombreOficialFinal
 * (ui/JS_Formato_Nombre), que usan esta misma nombresMariaDelante_ servida por incluirNombres_().
 * El «Nombre habitual» NO pasa por aquí: sigue solo la regla común.
 */
function normalizarNombreOficial_(texto) {
  return nombresMariaDelante_(normalizarNombreUsuario_(texto));
}

/**
 * Avisos SIN bloquear para el nombre que se escribe en el alta o en «Editar» (fase 3 de la sección 22):
 *   diminutivo conocido como primera palabra (seguro o dudoso), sin apellidos o con uno solo, y apellidos abreviados.
 * Devuelve una lista de { clave, texto, opciones, descartar }:
 *   texto: trozos de la frase; los de posición impar van resaltados (['¿El nombre oficial es ', 'MANUEL', '? …']).
 *   opciones: [{ etiqueta, nombre, habitual }] = botones que cambian el nombre (habitual = lo que pasaría a
 *     «Nombre habitual» si estaba vacío; '' si nada).
 *   descartar: texto del botón que lo da por bueno; clave: para no volver a enseñar un aviso ya descartado.
 */
function nombresAvisos_(nombre) {
  const palabras = normalizarNombreOficial_(nombre).split(' ').filter(Boolean);
  if (!palabras.length) return [];
  const avisos = [];
  const actual = palabras.join(' ');
  const largoPila = nombresLargoDePila_(palabras);
  const conPrimera = function (nueva) { return [nueva].concat(palabras.slice(1)).join(' '); };
  // Nombre habitual que correspondería: el nombre de pila tal como se ha escrito (sin partículas al final).
  const pila = palabras.slice(0, largoPila);
  while (pila.length > 1 && NOMBRES_PARTICULAS_.indexOf(pila[pila.length - 1]) !== -1) pila.pop();
  const habitual = pila.join(' ');

  // 1. Diminutivo como primera palabra.
  const p = palabras[0];
  let eq = NOMBRES_DIMINUTIVOS_[p];
  if (p === 'MARI') eq = largoPila > 1 ? 'MARIA' : ['MARIA'];   // MARI delante de otro nombre = MARIA; sola, dudosa
  if (typeof eq === 'string') {
    avisos.push({
      clave: 'diminutivo:' + actual,
      texto: ['¿El nombre oficial es ', eq, '? Escríbelo como en el DNI o la SIP.'],
      opciones: [{ etiqueta: 'Cambiar a ' + eq, nombre: conPrimera(eq), habitual: habitual }],
      descartar: 'Es su nombre real'
    });
  } else if (Array.isArray(eq)) {
    const texto = ['¿El nombre oficial es '];
    eq.forEach(function (o, i) { if (i) texto.push(i === eq.length - 1 ? ' o ' : ', '); texto.push(o); });
    texto.push('? Míralo en el DNI o la SIP.');
    avisos.push({
      clave: 'diminutivo:' + actual,
      texto: texto,
      opciones: eq.filter(function (o) { return o !== p; }).map(function (o) {
        return { etiqueta: o, nombre: conPrimera(o), habitual: habitual };
      }),
      descartar: 'Es su nombre real'
    });
  }

  // 2. Apellidos que faltan.
  const sinParticulas = palabras.filter(function (w) { return NOMBRES_PARTICULAS_.indexOf(w) === -1; }).length;
  if (sinParticulas === 1) {
    avisos.push({ clave: 'apellidos:' + actual, texto: ['Faltan los apellidos. Escríbelos como en el DNI o la SIP.'], opciones: [], descartar: 'Está bien así' });
  } else if (sinParticulas === 2) {
    avisos.push({ clave: 'apellidos:' + actual, texto: ['Solo hay un apellido. Si tiene dos, escríbelos como en el DNI o la SIP.'], opciones: [], descartar: 'Está bien así' });
  }

  // 3. Apellidos abreviados («GLEZ»).
  palabras.forEach(function (w, i) {
    const largo = NOMBRES_ABREVIATURAS_[w];
    if (!largo) return;
    const copia = palabras.slice(); copia[i] = largo;
    avisos.push({
      clave: 'abreviatura:' + w + ':' + actual,
      texto: ['«' + w + '» parece abreviado. ¿Es ', largo, '?'],
      opciones: [{ etiqueta: 'Cambiar a ' + largo, nombre: copia.join(' '), habitual: '' }],
      descartar: 'Está bien así'
    });
  });
  return avisos;
}

/**
 * Entrega al navegador las listas y funciones de nombres de este archivo (y normalizarNombreUsuario_, que usan) sin
 * copiarlas: escribe su mismo código. Se pone UNA vez por página, antes de ui/JS_Formato_Nombre y ui/JS_Aviso_Nombre
 * (como incluirEstados_). La app instalable la calcula al montar (pwa/build.js ejecuta este archivo y core/Utils.gs).
 */
function incluirNombres_() {
  const listas = { NOMBRES_DIMINUTIVOS_: NOMBRES_DIMINUTIVOS_, NOMBRES_ABREVIATURAS_: NOMBRES_ABREVIATURAS_,
    NOMBRES_PARTICULAS_: NOMBRES_PARTICULAS_, NOMBRES_M_MARIA_: NOMBRES_M_MARIA_ };
  const funciones = [normalizarNombreUsuario_, nombresLargoDePila_, nombresMariaDelante_, normalizarNombreOficial_, nombresAvisos_];
  let js = '';
  Object.keys(listas).forEach(function (k) { js += 'var ' + k + ' = ' + JSON.stringify(listas[k]) + ';\n'; });
  funciones.forEach(function (f) { js += f.toString() + '\n'; });
  return '<script>\n' + js.replace(/<\//g, '<\\/') + '</script>';
}
