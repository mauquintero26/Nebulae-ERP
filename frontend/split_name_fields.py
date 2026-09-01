import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the input block
pattern_input = re.compile(r'<div>\s*<label[^>]*>Nombre Completo / Raz.n Social</label>\s*<input type="text" value=\{formData\.name \|\| clientData\.name \|\| ""\} onChange=\{\(e\) => setFormData\(\{.*?\}\)\} className="[^"]*" />\s*</div>')

new_input = '''<div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre (s)</label>
                        <input type="text" value={formData.first_name || (clientData.name ? clientData.name.split(' ')[0] : "")} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Apellido (s) / Razón Social</label>
                        <input type="text" value={formData.last_name || (clientData.name ? clientData.name.split(' ').slice(1).join(' ') : "")} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                      </div>
                    </div>'''

text = pattern_input.sub(new_input, text)

# Replace the handleSave split logic
old_save = '''// Mapear nombre completo
          const names = (formData.name || 'Sin Nombre').split(' ');
          const first = names[0];
          const last = names.slice(1).join(' ') || '';
          
          await createCustomer({
            first_name: first,
            last_name: last || 'N/A','''

new_save = '''          await createCustomer({
            first_name: formData.first_name || 'Sin Nombre',
            last_name: formData.last_name || 'N/A','''

text = text.replace(old_save, new_save)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated name fields")
