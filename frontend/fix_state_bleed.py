import os

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix 1: Selecting a client
text = text.replace("onClick={() => setSelectedClient(client)}", "onClick={() => { setSelectedClient(client); setFormData({}); }}")

# Fix 2: Selecting NEW
text = text.replace("setSelectedClient('NEW');", "setSelectedClient('NEW');\n              setFormData({});")

# Fix 3: Clearing on close
text = text.replace("setSelectedClient(null);", "setSelectedClient(null);\n        setFormData({});")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed state bleeding")
