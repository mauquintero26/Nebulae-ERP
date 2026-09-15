'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, MessageSquare, Maximize2 } from 'lucide-react';

const CHATWOOT_URL = 'https://chatbot-crn-chatwoot.ionwxk.easypanel.host/app/accounts/1/conversations';

export default function AsistenteOmnicanal() {
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleRefresh = () => setIframeKey(k => k + 1);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full w-full'} bg-white flex flex-col overflow-hidden`}>

      {/* BARRA SUPERIOR */}
      <div className="h-11 border-b border-slate-200 bg-white px-4 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Indicador Live */}
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-black text-slate-800 tracking-tight">Asistente Omnicanal</span>
          </span>
          {/* Badge Telegram */}
          <span className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2L2 9.5l7 3.5 3 7 2-4.5 5.5 3.5L21.5 2z"/>
              <path d="M9 13l5-4"/>
            </svg>
            Telegram activo
          </span>
          <span className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-500 px-2.5 py-0.5 rounded-full text-xs font-medium">
            <MessageSquare size={11} />
            Chatwoot · Nebulae
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            title="Recargar consola"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <RefreshCw size={11} />
            Recargar
          </button>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <Maximize2 size={11} />
            {isFullscreen ? 'Salir' : 'Ampliar'}
          </button>
          <a
            href={CHATWOOT_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
          >
            <ExternalLink size={11} />
            Nueva pestaña
          </a>
        </div>
      </div>

      {/* IFRAME CHATWOOT — ocupa todo el espacio restante */}
      <div className="flex-1 w-full relative bg-slate-50">
        <iframe
          key={iframeKey}
          src={CHATWOOT_URL}
          className="absolute inset-0 w-full h-full border-none"
          title="Chatwoot — Asistente Omnicanal Nebulae Kids"
          allow="camera; microphone; clipboard-write; clipboard-read; storage-access; cross-origin-isolated"
        />
      </div>
    </div>
  );
}
