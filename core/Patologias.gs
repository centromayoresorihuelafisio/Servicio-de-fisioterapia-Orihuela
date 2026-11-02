/**
 * core/Patologias.gs
 * LISTA OFICIAL de patologías (sección 15 de CONTEXTO.md; aprobada por el dueño el 1-nov-2026). Es la ÚNICA definición:
 * los formularios de alta y edición de usuario la leen de aquí (no tienen copias propias).
 *
 *   · En la hoja (columnas «Patología 1» y «Patología 2» de la Maestra) se sigue guardando el NOMBRE de la patología;
 *     el código CIE-10 se saca de esta lista (patologiaCodigo_).
 *   · Los nombres NO pueden llevar , ; / | · + : esos signos separan varias patologías en una misma celda
 *     (DASH_SEP_PATOLOGIA_ en dashboard/Dashboard_Datos.gs y el split(",") de usuarios/Panel_Editar).
 *   · «Otro diagnóstico (no listado)» es la salida para lo que no esté en la lista (código R69).
 *   · Para añadir, quitar o renombrar una patología se cambia SOLO esta lista.
 *
 * Cada grupo: { grupo, items: [[nombre, código CIE-10], …] }. El orden es el que se ve en los formularios.
 */
const PATOLOGIAS_GRUPOS = [
  { grupo: 'Columna', items: [
    ['Cervicalgia', 'M54.2'], ['Dorsalgia', 'M54.6'], ['Lumbalgia', 'M54.5'], ['Ciática', 'M54.3'],
    ['Cervicobraquialgia', 'M53.1'], ['Hernia discal cervical', 'M50.2'], ['Hernia discal lumbar', 'M51.2'],
    ['Radiculopatía cervical', 'M54.12'], ['Radiculopatía lumbar', 'M54.16'], ['Estenosis de canal', 'M48.0'],
    ['Espondilolistesis', 'M43.1'], ['Escoliosis', 'M41.9'], ['Disfunción sacroilíaca', 'M53.3']
  ] },
  { grupo: 'Cabeza y cuello', items: [
    ['Cefalea tensional o cervicogénica', 'G44.2'], ['Trastorno de la articulación de la mandíbula (ATM)', 'M26.6'],
    ['Vértigo posicional (VPPB)', 'H81.1']
  ] },
  { grupo: 'Hombro', items: [
    ['Omalgia', 'M25.51'], ['Síndrome subacromial (manguito rotador)', 'M75.1'], ['Capsulitis adhesiva (hombro congelado)', 'M75.0'],
    ['Bursitis o artrosis de hombro', 'M75.5'], ['Luxación de hombro', 'S43.0'], ['Prótesis de hombro', 'Z96.6']
  ] },
  { grupo: 'Codo y mano', items: [
    ['Epicondilitis', 'M77.1'], ['Túnel carpiano', 'G56.0'], ['Tendinitis de De Quervain', 'M65.4']
  ] },
  { grupo: 'Cadera', items: [
    ['Coxalgia', 'M25.55'], ['Coxartrosis', 'M16.9'], ['Bursitis trocantérea', 'M70.6'], ['Síndrome del piramidal', 'G57.0'],
    ['Prótesis de cadera', 'Z96.6']
  ] },
  { grupo: 'Rodilla', items: [
    ['Gonalgia', 'M25.56'], ['Gonartrosis', 'M17.9'], ['Lesión de menisco', 'S83.2'], ['Lesión de ligamento cruzado', 'S83.5'],
    ['Dolor femoropatelar', 'M22.2'], ['Prótesis de rodilla', 'Z96.6']
  ] },
  { grupo: 'Tobillo y pie', items: [
    ['Esguince de tobillo', 'S93.4'], ['Tendinopatía aquílea', 'M76.6'], ['Fascitis plantar', 'M72.2'], ['Hallux valgus', 'M20.1'],
    ['Pie plano', 'M21.4']
  ] },
  { grupo: 'Traumatismos', items: [
    ['Fractura de miembro superior', 'T10'], ['Fractura de miembro inferior', 'T12'], ['Fractura de cadera', 'S72.0'],
    ['Fractura vertebral', 'T08'], ['Esguince o luxación de otras zonas', 'T14.3'], ['Lesión muscular (desgarro o contractura)', 'M62.6'],
    ['Tendinopatía de otra localización', 'M77.9'], ['Traumatismo o contusión', 'T14.9'], ['Postoperatorio ortopédico', 'Z47.8']
  ] },
  { grupo: 'Reumática y dolor', items: [
    ['Artrosis generalizada', 'M15.9'], ['Artritis reumatoide', 'M06.9'], ['Osteoporosis', 'M81.9'], ['Fibromialgia', 'M79.7'],
    ['Síndrome de dolor miofascial', 'M79.1'], ['Dolor crónico', 'G89.4']
  ] },
  { grupo: 'Neurológicas', items: [
    ['Parkinson', 'G20'], ['Esclerosis múltiple', 'G35'], ['Esclerosis lateral amiotrófica (ELA)', 'G12.2'], ['Ictus (secuelas)', 'I69.4'],
    ['Neuropatía periférica', 'G62.9']
  ] },
  { grupo: 'Función', items: [
    ['Debilidad muscular', 'M62.8'], ['Alteración de la marcha', 'R26.2'], ['Alteración del equilibrio', 'R26.8'],
    ['Fragilidad o deterioro funcional', 'R54']
  ] },
  { grupo: 'Otras', items: [
    ['Linfedema', 'I89.0'], ['Cardiopatía', 'I51.9'], ['EPOC', 'J44.9'], ['Otra enfermedad respiratoria', 'J98.9'], ['Cáncer', 'C80.9'],
    ['Otro diagnóstico (no listado)', 'R69']
  ] }
];

/** Lista plana en el orden de los formularios: [{ nombre, codigo, grupo }]. */
function patologiasLista_() {
  const out = [];
  PATOLOGIAS_GRUPOS.forEach(g => g.items.forEach(it => out.push({ nombre: it[0], codigo: it[1], grupo: g.grupo })));
  return out;
}

/** Código CIE-10 de una patología por su nombre (sin tildes ni mayúsculas); '' si no está en la lista. */
function patologiaCodigo_(nombre) {
  const n = normalizarTexto_(nombre);
  const hallada = patologiasLista_().filter(p => normalizarTexto_(p.nombre) === n)[0];
  return hallada ? hallada.codigo : '';
}

/**
 * Entrega la lista a la página como variable global del navegador (PATOLOGIAS_LISTA: [{ nombre, codigo, grupo }]).
 * Se pone UNA vez por página, antes de los paneles que la usan (usuarios/Panel_Nuevo y usuarios/Panel_Editar).
 * Mismo método que incluirEstados_() de core/WebApp.gs.
 */
function incluirPatologias_() {
  return '<script>var PATOLOGIAS_LISTA = ' + JSON.stringify(patologiasLista_()) + ';</script>';
}
