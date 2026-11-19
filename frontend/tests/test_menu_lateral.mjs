/**
 * frontend/tests/test_menu_lateral.mjs
 * B4.1 T10 (P3): el menú lateral se pliega o se superpone en pantallas angostas. La regla vive en lib/menu-lateral.js
 * (menuLateralEfectivo y alternarMenu) y el Sidebar la lee: por debajo de 768 px el menú va plegado (80 px) y, al
 * abrirlo, flota encima de la página (capa con fondo que la cierra; también Esc y un cambio de ruta). Pre-flight H28:
 * toda lectura de render del Sidebar usa `plegado`; `isCollapsed` queda solo en el estado, el alternado y
 * menuLateralEfectivo.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANCHO_MENU_ANGOSTO, menuLateralEfectivo, alternarMenu } from '../src/lib/menu-lateral.js';

console.log('--- B4.1 T10 (P3): el menú lateral se pliega o se superpone en pantallas angostas ---');
{
  assert.equal(ANCHO_MENU_ANGOSTO, 768);
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: false }), { plegado: true, superpuesto: false });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: true }), { plegado: false, superpuesto: true });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 1024, plegadoElegido: true, abiertoEnAngosta: true }), { plegado: true, superpuesto: false });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: null, plegadoElegido: false, abiertoEnAngosta: false }), { plegado: false, superpuesto: false });
  assert.deepEqual(alternarMenu({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: false }), { plegadoElegido: false, abiertoEnAngosta: true });
  assert.deepEqual(alternarMenu({ anchoVentana: 1440, plegadoElegido: false, abiertoEnAngosta: false }), { plegadoElegido: true, abiertoEnAngosta: false });
  const s = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(s, /menuLateralEfectivo\(\{ anchoVentana, plegadoElegido: isCollapsed, abiertoEnAngosta \}\)/);
  assert.ok(!/\{!isCollapsed &&/.test(s), 'los textos siguen al plegado efectivo');
  // Pre-flight H28: ni las clases, ni los títulos, ni los íconos leen el estado elegido (a 375 seguirían «abiertos»).
  assert.ok(!/isCollapsed \?/.test(s), 'los ternarios de render leen plegado, no isCollapsed');
  assert.match(s, /<AlertasBadge colapsado=\{plegado\} \/>/);
  assert.match(s, /max-md:w-20/, 'antes de hidratar, a 375 el menú ya mide 80 px');
  assert.match(s, /aria-label="Cerrar el menú"/, 'el fondo que cierra la capa');
  assert.match(s, /e\.key === 'Escape'/, 'Esc cierra la capa');
}

console.log('--- B4.1 T10 (P3): los bordes de la regla (767/768, alternar en angosto y antes de hidratar) ---');
{
  // 767 ya es angosto; 768 no (el mismo corte que md: de Tailwind).
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 767, plegadoElegido: false, abiertoEnAngosta: false }), { plegado: true, superpuesto: false });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 768, plegadoElegido: false, abiertoEnAngosta: true }), { plegado: false, superpuesto: false });
  // Antes de hidratar manda lo elegido, nunca la capa.
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: null, plegadoElegido: true, abiertoEnAngosta: true }), { plegado: true, superpuesto: false });
  // En angosto, alternar abre y cierra la capa sin tocar lo elegido para pantallas anchas.
  assert.deepEqual(alternarMenu({ anchoVentana: 375, plegadoElegido: true, abiertoEnAngosta: true }), { plegadoElegido: true, abiertoEnAngosta: false });
  assert.deepEqual(alternarMenu({ anchoVentana: 1024, plegadoElegido: true, abiertoEnAngosta: false }), { plegadoElegido: false, abiertoEnAngosta: false });
}

console.log('--- B4.1 T10 (P3): el Sidebar cablea la capa (hueco de 80 px, fondo, alternarMenu y la ruta) ---');
{
  const s = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(s, /^import \{ useAnchoVentana \} from '@\/components\/ui\/useAnchoVentana';$/m, 'el hook de ancho de T8 (sin otro)');
  assert.match(s, /^import \{ alternarMenu, menuLateralEfectivo \} from '@\/lib\/menu-lateral';$/m);
  assert.match(s, /const anchoVentana = useAnchoVentana\(\);/);
  assert.match(s, /const \[abiertoEnAngosta, setAbiertoEnAngosta\] = useState\(false\);/);
  assert.match(s, /const \{ plegado, superpuesto \} = menuLateralEfectivo\(/);
  assert.match(s, /alternarMenu\(\{ anchoVentana, plegadoElegido: isCollapsed, abiertoEnAngosta \}\)/, 'los dos botones alternan con la regla');
  assert.equal((s.match(/onClick=\{handleToggleCollapse\}/g) ?? []).length, 2, 'los dos botones de plegar');
  assert.ok(s.includes("'fixed inset-y-0 left-0 z-50 w-64 shadow-xl'"), 'superpuesto: flota encima, a 256 px');
  assert.ok(s.includes('<div aria-hidden="true" className="w-20 shrink-0" />'), 'el hueco de 80 px: la página no salta');
  assert.ok(s.includes('className="fixed inset-0 z-40 bg-slate-900/30"'), 'el fondo de la capa');
  assert.ok(s.includes("${plegado ? 'w-20' : 'w-64'} max-md:w-20"), 'sin superponer: el ancho del plegado efectivo');
  // Un cambio de ruta cierra la capa (un enlace del submenú navega sin recargar).
  assert.match(s, /if \(rutaDeLaCapa !== pathname\) \{/);
  // Lo que pinta lee plegado: los nueve textos y la pastilla del aviso.
  assert.equal((s.match(/\{!plegado && /g) ?? []).length, 9, 'los nueve textos del menú');
  // isCollapsed solo en el estado, el alternado y la regla (3 lecturas en el código: useState, alternarMenu y
  // menuLateralEfectivo). Sin comentarios: lo que cuenta es el código.
  const codigo = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual(codigo.match(/\bisCollapsed\b/g), ['isCollapsed', 'isCollapsed', 'isCollapsed']);
}

console.log('\nOK: test_menu_lateral.mjs');
