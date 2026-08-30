import re

#############################
# 1. SOLICITUD DE CLIENTE
#############################
path_solicitud = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path_solicitud, 'r', encoding='utf-8') as f:
    content = f.read()

# Headers
content = content.replace(
    '<th className="px-6 py-4 font-bold">Estado</th>\n                  <th className="px-6 py-4 font-bold">Fecha Creación</th>',
    '<th className="px-6 py-4 font-bold">Estado</th>'
)
content = content.replace(
    '<th className="px-6 py-4 font-bold">ID Solicitud</th>',
    '<th className="px-6 py-4 font-bold">ID Solicitud</th>\n                  <th className="px-6 py-4 font-bold">Fecha</th>'
)

# Data
content = content.replace(
    """                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          sol.estado === 'Nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          sol.estado === 'En Proceso' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {sol.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{sol.fecha}</td>""",
    """                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          sol.estado === 'Nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          sol.estado === 'En Proceso' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {sol.estado}
                        </span>
                      </td>"""
)
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{sol.id}</td>',
    '<td className="px-6 py-4 font-black text-slate-800">{sol.id}</td>\n                      <td className="px-6 py-4 text-slate-500 text-xs font-medium">{sol.fecha}</td>'
)

with open(path_solicitud, 'w', encoding='utf-8') as f:
    f.write(content)


#############################
# 2. COTIZACION
#############################
path_cot = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path_cot, 'r', encoding='utf-8') as f:
    content = f.read()

# Headers
content = content.replace(
    '<th className="px-6 py-4 font-bold">Estado</th>\n                  <th className="px-6 py-4 font-bold">Fecha Emisión</th>',
    '<th className="px-6 py-4 font-bold">Estado</th>'
)
content = content.replace(
    '<th className="px-6 py-4 font-bold">ID Cotización</th>',
    '<th className="px-6 py-4 font-bold">ID Cotización</th>\n                  <th className="px-6 py-4 font-bold">Fecha</th>'
)

# Data
content = content.replace(
    """                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          cot.estado === 'Pendiente por Cotizar' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          cot.estado === 'Cotizado - Pendiente Conf.' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {cot.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{cot.fecha}</td>""",
    """                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          cot.estado === 'Pendiente por Cotizar' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          cot.estado === 'Cotizado - Pendiente Conf.' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {cot.estado}
                        </span>
                      </td>"""
)
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{cot.id}</td>',
    '<td className="px-6 py-4 font-black text-slate-800">{cot.id}</td>\n                      <td className="px-6 py-4 text-slate-500 text-xs font-medium">{cot.fecha}</td>'
)

with open(path_cot, 'w', encoding='utf-8') as f:
    f.write(content)


#############################
# 3. VENTA
#############################
path_venta = 'src/app/dashboard/ventas/venta/page.tsx'
with open(path_venta, 'r', encoding='utf-8') as f:
    content = f.read()

# Headers
content = content.replace(
    '<th className="px-6 py-4 font-bold">Fecha Venta</th>\n                  <th className="px-6 py-4 font-bold">Monto</th>',
    '<th className="px-6 py-4 font-bold">Monto</th>'
)
content = content.replace(
    '<th className="px-6 py-4 font-bold">Venta</th>',
    '<th className="px-6 py-4 font-bold">Venta</th>\n                  <th className="px-6 py-4 font-bold">Fecha</th>'
)

# Data
content = content.replace(
    """<td className="px-6 py-4 text-slate-600 font-medium">{venta.fecha}</td>
                      <td className="px-6 py-4 font-black text-slate-800">{venta.monto}</td>""",
    '<td className="px-6 py-4 font-black text-slate-800">{venta.monto}</td>'
)
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{venta.id}</td>',
    '<td className="px-6 py-4 font-black text-slate-800">{venta.id}</td>\n                      <td className="px-6 py-4 text-slate-500 text-xs font-medium">{venta.fecha}</td>'
)

with open(path_venta, 'w', encoding='utf-8') as f:
    f.write(content)

print("Moved Fecha right after ID in all tables.")
