import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Using regex to replace the onClick completely
pattern = re.compile(r'onClick=\{\(\) => \{\s*if \(isNew\) \{\s*toast\.success\(\'Cliente creado exitosamente\'\);\s*setSelectedClient\(null\);\s*setFormData\(\{\}\);\s*setImagePreview\(null\);\s*\} else \{\s*toast\.success\(\'Cambios guardados\'\);\s*\}\s*\}\}')
text = pattern.sub('onClick={handleSave}', text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed the save button")
