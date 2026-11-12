/**
 * frontend/tests/test_entregas.mjs
 * Bloque 4, T3C (KANBAN-logistica punto 3, R15, C19, RP22): el tablero y las pestañas de Entregas (lib/entregas.js).
 * Cuatro columnas servidas con estados + saldo de /ventas/pedidos (Esperando mercancía · Listo pero falta saldo · Listo
 * para despachar · Despachados); los cancelados y devueltos no aparecen en ninguna; despachar solo desde «Listo para
 * despachar» y Bodega solo despacha. El monto del bloqueo va con formatoPesos.
 * Ronda r1 (fixes-3C-r1): «Esperando mercancía» pide también los estados heredados (R15, C19: solo se excluyen CANCELADO y
 * DEVUELTO_TOTAL) y solo ADMIN, ASESOR y BODEGA mueven tarjetas.
 */

import assert from 'node:assert/strict';
import { columnaEntrega, COLUMNAS_ENTREGA, reglaSoltarEntrega } from '../src/lib/entregas.js';
import { ESTADOS_PEDIDO, pasoPedido } from '../src/lib/estados-pedido.js';
import { mapaDestinos, TEXTO_SOLO_VER } from '../src/lib/kanban.js';
import { enlaceDocumento } from '../src/lib/analisis.js';

const PASO_2 = ['LISTO_ENTREGA', 'DISPONIBLE', 'PENDIENTE_SALDO', 'LISTO_PARA_ENTREGA'];

console.log('--- TEST 1: COLUMNAS_ENTREGA: títulos de R15, estados y saldo de RP22 ---');
{
  assert.deepEqual(COLUMNAS_ENTREGA.map((c) => [c.clave, c.titulo, c.estados, c.saldo, c.cerrada]), [
    ['esperando', 'Esperando mercancía', ['PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'PENDIENTE_PAGO', 'PAGADO', 'BORRADOR',
      'PENDIENTE_ANTICIPO', 'CONFIRMADO', 'PARCIALMENTE_DISPONIBLE'], null, false],
    ['falta_saldo', 'Listo pero falta saldo', PASO_2, 'pendiente', false],
    ['listo', 'Listo para despachar', PASO_2, 'pagado', false],
    ['despachado', 'Despachados', ['ENTREGADO', 'PARCIALMENTE_ENTREGADO', 'FACTURADO'], null, true],
  ]);
  assert.ok(Object.isFrozen(COLUMNAS_ENTREGA) && Object.isFrozen(COLUMNAS_ENTREGA[1].estados));
  // r1: Esperando = una sola regla con columnaEntrega (los 4 operativos y los 5 heredados); las dos «Listo» = el paso 2
  // sin PARCIALMENTE_ENTREGADO.
  assert.deepEqual(COLUMNAS_ENTREGA[0].estados, Object.keys(ESTADOS_PEDIDO).filter((e) => columnaEntrega({ estado: e }) === 'esperando'));
  assert.equal(COLUMNAS_ENTREGA[0].estados.length, 9);
  assert.deepEqual(PASO_2, Object.keys(ESTADOS_PEDIDO).filter((e) => pasoPedido(e) === 2 && e !== 'PARCIALMENTE_ENTREGADO'));
}

/** Las columnas que el servidor llenaría con un pedido (estados + saldo de la columna). */
const columnasQueLoTraen = (estado, saldo) => COLUMNAS_ENTREGA.filter((c) => c.estados.includes(estado)
  && (c.saldo === null || (c.saldo === 'pendiente' ? saldo > 0 : saldo <= 0))).map((c) => c.clave);

console.log('--- TEST 2: cada estado está en una sola columna y columnaEntrega coincide (RP22; r1) ---');
{
  const codigos = Object.keys(ESTADOS_PEDIDO);
  assert.equal(codigos.length, 18);
  for (const saldo of [0, 1000, -500]) {
    const enNinguna = [];
    for (const estado of codigos) {
      const columnas = columnasQueLoTraen(estado, saldo);
      if (estado === 'CANCELADO' || estado === 'DEVUELTO_TOTAL') {
        assert.deepEqual(columnas, [], `${estado} con saldo ${saldo}`);
      } else {
        assert.equal(columnas.length, 1, `${estado} con saldo ${saldo}: ${columnas}`);
      }
      if (columnas.length === 1) assert.equal(columnaEntrega({ estado, saldo_cop: saldo }), columnas[0], `${estado} ${saldo}`);
      else enNinguna.push(estado);
    }
    // r1: solo CANCELADO y DEVUELTO_TOTAL quedan fuera; un pedido web PAGADO (webhooks.py) se sigue viendo.
    assert.deepEqual(enNinguna, ['CANCELADO', 'DEVUELTO_TOTAL'], `saldo ${saldo}`);
  }
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
  const soltar = (pedido, destino, opciones = { rol: 'ADMIN' }) => reglaSoltarEntrega(pedido, columnaEntrega(pedido), destino, opciones);
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
  assert.deepEqual(soltar(p('PAGADO'), 'listo'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' }, 'un heredado (r1)');
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
  // r1 (punto 5): solo ADMIN, ASESOR y BODEGA mueven tarjetas (R15); con otro rol, o sin él, el tablero es para ver.
  const SOLO_VER = { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER };
  assert.equal(TEXTO_SOLO_VER, 'Este tablero es solo para ver.');
  for (const rol of ['FINANZAS', 'CONSULTA', 'COMPRAS', 'finanzas', '', null, undefined]) {
    assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'despachado', { rol }), SOLO_VER, `${rol} despachar`);
    assert.deepEqual(soltar(p('EN_PROCESO'), 'listo', { rol }), SOLO_VER, `${rol} → listo`);
    assert.deepEqual(soltar(p('ENTREGADO'), 'listo', { rol }), SOLO_VER, `${rol} salir de Despachados`);
    assert.deepEqual(soltar(p('EN_PROCESO'), 'esperando', { rol }), { tipo: 'ninguno' }, `${rol} misma columna`);
  }
  assert.deepEqual(reglaSoltarEntrega(p('LISTO_ENTREGA'), 'listo', 'despachado'), SOLO_VER, 'sin opciones no se sabe el rol');
  assert.deepEqual(soltar(p('LISTO_ENTREGA'), 'despachado', { rol: 'ASESOR' }), { tipo: 'accion', accion: 'despachar' });
  assert.deepEqual(soltar(p('EN_PROCESO'), 'listo', { rol: 'Vendedor' }), { tipo: 'cambio', estado: 'LISTO_ENTREGA' },
    'el nombre viejo de ASESOR (normalizarRol)');
  assert.deepEqual(soltar(p('EN_PROCESO'), 'listo', { rol: ' admin ' }), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  // Todas las combinaciones tienen la forma de kanban.js.
  for (const estado of Object.keys(ESTADOS_PEDIDO)) {
    for (const saldo of [0, 1000]) {
      const pedido = p(estado, saldo);
      const origen = columnaEntrega(pedido);
      if (!origen) continue;
      for (const rol of [undefined, 'BODEGA', 'ADMIN', 'FINANZAS']) {
        mapaDestinos(pedido, origen, COLUMNAS_ENTREGA, (x, o, d) => reglaSoltarEntrega(x, o, d, { rol }));
      }
    }
  }
}

// ─── B4 T19: lo puro de la pantalla Inventario › Entregas (las consultas, las pestañas, el despacho y la tarjeta) ──────────
import * as ent from '../src/lib/entregas.js';
import { estadoTablaInicial } from '../src/lib/tabla.js';

const estadoE = (parcial = {}) => estadoTablaInicial({ vista: 'listo', ...parcial });
const COL = (clave) => COLUMNAS_ENTREGA.find((c) => c.clave === clave);

console.log('--- TEST 5 (T19): la consulta de la TABLA: la pestaña = la columna (estados + saldo), sin `vista` del servidor ---');
{
  assert.equal(typeof ent.consultaEntregas, 'function');
  // Cada pestaña pide los estados y el saldo de SU columna; `vista` va en null (el servidor no tiene vista 'listo': 422) y el
  // semáforo y el paso de una sesión restaurada no se mandan (Entregas no los tiene).
  for (const c of COLUMNAS_ENTREGA) {
    assert.deepEqual(ent.consultaEntregas(estadoE({ vista: c.clave })),
      { vista: null, semaforo: null, paso: null, estados: [...c.estados], saldo: c.saldo }, c.clave);
  }
  // Una pestaña que no existe (una sesión vieja con 'todos') cae en la de trabajo: Listo para despachar.
  assert.equal(ent.consultaEntregas(estadoE({ vista: 'todos' })).saldo, 'pagado');
  assert.deepEqual(ent.consultaEntregas(estadoE({ vista: null })).estados, [...COL('listo').estados]);
  // El filtro de estados: el cruce con la pestaña; un filtro que la pestaña no tiene gana (lo que pide es lo que FiltroEstados muestra).
  assert.deepEqual(ent.consultaEntregas(estadoE({ vista: 'listo', estados: ['DISPONIBLE'] })).estados, ['DISPONIBLE']);
  assert.deepEqual(ent.consultaEntregas(estadoE({ vista: 'listo', estados: ['ENTREGADO'] })).estados, ['ENTREGADO']);
  // Nunca devuelve CANCELADO ni DEVUELTO_TOTAL desde una pestaña sin filtro.
  for (const c of COLUMNAS_ENTREGA) {
    const pedidos = ent.consultaEntregas(estadoE({ vista: c.clave })).estados;
    assert.ok(!pedidos.includes('CANCELADO') && !pedidos.includes('DEVUELTO_TOTAL'), c.clave);
  }
}

console.log('--- TEST 6 (T19): la consulta de una COLUMNA del tablero (modo servidor) y los conteos de las pestañas ---');
{
  const e = estadoE();
  const q = ent.consultaColumnaEntrega(e, COL('listo'), { orden: 'atencion', limit: 25, offset: 0 });
  assert.equal(q, 'estados=LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA&orden=atencion&limit=25&offset=0&saldo=pagado');
  // La plegada pide limit=0 (el hook lo manda) y la de saldo, saldo=pendiente.
  assert.equal(ent.consultaColumnaEntrega(e, COL('falta_saldo'), { orden: 'atencion', limit: 0, offset: 0 }),
    'estados=LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA&orden=atencion&limit=0&offset=0&saldo=pendiente');
  assert.equal(ent.consultaColumnaEntrega(e, COL('despachado'), { orden: 'reciente', limit: 0, offset: 0 }),
    'estados=ENTREGADO,PARCIALMENTE_ENTREGADO,FACTURADO&orden=reciente&limit=0&offset=0');
  // La búsqueda y el filtro de estados son los MISMOS del estado único; la pestaña NO viaja (el tablero trae las cuatro columnas).
  const con = ent.consultaColumnaEntrega(estadoE({ q: 'oso', estados: ['ENTREGADO'] }), COL('despachado'), { orden: null, limit: 25, offset: 25 });
  assert.equal(con, 'q=oso&estados=ENTREGADO,PARCIALMENTE_ENTREGADO,FACTURADO&limit=25&offset=25');
  assert.ok(!/(^|&)vista=/.test(q) && !/(^|&)semaforo=/.test(q));
  // Un filtro sin nada en común con la columna: no pide (null), la columna queda vacía.
  assert.equal(ent.consultaColumnaEntrega(estadoE({ estados: ['ENTREGADO'] }), COL('esperando'), { orden: null, limit: 25, offset: 0 }), null);
  // Los conteos de las pestañas: estados + saldo de cada columna, SIN búsqueda ni filtro y con limit=0 (solo el total).
  assert.equal(typeof ent.consultaConteoEntrega, 'function');
  assert.equal(ent.consultaConteoEntrega(COL('falta_saldo'), estadoE()),
    'estados=LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA&limit=0&offset=0&saldo=pendiente');
  assert.equal(ent.consultaConteoEntrega(COL('despachado'), estadoE()), 'estados=ENTREGADO,PARCIALMENTE_ENTREGADO,FACTURADO&limit=0&offset=0');
  // r1 (m1, m13, m22): los conteos siguen la BÚSQUEDA del estado (R5), no sus estados ni su pestaña.
  assert.equal(ent.consultaConteoEntrega(COL('listo'), estadoE({ q: ' oso ', estados: ['DISPONIBLE'] })),
    'q=oso&estados=LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA&limit=0&offset=0&saldo=pagado');
}

console.log('--- TEST 7 (T19, lección I1 de T18): las pestañas y la tarjeta Despachados salen de los MISMOS conteos ---');
{
  const conteos = { esperando: 4, falta_saldo: 2, listo: 7, despachado: 31 };
  const pestanas = ent.pestanasEntrega(conteos);
  assert.deepEqual(pestanas.map((p) => [p.id, p.etiqueta, p.conteo]), [
    ['esperando', 'Esperando mercancía', 4], ['falta_saldo', 'Listo pero falta saldo', 2],
    ['listo', 'Listo para despachar', 7], ['despachado', 'Despachados', 31],
  ]);
  assert.equal(pestanas.find((p) => p.id === 'falta_saldo').alerta, true, 'hay pedidos con saldo: ámbar');
  assert.equal(ent.pestanasEntrega({ ...conteos, falta_saldo: 0 }).find((p) => p.id === 'falta_saldo').alerta, false);
  // Mientras no llegan (o fallaron), null: la barra gris, nunca 0.
  assert.deepEqual(ent.pestanasEntrega(null).map((p) => p.conteo), [null, null, null, null]);
  assert.deepEqual(ent.pestanasEntrega({ esperando: 'x', listo: 3 }).map((p) => p.conteo), [null, null, 3, null]);
  // Las tarjetas: la de Despachados es el conteo de su pestaña (ni 1 de diferencia), las otras dos son del servidor de ventas.
  const kpis = { pven_en_curso: 11, pven_saldo_en_curso: 2500000 };
  const t = ent.tarjetasEntregas(kpis, conteos);
  assert.deepEqual(t, { en_curso: { valor: 11 }, saldo: { valor: 2500000 }, despachados: { valor: 31 } });
  assert.equal(t.despachados.valor, ent.pestanasEntrega(conteos).find((p) => p.id === 'despachado').conteo);
  // Sin datos: null, no 0.
  assert.deepEqual(ent.tarjetasEntregas(null, null), { en_curso: { valor: null }, saldo: { valor: null }, despachados: { valor: null } });
  assert.deepEqual(ent.tarjetasEntregas({ pven_en_curso: '3' }, { despachado: 'x' }),
    { en_curso: { valor: 3 }, saldo: { valor: null }, despachados: { valor: null } });
  assert.deepEqual(ent.tarjetasEntregas('x', 7), { en_curso: { valor: null }, saldo: { valor: null }, despachados: { valor: null } });
}

console.log('--- TEST 8 (T19, RP23): el cuerpo del despacho: Bodega manda EXACTAMENTE {estado, warehouse_id}; ADMIN y ASESOR lo de hoy sin fecha_entrega ---');
{
  const catalogo = { id: 5, numero: 'PVEN-5', notas: null, productos: [{ sku_id: 9, product_name: 'Oso', qty: 2 }] };
  const libre = { id: 6, numero: 'PVEN-6', notas: 'Llamar antes', productos: [{ product_name: 'Servicio', qty: 1 }] };
  assert.deepEqual(ent.cuerpoDespacho(catalogo, { rol: 'BODEGA', warehouseId: '3', hoy: '3/11/2026' }), { estado: 'ENTREGADO', warehouse_id: 3 });
  assert.deepEqual(Object.keys(ent.cuerpoDespacho(catalogo, { rol: 'BODEGA', warehouseId: '3' })), ['estado', 'warehouse_id'], 'Bodega: ni notas ni fecha_entrega');
  assert.deepEqual(Object.keys(ent.cuerpoDespacho(libre, { rol: ' bodega ', warehouseId: '4' })), ['estado', 'warehouse_id'], 'el rol se normaliza');
  assert.deepEqual(ent.cuerpoDespacho(catalogo, { rol: 'ADMIN', warehouseId: '3', hoy: '3/11/2026' }),
    { estado: 'ENTREGADO', warehouse_id: 3, notas: 'Despachado desde mesa de entregas' });
  assert.deepEqual(ent.cuerpoDespacho(libre, { rol: 'ASESOR', warehouseId: '', hoy: '3/11/2026' }),
    { estado: 'ENTREGADO', notas: 'Llamar antes | Despachado el 3/11/2026' }, 'sin bodega no manda warehouse_id (lineas libres)');
  assert.ok(!('fecha_entrega' in ent.cuerpoDespacho(catalogo, { rol: 'ADMIN', warehouseId: '3' })), 'fecha_entrega no se guarda');
  assert.ok(!('updated_by' in ent.cuerpoDespacho(catalogo, { rol: 'BODEGA', warehouseId: '3' })));
  // La bodega: Bodega siempre; ADMIN y ASESOR solo con líneas de catálogo (sku_id), como hoy.
  assert.equal(ent.bodegaObligatoria(libre, 'BODEGA'), true);
  assert.equal(ent.bodegaObligatoria(libre, 'ADMIN'), false);
  assert.equal(ent.bodegaObligatoria(catalogo, 'ASESOR'), true);
  assert.equal(ent.bodegaObligatoria({ productos: null }, 'ADMIN'), false);
  assert.equal(ent.mensajeFaltaBodega(catalogo, { rol: 'ADMIN', warehouseId: '' }), 'Selecciona la bodega de despacho antes de continuar');
  assert.equal(ent.mensajeFaltaBodega(catalogo, { rol: 'ADMIN', warehouseId: '3' }), null);
  assert.equal(ent.mensajeFaltaBodega(libre, { rol: 'ASESOR', warehouseId: '' }), null);
  assert.equal(ent.mensajeFaltaBodega(libre, { rol: 'BODEGA', warehouseId: '' }), 'Selecciona la bodega de despacho antes de continuar');
  // Quién despacha: ADMIN, ASESOR y BODEGA (el nombre viejo también); los demás solo ven.
  for (const rol of ['ADMIN', 'ASESOR', 'BODEGA', 'Vendedor', ' admin ']) assert.equal(ent.puedeDespachar(rol), true, rol);
  for (const rol of ['FINANZAS', 'COMPRAS', '', null, undefined]) assert.equal(ent.puedeDespachar(rol), false, String(rol));
}

console.log('--- TEST 9 (T19, RP23): lo que pregunta confirmar() de useAvisos antes de despachar (ya no window.confirm) ---');
{
  const c = ent.confirmacionDespacho({ numero: 'PVEN-5', customer_name: 'Ana', saldo_cop: 400000 }, 'Bodega Norte');
  assert.equal(c.peligro, true, 'con saldo: botón de alerta');
  assert.match(c.mensaje, /saldo pendiente de \$400\.000/);
  assert.ok(!/40\s?%/.test(`${c.titulo} ${c.mensaje}`), 'sin el 40 % fijo');
  assert.ok(c.efectos.includes('Bodega de salida: Bodega Norte') && c.efectos.includes('Cliente: Ana'));
  const sin = ent.confirmacionDespacho({ numero: 'PVEN-6', customer_name: '', saldo_cop: 0 }, null);
  assert.equal(sin.peligro, false);
  assert.equal(sin.titulo, 'Despachar PVEN-6');
  assert.deepEqual(sin.efectos, ['Cliente: Sin nombre']);
  assert.equal(ent.confirmacionDespacho({ numero: 'P', saldo_cop: -5000 }, null).peligro, false, 'un crédito a favor no frena');
}

console.log('--- TEST 10 (T19): la tarjeta del tablero, el cobro, el recordatorio de WhatsApp y los textos ---');
{
  const ped = { id: 12, numero: 'PVEN-12', customer_name: 'Ana Pérez', customer_phone: '300 123 4567', telefono_whatsapp: null,
    total_cop: 1000000, saldo_cop: 400000, estado: 'LISTO_ENTREGA', productos: [{ qty: 1 }, { qty: 2 }], fecha_entrega_estimada: '2026-11-20T00:00:00' };
  const t = ent.tarjetaEntrega(ped);
  assert.equal(t.numero, 'PVEN-12');
  assert.equal(t.tipo, 'PVEN');
  assert.equal(t.titulo, 'Ana Pérez');
  assert.equal(t.subtitulo, '2 ítems');
  assert.equal(t.monto, 1000000);
  assert.equal(t.estado.label, 'Listo para entrega');
  assert.deepEqual(t.chips, [{ texto: 'Saldo $400.000', tono: 'amber' }]);
  assert.equal(t.accionPrincipal, null);
  assert.equal(t.tiempo, 'Entrega 20 nov 2026', 'fecha de negocio: el día del API, no un instante (T9 r1 I2)');
  assert.equal(ent.textoEntregaTablero(ped), '20 nov 2026');
  assert.equal(ent.textoEntregaTablero({}), '—');
  assert.deepEqual(ent.tarjetaEntrega({ ...ped, saldo_cop: 0 }).chips, [{ texto: 'Pagado', tono: 'emerald' }]);
  assert.deepEqual(ent.tarjetaEntrega({ ...ped, saldo_cop: -3000 }).chips, [{ texto: 'Pagado', tono: 'emerald' }], 'a favor: pagado');
  assert.equal(ent.tarjetaEntrega({ ...ped, customer_name: ' ', productos: [{}] }).titulo, 'Cliente sin nombre');
  assert.equal(ent.tarjetaEntrega({ ...ped, productos: [{}] }).subtitulo, '1 ítem');
  assert.equal(ent.tarjetaEntrega({ ...ped, productos: [] }).subtitulo, 'Sin ítems');
  assert.equal(ent.tarjetaEntrega({ ...ped, productos: undefined }).subtitulo, 'Sin ítems');
  // Cobro (la columna «Cobro» de la tabla y el Drawer): el mismo saldo.
  assert.equal(ent.saldoEntrega(ped), 400000);
  assert.equal(ent.saldoEntrega({ saldo_cop: '250000' }), 250000);
  assert.equal(ent.saldoEntrega({ saldo_cop: null }), 0);
  assert.equal(ent.infoCobroEntrega(ped).label, 'Cobro pendiente');
  assert.equal(ent.infoCobroEntrega({ ...ped, saldo_cop: 0 }).label, 'Pagado');
  assert.equal(ent.infoCobroEntrega({ ...ped, saldo_cop: -1 }).label, 'Pagado');
  // El recordatorio: wa.me con el teléfono del pedido (telefono_whatsapp primero, luego customer_phone) solo si hay saldo.
  const r = ent.recordatorioSaldo(ped);
  assert.ok(r.url.startsWith('https://wa.me/573001234567?text='), r.url);
  assert.ok(decodeURIComponent(r.url).includes('PVEN-12') && decodeURIComponent(r.url).includes('$400.000'));
  assert.equal(ent.recordatorioSaldo({ ...ped, telefono_whatsapp: '+573159876543' }).url.slice(0, 29), 'https://wa.me/573159876543?te');
  assert.equal(ent.recordatorioSaldo({ ...ped, saldo_cop: 0 }), null, 'sin saldo no hay recordatorio');
  assert.equal(ent.recordatorioSaldo({ ...ped, customer_phone: '', telefono_whatsapp: null }), null, 'sin teléfono tampoco');
  // El resumen de la columna bajo su título: la de saldo suma el SALDO, las demás el monto.
  assert.equal(ent.resumenColumnaEntrega('falta_saldo', { monto_cop: 5000000, saldo_cop: 1250000 }), 'Saldo $1.250.000');
  assert.equal(ent.resumenColumnaEntrega('listo', { monto_cop: 5000000, saldo_cop: 0 }), '$5.000.000');
  assert.equal(ent.resumenColumnaEntrega('despachado', null), null);
  assert.equal(ent.resumenColumnaEntrega('listo', { monto_cop: 'x' }), null);
  // Los textos de la nota y del vacío (dicen qué lo vacía).
  assert.equal(ent.NOTA_ENTREGAS, 'Si la mercancía llegó y falta el saldo, contacta al cliente antes de generar la guía.');
  assert.equal(ent.textoVacioEntregas({ vista: 'listo', q: 'zzz', estados: [] }).titulo, 'Sin resultados para «zzz»');
  assert.equal(ent.textoVacioEntregas({ vista: 'listo', q: '', estados: ['DISPONIBLE'] }).titulo, 'Ningún pedido con esos estados. Ajusta el filtro.');
  assert.equal(ent.textoVacioEntregas({ vista: 'falta_saldo', q: '', estados: [] }).titulo, 'No hay pedidos con saldo por cobrar');
  assert.equal(ent.textoVacioEntregas({ vista: 'listo', q: '', estados: [] }).titulo, 'No hay pedidos listos para despachar');
  assert.equal(ent.textoVacioEntregas({ vista: 'despachado', q: '', estados: [] }).titulo, 'Aún no hay pedidos despachados');
  assert.equal(ent.textoVacioEntregas({ vista: 'esperando', q: '', estados: [] }).titulo, 'No hay pedidos esperando mercancía');
}

console.log('--- TEST 11 (T19): «Filtrar estado» de la tabla (los estados de la pestaña) y del tablero (una opción por columna) ---');
{
  assert.deepEqual(ent.opcionesEstadosEntrega('listo').map((o) => o.valor), [...COL('listo').estados]);
  assert.deepEqual(ent.opcionesEstadosEntrega('despachado').map((o) => o.etiqueta), ['Entregado', 'Entregado parcialmente', 'Facturado']);
  assert.equal(ent.opcionesEstadosEntrega('listo'), ent.opcionesEstadosEntrega('listo'), 'la misma referencia');
  assert.deepEqual(ent.opcionesEstadosEntrega('no_existe').map((o) => o.valor), [...COL('listo').estados], 'cae en la pestaña de trabajo');
  assert.deepEqual(ent.OPCIONES_ESTADOS_TABLERO_ENTREGA.map((o) => [o.valor, o.etiqueta]), [
    ['PENDIENTE_COMPRA', 'Esperando mercancía'], ['LISTO_ENTREGA', 'Listo para entrega'], ['ENTREGADO', 'Despachados'],
  ]);
  // Los valores del tablero son el estado principal de cada columna (estadosDeColumnaLista abre la columna entera con él).
  for (const o of ent.OPCIONES_ESTADOS_TABLERO_ENTREGA) assert.ok(COLUMNAS_ENTREGA.some((c) => c.estados[0] === o.valor), o.valor);
}

console.log('--- TEST 12 (T19 r1): una sola regla para despachar (fila, tablero y Drawer: la MISMA función), cobrar el saldo y la tarjeta que abre cada pestaña ---');
{
  const p = (estado, saldo = 0) => ({ id: 1, numero: 'PVEN-1', estado, saldo_cop: saldo });
  // m3, m10, m17: despachar desde «Listo para despachar», desde «falta saldo» (con la alerta) y terminar un PARCIALMENTE_ENTREGADO; nunca desde
  // «Esperando mercancía», ni un ya despachado, cancelado o devuelto.
  const casos = [
    ['LISTO_ENTREGA', 0, true], ['DISPONIBLE', 0, true],
    // r2 (I3): con saldo pendiente NO se despacha (el brief y el tablero: «Falta cobrar el saldo»); se cobra primero.
    ['LISTO_ENTREGA', 5000, false], ['PENDIENTE_SALDO', 100, false], ['LISTO_PARA_ENTREGA', 100, false], ['PARCIALMENTE_ENTREGADO', 100, false],
    ['LISTO_PARA_ENTREGA', 0, true], ['PARCIALMENTE_ENTREGADO', 0, true],
    ['EN_TRANSITO', 0, false], ['PENDIENTE_COMPRA', 0, false], ['EN_PROCESO', 0, false], ['CONFIRMADO', 0, false], ['PAGADO', 0, false],
    ['ENTREGADO', 0, false], ['FACTURADO', 0, false], ['CANCELADO', 0, false], ['DEVUELTO_TOTAL', 0, false],
  ];
  for (const [estado, saldo, esperado] of casos) {
    for (const rol of ['ADMIN', 'ASESOR', 'BODEGA']) assert.equal(ent.puedeDespacharPedido(p(estado, saldo), rol), esperado, `${estado} ${rol}`);
    for (const rol of ['FINANZAS', 'COMPRAS', '', null]) assert.equal(ent.puedeDespacharPedido(p(estado, saldo), rol), false, `${estado} ${rol}`);
  }
  assert.equal(ent.puedeDespacharPedido(null, 'ADMIN'), false);
  // r2 (I3): el tablero usa la MISMA regla: soltar en Despachados es una acción exactamente cuando puedeDespacharPedido; el resto, bloqueado.
  for (const [estado, saldo] of [...casos.map(([e, s]) => [e, s]), ['LISTO_ENTREGA', 1]]) {
    for (const rol of ['ADMIN', 'ASESOR', 'BODEGA', 'FINANZAS', 'COMPRAS', '']) {
      const ped = p(estado, saldo);
      const origen = columnaEntrega(ped);
      if (origen === null || origen === 'despachado') continue;
      assert.equal(reglaSoltarEntrega(ped, origen, 'despachado', { rol }).tipo === 'accion', ent.puedeDespacharPedido(ped, rol), `tablero y fila coinciden: ${estado} saldo ${saldo} ${rol}`);
    }
  }
  assert.match(reglaSoltarEntrega(p('LISTO_ENTREGA', 5000), 'falta_saldo', 'despachado', { rol: 'ADMIN' }).motivo, /Falta cobrar el saldo de \$5\.000/);
  // m6, m12, m21: «Marcar Saldo Cobrado» (PATCH saldo_cop) solo ADMIN y ASESOR; Bodega recibe 403.
  for (const rol of ['ADMIN', 'ASESOR', 'Vendedor', ' admin ']) assert.equal(ent.puedeCobrarSaldo(rol), true, rol);
  for (const rol of ['BODEGA', 'FINANZAS', 'COMPRAS', 'CONSULTA', '', null, undefined]) assert.equal(ent.puedeCobrarSaldo(rol), false, String(rol));
  // I4: qué pestaña abre cada tarjeta (una función pura con sus casos; los mutantes de la página mueren aquí).
  assert.equal(ent.vistaDeTarjetaEntrega('ent_despachados'), 'despachado');
  assert.equal(ent.vistaDeTarjetaEntrega('pven_en_curso'), null, 'informativa');
  assert.equal(ent.vistaDeTarjetaEntrega('ent_saldo'), null, 'informativa');
  assert.equal(ent.vistaDeTarjetaEntrega('otra'), null);
  assert.equal(ent.COLUMNAS_ENTREGA.some((c) => c.clave === ent.vistaDeTarjetaEntrega('ent_despachados')), true, 'la vista existe');
}

console.log('OK test_entregas');
