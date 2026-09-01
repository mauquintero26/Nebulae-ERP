import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

old_payload = """        await createCustomer({
          first_name: first,
          last_name: last,
          email: formData.email,
          phone: formData.phone,
          city: formData.city
        });"""

new_payload = """        await createCustomer({
          first_name: first,
          last_name: last || 'N/A',
          email: formData.email || null,
          phone: formData.phone || null,
          city: formData.city || null
        });"""

text = text.replace(old_payload, new_payload)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Protected payload constraints")
