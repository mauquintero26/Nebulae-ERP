import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the layout wrapper logic
# Old: <div className={`flex gap-4 items-start ${showBitacora ? '' : 'justify-center'}`}>
# Old: <div className={`flex-1 space-y-4 ${showBitacora ? '' : 'max-w-5xl w-full'}`}>

new_wrapper = """      <div className={`flex gap-4 items-start ${isNew ? 'justify-center' : ''}`}>
        {/* LEFT COLUMN: Dynamic Tab Content */}
        <div className={`flex-1 space-y-4 ${isNew ? 'max-w-5xl w-full' : 'w-full'}`}>"""

content = re.sub(
    r'<div className=\{`flex gap-4 items-start \$\{showBitacora \? \'\' : \'justify-center\'\}`\}>\s*\{\/\* LEFT COLUMN: Dynamic Tab Content \*\/}\s*<div className=\{`flex-1 space-y-4 \$\{showBitacora \? \'\' : \'max-w-5xl w-full\'\}`\}>',
    new_wrapper,
    content
)

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Layout fixed for full width tabs")
