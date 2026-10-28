/**
 * frontend/tests/test_entregas.mjs
 * Bloque 4, T3C (KANBAN-logistica punto 3, R15, C19, RP22): el tablero y las pestañas de Entregas (lib/entregas.js).
 * Cuatro columnas servidas con estados + saldo de /ventas/pedidos (Esperando mercancía · Listo pero falta saldo · Listo
 * para despachar · Despachados); los cancelados y devueltos no aparecen en ninguna; despachar solo desde «Listo para
 * despachar» y Bodega solo despacha. El monto del bloqueo va con formatoPesos.
 */

import assert from 'node:assert/strict';
import { columnaEntrega, COLUMNAS_ENTREGA, reglaSoltarEntrega } from '../src/lib/entregas.js';
import { ESTADOS_PEDIDO, ESTADOS_PEDIDO_OPERATIVOS, pasoPedido } from '../src/lib/estados-pedido.js';
import { mapaDestinos } from '../src/lib/kanban.js';
import { enlaceDocumento } from '../src/lib/analisis.js';

const PASO_2 = ['LISTO_ENTREGA', 'DISPONIBLE', 'PENDIENTE_SALDO', 'LISTO_PARA_ENTREGA'];

console.log('--- TEST 1: COLUMNAS_ENTREGA: títulos de R15, estados y saldo de RP22 ---');
{
  assert.deepEqual(COLUMNAS_ENTREGA.map((c) => [c.clave, c.titulo, c.estados, c.saldo, c.cerrada]), [
    ['esperando', 'Esperando mercancía', ['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO'], null, false],
    ['falta_saldo', 'Listo pero falta saldo', PASO_2, 'pendiente', false],
    ['listo', 'Listo para despachar', PASO_2, 'pagado', false],
    ['despachado', 'Despachados', ['ENTREGADO', 'PARCIALMENTE_ENTREGADO', 'FACTURADO'], null, true],
  ]);
  assert.ok(Object.isFrozen(COLUMNAS_ENTREGA) && Object.isFrozen(COLUMNAS_ENTREGA[1].estados));
  // Esperando = los operativos que no están en el paso 2; las dos «Listo» = el paso 2 sin PARCIALMENTE_ENTREGADO.
  assert.deepEqual(COLUMNAS_ENTREGA[0].estados, ESTADOS_PEDIDO_OPERATIVOS.filter((e) => pasoPedido(e) !== 2));
  assert.deepEqual(PASO_2, Object.keys(ESTADOS_PEDIDO).filter((e) => pasoPedido(e) === 2 && e !== 'PARCIALMENTE_ENTREGADO'));
}

/** Las columnas que el servidor llenaría con un pedido (estados + saldo de la columna). */
const columnasQueLoTraen = (estado, saldo) => COLUMNAS_ENTREGA.filter((c) => c.estados.includes(estado)
  && (c.saldo === null || (c.saldo === 'pendiente' ? saldo > 0 : saldo <= 0))).map((c) => c.clave);

console.log('--- TEST 2: cada estado está como máximo en una columna y columnaEntrega coincide (RP22) ---');
{
  const codigos = Object.keys(ESTADOS_PEDIDO);
  assert.equal(codigos.length, 18);
  const enNinguna = new Set();
  for (const estado of codigos) {
    for (const saldo of [0, 1000, -500]) {
      const columnas = columnasQueLoTraen(estado, saldo);
      assert.ok(columnas.length <= 1, `${estado} con saldo ${saldo}: ${columnas}`);
      if (columnas.length === 1) assert.equal(columnaEntrega({ estado, saldo_cop: saldo }), columnas[0], `${estado} ${saldo}`);
      else enNinguna.add(estado);
    }
  }
  // CANCELADO y DEVUELTO_TOTAL no aparecen; los heredados (fase 4 y la tienda) tampoco se piden al servidor.
  assert.deepEqual([...enNinguna].sort(),
    ['BORRADOR', 'CANCELADO', 'CONFIRMADO', 'DEVUELTO_TOTAL', 'PAGADO', 'PARCIALMENTE_DISPONIBLE', 'PENDIENTE_ANTICIPO']);
}

console.log('--- TEST 3: columnaEntrega ---');
{
  assert.equal(columnaEntrega({ estado: 'CANCELADO', saldo_cop: 0 }), null);
  assert.equal(columnaEntrega({ estado: 'DEVUELTO_TOTAL' }), null);
  assert.equal(columnaEntrega({ estado: 'LISTO_ENTREGA', saldo_cop: 0 }), 'listo');
  assert.equal(columnaEntrega({ estado: 'LISTO_ENTREGA', saldo_cop: 1000 }), 'falta_saldo');
  assert.equal(columnaEntrega({ estado: 'LISTO_ENTREGA', saldo_cop: -200 }), 'listo', 'un crédito a favor no frena el despacho');
  assert.equal(columnaEntrega({ estado: 'LISTO_ENTREGA', saldo_cop: '1500.5' }), 'falta_saldo', 'el API manda Decimal como texto');
  assert.equal(columnaEntrega({ estado: 'LISTO_ENTREGA' }), 'listo', 'sin saldo_cop no hay saldo');
  assert.equal(columnaEntrega({ estado: 'EN_TRANSITO', saldo_cop: 5000 }), 'esperando');
  assert.equal(columnaEntrega({ estado: 'FACTURADO' }), 'despachado');
  assert.equal(columnaEntrega({ estado: 'PARCIALMENTE_ENTREGADO', saldo_cop: 300 }), 'despachado', 'antes que el paso 2 (RP22)');
  assert.equal(columnaEntrega({ estado: 'PAGADO' }), 'esperando', 'el resto: esperando');
  assert.equal(columnaEntrega(null), null);
}

console.log('--- TEST 4: reglaSoltarEntrega ---');
{
  const p = (estado, saldo = 0) => ({ id: 12, numero: 'PVEN-12', estado, saldo_cop: saldo });
  const soltar = (pedido, destino, opciones) => reglaSoltarEntrega(pedido, columnaEntrega(pedido), destino, opciones);
  const enlace = { texto: 'Abrir pedido', href: enlaceDocumento('PVEN', 12, { returnTo: '/dashboard/inventario/entregas' }) };
  // → Despachados
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'despachado'), { tipo: 'accion', accion: 'despachar' });
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'despachado', { rol: 'BODEGA' }), { tipo: 'accion', accion: 'despachar' },
    'Bodega sí despacha (R15)');
  assert.deepEqual(soltar(p('LISTO_ENTREGA', 1062523.4), 'despachado'),
    { tipo: 'bloqueado', motivo: 'Falta cobrar el saldo de $1.062.523 antes de despachar.' });
  assert.deepEqual(soltar(p('EN_PROCESO'), 'despachado'),
    { tipo: 'bloqueado', motivo: 'La mercancía todavía no está lista para entrega.' });
  // → Listo (o falta saldo) desde Esperando: cambio a LISTO_ENTREGA; con Bodega, bloqueado (RP22).
  assert.deepEqual(soltar(p('EN_TRANSITO'), 'listo'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  assert.deepEqual(soltar(p('PENDIENTE_COMPRA', 5000), 'falta_saldo'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  for (const destino of ['listo', 'falta_saldo']) {
    assert.deepEqual(soltar(p('EN_PROCESO'), destino, { rol: 'BODEGA' }),
      { tipo: 'bloqueado', motivo: 'Bodega solo puede marcar el pedido como despachado.' }, destino);
    assert.deepEqual(soltar(p('EN_PROCESO'), destino, { rol: 'Bodega' }).motivo, 'Bodega solo puede marcar el pedido como despachado.',
      'el rol se normaliza');
  }
  // Salir de Despachados: el motivo de N2.
  assert.deepEqual(soltar(p('ENTREGADO'), 'listo'), { tipo: 'bloqueado', motivo: 'Un pedido entregado solo puede pasar a Facturado.' });
  assert.deepEqual(soltar(p('FACTURADO'), 'esperando'),
    { tipo: 'bloqueado', motivo: 'El pedido ya está facturado; su estado no se puede cambiar.' });
  assert.deepEqual(soltar(p('PARCIALMENTE_ENTREGADO'), 'listo', { rol: 'BODEGA' }),
    { tipo: 'bloqueado', motivo: 'Un pedido entregado parcialmente solo puede pasar a Entregado.' });
  // Entre las dos «Listo» (las separa el saldo) y de vuelta a Esperando: se hace en el pedido.
  assert.deepEqual(soltar(p('LISTO_ENTREGA', 800), 'listo'),
    { tipo: 'bloqueado', motivo: 'La columna la decide el saldo: el cobro se registra en el pedido.', enlace });
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'falta_saldo'),
    { tipo: 'bloqueado', motivo: 'La columna la decide el saldo: el cobro se registra en el pedido.', enlace });
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'esperando'),
    { tipo: 'bloqueado', motivo: 'Un pedido listo para entrega vuelve atrás desde el pedido, no desde Entregas.', enlace });
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'esperando', { rol: 'BODEGA' }),
    { tipo: 'bloqueado', motivo: 'Bodega solo puede marcar el pedido como despachado.' });
  assert.deepEqual(soltar(p('EN_PROCESO'), 'esperando'), { tipo: 'ninguno' });
  assert.throws(() => reglaSoltarEntrega(p('EN_PROCESO'), 'esperando', 'Cancelado'), /desconocida/);
  // Todas las combinaciones tienen la forma de kanban.js.
  for (const estado of Object.keys(ESTADOS_PEDIDO)) {
    for (const saldo of [0, 1000]) {
      const pedido = p(estado, saldo);
      const origen = columnaEntrega(pedido);
      if (!origen) continue;
      for (const rol of [undefined, 'BODEGA', 'ADMIN']) {
        mapaDestinos(pedido, origen, COLUMNAS_ENTREGA, (x, o, d) => reglaSoltarEntrega(x, o, d, { rol }));
      }
    }
  }
}

console.log('OK test_entregas');
