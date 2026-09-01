import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix handleSave payload
old_save_regex = r"const names = \(formData\.name \|\| 'Sin Nombre'\)\.split\(' '\);\s*const first = names\[0\];\s*const last = names\.slice\(1\)\.join\(' '\) \|\| '';\s*await createCustomer\(\{\s*first_name: first,\s*last_name: last \|\| 'N/A',"

new_save = """await createCustomer({
            first_name: formData.first_name || 'Sin Nombre',
            last_name: formData.last_name || 'N/A',"""

text = re.sub(old_save_regex, new_save, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed handleSave payload for name")
