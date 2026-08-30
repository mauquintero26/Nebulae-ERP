import re

#############################
# 1. SOLICITUD DE CLIENTE
#############################
path_solicitud = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path_solicitud, 'r', encoding='utf-8') as f:
    content = f.read()

# Add fecha to mock
content = re.sub(
    r"estado: '([^']+)', ultimaAct:",
    r"estado: '\1', fecha: '24 Ago 2026', ultimaAct:",
    content
)

# Add column header
content = content.replace(
    '<th className="px-6 py-4 font-bold">Estado</th>',
    '<th className="px-6 py-4 font-bold">Estado</th>\n                  <th className="px-6 py-4 font-bold">Fecha Creación</th>'
)

# Add column data
content = content.replace(
    """<td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          sol.estado === 'Nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          sol.estado === 'En Proceso' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {sol.estado}
                        </span>
                      </td>""",
    """<td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          sol.estado === 'Nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          sol.estado === 'En Proceso' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {sol.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{sol.fecha}</td>"""
)

with open(path_solicitud, 'w', encoding='utf-8') as f:
    f.write(content)


#############################
# 2. COTIZACION
#############################
path_cot = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path_cot, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify mock to include fecha and origen_sc
mock_items = "[\n"
for i in range(1, 25):
    is_desatendida = i in [2, 3, 14, 21]
    estado = "Pendiente por Cotizar" if i % 3 == 0 else ("Cotizado - Pendiente Conf." if i % 2 == 0 else "Cotización Confirmada")
    mock_items += f"  {{ id: 'COT-{i:04d}', origen_sc: 'SC-{(i*3):04d}', cliente: 'Empresa Cliente {i}', monto: '${(i*1200):,}.00', fecha: '23 Ago 2026', estado: '{estado}', ultimaAct: '{'Hace 3 días' if is_desatendida else 'Hace 2 horas'}', responsable: 'Agente {i%3 + 1}', desatendida: {'true' if is_desatendida else 'false'} }},\n"
mock_items += "]"
content = re.sub(r'const MOCK_COTIZACIONES = \[\s*[\s\S]*?\s*\];', f'const MOCK_COTIZACIONES = {mock_items};', content)

# Add column header
content = content.replace(
    '<th className="px-6 py-4 font-bold">Cliente</th>',
    '<th className="px-6 py-4 font-bold">Cliente</th>\n                  <th className="px-6 py-4 font-bold">Origen</th>'
)
content = content.replace(
    '<th className="px-6 py-4 font-bold">Estado</th>',
    '<th className="px-6 py-4 font-bold">Estado</th>\n                  <th className="px-6 py-4 font-bold">Fecha Emisión</th>'
)

# Add column data
content = content.replace(
    '<td className="px-6 py-4 font-bold text-slate-700">{cot.cliente}</td>',
    """<td className="px-6 py-4 font-bold text-slate-700">{cot.cliente}</td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                          {cot.origen_sc}
                        </span>
                      </td>"""
)

content = content.replace(
    """<td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          cot.estado === 'Pendiente por Cotizar' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          cot.estado === 'Cotizado - Pendiente Conf.' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {cot.estado}
                        </span>
                      </td>""",
    """<td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          cot.estado === 'Pendiente por Cotizar' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          cot.estado === 'Cotizado - Pendiente Conf.' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {cot.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{cot.fecha}</td>"""
)

with open(path_cot, 'w', encoding='utf-8') as f:
    f.write(content)


#############################
# 3. VENTA
#############################
path_venta = 'src/app/dashboard/ventas/venta/page.tsx'
with open(path_venta, 'r', encoding='utf-8') as f:
    content = f.read()

# Add fecha to mock
content = re.sub(
    r"estado: estado,",
    r"fecha: '25 Ago 2026', estado: estado,",
    content
)

# Add column header
content = content.replace(
    '<th className="px-6 py-4 font-bold">Monto</th>',
    '<th className="px-6 py-4 font-bold">Fecha Venta</th>\n                  <th className="px-6 py-4 font-bold">Monto</th>'
)

# Add column data
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{venta.monto}</td>',
    """<td className="px-6 py-4 text-slate-600 font-medium">{venta.fecha}</td>
                      <td className="px-6 py-4 font-black text-slate-800">{venta.monto}</td>"""
)

with open(path_venta, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added Fechas and Origen to tables.")
