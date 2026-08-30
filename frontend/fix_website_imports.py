import re

with open('src/app/dashboard/website/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("ChevronLeft, Send,", "ChevronLeft, ChevronRight, ChevronDown, Send,")

with open('src/app/dashboard/website/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added missing imports")
