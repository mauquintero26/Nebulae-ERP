import os

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Update mapped object
text = text.replace("document: '',", "document: c.document || '',")
text = text.replace("address: '',", "address: c.address || '',")

# Update payload in handleSave
text = text.replace("city: formData.city || null", "city: formData.city || null,\n            document: formData.document || null,\n            address: formData.address || null")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated frontend for document and address")
