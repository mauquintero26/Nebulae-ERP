'use client';

import { useState, useEffect } from 'react';
import { 
  ExternalLink, RefreshCw, MessageSquare, Maximize2, Minimize2,
  User, Package, CheckCircle2, Clock, PlusCircle,
  Sparkles, Copy, Check, Search, X, FileText, Phone, MapPin, Layers
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const CHATWOOT_URL = 'https://chatbot-crn-chatwoot.ionwxk.easypanel.host/app/accounts/1/conversations';

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDIENTE_COMPRA: { bg: 'bg-amber-50 border-amber-200 text-amber-700', text: 'text-amber-700', label: 'Pendiente Compra' },
  EN_TRANSITO: { bg: 'bg-blue-50 border-blue-200 text-blue-700', text: 'text-blue-700', label: 'En Tránsito' },
  EN_BODEGA: { bg: 'bg-purple-50 border-purple-200 text-purple-700', text: 'text-purple-700', label: 'En Bodega' },
  DISPONIBLE_ENTREGA: { bg: 'bg-cyan-50 border-cyan-200 text-cyan-700', text: 'text-cyan-700', label: 'Disp. Entrega' },
  FACTURADO: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-700', label: 'Facturado' },
  BORRADOR: { bg: 'bg-slate-100 border-slate-200 text-slate-700', text: 'text-slate-700', label: 'Borrador' },
  ENTREGADO: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-700', label: 'Entregado' },
  COMPLETADO: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-700', label: 'Completado' },
  CANCELADO: { bg: 'bg-rose-50 border-rose-200 text-rose-700', text: 'text-rose-700', label: 'Cancelado' },
};

function formatCOP(val: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(val);
}

export default function AsistenteOmnicanal() {
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Estados del Cliente & Contexto ERP
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [, setIsSearching] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<any | null>(null);
  const [contextData, setContextData] = useState<any | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Pestaña en columna de contexto
  const [activeTab, setActiveTab] = useState<'activos' | 'cerrados' | 'solicitudes' | 'copiloto'>('activos');

  // Modal para Crear Solicitud de Cliente (SC)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submittingSc, setSubmittingSc] = useState(false);
  const [scFormData, setScFormData] = useState({
    tipo_solicitud: 'Cotizacion de Producto',
    modalidad_pago: 'Contado',
    notas: '',
    productos_texto: '',
    advisor_name: '',
  });

  // Copiloto de IA
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleRefresh = () => setIframeKey(k => k + 1);

  // Búsqueda de clientes con debouncing
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(`/chat/search-customers?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res?.status === 'success') {
          setSearchResults(res.data || []);
        }
      } catch (err) {
        console.error('Error buscando clientes:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cargar contexto cuando se selecciona un cliente
  const loadCustomerContext = async (customerIdentifier: { id?: number; phone?: string; email?: string; q?: string }) => {
    setLoadingContext(true);
    try {
      const params = new URLSearchParams();
      if (customerIdentifier.id) params.set('customer_id', String(customerIdentifier.id));
      if (customerIdentifier.phone) params.set('phone', customerIdentifier.phone);
      if (customerIdentifier.email) params.set('email', customerIdentifier.email);
      if (customerIdentifier.q) params.set('q', customerIdentifier.q);

      const res = await apiFetch(`/chat/customer-context?${params.toString()}`);
      if (res?.status === 'success' && res.found) {
        setActiveCustomer(res.data.customer);
        setContextData(res.data);
        generateAiSuggestions(res.data);
      } else {
        setContextData(null);
      }
    } catch (err) {
      console.error('Error cargando contexto de cliente:', err);
      setContextData(null);
    } finally {
      setLoadingContext(false);
    }
  };

  // Generar sugerencias con Copiloto IA
  const generateAiSuggestions = async (context: any) => {
    if (!context?.customer) return;
    setLoadingAi(true);
    try {
      const res = await apiFetch('/chat/ai-copilot-suggest', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: context.customer.name,
          active_orders: context.active_orders,
          customer_requests: context.customer_requests,
        }),
      });
      if (res?.status === 'success' && res.data?.suggestions) {
        setAiSuggestions(res.data.suggestions);
      }
    } catch (err) {
      console.error('Error generando sugerencias IA:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  // Escuchar mensajes de Chatwoot (Auto-sincronización con la conversación activa)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        let msgData = event.data;
        if (typeof msgData === 'string' && msgData.startsWith('{')) {
          msgData = JSON.parse(msgData);
        }

        if (msgData?.type === 'CHATWOOT_CONVERSATION_ACTIVE' || msgData?.event === 'appContext') {
          const contact = msgData?.contact || msgData?.data?.contact;
          if (contact) {
            const phone = contact.phone_number || '';
            const email = contact.email || '';
            const name = contact.name || '';
            if (phone || email || name) {
              loadCustomerContext({ phone, email, q: name });
            }
          }
        }
      } catch (e) {
        // Silenciar
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, []);

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Enviar creación de Solicitud de Cliente (SC)
  const handleCreateSc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer && !scFormData.notas) return;

    setSubmittingSc(true);
    try {
      const prods = scFormData.productos_texto
        ? scFormData.productos_texto.split('\n').filter(Boolean).map(l => ({ nombre: l.trim(), cantidad: 1 }))
        : [];

      const payload = {
        customer_id: activeCustomer?.id,
        customer_name: activeCustomer?.name,
        customer_phone: activeCustomer?.phone,
        customer_email: activeCustomer?.email,
        tipo_solicitud: scFormData.tipo_solicitud,
        modalidad_pago: scFormData.modalidad_pago,
        notas: scFormData.notas,
        productos: prods,
        advisor_name: scFormData.advisor_name,
      };

      const res = await apiFetch('/chat/create-customer-request', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res?.status === 'success') {
        setIsModalOpen(false);
        setScFormData({
          tipo_solicitud: 'Cotizacion de Producto',
          modalidad_pago: 'Contado',
          notas: '',
          productos_texto: '',
          advisor_name: '',
        });
        if (activeCustomer?.id) {
          loadCustomerContext({ id: activeCustomer.id });
        }
        setActiveTab('solicitudes');
      }
    } catch (err) {
      console.error('Error creando solicitud:', err);
    } finally {
      setSubmittingSc(false);
    }
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full w-full'} bg-slate-100 flex flex-col overflow-hidden`}>

      {/* BARRA SUPERIOR */}
      <div className="h-11 border-b border-slate-200 bg-white px-4 flex items-center justify-between flex-shrink-0 shadow-xs z-20">
        <div className="flex items-center gap-3">
          {/* Indicador Live */}
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-black text-slate-800 tracking-tight">Asistente Omnicanal</span>
          </span>
          {/* Badge Telegram */}
          <span className="hidden sm:flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 px-2 py-0.5 rounded-full text-xs font-bold">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2L2 9.5l7 3.5 3 7 2-4.5 5.5 3.5L21.5 2z"/>
              <path d="M9 13l5-4"/>
            </svg>
            Telegram activo
          </span>
          <span className="hidden md:flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-medium">
            <MessageSquare size={11} />
            Chatwoot · Nebulae
          </span>

          {activeCustomer && (
            <span className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
              <User size={11} />
              {activeCustomer.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Toggle Columna Contexto */}
          <button
            onClick={() => setShowSidebar(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
              showSidebar 
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Layers size={12} />
            {showSidebar ? 'Ocultar Contexto' : 'Ver Contexto ERP'}
          </button>

          <button
            onClick={handleRefresh}
            title="Recargar consola"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw size={11} />
            Recargar
          </button>
          
          <button
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            {isFullscreen ? 'Salir' : 'Ampliar'}
          </button>

          <a
            href={CHATWOOT_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
          >
            <ExternalLink size={11} />
            Nueva pestaña
          </a>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL: CHATWOOT + COLUMNA CONTEXTO */}
      <div className="flex-1 w-full flex flex-row overflow-hidden relative">

        {/* ÁREA IZQUIERDA: IFRAME CHATWOOT */}
        <div className="flex-1 h-full min-w-0 relative bg-slate-50">
          <iframe
            key={iframeKey}
            src={CHATWOOT_URL}
            className="absolute inset-0 w-full h-full border-none"
            title="Chatwoot — Asistente Omnicanal Nebulae Kids"
            allow="camera; microphone; clipboard-write; clipboard-read; storage-access; cross-origin-isolated"
          />
        </div>

        {/* ÁREA DERECHA: COLUMNA DE CONTEXTO ERP */}
        {showSidebar && (
          <aside className="w-96 lg:w-[420px] h-full flex flex-col border-l border-slate-200 bg-white flex-shrink-0 z-10 shadow-lg">
            
            {/* Header de la Columna: Buscador de Cliente */}
            <div className="p-3.5 border-b border-slate-200 bg-slate-50/70">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre, tel o email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium placeholder-slate-400"
                />
                {searchQuery && (
                  <button 
                    onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Dropdown de Resultados de Búsqueda */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {searchResults.map(cust => (
                      <button
                        key={cust.id}
                        onClick={() => {
                          setActiveCustomer(cust);
                          setSearchQuery('');
                          setSearchResults([]);
                          loadCustomerContext({ id: cust.id });
                        }}
                        className="w-full text-left p-2.5 hover:bg-indigo-50/50 transition-colors flex flex-col"
                      >
                        <span className="text-xs font-bold text-slate-800">{cust.name}</span>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          {cust.phone && <span className="flex items-center gap-1"><Phone size={10} /> {cust.phone}</span>}
                          {cust.city && <span className="flex items-center gap-1"><MapPin size={10} /> {cust.city}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CUERPO DEL CONTEXTO (SCROLLABLE) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {loadingContext ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                  <RefreshCw size={24} className="animate-spin text-indigo-500" />
                  <span className="text-xs font-bold">Cargando perfil 360 del cliente...</span>
                </div>
              ) : contextData ? (
                <>
                  {/* CARD DE REVENUE Y PERFIL FINANCIERO */}
                  <div className="p-4 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-md relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                          {contextData.revenue.segmento}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-white/10 rounded-full font-bold">
                          ID: #{contextData.customer.id}
                        </span>
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-slate-300 font-medium">Revenue Total (Ventas)</div>
                        <div className="text-2xl font-black tracking-tight text-white mt-0.5">
                          {formatCOP(contextData.revenue.total_spent_cop)}
                        </div>
                      </div>

                      {/* Mini métricas */}
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center">
                        <div>
                          <div className="text-[10px] text-slate-400">Total Pedidos</div>
                          <div className="text-sm font-bold text-white mt-0.5">{contextData.revenue.total_orders_count}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Activos</div>
                          <div className="text-sm font-bold text-amber-300 mt-0.5">{contextData.revenue.active_orders_count}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Ticket Promedio</div>
                          <div className="text-xs font-bold text-emerald-300 mt-1">
                            {formatCOP(contextData.revenue.avg_ticket_cop).split(',')[0]}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BOTÓN PRINCIPAL: CREAR SOLICITUD DE CLIENTE */}
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <PlusCircle size={15} />
                    Crear Solicitud de Cliente
                  </button>

                  {/* NAVEGACIÓN DE PESTAÑAS */}
                  <div className="flex border-b border-slate-200 text-xs font-bold">
                    <button
                      onClick={() => setActiveTab('activos')}
                      className={`flex-1 pb-2 text-center transition-colors border-b-2 cursor-pointer ${
                        activeTab === 'activos'
                          ? 'border-indigo-600 text-indigo-600 font-black'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Activos ({contextData.active_orders.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('cerrados')}
                      className={`flex-1 pb-2 text-center transition-colors border-b-2 cursor-pointer ${
                        activeTab === 'cerrados'
                          ? 'border-indigo-600 text-indigo-600 font-black'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Entregados ({contextData.closed_orders.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('solicitudes')}
                      className={`flex-1 pb-2 text-center transition-colors border-b-2 cursor-pointer ${
                        activeTab === 'solicitudes'
                          ? 'border-indigo-600 text-indigo-600 font-black'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      SCs ({contextData.customer_requests.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('copiloto')}
                      className={`flex-1 pb-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1 cursor-pointer ${
                        activeTab === 'copiloto'
                          ? 'border-purple-600 text-purple-600 font-black'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Sparkles size={11} className="text-purple-500" />
                      IA
                    </button>
                  </div>

                  {/* CONTENIDO DE PESTAÑAS */}
                  <div className="space-y-3">

                    {/* TAB: PEDIDOS ACTIVOS */}
                    {activeTab === 'activos' && (
                      <div className="space-y-2.5">
                        {contextData.active_orders.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <Clock size={20} className="mx-auto mb-1 opacity-50" />
                            <span className="text-xs">No tiene pedidos activos en curso.</span>
                          </div>
                        ) : (
                          contextData.active_orders.map((ord: any) => {
                            const badge = STATUS_BADGES[ord.estado] || STATUS_BADGES.BORRADOR;
                            return (
                              <div key={ord.id} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-800 tracking-tight">{ord.numero}</span>
                                  <span className={`text-[10px] px-2 py-0.5 font-bold border rounded-full ${badge.bg}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  <span className="font-semibold text-slate-500">Items: </span>
                                  {ord.productos_resumen}
                                </div>
                                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                                  <span className="text-slate-400">{ord.fecha}</span>
                                  <span className="font-black text-slate-800">{formatCOP(ord.total_cop)}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* TAB: PEDIDOS CERRADOS O ENTREGADOS */}
                    {activeTab === 'cerrados' && (
                      <div className="space-y-2.5">
                        {contextData.closed_orders.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <CheckCircle2 size={20} className="mx-auto mb-1 opacity-50" />
                            <span className="text-xs">No registra compras entregadas previamente.</span>
                          </div>
                        ) : (
                          contextData.closed_orders.map((ord: any) => (
                            <div key={ord.id} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800">{ord.numero}</span>
                                <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
                                  Entregado
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">{ord.productos_resumen}</div>
                              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                                <span className="text-slate-400">{ord.fecha}</span>
                                <span className="font-bold text-slate-800">{formatCOP(ord.total_cop)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB: SOLICITUDES DE CLIENTE (SC) */}
                    {activeTab === 'solicitudes' && (
                      <div className="space-y-2.5">
                        {contextData.customer_requests.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <FileText size={20} className="mx-auto mb-1 opacity-50" />
                            <span className="text-xs">No hay solicitudes registradas aún.</span>
                          </div>
                        ) : (
                          contextData.customer_requests.map((sc: any) => (
                            <div key={sc.id} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-800">{sc.numero}</span>
                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold">
                                  {sc.estado}
                                </span>
                              </div>
                              <div className="text-[11px] text-indigo-700 font-semibold">{sc.tipo}</div>
                              {sc.notas && <p className="text-[11px] text-slate-600 italic line-clamp-2">&ldquo;{sc.notas}&rdquo;</p>}
                              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                                Asesor: {sc.asesor} · {sc.fecha}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB: COPILOTO IA */}
                    {activeTab === 'copiloto' && (
                      <div className="space-y-3">
                        <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 mb-1">
                            <Sparkles size={13} className="text-purple-600" />
                            Análisis Comercial IA
                          </div>
                          <p className="text-[11px] text-purple-800 leading-relaxed">
                            {contextData.ai_insights.summary}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">Respuestas Sugeridas</span>
                            <button
                              onClick={() => generateAiSuggestions(contextData)}
                              disabled={loadingAi}
                              className="text-[11px] text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw size={10} className={loadingAi ? 'animate-spin' : ''} />
                              Refrescar
                            </button>
                          </div>

                          {loadingAi ? (
                            <div className="py-6 text-center text-xs text-slate-400">Generando sugerencias...</div>
                          ) : aiSuggestions.length === 0 ? (
                            <div className="text-center py-6 text-xs text-slate-400">
                              Pulsa refrescar para generar respuestas personalizadas.
                            </div>
                          ) : (
                            aiSuggestions.map((sug, idx) => (
                              <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800">{sug.title}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold uppercase">
                                    {sug.badge}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  {sug.text}
                                </p>
                                <button
                                  onClick={() => handleCopyText(sug.text, idx)}
                                  className="w-full py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  {copiedIndex === idx ? (
                                    <>
                                      <Check size={12} className="text-emerald-600" />
                                      <span className="text-emerald-700">¡Copiado al portapapeles!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>Copiar para el Chat</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </>
              ) : (
                /* ESTADO SIN CLIENTE SELECCIONADO */
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User size={24} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-700">Sin cliente seleccionado</h4>
                    <p className="text-[11px] text-slate-400 max-w-xs">
                      Selecciona una conversación en Chatwoot o utiliza el buscador superior para vincular un cliente del ERP.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </aside>
        )}

      </div>

      {/* MODAL: CREAR SOLICITUD DE CLIENTE (SC) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                <h3 className="text-sm font-black text-slate-800">Nueva Solicitud de Cliente (SC)</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSc} className="p-5 space-y-3.5">
              {/* Cliente */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Cliente Vinculado</label>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>{activeCustomer ? activeCustomer.name : 'Cliente no registrado'}</span>
                  {activeCustomer?.phone && (
                    <span className="text-[11px] font-normal text-slate-500">{activeCustomer.phone}</span>
                  )}
                </div>
              </div>

              {/* Tipo y Modalidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de Solicitud</label>
                  <select
                    value={scFormData.tipo_solicitud}
                    onChange={e => setScFormData({ ...scFormData, tipo_solicitud: e.target.value })}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Cotizacion de Producto">Cotización de Producto</option>
                    <option value="Pedido Inmediato">Pedido Inmediato</option>
                    <option value="Pedido de Importacion">Pedido de Importación</option>
                    <option value="Consulta General">Consulta General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Modalidad de Pago</label>
                  <select
                    value={scFormData.modalidad_pago}
                    onChange={e => setScFormData({ ...scFormData, modalidad_pago: e.target.value })}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Contado">Contado</option>
                    <option value="50% Anticipo / 50% Entrega">50% Anticipo / 50% Entrega</option>
                    <option value="Credito">Crédito Comercial</option>
                  </select>
                </div>
              </div>

              {/* Productos o requerimiento */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Productos solicitados (1 por línea o requerimiento)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cuna colecho convertible blanco&#10;Colchón ortopédico infantil"
                  value={scFormData.productos_texto}
                  onChange={e => setScFormData({ ...scFormData, productos_texto: e.target.value })}
                  className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              {/* Notas de la conversación */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Notas / Instrucciones del Chat</label>
                <textarea
                  rows={2}
                  placeholder="Detalles conversados con el cliente en Chatwoot..."
                  value={scFormData.notas}
                  onChange={e => setScFormData({ ...scFormData, notas: e.target.value })}
                  className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              {/* Botones de acción */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingSc}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingSc ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      Crear Solicitud SC
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
