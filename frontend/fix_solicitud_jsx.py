import re

with open('src/app/dashboard/ventas/solicitud/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace (> 2 días) with (&gt; 2 días)
new_content = content.replace("(> 2 días)", "(&gt; 2 días)")

with open('src/app/dashboard/ventas/solicitud/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
    
print("Fixed JSX escape error in page.tsx")
