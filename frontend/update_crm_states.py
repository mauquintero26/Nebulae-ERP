import re

with open('src/app/dashboard/crm/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace INITIAL_KANBAN completely
old_kanban_pattern = r"const INITIAL_KANBAN = \[\s*\{[\s\S]*?\}\s*\];"
new_kanban = """const INITIAL_KANBAN = [
  {
    id: 'col-1', title: 'Nuevo', color: 'bg-blue-500', bgColor: 'bg-blue-50/50',
    cards: [
      { id: 'lead-1', client: 'Empresa Alpha SAS', contact: 'Juan Pérez', value: 1250000, days: 1, source: 'Instagram', tag: 'Alta Prioridad' }
    ]
  },
  {
    id: 'col-2', title: 'Solicitud Cliente', color: 'bg-cyan-500', bgColor: 'bg-cyan-50/50',
    cards: [
      { id: 'lead-2', client: 'Inversiones Beta', contact: 'María Gómez', value: 850000, days: 3, source: 'WhatsApp', tag: 'Seguimiento' }
    ]
  },
  {
    id: 'col-3', title: 'Cotización', color: 'bg-indigo-500', bgColor: 'bg-indigo-50/50',
    cards: [
      { id: 'lead-3', client: 'Constructora Gamma', contact: 'Carlos Ruiz', value: 4500000, days: 2, source: 'Correo', tag: 'Enviada' },
      { id: 'lead-4', client: 'Distribuidora Delta', contact: 'Ana Silva', value: 3200000, days: 5, source: 'WhatsApp', tag: 'Revisión' }
    ]
  },
  {
    id: 'col-4', title: 'Pago', color: 'bg-amber-500', bgColor: 'bg-amber-50/50',
    cards: [
      { id: 'lead-6', client: 'Servicios Zeta', contact: 'Elena Soto', value: 6700000, days: 4, source: 'Reunión', tag: 'Acuerdo Plazos' }
    ]
  },
  {
    id: 'col-5', title: 'Pedido de Venta', color: 'bg-emerald-500', bgColor: 'bg-emerald-50/50',
    cards: [
      { id: 'lead-7', client: 'Grupo Omega', contact: 'David Ríos', value: 9500000, days: 0, source: 'Referido', tag: 'Completado' }
    ]
  }
];"""

content = re.sub(old_kanban_pattern, new_kanban, content)

with open('src/app/dashboard/crm/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("CRM Kanban states updated")
