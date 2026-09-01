import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace file upload button
pattern_upload = re.compile(r'<div>\s*<h3[^>]*>Fotograf.a / Logo</h3>\s*<p[^>]*>Sube una imagen[^<]*</p>\s*<button[^>]*>Subir imagen</button>\s*</div>')
new_upload = '''<div>
                    <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
                    <input type="file" id="upload-image" className="hidden" accept="image/*" onChange={(e) => { if(e.target.files && e.target.files[0]) { setImagePreview(URL.createObjectURL(e.target.files[0])); toast.success('Imagen cargada localmente'); } }} />
                    <label htmlFor="upload-image" className="cursor-pointer text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</label>
                  </div>'''
text = pattern_upload.sub(new_upload, text)

# Replace Avatar
pattern_avatar = re.compile(r'<div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">\s*<User size=\{32\} className="mb-1 opacity-50" />\s*</div>')
new_avatar = '''{imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-24 h-24 rounded-full object-cover shadow-inner shrink-0 border-2 border-slate-300" />
                ) : (
                  <div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                    <User size={32} className="mb-1 opacity-50" />
                  </div>
                )}'''
text = pattern_avatar.sub(new_avatar, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Done with Regex")
