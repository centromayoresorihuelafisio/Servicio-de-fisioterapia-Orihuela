// comprobar/sin_citas.mjs
// Prueba fuera de Google del aviso «sin citas» (usuarios/Sin_Citas.gs, sección 23 de CONTEXTO.md). Datos inventados.
// Uso: node comprobar/sin_citas.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['historia/HC_Web.gs', 'usuarios/Sin_Citas.gs']) {
  vm.runInContext(readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f });
}
let fallos = 0, pruebas = 0;
function ok(cond, texto, extra) {
  pruebas++;
  if (cond) console.log('  [OK] ' + texto);
  else { fallos++; console.log('  [FALLA] ' + texto + (extra ? '\n         ' + JSON.stringify(extra) : '')); }
}

const episodios = {
  A: [{ ingreso: '2026-10-01', alta: '' }],                                        // última cita hace 18 días → aviso
  B: [{ ingreso: '2026-10-01', alta: '' }],                                        // tiene cita futura → no
  C: [{ ingreso: '2026-10-01', alta: '' }],                                        // sin citas desde el inicio → aviso por inicio
  D: [{ ingreso: '2026-11-01', alta: '' }],                                        // inicio hace 12 días, sin citas → no
  E: [{ ingreso: '2026-01-01', alta: '2026-04-01' }],                              // episodio cerrado → no
  F: [{ ingreso: '2026-01-01', alta: '2026-04-01' }, { ingreso: '', alta: '' }],   // nuevo episodio sin empezar (en espera) → no
  G: [{ ingreso: '2026-10-01', alta: '' }],                                        // última cita hace 13 días → no
  H: [{ ingreso: '2026-10-01', alta: '' }],                                        // cita hoy → no
  I: [{ ingreso: '2026-10-20', alta: '' }, { ingreso: '2025-01-01', alta: '2025-03-01' }],  // citas de antes del inicio no cuentan
};
const citas = {
  A: ['2026-10-01', '2026-10-26'], B: ['2026-10-01', '2026-11-20'], G: ['2026-10-31'], H: ['2026-10-01', '2026-11-13'],
  I: ['2025-02-01'],
};
const r = vm.runInContext(`sinCitasCalcular_(${JSON.stringify(episodios)}, ${JSON.stringify(citas)}, '2026-11-13', 14)`, ctx);
ok(r.A && r.A.dias === 18 && r.A.desde === '2026-10-26' && r.A.porInicio === false, 'Última cita hace 18 días: aviso', r.A);
ok(!r.B, 'Con cita más adelante: sin aviso');
ok(r.C && r.C.dias === 43 && r.C.porInicio === true, 'Sin citas desde el inicio: aviso contado desde el inicio', r.C);
ok(!r.D, 'Inicio hace 12 días: todavía no');
ok(!r.E, 'Episodio cerrado: sin aviso');
ok(!r.F, 'Episodio nuevo sin empezar: sin aviso');
ok(!r.G, 'Última cita hace 13 días: todavía no');
ok(!r.H, 'Cita hoy: sin aviso');
ok(r.I && r.I.desde === '2026-10-20' && r.I.porInicio, 'Las citas de un episodio anterior no cuentan', r.I);
ok(Object.keys(r).sort().join() === 'A,C,I', 'Solo A, C e I', Object.keys(r));

console.log(`\n${pruebas - fallos} de ${pruebas} pruebas bien.` + (fallos ? ` FALLAN ${fallos}.` : ''));
process.exit(fallos ? 1 : 0);
