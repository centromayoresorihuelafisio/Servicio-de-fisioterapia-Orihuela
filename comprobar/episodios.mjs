// comprobar/episodios.mjs
// Prueba fuera de Google de la herramienta de un solo uso herramientas/Cerrar_Episodios_Olvidados.gs. Datos inventados.
// Uso: node comprobar/episodios.mjs   (se retira junto con la herramienta)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['core/Config.gs', 'herramientas/Cerrar_Episodios_Olvidados.gs']) {
  vm.runInContext(readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f });
}
const run = expr => vm.runInContext(expr, ctx);
let fallos = 0, pruebas = 0;
function ok(cond, texto, extra) {
  pruebas++;
  if (cond) console.log('  [OK] ' + texto);
  else { fallos++; console.log('  [FALLA] ' + texto + (extra ? '\n         ' + JSON.stringify(extra) : '')); }
}

console.log('Sumar meses');
const suma = (iso, n) => run(`epiOlvSumarMeses_(${JSON.stringify(iso)}, ${n})`);
ok(suma('2026-01-15', 3) === '2026-04-15', '15-ene + 3 = 15-abr');
ok(suma('2025-11-30', 3) === '2026-02-28', '30-nov + 3 = 28-feb');
ok(suma('2023-11-30', 3) === '2024-02-29', '30-nov-2023 + 3 = 29-feb (bisiesto)');
ok(suma('2026-11-13', -8) === '2026-03-13', '13-nov − 8 = 13-mar');
ok(suma('2026-10-31', 3) === '2027-01-31', 'cambio de año');

console.log('Revisión');
const episodios = [
  { idHC: 'H1', ingreso: '2026-01-10', alta: '' },            // Activo, sin citas después → Listo
  { idHC: 'H2', ingreso: '2026-02-01', alta: '' },            // citas después del alta → Revisar
  { idHC: 'H3', ingreso: '2026-03-12', alta: '' },            // un día antes del corte → entra
  { idHC: 'H4', ingreso: '2026-03-13', alta: '' },            // el día del corte → no entra (no tiene más de 8 meses)
  { idHC: 'H5', ingreso: '2025-12-01', alta: '' },            // En espera → Revisar
  { idHC: 'H6', ingreso: '2025-09-01', alta: '' },            // con episodio posterior → Listo, solo episodio
  { idHC: 'H6', ingreso: '2026-09-01', alta: '' },
  { idHC: 'H7', ingreso: '2025-10-01', alta: '2026-01-01' },  // cerrado → no entra
  { idHC: 'H8', ingreso: '2025-10-01', alta: '' },            // sin ID paciente → Revisar
  { idHC: 'H9', ingreso: '2025-10-01', alta: '' },            // ya en Alta → Listo
];
const pacienteDeHC = { H1: 'P1', H2: 'P2', H3: 'P3', H4: 'P4', H5: 'P5', H6: 'P6', H7: 'P7', H9: 'P9' };
const usuarios = {
  P1: { nombre: 'ANA UNO', estado: 'Activo' }, P2: { nombre: 'BEA DOS', estado: 'Activo' }, P3: { nombre: 'CARLA TRES', estado: 'Activo' },
  P4: { nombre: 'DORA CUATRO', estado: 'Activo' }, P5: { nombre: 'EVA CINCO', estado: 'En espera' }, P6: { nombre: 'FE SEIS', estado: 'Activo' },
  P7: { nombre: 'GEMA SIETE', estado: 'Alta' }, P9: { nombre: 'INES NUEVE', estado: 'Alta' },
};
const citas = { P1: ['2026-01-10', '2026-04-10'], P2: ['2026-02-01', '2026-06-01', '2026-07-01'] };
const r = run(`epiOlvCalcular_(${JSON.stringify(episodios)}, ${JSON.stringify(pacienteDeHC)}, ${JSON.stringify(usuarios)}, ${JSON.stringify(citas)}, '2026-11-13')`);
const fila = idHC => r.filas.find(f => f[0] === idHC);
ok(r.resumen.abiertosAntiguos === 7, '7 episodios abiertos antiguos', r.resumen);
ok(fila('H1') && fila('H1')[2] === 'Listo' && fila('H1')[6] === '10/04/2026' && fila('H1')[10] === 'Sí', 'Activo sin citas después: Listo, alta 10/04/2026', fila('H1'));
ok(fila('H2') && fila('H2')[2] === 'Revisar' && fila('H2')[7] === 2 && fila('H2')[8] === '01/07/2026', 'Citas después: Revisar, 2 citas, última 01/07/2026', fila('H2'));
ok(!!fila('H3') && !fila('H4'), 'El corte es estricto: más de 8 meses');
ok(fila('H5') && fila('H5')[2] === 'Revisar' && fila('H5')[10] === '', 'En espera: Revisar', fila('H5'));
const h6 = r.filas.filter(f => f[0] === 'H6');
ok(h6.length === 1 && h6[0][5] === '01/09/2025' && h6[0][10] === 'Sí' && /posterior/.test(h6[0][9]), 'Episodio con otro posterior: Listo, solo ese', h6);
ok(!fila('H7'), 'Episodio cerrado: no sale');
ok(fila('H8') && fila('H8')[2] === 'Revisar' && /ID paciente/.test(fila('H8')[9]), 'Sin ID paciente: Revisar', fila('H8'));
ok(fila('H9') && fila('H9')[10] === 'Sí' && /Ya está en Alta/.test(fila('H9')[9]), 'Ya en Alta: Listo, solo episodio', fila('H9'));
ok(r.filas[0][2] === 'Revisar' && r.filas[r.filas.length - 1][2] === 'Listo', 'Primero «Revisar», luego «Listo»');

console.log(`\n${pruebas - fallos} de ${pruebas} pruebas bien.` + (fallos ? ` FALLAN ${fallos}.` : ''));
process.exit(fallos ? 1 : 0);
