import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix clientData for NEW client so it doesn't have "Nuevo Cliente" forced in the data payload
old_client_data = """const clientData = isNew ? {
      id: 'Nuevo', name: 'Nuevo Cliente', initial: 'N', source: 'Tú',
      email: '', phone: '', document: '', address: '', city: '', country: '', category: '', tags: []
    } : selectedClient;"""
    
new_client_data = """const clientData = isNew ? {
      id: 'Nuevo', name: '', initial: 'N', source: 'Tú',
      email: '', phone: '', document: '', address: '', city: '', country: '', category: '', tags: []
    } : selectedClient;"""
text = text.replace(old_client_data, new_client_data)

# Fix input bindings so empty strings are preserved instead of falling back via ||
# Example: value={formData.first_name || (clientData.name ? clientData.name.split(' ')[0] : "")}
# To: value={formData.first_name !== undefined ? formData.first_name : (clientData.name ? clientData.name.split(' ')[0] : "")}

text = re.sub(r'value=\{formData\.first_name \|\|', 'value={formData.first_name !== undefined ? formData.first_name :', text)
text = re.sub(r'value=\{formData\.last_name \|\|', 'value={formData.last_name !== undefined ? formData.last_name :', text)
text = re.sub(r'value=\{formData\.document \|\|', 'value={formData.document !== undefined ? formData.document :', text)
text = re.sub(r'value=\{formData\.email \|\|', 'value={formData.email !== undefined ? formData.email :', text)
text = re.sub(r'value=\{formData\.phone \|\|', 'value={formData.phone !== undefined ? formData.phone :', text)
text = re.sub(r'value=\{formData\.city \|\|', 'value={formData.city !== undefined ? formData.city :', text)
text = re.sub(r'value=\{formData\.address \|\|', 'value={formData.address !== undefined ? formData.address :', text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed state fallbacks")
