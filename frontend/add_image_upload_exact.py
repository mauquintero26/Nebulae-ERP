import os

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

old_upload = """                  <div>
                    <h3 className="font-bold text-slate-800">Fotografa / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rǭpidamente al cliente.</p>
                    <button className="text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</button>
                  </div>"""

new_upload = """                  <div>
                    <h3 className="font-bold text-slate-800">Fotografa / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rǭpidamente al cliente.</p>
                    <input type="file" id="upload-image" className="hidden" accept="image/*" onChange={(e) => { if(e.target.files && e.target.files[0]) { setImagePreview(URL.createObjectURL(e.target.files[0])); toast.success('Imagen cargada localmente para previsualizacin'); } }} />
                    <label htmlFor="upload-image" className="cursor-pointer text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</label>
                  </div>"""

text = text.replace(old_upload, new_upload)

old_avatar = """<div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                  <User size={32} className="mb-1 opacity-50" />
                </div>"""

new_avatar = """{imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-24 h-24 rounded-full object-cover shadow-inner shrink-0 border-2 border-slate-300" />
                ) : (
                  <div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                    <User size={32} className="mb-1 opacity-50" />
                  </div>
                )}"""

text = text.replace(old_avatar, new_avatar)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Replaced exact strings")
