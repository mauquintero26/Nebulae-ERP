import os

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('export default function Sidebar()', 'export function Sidebar()')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed default vs named export in Sidebar.tsx")
