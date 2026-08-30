import os

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the initial state of openMenus
old_state = """  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    'CRM': true,
    'Ventas': true,
    'Compras': true,
    'Inventario': true,
    'Marketing': true,
    'Integraciones': true
  });"""

new_state = """  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});"""

text = text.replace(old_state, new_state)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed Sidebar default open state.")
