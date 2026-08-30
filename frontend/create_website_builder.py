import os

os.makedirs('src/app/dashboard/website', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  Monitor, Smartphone, Tablet, ChevronLeft, 
  Send, Sparkles, LayoutTemplate, Type, Image as ImageIcon,
  Palette, MousePointer2, Layers, Settings, Play, CheckCircle2,
  Undo2, Redo2, Save, ExternalLink
} from 'lucide-react';

export default function WebsiteBuilderPage() {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock chat history
  const [chat, setChat] = useState([
    { role: 'ai', text: '¡Hola! Soy tu Arquitecto Web IA. ¿Qué te gustaría modificar o construir hoy en tu tienda?' }
  ]);

  const handleSend = () => {
    if (!chatInput.trim()) return;
    const newChat = [...chat, { role: 'user', text: chatInput }];
    setChat(newChat);
    setChatInput('');
    setIsGenerating(true);

    setTimeout(() => {
      setChat([...newChat, { role: 'ai', text: '¡Claro! He aplicado el estilo oscuro al banner principal y he agrandado el botón de "Comprar Ahora". ¿Qué te parece el resultado en el lienzo central?' }]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="h-full w-full bg-[#1e1e24] flex flex-col overflow-hidden text-slate-300 font-sans animate-in fade-in">
      
      {/* Top Navbar (Editor Controls) */}
      <div className="h-14 bg-[#18181b] border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <span className="font-bold text-sm tracking-wide">Nebulae Builder IA</span>
          </div>
          <div className="h-6 w-px bg-slate-700 mx-2"></div>
          <div className="flex bg-[#27272a] p-1 rounded-lg">
            <button className="px-3 py-1 rounded text-xs font-bold bg-slate-700 text-white shadow-sm">Home</button>
            <button className="px-3 py-1 rounded text-xs font-bold text-slate-400 hover:text-white">Catálogo</button>
            <button className="px-3 py-1 rounded text-xs font-bold text-slate-400 hover:text-white">Contacto</button>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#27272a] p-1 rounded-lg">
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded transition-colors ${device === 'desktop' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}><Monitor size={16} /></button>
          <button onClick={() => setDevice('tablet')} className={`p-1.5 rounded transition-colors ${device === 'tablet' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}><Tablet size={16} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded transition-colors ${device === 'mobile' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}><Smartphone size={16} /></button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-slate-400">
            <button className="p-1.5 hover:text-white transition-colors"><Undo2 size={16} /></button>
            <button className="p-1.5 hover:text-white transition-colors"><Redo2 size={16} /></button>
          </div>
          <div className="h-6 w-px bg-slate-700 mx-1"></div>
          <button className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-colors">
            <Play size={14} /> Vista Previa
          </button>
          <button className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-purple-900/50">
            <Save size={14} /> Publicar
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: AI Assistant Chat */}
        <div className="w-80 bg-[#18181b] border-r border-slate-800 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" /> Copiloto de Diseño
            </h2>
            <p className="text-[10px] text-slate-500 mt-1">Pídele cambios a la web en lenguaje natural.</p>
          </div>
          
          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {chat.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-3 rounded-2xl max-w-[90%] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-[#27272a] text-slate-300 rounded-tl-sm border border-slate-700'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-purple-400 text-xs font-bold animate-pulse">
                <Sparkles size={14} /> Modificando la web...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-[#18181b] border-t border-slate-800">
            <div className="relative">
              <textarea 
                rows={3} 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ej: Agrega una sección de testimonios abajo..."
                className="w-full bg-[#27272a] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none custom-scrollbar"
              />
              <button 
                onClick={handleSend}
                className="absolute right-2 bottom-2 p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Center Column: Live Preview Canvas */}
        <div className="flex-1 bg-[#0f0f11] p-8 flex items-center justify-center overflow-y-auto custom-scrollbar relative">
          
          <div 
            className={`bg-white rounded-xl shadow-2xl transition-all duration-500 overflow-hidden relative ${
              device === 'desktop' ? 'w-full max-w-5xl h-[800px]' : 
              device === 'tablet' ? 'w-[768px] h-[1024px]' : 'w-[375px] h-[812px]'
            }`}
          >
            {/* Título y URL mockeada de la ventana */}
            <div className="bg-slate-100 h-8 flex items-center px-4 gap-2 border-b border-slate-200">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
              </div>
              <div className="mx-auto bg-white border border-slate-200 rounded text-[10px] text-slate-400 px-10 py-0.5 flex items-center gap-1">
                tienda.nebulae.com <ExternalLink size={10} />
              </div>
            </div>

            {/* MOCK WEBSITE CONTENT */}
            <div className="w-full h-full overflow-y-auto bg-white text-slate-800 custom-scrollbar">
              
              {/* Header Web */}
              <header className="flex justify-between items-center p-6 border-b border-slate-100">
                <h1 className="text-xl font-black tracking-tighter">MiiStore.</h1>
                <nav className="hidden md:flex gap-6 text-sm font-bold text-slate-500">
                  <span className="text-slate-900">Inicio</span>
                  <span>Catálogo</span>
                  <span>Nosotros</span>
                </nav>
                <button className="bg-slate-900 text-white px-5 py-2 rounded-full text-sm font-bold">Carrito (0)</button>
              </header>

              {/* Hero Section */}
              <section className="bg-slate-50 px-6 py-20 flex flex-col items-center text-center">
                <span className="text-purple-600 font-black text-xs tracking-widest uppercase mb-4">Nueva Colección 2026</span>
                <h2 className="text-5xl font-black tracking-tight max-w-2xl mb-6">Tecnología diseñada para tu estilo de vida.</h2>
                <p className="text-slate-500 max-w-md mb-8">Descubre la nueva línea de accesorios premium con envío inmediato a todo el país.</p>
                <button className="bg-purple-600 text-white px-8 py-3.5 rounded-full font-bold shadow-lg shadow-purple-200 hover:scale-105 transition-transform cursor-pointer relative ring-2 ring-purple-600 ring-offset-2">
                  <span className="absolute -top-3 -right-3 bg-indigo-500 text-white text-[9px] px-2 py-1 rounded-full uppercase flex items-center gap-1"><Sparkles size={10}/> Editado</span>
                  Explorar Catálogo
                </button>
              </section>

              {/* Grid de Productos Web */}
              <section className="p-10">
                <h3 className="text-2xl font-black mb-8 text-center">Productos Destacados</h3>
                <div className={`grid gap-6 ${device === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="group cursor-pointer">
                      <div className="bg-slate-100 aspect-square rounded-2xl mb-4 relative overflow-hidden">
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors"></div>
                        <div className="absolute top-3 left-3 bg-white px-2 py-1 rounded text-xs font-bold shadow-sm">Nuevo</div>
                      </div>
                      <h4 className="font-bold text-slate-800">Auriculares Inalámbricos Pro</h4>
                      <p className="text-slate-500 text-sm mt-1">$450.000</p>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* Selector interactivo superpuesto simulando que el IA está seleccionando un elemento */}
            <div className="absolute top-1/4 left-1/4 right-1/4 h-64 border-2 border-dashed border-purple-500 bg-purple-500/10 pointer-events-none rounded-2xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <div className="bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg flex items-center gap-2">
                <Sparkles size={12} /> Modificando sección Hero...
              </div>
            </div>

          </div>

        </div>

        {/* Right Column: Properties & Layers */}
        <div className="w-64 bg-[#18181b] border-l border-slate-800 flex flex-col flex-shrink-0">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button className="flex-1 py-3 text-xs font-bold text-white border-b-2 border-purple-500 flex items-center justify-center gap-2">
              <Layers size={14} /> Estructura
            </button>
            <button className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-300 flex items-center justify-center gap-2">
              <Settings size={14} /> Bloque
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            
            {/* Tree view */}
            <div className="flex items-center gap-2 text-sm text-slate-300 p-2 hover:bg-[#27272a] rounded cursor-pointer">
              <ChevronDown size={14} className="text-slate-500" />
              <LayoutTemplate size={14} className="text-indigo-400" />
              <span className="font-bold">Header Principal</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-300 p-2 bg-[#27272a] rounded border border-slate-700 cursor-pointer">
              <ChevronDown size={14} className="text-slate-500" />
              <LayoutTemplate size={14} className="text-purple-400" />
              <span className="font-bold text-white">Sección Hero</span>
            </div>
            
            <div className="pl-6 space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-400 p-1.5 hover:bg-[#27272a] rounded cursor-pointer">
                <Type size={12} /> Subtítulo
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 p-1.5 hover:bg-[#27272a] rounded cursor-pointer">
                <Type size={12} /> Título Principal H1
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 p-1.5 hover:bg-[#27272a] rounded cursor-pointer">
                <Type size={12} /> Párrafo
              </div>
              <div className="flex items-center gap-2 text-xs text-purple-400 p-1.5 bg-purple-500/10 rounded cursor-pointer font-bold">
                <MousePointer2 size={12} /> Botón de Acción
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-300 p-2 hover:bg-[#27272a] rounded cursor-pointer mt-2">
              <ChevronRight size={14} className="text-slate-500" />
              <LayoutTemplate size={14} className="text-emerald-400" />
              <span className="font-bold">Grilla Productos</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-300 p-2 hover:bg-[#27272a] rounded cursor-pointer">
              <ChevronRight size={14} className="text-slate-500" />
              <LayoutTemplate size={14} className="text-slate-400" />
              <span className="font-bold">Footer</span>
            </div>

          </div>

          <div className="p-4 border-t border-slate-800 bg-[#18181b]">
            <button className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-300 bg-[#27272a] border border-slate-700 hover:bg-slate-700 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Añadir Bloque Manual
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
"""

with open('src/app/dashboard/website/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Website Builder mockup created")
