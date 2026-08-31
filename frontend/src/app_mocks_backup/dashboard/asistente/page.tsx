'use client';

import { MessageSquare, Hammer, Wrench } from 'lucide-react';

export default function AsistenteIAPage() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[70vh]">
      <div className="bg-white border border-slate-200 rounded-[32px] p-16 shadow-sm flex flex-col items-center text-center max-w-lg relative overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Wrench className="w-32 h-32 text-blue-900" />
        </div>
        <div className="absolute bottom-0 left-0 p-8 opacity-5 transform -scale-x-100">
          <Hammer className="w-32 h-32 text-purple-900" />
        </div>
        
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 relative z-10 border border-blue-100 shadow-inner">
          <MessageSquare className="w-10 h-10 text-blue-600" />
        </div>
        
        <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight relative z-10">Trabajando en esta sección...</h2>
        <p className="text-slate-500 leading-relaxed relative z-10">
          El módulo central del <strong className="text-blue-600">Asistente de IA (Mensajería y WhatsApp)</strong> se encuentra actualmente en desarrollo y construcción arquitectónica.
        </p>
        
        <div className="mt-8 flex gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
}
