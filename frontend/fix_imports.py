import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r"User, ExternalLink, X, ShoppingCart, Calculator, ArrowRight"
replacement = "User, ExternalLink, X, ShoppingCart, Calculator, ArrowRight, Phone, Mail"

new_content = re.sub(pattern, replacement, content)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Done")
