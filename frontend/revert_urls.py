import os

path_api = 'src/lib/api.ts'
with open(path_api, 'r', encoding='utf-8') as f:
    text_api = f.read()

text_api = text_api.replace("const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';", "const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';")

with open(path_api, 'w', encoding='utf-8') as f:
    f.write(text_api)

path_chat = 'src/components/GlobalAIChat.tsx'
with open(path_chat, 'r', encoding='utf-8') as f:
    text_chat = f.read()

text_chat = text_chat.replace("const socket = new WebSocket('wss://api.nebulaekids.com/ws/chat');", "const socket = new WebSocket('ws://localhost:5000/ws/chat');")

with open(path_chat, 'w', encoding='utf-8') as f:
    f.write(text_chat)

print("Switched URLs to localhost")
