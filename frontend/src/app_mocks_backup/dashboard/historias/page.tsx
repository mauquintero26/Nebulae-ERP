'use client';

import { useState } from 'react';
import { Sparkles, MessageSquare, Download, Send, Heart, Loader2 } from 'lucide-react';

export default function HistoriasPage() {
  const [product, setProduct] = useState('iphone15');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('urgencia');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedContent('');

    // Mock API call delay
    setTimeout(() => {
      let mockResult = '';
      if (product === 'iphone15') {
        mockResult = tone === 'urgencia' 
          ? "🚨 ¡OFERTA RELÁMPAGO! 🚨\n\nSolo por HOY: iPhone 15 Pro con 20% OFF. ¡No te quedes sin el tuyo, unidades limitadas!\n\n👇 ¡Haz clic en el enlace!"
          : tone === 'elegante'
          ? "✨ Innovación y elegancia en la palma de tu mano. Descubre el nuevo iPhone 15 Pro.\n\nExperimenta el futuro hoy. ✨"
          : "😂 Cuando tu celular se traba al abrir WhatsApp, sabes que es hora de un iPhone 15 Pro. ¡Cómpralo ya y deja de sufrir!";
      } else if (product === 'zapatos_nike') {
        mockResult = tone === 'urgencia'
          ? "🔥 ¡ÚLTIMAS TALLAS! 🔥\n\nZapatos Nike Air Max. Corre por los tuyos antes de que vuelen. 🏃‍♂️💨"
          : tone === 'elegante'
          ? "El diseño clásico que define tu estilo. Nike Air Max.\n\nDa el siguiente paso con distinción."
          : "👟 Para los que quieren correr de sus problemas pero con mucho estilo. ¡Nuevos Nike Air Max!";
      } else {
        mockResult = tone === 'urgencia'
          ? "⚠️ ¡PROMO 2x1! ⚠️\n\nCrema Facial Hidratante. Solo por 24 horas. ¡Cuida tu piel AHORA!"
          : tone === 'elegante'
          ? "El secreto de una piel radiante y eterna.\n\nNuestra Crema Facial Hidratante Premium te acompaña en cada momento."
          : "🧖‍♀️ Cuando tienes 20 pero tu piel dice 40... ¡Tranquila! Nuestra crema hidratante te salva. 😉";
      }

      setGeneratedContent(mockResult);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="flex flex-col items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" /> Generador de Historias IA
          </h1>
          <p className="text-sm text-slate-500 mt-1">Crea contenido promocional optimizado para Instagram y WhatsApp (Mock).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Configuración de la Historia</h3>
            
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">1. Selecciona el Producto (Simulado)</label>
                <select 
                  value={product}
                  onChange={e => setProduct(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium text-slate-700"
                >
                  <option value="iphone15">📱 iPhone 15 Pro (Simulado)</option>
                  <option value="zapatos_nike">👟 Zapatos Nike Air Max (Simulado)</option>
                  <option value="crema_facial">🧴 Crema Facial Hidratante (Simulado)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">2. ¿Qué quieres comunicar?</label>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Ej: Quiero anunciar un 20% de descuento por el día de la madre..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">3. Tono y Estilo</label>
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => setTone('urgencia')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'urgencia' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🔥 Urgencia</button>
                  <button onClick={() => setTone('elegante')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'elegante' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>✨ Elegante</button>
                  <button onClick={() => setTone('divertido')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'divertido' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>😂 Divertido</button>
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-purple-600/20"
              >
                {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generando...</> : <><Sparkles className="w-5 h-5" /> Generar con IA</>}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Mobile Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-[320px] h-[650px] bg-slate-900 rounded-[40px] p-2 shadow-2xl relative border-8 border-slate-800 overflow-hidden flex flex-col">
            {/* Camera Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-2xl z-20"></div>
            
            {/* Screen Content */}
            <div className="flex-1 bg-gradient-to-br from-slate-800 to-slate-900 rounded-[32px] overflow-hidden relative flex flex-col">
              
              {/* Story Header */}
              <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-8 pb-4 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex gap-1 mb-3">
                  <div className="h-0.5 bg-white/30 flex-1 rounded-full overflow-hidden">
                    {generatedContent && <div className="h-full bg-white w-full animate-[progress_5s_linear]"></div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-orange-500 p-0.5">
                    <div className="w-full h-full bg-slate-900 rounded-full border border-slate-800"></div>
                  </div>
                  <span className="text-white text-xs font-bold drop-shadow-md">Mi Empresa</span>
                  <span className="text-white/60 text-[10px] ml-1 drop-shadow-md">2h</span>
                </div>
              </div>

              {/* Story Body */}
              <div className="flex-1 flex items-center justify-center p-8 text-center relative z-0">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                    <p className="text-white/60 text-sm font-medium">Creando magia...</p>
                  </div>
                ) : generatedContent ? (
                  <p className="text-white text-2xl font-bold leading-tight whitespace-pre-wrap text-shadow-lg" style={{textShadow: '0 2px 10px rgba(0,0,0,0.5)'}}>
                    {generatedContent}
                  </p>
                ) : (
                  <p className="text-white/40 text-sm font-medium border border-white/20 p-6 rounded-2xl border-dashed">
                    La previsualización de tu historia aparecerá aquí.
                  </p>
                )}
              </div>

              {/* Story Footer */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-3">
                <div className="flex-1 border border-white/30 rounded-full px-4 py-2 flex items-center">
                  <span className="text-white/50 text-xs font-medium">Enviar mensaje...</span>
                </div>
                <button className="text-white hover:text-red-500 transition-colors">
                  <Heart className="w-6 h-6" />
                </button>
                <button className="text-white hover:text-blue-400 transition-colors">
                  <Send className="w-6 h-6" />
                </button>
              </div>

            </div>
          </div>

          <div className="flex gap-3 w-[320px] mt-6">
            <button className="flex-1 border border-slate-300 bg-white text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors hover:bg-slate-50 flex items-center justify-center gap-2 shadow-sm">
              <Download className="w-4 h-4" /> Bajar
            </button>
            <button 
              disabled={!generatedContent}
              className="flex-[2] bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20"
            >
              <Send className="w-4 h-4" /> Publicar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
