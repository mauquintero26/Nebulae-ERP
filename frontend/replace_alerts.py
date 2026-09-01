import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace all alert(xxx) with toast.success(xxx)
text = re.sub(r"alert\('([^']+)'\)", r"toast.success('\1')", text)

# There is a confirm check that might need to be left as confirm or replaced. 
# confirm is fine, but the alert inside can be a toast.
# The regex already catches the alert inside the confirm block!

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Replaced alerts with toasts")
