// comprobar/nombres.mjs
// Prueba fuera de Google de la lógica de nombres oficiales (CONTEXTO.md, sección 22): core/Nombres_Oficiales.gs
// y el saludo de usuarios/Whatsapp.gs. Datos inventados.
// Uso: node comprobar/nombres.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['core/Utils.gs', 'core/Nombres_Oficiales.gs', 'usuarios/Whatsapp.gs']) {
  vm.runInContext(readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f });
}
const run = expr => vm.runInContext(expr, ctx);
const EXTRA = { erratas: { DELMORAL: 'DEL MORAL', ASCENSIO: ['ASCENSION', 'ASENSIO'] }, ajenas: ['PERSONAL'] };
const analizar = (n, extra) => run(`nombresAnalizar_(${JSON.stringify(n)}, ${extra ? JSON.stringify(EXTRA) : 'undefined'})`);

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
caso('ASCENSIO LOPEZ RUIZ', { propuesta: 'ASCENSION LOPEZ RUIZ' });
caso('PEDRO ASCENSIO RUIZ', { propuesta: 'PEDRO ASENSIO RUIZ' });
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
