import re

with open('src/app/dashboard/crm/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add activeView state inside CRMKanbanPage
state_pattern = r"(export default function CRMKanbanPage\(\) \{)"
new_state = r"\1\n  const [activeView, setActiveView] = useState<'kanban' | 'lista' | 'analisis'>('kanban');"
content = re.sub(state_pattern, new_state, content)

with open('src/app/dashboard/crm/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("State fixed")
