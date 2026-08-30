import os

path = 'src/app/dashboard/scrapper/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

old_td = """                      <td className="px-6 py-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex shrink-0 items-center justify-center">
                          {promo.image ? (
                            <img src={promo.image} alt={promo.product} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-slate-400" />
                          )}
                        </div>
                      </td>"""

new_td = """                      <td className="px-6 py-3 relative group">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex shrink-0 items-center justify-center cursor-pointer">
                          {promo.image ? (
                            <img src={promo.image} alt={promo.product} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-slate-400" />
                          )}
                        </div>
                        
                        {/* Hover Overlay Image */}
                        {promo.image && (
                          <div className="hidden group-hover:block absolute left-20 top-1/2 -translate-y-1/2 z-[100] w-64 h-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-none origin-left animate-in fade-in zoom-in-95 duration-200">
                            <img src={promo.image} alt={promo.product} className="w-full h-full object-contain bg-slate-50 p-2" />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                              <p className="text-white text-xs font-bold truncate">{promo.product}</p>
                            </div>
                          </div>
                        )}
                      </td>"""

text = text.replace(old_td, new_td)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Scrapper page updated with image hover overlay.")
