import os
import re

# 1. Update Sidebar
sidebar_path = 'src/components/Sidebar.tsx'
with open(sidebar_path, 'r', encoding='utf-8') as f:
    sidebar = f.read()

sidebar = sidebar.replace(
    "{ name: '🚚 Rutas', path: '/dashboard/inventario/rutas' },",
    "{ name: '🚚 Rutas', path: '/dashboard/inventario/rutas' },\n            { name: '🤝 Inventario Compartido', path: '/dashboard/inventario/compartido' },"
)
with open(sidebar_path, 'w', encoding='utf-8') as f:
    f.write(sidebar)

# 2. Update Inventario Dashboard
hub_path = 'src/app/dashboard/inventario/page.tsx'
with open(hub_path, 'r', encoding='utf-8') as f:
    hub = f.read()

import_str = "Archive, PackagePlus, PackageMinus, RefreshCw, \n  Settings2, ShoppingCart, Warehouse, MapPin, Truck,\n  ArrowUpRight, AlertTriangle, BarChart3, TrendingUp, Search,"
if "Users2" not in import_str:
    hub = hub.replace(
        "ArrowUpRight, AlertTriangle, BarChart3, TrendingUp, Search",
        "ArrowUpRight, AlertTriangle, BarChart3, TrendingUp, Search, Users2"
    )

new_module = "{ name: 'Inventario Compartido', path: '/dashboard/inventario/compartido', desc: 'Gestión de inventario compartido (Próximamente)', icon: Users2, color: 'text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200' }"
hub = hub.replace(
    "{ name: 'Rutas', path: '/dashboard/inventario/rutas', desc: 'Gestión de flotas y rutas de distribución', icon: Truck, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },",
    "{ name: 'Rutas', path: '/dashboard/inventario/rutas', desc: 'Gestión de flotas y rutas de distribución', icon: Truck, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },\n    " + new_module + ","
)

with open(hub_path, 'w', encoding='utf-8') as f:
    f.write(hub)

print("Updated Sidebar and Hub with Inventario Compartido")
