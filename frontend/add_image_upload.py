import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Add a state for image
if "const [imagePreview, setImagePreview]" not in text:
    text = text.replace("const [formData, setFormData] = useState<any>({});", "const [formData, setFormData] = useState<any>({});\n  const [imagePreview, setImagePreview] = useState<string | null>(null);")

# Replace the upload section
old_upload = '''<div>
                    <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
                    <button className="text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</button>
                  </div>'''

# Sometimes encoding differences cause match issues, use regex
regex_upload = r'<div>\s*<h3[^>]*>Fotografa / Logo</h3>\s*<p[^>]*>Sube una imagen para identificar rǭpidamente al cliente\.</p>\s*<button[^>]*>Subir imagen</button>\s*</div>'

new_upload = '''<div>
                    <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
                    <input 
                      type="file" 
                      id="upload-image" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => {
                        if(e.target.files && e.target.files[0]) {
                          setImagePreview(URL.createObjectURL(e.target.files[0]));
                          toast.success('Imagen cargada exitosamente');
                        }
                      }} 
                    />
                    <label htmlFor="upload-image" className="cursor-pointer text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">
                      Subir imagen
                    </label>
                  </div>'''

text = re.sub(regex_upload, new_upload, text)

# Show the image if imagePreview is set instead of the initial
regex_initial = r'<div className="w-24 h-24 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-4xl shadow-inner shrink-0">\s*\{clientData\.initial\}\s*</div>'

new_initial = '''{imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-24 h-24 rounded-2xl object-cover shadow-inner shrink-0" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-4xl shadow-inner shrink-0">
                    {clientData.initial}
                  </div>
                )}'''

text = re.sub(regex_initial, new_initial, text)

# Make sure to reset imagePreview on handleSave if isNew
text = text.replace("setSelectedClient(null);", "setSelectedClient(null);\n        setImagePreview(null);")
text = text.replace("onClick={() => setSelectedClient(null)}", "onClick={() => { setSelectedClient(null); setImagePreview(null); }}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added image upload feature")
