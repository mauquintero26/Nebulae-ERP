"use client";

import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, getHeaders, API_URL, handleResponse } from '@/lib/api';
import toast from 'react-hot-toast';
import { 
  Search, Filter, LayoutGrid, List, Plus, 
  ChevronLeft, Calendar, MessageSquare, Settings, 
  Upload, ChevronDown, CheckCircle2, FileText, User,
  DollarSign, ShoppingBag, MapPin, Tag, Activity,
  Phone, Mail, X, ArrowRight
, Trash2, Edit, Download} from 'lucide-react';



export default function AgendaPage() {
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información y Bitácora');
  const [entityType, setEntityType] = useState('Individuo');
  const [activeTimeline, setActiveTimeline] = useState('general');
  const [showModal, setShowModal] = useState<string | null>(null);

  const [customers, setCustomers] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({});

  const [customer360, setCustomer360] = useState<any>(null);

  useEffect(() => {
    if (selectedClient && selectedClient !== 'NEW') {
      const fetchProfile = async () => {
        try {
          const res = await fetch(`${API_URL}/crm/customers/${selectedClient.realId}/profile-360`, { headers: getHeaders() });
          const data = await handleResponse(res);
          setCustomer360(data.data);
        } catch(e) {
          console.error(e);
        }
      };
      fetchProfile();
    } else {
      setCustomer360(null);
    }
  }, [selectedClient]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      const realCustomers = data.data || data;
      if (Array.isArray(realCustomers)) {
        const mapped = realCustomers.map(c => ({
          id: `CLI-00${c.id}`,
          realId: c.id,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email || '',
          phone: c.phone || '',
          type: 'Regular',
          sector: 'N/A',
          source: 'Registro CRM',
          initial: c.first_name ? c.first_name.charAt(0).toUpperCase() : 'C',
          document: '',
          address: '',
          city: c.city || '',
          country: 'Colombia',
          category: 'Regular',
          tags: []
        }));
        setCustomers(mapped);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async () => {
    if (selectedClient === 'NEW') {
      try {
        toast.loading('Guardando cliente...', { id: 'save-client' });
        // Mapear nombre completo
        const names = (formData.name || 'Sin Nombre').split(' ');
        const first = names[0];
        const last = names.slice(1).join(' ') || '';
        
        await createCustomer({
          first_name: first,
          last_name: last || 'N/A',
          email: formData.email || null,
          phone: formData.phone || null,
          city: formData.city || null
        });
        
        toast.success('Cliente creado', { id: 'save-client' });
        setSelectedClient(null);
        setFormData({});
        setImagePreview(null);
        fetchCustomers();
      } catch (error: any) {
        toast.error(error.message, { id: 'save-client' });
      }
    } else {
      toast.success('Cambios guardados localmente');
    }
  };
  
  const MOCK_CLIENTS = customers;


  // VIEW 1: LIST
  if (!selectedClient) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="text-slate-900"><User size={32} /></div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Agenda de Clientes</h1>
              <p className="text-slate-500 text-sm mt-1">Base de datos de tus prospectos y clientes activos.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setSelectedClient('NEW');
              setFormData({});
              setActiveTab('Información y Bitácora');
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Cliente
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-4 flex justify-between items-center">
          <div className="flex items-center">
            <button className="px-4 py-2 font-bold text-sm border-b-2 border-purple-600 text-purple-700">
              Todos mis clientes
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 outline-none focus:border-purple-600" />
            </div>
            <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Filter size={18} /></button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Rubro</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresado Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_CLIENTS.map((client) => (
                <tr key={client.id} onClick={() => { setSelectedClient(client); setFormData({}); }} className="hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">{client.initial}</div>
                      <span className="font-bold text-slate-800">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-800">{client.email}</p>
                    <p className="text-sm text-slate-500">{client.phone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-md text-xs border border-blue-100">{client.type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{client.sector}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-800">{client.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isNew = selectedClient === 'NEW';
  const clientData = isNew ? {
    id: 'Nuevo', name: 'Nuevo Cliente', initial: 'N', source: 'Tú',
    email: '', phone: '', document: '', address: '', city: '', country: '', category: '', tags: []
  } : selectedClient;

  // Render logic flags
  const showTabs = !isNew;
  const showBitacora = !isNew && activeTab === 'Información y Bitácora';

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <button onClick={() => { setSelectedClient(null);
        setFormData({}); setImagePreview(null); }} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 shadow-sm">
            <ChevronLeft size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl">
            {clientData.initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{clientData.name}</h1>
            <p className="text-slate-500 text-sm">
              Ingresado por: <span className="text-amber-600 font-bold">{clientData.source}</span>
            </p>
          </div>
        </div>

        {!isNew && (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowModal('Agendar')} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <Calendar size={16} /> Agendar
            </button>
            <button onClick={() => setShowModal('Contactar')} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <MessageSquare size={16} /> Contactar
            </button>
            <button onClick={() => setShowModal('Nueva Solicitud')} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <Plus size={16} /> Nueva Solicitud
            </button>
            <button onClick={() => setShowModal('Opciones de Cliente')} className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm"><Settings size={18} /></button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {showTabs && (
        <div className="flex flex-wrap border-b border-slate-200 mb-4 gap-x-6 gap-y-2">
          {['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

            <div className={`flex gap-4 items-start ${isNew ? 'justify-center' : ''}`}>
        {/* LEFT COLUMN: Dynamic Tab Content */}
        <div className={`flex-1 space-y-4 ${isNew ? 'max-w-5xl w-full' : 'w-full'}`}>
          
          {activeTab === 'Información y Bitácora' && (
            <>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-24 h-24 rounded-full object-cover shadow-inner shrink-0 border-2 border-slate-300" />
                ) : (
                  <div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                    <User size={32} className="mb-1 opacity-50" />
                  </div>
                )}
                <div>
                    <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
                    <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
                    <input type="file" id="upload-image" className="hidden" accept="image/*" onChange={(e) => { if(e.target.files && e.target.files[0]) { setImagePreview(URL.createObjectURL(e.target.files[0])); toast.success('Imagen cargada localmente'); } }} />
                    <label htmlFor="upload-image" className="cursor-pointer text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</label>
                  </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6">Información Básica</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Entidad</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setEntityType('Individuo')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${entityType === 'Individuo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Individuo</button>
                      <button onClick={() => setEntityType('Compañía')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${entityType === 'Compañía' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Compañía</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre (s)</label>
                        <input type="text" value={formData.first_name !== undefined ? formData.first_name : (clientData.name ? clientData.name.split(' ')[0] : "")} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Apellido (s) / Razón Social</label>
                        <input type="text" value={formData.last_name !== undefined ? formData.last_name : (clientData.name ? clientData.name.split(' ').slice(1).join(' ') : "")} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                      </div>
                    </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Identificación (CC/NIT/Pasaporte)</label>
                    <input type="text" value={formData.document !== undefined ? formData.document : clientData.document || ""} onChange={(e) => setFormData({...formData, document: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Categorización</label>
                    <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-purple-600">
                      <option>Prospecto</option>
                      <option>Cliente Regular</option>
                      <option>VIP</option>
                      <option>Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                    <input type="email" value={formData.email !== undefined ? formData.email : clientData.email || ""} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                    <input type="text" value={formData.phone !== undefined ? formData.phone : clientData.phone || ""} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad</label>
                    <input type="text" value={formData.city !== undefined ? formData.city : clientData.city || ""} onChange={(e) => setFormData({...formData, city: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Dirección de Facturación / Entrega</label>
                    <input type="text" value={formData.address !== undefined ? formData.address : clientData.address || ""} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Etiquetas (Tags)</label>
                  <input type="text" placeholder="Ej. Corporativo, Mayorista..." className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>

                <button 
                  onClick={handleSave}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
                >
                  {isNew ? 'Crear Cliente' : 'Guardar Cambios'}
                </button>
              </div>
            </>
          )}

          {!isNew && activeTab === 'Contactos Adicionales' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 min-h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Contactos Relacionados</h3>
                <button className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-200 transition-colors">
                  <Plus size={14}/> Agregar Contacto
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800">María Camila (Asistente)</h4>
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Phone size={14}/> +57 311 222 3344</p>
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Mail size={14}/> camila@empresa.com</p>
                </div>
              </div>
            </div>
          )}

          {!isNew && activeTab === 'Historial de Compra' && (
            <div className="space-y-4">
              {/* KPIs Financieros */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl text-white shadow-md">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Total Comprado</p>
                  <h2 className="text-3xl font-black">${(customer360?.ltv || 0).toLocaleString()}</h2>
                  <p className="text-sm opacity-90 mt-2">En {customer360?.active_orders?.length || 0} transacciones</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign size={14}/> Ganancia / LTV</p>
                  <h2 className="text-2xl font-black text-slate-800">$1.850.000</h2>
                  <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1">+24% vs año anterior</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><ShoppingBag size={14}/> Ticket Promedio</p>
                  <h2 className="text-2xl font-black text-slate-800">$1.062.500</h2>
                  <p className="text-xs font-bold text-slate-500 mt-2">Cliente VIP</p>
                </div>
              </div>

              {/* Lista de Compras */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Detalle de Compras</h3>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                      <th className="px-6 py-3 font-bold">Orden / Fecha</th>
                      <th className="px-6 py-3 font-bold">Artículos</th>
                      <th className="px-6 py-3 font-bold">Total</th>
                      <th className="px-6 py-3 font-bold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-902</div>
                        <div className="text-slate-500 text-xs">15 Ago 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Extractor Eléctrico Doble (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$850.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-850</div>
                        <div className="text-slate-500 text-xs">02 Jul 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Coche Paseador Premium (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$3.400.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Bitácora de Actividad - ONLY SHOWS FOR EXISTING CLIENTS IN 'Información y Bitácora' */}
        {showBitacora && (
          <div className="w-[420px] bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[700px] sticky top-0 flex-shrink-0">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-purple-600" size={18}/> Bitácora de Actividad
              </h3>
              <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
                <FileText size={14} /> Nota
              </button>
            </div>

            {/* Resumen de Estados Activos CRM */}
            <div className="p-5 border-b border-slate-100 bg-white space-y-3">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trámites Activos (CRM)</h4>
                {activeTimeline !== 'general' && (
                  <button onClick={() => setActiveTimeline('general')} className="text-[10px] text-purple-600 font-bold hover:underline">
                    Ver Todo
                  </button>
                )}
              </div>
              
              <div className={`flex justify-between items-center border p-3 rounded-xl transition-all ${activeTimeline === 'cotizacion' ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-100' : 'bg-indigo-50/30 border-indigo-100'}`}>
                <div>
                  <p className="text-xs font-bold text-indigo-900">Cotización #095</p>
                  <p className="text-[10px] text-indigo-600 mt-0.5">Cotizado - pdte confirmación</p>
                </div>
                <button onClick={() => setActiveTimeline('cotizacion')} className="text-xs font-bold bg-white text-indigo-600 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50">
                  Ver Tracking
                </button>
              </div>

              <div className={`flex justify-between items-center border p-3 rounded-xl transition-all ${activeTimeline === 'pedido' ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100' : 'bg-emerald-50/30 border-emerald-100'}`}>
                <div>
                  <p className="text-xs font-bold text-emerald-900">Pedido #089</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Procesando orden</p>
                </div>
                <button onClick={() => setActiveTimeline('pedido')} className="text-xs font-bold bg-white text-emerald-600 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-50">
                  Ver Tracking
                </button>
              </div>
            </div>

            {/* Trazabilidad Timeline */}
            <div className="flex-1 p-5 relative overflow-y-auto custom-scrollbar bg-slate-50/30">
              <div className="absolute left-[27px] top-5 bottom-5 w-0.5 bg-slate-200"></div>
              
              <div className="space-y-6 relative">
                
                {/* Event: Pedido */}
                {(activeTimeline === 'general' || activeTimeline === 'pedido') && (
                  <div className="relative pl-8">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm ring-4 ring-emerald-100"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:border-emerald-200 transition-colors cursor-pointer">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">Pedido de Venta Creado</h4>
                        <span className="text-[10px] text-slate-400 font-medium">Hace 2 horas</span>
                      </div>
                      <p className="text-xs text-slate-600">El pago fue validado y la orden pasó a logística.</p>
                    </div>
                  </div>
                )}

                {/* Event: Pago */}
                {(activeTimeline === 'general' || activeTimeline === 'pedido') && (
                  <div className="relative pl-8">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow-sm"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">Pago Recibido</h4>
                        <span className="text-[10px] text-slate-400 font-medium">Ayer, 11:30 AM</span>
                      </div>
                      <p className="text-xs text-slate-600">Transferencia verificada por finanzas.</p>
                    </div>
                  </div>
                )}

                {/* Event: Cotización */}
                {(activeTimeline === 'general' || activeTimeline === 'cotizacion') && (
                  <div className="relative pl-8 opacity-90">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">Cotización Enviada</h4>
                        <span className="text-[10px] text-slate-400 font-medium">Hace 3 días</span>
                      </div>
                      <p className="text-xs text-slate-600 mb-2">Cotización #095 enviada por WhatsApp.</p>
                      <button className="text-[10px] font-bold text-indigo-600 border border-indigo-200 px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        Ver PDF
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Event: Solicitud Inicial */}
                {(activeTimeline === 'general' || activeTimeline === 'cotizacion') && (
                  <div className="relative pl-8 opacity-75">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow-sm"></div>
                    <div className="bg-transparent rounded-xl p-2">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-600 text-sm">Solicitud Inicial</h4>
                        <span className="text-[10px] text-slate-400 font-medium">Hace 4 días</span>
                      </div>
                      <p className="text-xs text-slate-500">Cliente solicitó información vía Instagram.</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 text-white rounded-lg shadow-sm">
                  {showModal === 'Agendar' ? <Calendar size={20}/> : showModal === 'Contactar' ? <MessageSquare size={20}/> : <Plus size={20}/>}
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{showModal}</h3>
              </div>
              <button onClick={() => setShowModal(null)} className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              {showModal === 'Agendar' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Fecha de la Reunión</label>
                    <input type="date" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Hora de Disponibilidad</label>
                    <input type="time" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Asunto / Motivo</label>
                    <input type="text" placeholder="Ej. Presentación de producto" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <button onClick={() => { toast.success('Reunión agendada exitosamente en el calendario.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2">
                    Confirmar Agenda
                  </button>
                </div>
              )}

              


              {showModal === 'Contactar' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-2">Selecciona el canal de comunicación:</p>
                  
                  <button onClick={() => { toast.success('Abriendo chat de WhatsApp'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-green-50 hover:border-green-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-green-700">WhatsApp</span>
                  </button>
                  
                  <button onClick={() => { toast.success('Abriendo chat de Instagram'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-pink-700">Instagram</span>
                  </button>

                  <button onClick={() => { toast.success('Abriendo chat de Facebook'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-blue-700">Facebook Messenger</span>
                  </button>
                  
                  <button onClick={() => { toast.success('Abriendo redactor de correo'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Mail size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-red-700">Correo Electrónico</span>
                  </button>
                  
                  <button onClick={() => { toast.success('Iniciando llamada...'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-purple-50 hover:border-purple-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><Phone size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-purple-700">Llamada Telefónica</span>
                  </button>
                </div>
              )}

              


              {showModal === 'Nueva Solicitud' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Tipo de Solicitud</label>
                    <div className="relative">
                      <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 appearance-none focus:outline-none focus:border-purple-600">
                        <option>Solicitud de Cotización</option>
                        <option>Solicitud de Seguimiento</option>
                        <option>Solicitud de Devolución / Garantía</option>
                        <option>Solicitud de Soporte Técnico</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Producto o Requerimiento Específico</label>
                    <input type="text" placeholder="Ej. Extractor eléctrico doble..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Detalles Adicionales</label>
                    <textarea rows={3} placeholder="Describe brevemente lo que necesita el cliente..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600 resize-none"></textarea>
                  </div>
                  <button onClick={() => { toast.success('¡Solicitud Creada! El cliente ha sido ingresado al pipeline del CRM en la etapa correspondiente.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2 flex items-center justify-center gap-2">
                    Ingresar al CRM <ArrowRight size={16} />
                  </button>
                </div>
              )}
              {/* MODAL: OPCIONES DE CLIENTE */}
              {showModal === 'Opciones de Cliente' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-4 text-center">Configuración y gestión de datos de este cliente:</p>
                  
                  <button onClick={() => { setActiveTab('Información y Bitácora'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Edit size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-blue-700">Modificar Cliente</h4>
                      <p className="text-xs text-slate-500">Actualiza la información básica y etiquetas.</p>
                    </div>
                  </button>
                  
                  <button onClick={() => { toast.success('Iniciando descarga de reporte en PDF/Excel...'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Download size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-emerald-700">Exportar Información</h4>
                      <p className="text-xs text-slate-500">Descarga su historial, compras y bitácora.</p>
                    </div>
                  </button>

                  <div className="pt-4 mt-4 border-t border-slate-100">
                    <button onClick={() => { if(confirm('¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.')) { toast.success('Cliente eliminado.'); setShowModal(null); setSelectedClient(null);
        setFormData({});
        setImagePreview(null); } }} className="w-full flex items-center gap-3 p-4 border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group shadow-sm bg-red-50/50">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Trash2 size={18} /></div>
                      <div className="text-left">
                        <h4 className="font-bold text-red-700">Eliminar Cliente</h4>
                        <p className="text-xs text-red-500">Borrar permanentemente su ficha del CRM.</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
