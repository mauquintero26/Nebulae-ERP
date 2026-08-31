"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  Sparkles, Loader2, Heart, Send, Download, Camera, 
  Palette, Image as ImageIcon, CalendarClock, Share2
, ArrowLeft } from 'lucide-react';

export default function HistoriasHub() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [product, setProduct] = useState('iphone15');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('urgencia');
  const [canvaTemplate, setCanvaTemplate] = useState('minimalista');

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedContent(
        tone === 'urgencia' ? '¡SOLO POR HOY! 🚨\n\nLleva tu ' + product.toUpperCase() + ' con 20% OFF.\n\n¡Corre que se agotan! 🏃‍♂️💨' :
        tone === 'elegante' ? 'La elegancia se redefine.\n\nDescubre el nuevo ' + product.toUpperCase() + '.\n\nExclusivo para ti. ✨' :
        '¿Listo para sorprenderte? 🤯\n\nEl ' + product.toUpperCase() + ' llegó para quedarse.\n\n¡Etiqueta a quien te lo debe regalar! 👇'
      );
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-6 min-h-max animate-in fade-in custom-scrollbar">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2">
          <ArrowLeft size={16} /> Volver al Hub de Marketing
        </Link>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Sparkles className="text-purple-600" size={28} /> Historias y Publicaciones (IA & Canva)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Diseña, visualiza, programa y publica contenido para tus redes sociales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form & Integrations */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4 flex items-center gap-2">
              <Palette className="text-purple-600" size={20} /> Asistente de Creación IA
            </h3>
            
            <div className="flex flex-col gap-5">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">1. Selecciona el Producto</label>
                  <select 
                    value={product}
                    onChange={e => setProduct(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium text-slate-700"
                  >
                    <option value="iphone15">📱 iPhone 15 Pro</option>
                    <option value="zapatos_nike">👟 Zapatos Nike Air Max</option>
                    <option value="crema_facial">🧴 Crema Facial Hidratante</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">2. Repositorio Canva (Branding)</label>
                  <select 
                    value={canvaTemplate}
                    onChange={e => setCanvaTemplate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium text-slate-700"
                  >
                    <option value="minimalista">🎨 Template: Minimalista White</option>
                    <option value="cyberpunk">🎨 Template: Cyberpunk Neon</option>
                    <option value="corporativo">🎨 Template: Corporativo Blue</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">3. ¿Qué quieres comunicar?</label>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Ej: Quiero anunciar un 20% de descuento por el día de la madre..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">4. Tono y Estilo Textual</label>
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => setTone('urgencia')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'urgencia' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🔥 Urgencia</button>
                  <button onClick={() => setTone('elegante')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'elegante' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>✨ Elegante</button>
                  <button onClick={() => setTone('divertido')} className={`py-3 px-2 rounded-xl text-xs font-bold transition-colors border ${tone === 'divertido' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🥳 Divertido</button>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-[2] bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-purple-600/20"
                >
                  {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generando...</> : <><Sparkles className="w-5 h-5" /> Generar Historia (IA + Canva)</>}
                </button>
                <button className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                  <ImageIcon size={18} /> Subir Media
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Mobile Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-[320px] h-[650px] bg-slate-900 rounded-[40px] p-2 shadow-2xl relative border-8 border-slate-800 overflow-hidden flex flex-col">
            {/* Camera Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-2xl z-20 flex justify-center items-center">
              <div className="w-16 h-4 bg-black rounded-full"></div>
            </div>
            
            {/* Screen Content */}
            <div className={`flex-1 rounded-[32px] overflow-hidden relative flex flex-col ${
              canvaTemplate === 'minimalista' ? 'bg-slate-100' :
              canvaTemplate === 'cyberpunk' ? 'bg-slate-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900 to-black' :
              'bg-blue-900'
            }`}>
              
              {/* Story Header */}
              <div className={`absolute top-0 left-0 right-0 z-10 px-4 pt-8 pb-4 bg-gradient-to-b ${canvaTemplate === 'minimalista' ? 'from-black/20 to-transparent' : 'from-black/60 to-transparent'}`}>
                <div className="flex gap-1 mb-3">
                  <div className="h-0.5 bg-white/30 flex-1 rounded-full overflow-hidden">
                    {generatedContent && <div className="h-full bg-white w-full animate-[progress_5s_linear]"></div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-orange-500 p-0.5">
                    <div className="w-full h-full bg-slate-900 rounded-full border border-slate-800"></div>
                  </div>
                  <span className="text-white text-xs font-bold drop-shadow-md">Nebulae Store</span>
                  <span className="text-white/80 text-[10px] ml-1 drop-shadow-md">Vista Previa</span>
                </div>
              </div>

              {/* Story Body */}
              <div className="flex-1 flex items-center justify-center p-8 text-center relative z-0">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className={`w-10 h-10 animate-spin ${canvaTemplate === 'minimalista' ? 'text-slate-800' : 'text-white'}`} />
                    <p className={`text-sm font-medium ${canvaTemplate === 'minimalista' ? 'text-slate-600' : 'text-white/60'}`}>Aplicando Brand Kit...</p>
                  </div>
                ) : generatedContent ? (
                  <p className={`text-2xl font-bold leading-tight whitespace-pre-wrap ${
                    canvaTemplate === 'minimalista' ? 'text-slate-800 drop-shadow-sm' :
                    canvaTemplate === 'cyberpunk' ? 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] font-mono' :
                    'text-white drop-shadow-lg'
                  }`}>
                    {generatedContent}
                  </p>
                ) : (
                  <p className={`text-sm font-medium border p-6 rounded-2xl border-dashed ${
                    canvaTemplate === 'minimalista' ? 'text-slate-400 border-slate-300' : 'text-white/40 border-white/20'
                  }`}>
                    La previsualización interactiva de tu historia aparecerá aquí.
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
              <Download size={18} /> Bajar
            </button>
            <button 
              disabled={!generatedContent}
              className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-amber-500/20"
            >
              <CalendarClock size={18} /> Programar
            </button>
            <button 
              disabled={!generatedContent}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20"
            >
              <Share2 size={18} /> Publicar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
