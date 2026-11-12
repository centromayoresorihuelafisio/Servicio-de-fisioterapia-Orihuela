// comprobar/nombres.mjs
// Prueba fuera de Google de la lógica de nombres oficiales (CONTEXTO.md, sección 22): core/Nombres_Oficiales.gs,
// la parte pura de herramientas/Revisar_Nombres.gs y el saludo de usuarios/Whatsapp.gs. Datos inventados.
// Uso: node comprobar/nombres.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['core/Utils.gs', 'core/Nombres_Oficiales.gs', 'herramientas/Revisar_Nombres.gs', 'usuarios/Whatsapp.gs']) {
  vm.runInContext(readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f });
}
const run = expr => vm.runInContext(expr, ctx);
const analizar = (n, extra) => run(`nombresAnalizar_(${JSON.stringify(n)}, ${extra ? 'REV_NOMBRES_EXTRA_' : 'undefined'})`);

let fallos = 0, pruebas = 0;
function ok(cond, texto, extra) {
  pruebas++;
  if (cond) console.log('  [OK] ' + texto);
  else { fallos++; console.log('  [FALLA] ' + texto + (extra ? '\n         ' + JSON.stringify(extra) : '')); }
}
function caso(nombre, esperado, conExtra = true) {
  const r = analizar(nombre, conExtra);
  const bien = Object.entries(esperado).every(([k, v]) => k === 'motivo' ? r.motivos.some(m => m.includes(v)) : r[k] === v);
  ok(bien, `${nombre} → ${esperado.propuesta ?? r.propuesta} (${esperado.tipo ?? r.tipo})`, r);
}

console.log('Seguros');
caso('M CARMEN LOPEZ GARCIA', { propuesta: 'MARIA CARMEN LOPEZ GARCIA', tipo: 'seguro', habitual: '', cambia: true });
caso('Mª JOSE RUIZ SOLER', { propuesta: 'MARIA JOSE RUIZ SOLER', tipo: 'seguro', habitual: '' });
caso('MANOLO PEREZ MARTINEZ', { propuesta: 'MANUEL PEREZ MARTINEZ', tipo: 'seguro', habitual: 'MANOLO' });
caso('PAQUITA SOLER RUIZ', { propuesta: 'FRANCISCA SOLER RUIZ', tipo: 'seguro', habitual: 'PAQUITA' });
caso('PEPE GIL ROS', { propuesta: 'JOSE GIL ROS', habitual: 'PEPE' });
caso('CHARO MOLINA PEREZ', { propuesta: 'ROSARIO MOLINA PEREZ' });
caso('MONSE ALCARAZ GIL', { propuesta: 'MONSERRATE ALCARAZ GIL', tipo: 'seguro' });
caso('MAMEN ROCAMORA SANZ', { propuesta: 'MARIA CARMEN ROCAMORA SANZ', tipo: 'seguro', habitual: 'MAMEN' });
caso('MARICARMEN BAEZA SOTO', { propuesta: 'MARIA CARMEN BAEZA SOTO', habitual: 'MARICARMEN' });
caso('MARIBEL CANO RUIZ', { propuesta: 'MARIA ISABEL CANO RUIZ' });
caso('ROSAMARI LOPEZ PEREZ', { propuesta: 'ROSA MARIA LOPEZ PEREZ', habitual: 'ROSAMARI' });
caso('MARI CARMEN LOPEZ GARCIA', { propuesta: 'MARIA CARMEN LOPEZ GARCIA', tipo: 'seguro', habitual: 'MARI CARMEN' });
caso('ROSA MARI SOTO GIL', { propuesta: 'ROSA MARIA SOTO GIL', tipo: 'seguro', habitual: 'ROSA MARI' });
caso('TOÑI MUÑOZ PEREZ', { propuesta: 'ANTONIA MUÑOZ PEREZ' });
caso('EMMA DEL AMO GARCÍA', { propuesta: 'EMMA DEL AMO GARCIA', tipo: 'seguro', motivo: 'Tildes' });
caso('CONCHA PEREZ CONCHA', { propuesta: 'CONCEPCION PEREZ CONCHA' });   // el apellido no se toca

console.log('Sin nada que revisar');
caso('MARIA CARMEN LOPEZ GARCIA', { tipo: '', cambia: false });
caso('MARIA PERAL FENOLL', { tipo: '' });
caso('JOSE ANTONIO DELGADO SOLER', { tipo: '' });

console.log('Dudosos (el dueño decide)');
caso('FINA ORTS LLOR', { propuesta: 'JOSEFA ORTS LLOR o JOSEFINA ORTS LLOR', tipo: 'dudoso', habitual: 'FINA', cambia: false });
caso('MARI SOLER GIL', { propuesta: 'MARIA SOLER GIL', tipo: 'dudoso', habitual: 'MARI' });
caso('ANGELINES RUIZ RUIZ', { tipo: 'dudoso', motivo: 'ANGELINES' });   // dos apellidos iguales no son error
caso('LLANOS PEREZ ROS', { propuesta: 'MARIA DE LOS LLANOS PEREZ ROS o LLANOS PEREZ ROS', tipo: 'dudoso' });

console.log('Errores a revisar');
caso('ANA GLEZ PEREZ', { propuesta: 'ANA GONZALEZ PEREZ', tipo: 'error a revisar', motivo: 'GLEZ' });
caso('LUIS GOMEZ DELMORAL', { propuesta: 'LUIS GOMEZ DEL MORAL', tipo: 'error a revisar' });
caso('COSTANZA ROS GIL', { propuesta: 'CONSTANZA ROS GIL', tipo: 'error a revisar' });
caso('ASCENSIO LOPEZ RUIZ', { propuesta: 'ASCENSION LOPEZ RUIZ' });
caso('PEDRO ASCENSIO RUIZ', { propuesta: 'PEDRO ASENSIO RUIZ' });
caso('JUAN BAUTIS GIL SOLER', { propuesta: 'JUAN BAUTISTA GIL SOLER' });
caso('PEDRO SOLER', { tipo: 'error a revisar', motivo: 'Un solo apellido' });
caso('FIFI TORA ROCAMORA FIFI', { tipo: 'error a revisar', motivo: 'repetida' });
caso('MARICARMEN BALLESTER PERSONAL', { propuesta: 'MARIA CARMEN BALLESTER', tipo: 'error a revisar', motivo: 'PERSONAL' });
caso('M MARUJA MONSERRATE GIL', { tipo: 'error a revisar', motivo: 'MARUJA' });
caso('CARMEN M JOSE PEREZ GIL', { propuesta: 'CARMEN MARIA JOSE PEREZ GIL', tipo: 'error a revisar', motivo: 'Letra suelta' });
caso('MANOLO GLEZ RUIZ', { propuesta: 'MANUEL GONZALEZ RUIZ', tipo: 'error a revisar', habitual: 'MANOLO' });

console.log('Posibles duplicados');
const dup = run(`nombresPosiblesDuplicados_([
  { id: 'a', nombre: 'MARIA NIEVES PERAL FENOL' }, { id: 'b', nombre: 'MARIA PERAL FENOLL' },
  { id: 'c', nombre: 'MARIA JOSE GARCIA LOPEZ' }, { id: 'd', nombre: 'MARIA DOLORES GARCIA LOPEZ' }])`);
ok(JSON.stringify(dup) === JSON.stringify({ a: ['b'], b: ['a'] }), 'MARI NIEVES PERAL FENOL ~ MARIA PERAL FENOLL; dos hermanas MARIA JOSE / MARIA DOLORES no', dup);

console.log('Pestaña «Revisión nombres»');
const usuarios = [
  { id: 'u1', nombre: 'MANOLO PEREZ MARTINEZ', habitual: '' },
  { id: 'u2', nombre: 'FINA ORTS LLOR', habitual: '' },
  { id: 'u3', nombre: 'MARIA CARMEN LOPEZ GARCIA', habitual: '' },
  { id: 'u4', nombre: 'PAQUI SOLER RUIZ', habitual: 'PAQUITA' },
  { id: 'u5', nombre: 'MARI NIEVES PERAL FENOL', habitual: '' },
  { id: 'u6', nombre: 'MARIA PERAL FENOLL', habitual: '' },
  { id: '', nombre: 'PEPE SIN ID', habitual: '' },
];
let r = run(`revNombresCalcular_(${JSON.stringify(usuarios)}, {})`);
const porId = Object.fromEntries(r.filas.map(f => [f[0], f]));
ok(!porId.u3, 'Un nombre ya oficial no sale');
ok(porId.u1 && porId.u1[6] === 'MANUEL PEREZ MARTINEZ' && porId.u1[5] === 'MANOLO', 'Seguro: «Nombre definitivo» ya relleno y nombre habitual MANOLO', porId.u1);
ok(porId.u2 && porId.u2[6] === '' && porId.u2[3] === 'dudoso', 'Dudoso: «Nombre definitivo» vacío', porId.u2);
ok(porId.u4 && porId.u4[5] === '' && porId.u4[4].includes('Ya tiene nombre habitual'), 'Si ya tiene nombre habitual no se propone otro', porId.u4);
ok(porId.u5 && porId.u5[3] === 'error a revisar' && porId.u5[6] === '' && porId.u5[4].includes('MARIA PERAL FENOLL'), 'Posible duplicado: pasa a error a revisar y sin nombre definitivo', porId.u5);
ok(porId.u6 && porId.u6[2] === '' && porId.u6[4].includes('¿Duplicado?'), 'El otro del par sale sin propuesta de cambio', porId.u6);
ok(r.resumen.sinId === 1 && !r.filas.some(f => f[1] === 'PEPE SIN ID'), 'Sin ID paciente no se lista');
ok(r.filas.map(f => f[3]).join() === 'seguro,seguro,dudoso,error a revisar,error a revisar', 'Orden: seguros, dudosos, errores', r.filas.map(f => f[3]));
r = run(`revNombresCalcular_(${JSON.stringify(usuarios)}, { u2: { actual: 'FINA ORTS LLOR', definitivo: 'JOSEFA ORTS LLOR' }, u1: { actual: 'OTRO', definitivo: 'X' } })`);
const porId2 = Object.fromEntries(r.filas.map(f => [f[0], f]));
ok(porId2.u2[6] === 'JOSEFA ORTS LLOR' && porId2.u1[6] === 'MANUEL PEREZ MARTINEZ', 'Al rehacer se conserva lo escrito por el dueño (si el nombre no cambió)');
const sinCol = run(`revNombresCalcular_([{ id: 'z', nombre: 'MANOLO GIL ROS', habitual: null }], {})`);
ok(sinCol.filas[0][5] === '' && !sinCol.filas[0][4].includes('Ya tiene'), 'Sin columna «Nombre habitual» no se propone ninguno', sinCol.filas[0]);

console.log('Aplicar');
const fila = (actual, definitivo, habitual) => ['u', actual, '', '', '', habitual, definitivo, ''];
const decidir = (f, m) => run(`revNombresDecidir_(${JSON.stringify(f)}, ${JSON.stringify(m)})`);
let d = decidir(fila('MANOLO PEREZ MARTINEZ', 'Manuel Pérez Martínez', 'MANOLO'), { nombre: 'MANOLO PEREZ MARTINEZ', habitual: '', hayHabitual: true });
ok(d.nombre === 'MANUEL PEREZ MARTINEZ' && d.habitual === 'MANOLO', 'Cambia el nombre (normalizado) y guarda el nombre habitual', d);
d = decidir(fila('MANOLO PEREZ MARTINEZ', 'MANUEL PEREZ MARTINEZ', 'MANOLO'), { nombre: 'MANUEL PEREZ MARTINEZ', habitual: 'MANOLO', hayHabitual: true });
ok(d.nombre === null && d.habitual === null && d.resultado === 'Ya estaba así', 'Repetir no cambia nada', d);
d = decidir(fila('MANOLO PEREZ MARTINEZ', 'MANUEL PEREZ MARTINEZ', 'MANOLO'), { nombre: 'MANOLO PERES MARTINEZ', habitual: '', hayHabitual: true });
ok(d.nombre === null && d.habitual === null && d.resultado.includes('cambió'), 'Si el nombre cambió en la hoja tras la revisión, no se toca', d);
d = decidir(fila('M CARMEN GIL ROS', 'MARIA CARMEN GIL ROS', ''), { nombre: 'M CARMEN GIL ROS', habitual: '', hayHabitual: true });
ok(d.nombre === 'MARIA CARMEN GIL ROS' && d.habitual === null, '«M CARMEN»: sin nombre habitual', d);
d = decidir(fila('PAQUI SOLER RUIZ', 'FRANCISCA SOLER RUIZ', 'PAQUI'), { nombre: 'PAQUI SOLER RUIZ', habitual: 'PAQUITA', hayHabitual: true });
ok(d.nombre === 'FRANCISCA SOLER RUIZ' && d.habitual === null, 'No pisa un nombre habitual que ya existe', d);
d = decidir(fila('LLANOS PEREZ ROS', 'LLANOS PEREZ ROS', 'LLANOS'), { nombre: 'LLANOS PEREZ ROS', habitual: '', hayHabitual: true });
ok(d.habitual === null, 'Si el dueño deja el mismo nombre, no copia el nombre habitual', d);
d = decidir(fila('X', '123', ''), { nombre: 'X', habitual: '', hayHabitual: true });
ok(d.nombre === null && d.resultado.includes('sin letras'), 'Un nombre definitivo sin letras no se aplica', d);

console.log('Saludo de WhatsApp');
const saludo = n => run(`_primerNombreWhatsapp_(${JSON.stringify(n)})`);
for (const [n, s] of [
  ['MARIA CARMEN LOPEZ GARCIA', 'Maria Carmen'], ['MARIA DEL CARMEN LOPEZ GARCIA', 'Maria del Carmen'],
  ['MARIA DE LOS ANGELES RUIZ SOLER', 'Maria de los Angeles'], ['MARIA PERAL FENOLL', 'Maria'],
  ['MARÍA JOSÉ RUIZ SOLER', 'María José'], ['M CARMEN LOPEZ GARCIA', 'M Carmen'], ['MANUEL PEREZ MARTINEZ', 'Manuel'],
  ['JOSE ANTONIO PEREZ GIL', 'Jose'], ['MARIA CARMEN DE LA CRUZ', 'Maria Carmen'], ['', ''],
]) ok(saludo(n) === s, `«${n}» → «${s}»`, saludo(n));

console.log(`\n${pruebas - fallos} de ${pruebas} pruebas correctas.`);
process.exit(fallos ? 1 : 0);
