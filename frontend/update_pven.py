import os

# 1. Update ventas hub
hub_path = 'src/app/dashboard/ventas/venta/page.tsx'
with open(hub_path, 'r', encoding='utf-8') as f:
    hub_content = f.read()

# Replace VEN- with PVEN-
hub_content = hub_content.replace("id: 'VEN-", "id: 'PVEN-")

with open(hub_path, 'w', encoding='utf-8') as f:
    f.write(hub_content)


# 2. Update ventas detail
detail_path = 'src/app/dashboard/ventas/venta/[id]/page.tsx'
with open(detail_path, 'r', encoding='utf-8') as f:
    detail_content = f.read()

detail_content = detail_content.replace("VEN-0105", "PVEN-0105")

with open(detail_path, 'w', encoding='utf-8') as f:
    f.write(detail_content)


# 3. Update compras/pedidos/[id]/page.tsx to add the PVEN origin
pec_path = 'src/app/dashboard/compras/pedidos/[id]/page.tsx'
with open(pec_path, 'r', encoding='utf-8') as f:
    pec_content = f.read()

# I will replace the "Origen" field in Pedido de Compra to say "PVEN-0105" instead of "COT-0005"
pec_content = pec_content.replace("COT-0005", "PVEN-0105")
pec_content = pec_content.replace("/dashboard/ventas/cotizacion/cot-0005", "/dashboard/ventas/venta/pven-0105")

with open(pec_path, 'w', encoding='utf-8') as f:
    f.write(pec_content)

print("Updated VEN- to PVEN- and linked PEC to PVEN.")
