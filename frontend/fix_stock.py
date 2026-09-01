import os

path = 'src/app/dashboard/inventario/stock/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("import { useState, useEffect } from 'react';\n\"use client\";", "\"use client\";\nimport { useState, useEffect } from 'react';")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
