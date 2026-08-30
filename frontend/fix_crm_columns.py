import re

with open('src/app/dashboard/crm/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("columns.map(col", "board.map(col")
content = content.replace("columns.flatMap(col", "board.flatMap(col")

with open('src/app/dashboard/crm/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Columns renamed to board")
