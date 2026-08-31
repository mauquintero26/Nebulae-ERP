"use client";

import { useState, useEffect, useRef } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, createClienteSolicitud, getHeaders, API_URL } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Search, Filter, Plus,
  ChevronLeft, Calendar, MessageSquare, Settings,
  Upload, ChevronDown, FileText, User,
  DollarSign, ShoppingBag, MapPin, Tag, Activity,
  Phone, Mail, X, ArrowRight, Trash2, Edit, Download, CheckCircle2
} from 'lucide-react';

// ─── Helper ────────────────────────────────────────────────────────────────────
function timeAgo(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Hace unos segundos';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_COLOR_MAP: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  QUOTATION: 'bg-indigo-100 text-indigo-700',
  TO_INVOICE: 'bg-amber-100 text-amber-700',
  INVOICED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

const TIMELINE_DOT_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-400',
  QUOTATION: 'bg-indigo-500',
  TO_INVOICE: 'bg-amber-500',
  INVOICED: 'bg-emerald-500',
  CANCELLED: 'bg-red-400',
  DONE: 'bg-emerald-500',
  PAID: 'bg-emerald-500',
  CREATED: 'bg-purple-500',
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información y Bitácora');
  const [entityType, setEntityType] = useState('Individuo');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({});
  const [solicitudForm, setSolicitudForm] = useState<any>({ sale_type: 'ON_DEMAND', tipo: 'Solicitud de Cotización', producto: '', detalles: '' });
  const [customer360, setCustomer360] = useState<any>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch customers list
  const fetchCustomers = async () => {
    try {
      const raw = await getCustomers();
      const list = raw.data || raw;
      if (Array.isArray(list)) {
        setCustomers(list.map((c: any) => ({
          id: `CLI-${String(c.id).padStart(4, '0')}`,
          realId: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email || '',
          phone: c.phone || '',
          document: c.document || '',
          address: c.address || '',
          city: c.city || '',
          type: 'Regular',
          sector: 'N/A',
          source: 'Registro CRM',
          initial: c.first_name ? c.first_name.charAt(0).toUpperCase() : 'C',
          country: 'Colombia',
          category: 'Regular',
          tags: [],
        })));
      }
    } catch (e) {
      console.error('Error cargando clientes', e);
    }
  };

  // Fetch 360 profile for selected client
  const fetchProfile = async (realId: number) => {
    try {
      const res = await fetch(`${API_URL}/crm/customers/${realId}/profile-360`, { headers: getHeaders() });
      const json = await res.json();
      if (json.status === 'success') setCustomer360(json.data);
    } catch (e) {
      console.error('Error perfil 360', e);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  useEffect(() => {
    if (selectedClient && selectedClient !== 'NEW') {
      fetchProfile(selectedClient.realId);
    } else {
      setCustomer360(null);
    }
  }, [selectedClient]);

  // ─── Reset form when switching clients ──────────────────────────────────────
  const openClient = (client: any) => {
    setSelectedClient(client);
    setFormData({});
    setImagePreview(null);
    setActiveTab('Información y Bitácora');
  };

  const openNew = () => {
    setSelectedClient('NEW');
    setFormData({ first_name: '', last_name: '', email: '', phone: '', document: '', address: '', city: '' });
    setImagePreview(null);
    setActiveTab('Información y Bitácora');
  };

  const goBack = () => {
    setSelectedClient(null);
    setFormData({});
    setImagePreview(null);
    setCustomer360(null);
  };

  // ─── CRUD Handlers ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formData.first_name?.trim()) return toast.error('El nombre es obligatorio.');
    setIsSaving(true);
    const tid = toast.loading('Creando cliente...');
    try {
      await createCustomer({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name?.trim() || 'N/A',
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        city: formData.city?.trim() || null,
        document: formData.document?.trim() || null,
        address: formData.address?.trim() || null,
      });
      toast.success('¡Cliente creado exitosamente!', { id: tid });
      goBack();
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear cliente', { id: tid });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedClient?.realId) return;
    setIsSaving(true);
    const tid = toast.loading('Guardando cambios...');
    try {
      const payload: any = {};
      if (formData.first_name !== undefined) payload.first_name = formData.first_name?.trim() || selectedClient.first_name;
      if (formData.last_name !== undefined) payload.last_name = formData.last_name?.trim() || selectedClient.last_name;
      if (formData.email !== undefined) payload.email = formData.email?.trim() || null;
      if (formData.phone !== undefined) payload.phone = formData.phone?.trim() || null;
      if (formData.city !== undefined) payload.city = formData.city?.trim() || null;
      if (formData.document !== undefined) payload.document = formData.document?.trim() || null;
      if (formData.address !== undefined) payload.address = formData.address?.trim() || null;

      if (Object.keys(payload).length === 0) {
        toast.dismiss(tid);
        toast('No hay cambios que guardar.');
        setIsSaving(false);
        return;
      }

      await updateCustomer(selectedClient.realId, payload);
      toast.success('Cambios guardados', { id: tid });
      fetchCustomers();
      // Refresh local selected client data
      setSelectedClient({ ...selectedClient, ...payload, name: `${payload.first_name || selectedClient.first_name} ${payload.last_name || selectedClient.last_name}` });
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar', { id: tid });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedClient?.realId) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar a ${selectedClient.name}? Esta acción no se puede deshacer.`)) return;
    const tid = toast.loading('Eliminando cliente...');
    try {
      await deleteCustomer(selectedClient.realId);
      toast.success('Cliente eliminado.', { id: tid });
      setShowModal(null);
      goBack();
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar', { id: tid });
    }
  };

  const handleCreateSolicitud = async () => {
    if (!selectedClient?.realId) return;
    const tid = toast.loading('Ingresando solicitud al CRM...');
    try {
      const result = await createClienteSolicitud(selectedClient.realId, {
        sale_type: solicitudForm.sale_type || 'ON_DEMAND',
        tipo: solicitudForm.tipo,
        producto: solicitudForm.producto,
        detalles: solicitudForm.detalles,
      });
      toast.success(`¡Solicitud #${result.data?.id} creada! Ingresada al pipeline de Ventas.`, { id: tid });
      setShowModal(null);
      setSolicitudForm({ sale_type: 'ON_DEMAND', tipo: 'Solicitud de Cotización', producto: '', detalles: '' });
      // Refresh 360 profile to show new order in timeline
      fetchProfile(selectedClient.realId);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear solicitud', { id: tid });
    }
  };

  // ─── Filtered Customers ─────────────────────────────────────────────────────
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    c.id.includes(searchTerm)
  );

  // ─── VIEW 1: LIST ───────────────────────────────────────────────────────────
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
            onClick={openNew}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Cliente
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-4 flex justify-between items-center">
          <div className="flex items-center">
            <button className="px-4 py-2 font-bold text-sm border-b-2 border-purple-600 text-purple-700">
              Todos mis clientes ({customers.length})
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nombre, email, teléfono..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-72 outline-none focus:border-purple-600"
              />
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ciudad</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresado Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    {searchTerm ? 'No se encontraron clientes con esa búsqueda.' : 'Aún no tienes clientes registrados. ¡Crea el primero!'}
                  </td>
                </tr>
              )}
              {filteredCustomers.map((client) => (
                <tr key={client.id} onClick={() => openClient(client)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">{client.initial}</div>
                      <div>
                        <span className="font-bold text-slate-800 block">{client.name}</span>
                        <span className="text-xs text-slate-400">{client.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-800">{client.email || '—'}</p>
                    <p className="text-sm text-slate-500">{client.phone || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-md text-xs border border-blue-100">{client.type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{client.city || '—'}</td>
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

  // ─── VIEW 2: DETAIL / NEW ───────────────────────────────────────────────────
  const isNew = selectedClient === 'NEW';
  const clientData = isNew ? {
    id: 'Nuevo', realId: null, name: '', initial: '+', source: 'Tú',
    first_name: '', last_name: '', email: '', phone: '', document: '', address: '', city: '', country: '', category: '', tags: []
  } : selectedClient;

  const showBitacora = !isNew && activeTab === 'Información y Bitácora';

  // Controlled form value: use formData if user has touched it, else fall back to clientData
  const fv = (key: string) => formData[key] !== undefined ? formData[key] : (clientData[key] || '');
  const sf = (key: string, val: string) => setFormData({ ...formData, [key]: val });

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 shadow-sm">
            <ChevronLeft size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl">
            {isNew ? <Plus size={22} /> : clientData.initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isNew ? 'Nuevo Cliente' : clientData.name}</h1>
            <p className="text-slate-500 text-sm">
              {isNew ? 'Completar el formulario y presionar "Crear Cliente".' : <>Ingresado por: <span className="text-amber-600 font-bold">{clientData.source}</span></>}
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
      {!isNew && (
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
        {/* LEFT COLUMN */}
        <div className={`flex-1 space-y-4 ${isNew ? 'max-w-5xl w-full' : 'w-full'}`}>

          {/* ── Información y Bitácora tab (also used for NEW) ── */}
          {(activeTab === 'Información y Bitácora') && (
            <>
              {/* Image upload */}
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
                  <input type="file" id="upload-image" className="hidden" accept="image/*" onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImagePreview(URL.createObjectURL(e.target.files[0]));
                      toast.success('Imagen cargada');
                    }
                  }} />
                  <label htmlFor="upload-image" className="cursor-pointer text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</label>
                </div>
              </div>

              {/* Basic Info Form */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6">Información Básica</h3>

                {/* Entity type + Name row */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Entidad</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setEntityType('Individuo')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${entityType === 'Individuo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Individuo</button>
                      <button onClick={() => setEntityType('Compañía')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${entityType === 'Compañía' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Compañía</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Identificación (CC/NIT/Pasaporte)</label>
                    <input type="text" value={fv('document')} onChange={e => sf('document', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre (s)</label>
                    <input type="text" value={fv('first_name')} onChange={e => sf('first_name', e.target.value)} placeholder="Ej. Juan Pablo" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Apellido (s) / Razón Social</label>
                    <input type="text" value={fv('last_name')} onChange={e => sf('last_name', e.target.value)} placeholder="Ej. García López" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                    <input type="email" value={fv('email')} onChange={e => sf('email', e.target.value)} placeholder="correo@ejemplo.com" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                    <input type="text" value={fv('phone')} onChange={e => sf('phone', e.target.value)} placeholder="+57 300 000 0000" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad</label>
                    <input type="text" value={fv('city')} onChange={e => sf('city', e.target.value)} placeholder="Bogotá" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Dirección de Facturación / Entrega</label>
                    <input type="text" value={fv('address')} onChange={e => sf('address', e.target.value)} placeholder="Calle 123 # 45-67" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={isNew ? handleCreate : handleUpdate}
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
                  >
                    {isSaving ? 'Guardando...' : isNew ? '✓ Crear Cliente' : 'Guardar Cambios'}
                  </button>
                  {!isNew && (
                    <button onClick={goBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Contactos Adicionales ── */}
          {!isNew && activeTab === 'Contactos Adicionales' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 min-h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Contactos Relacionados</h3>
                <button className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-200 transition-colors">
                  <Plus size={14} /> Agregar Contacto
                </button>
              </div>
              <p className="text-xs text-slate-400 italic">No hay contactos adicionales registrados para este cliente.</p>
            </div>
          )}

          {/* ── Historial de Compra ── */}
          {!isNew && activeTab === 'Historial de Compra' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl text-white shadow-md">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Lifetime Value</p>
                  <h2 className="text-3xl font-black">${parseFloat(customer360?.ltv || '0').toLocaleString('es-CO')}</h2>
                  <p className="text-sm opacity-90 mt-2">En {customer360?.total_orders || 0} transacciones</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign size={14} /> Trámites Activos</p>
                  <h2 className="text-2xl font-black text-slate-800">{customer360?.active_orders?.length || 0}</h2>
                  <p className="text-xs font-bold text-slate-500 mt-2">En el pipeline de ventas</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><ShoppingBag size={14} /> Total Órdenes</p>
                  <h2 className="text-2xl font-black text-slate-800">{customer360?.total_orders || 0}</h2>
                  <p className="text-xs font-bold text-slate-500 mt-2">Historial completo</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Detalle de Órdenes</h3>
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
                    {customer360?.active_orders?.length > 0 ? customer360.active_orders.map((o: any) => (
                      <tr key={o.id} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">#ORD-{String(o.id).padStart(4, '0')}</div>
                          <div className="text-slate-500 text-xs">{o.created_at ? new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{o.lines_count || 0} artículo(s)</td>
                        <td className="px-6 py-4 font-bold text-slate-800">${parseFloat(o.total || 0).toLocaleString('es-CO')}</td>
                        <td className="px-6 py-4">
                          <span className={`font-bold px-2 py-1 rounded text-xs ${STATUS_COLOR_MAP[o.status] || 'bg-slate-100 text-slate-700'}`}>{o.status_label || o.status}</span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm">Este cliente no tiene órdenes registradas aún.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Bitácora */}
        {showBitacora && (
          <div className="w-[420px] bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[700px] sticky top-0 flex-shrink-0">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-purple-600" size={18} /> Bitácora de Actividad
              </h3>
              <button onClick={() => setShowModal('Nueva Solicitud')} className="bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-1">
                <Plus size={12} /> Solicitud
              </button>
            </div>

            {/* Trámites Activos Summary */}
            <div className="p-4 border-b border-slate-100 bg-white space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Trámites Activos en CRM</h4>
              {customer360?.active_orders?.length > 0 ? (
                customer360.active_orders.map((order: any) => (
                  <div key={order.id} className="flex justify-between items-center border p-3 rounded-xl bg-indigo-50/50 border-indigo-100">
                    <div>
                      <p className="text-xs font-bold text-indigo-900">Orden #{String(order.id).padStart(4, '0')}</p>
                      <p className="text-[10px] text-indigo-600 mt-0.5">{order.status_label || order.status}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${STATUS_COLOR_MAP[order.status] || 'bg-slate-100 text-slate-700'}`}>
                      ${parseFloat(order.total || 0).toLocaleString('es-CO')}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic py-1">Sin trámites activos en este momento.</p>
              )}
            </div>

            {/* Timeline */}
            <div className="flex-1 p-5 relative overflow-y-auto custom-scrollbar bg-slate-50/30">
              <div className="absolute left-[27px] top-5 bottom-5 w-0.5 bg-slate-200"></div>
              <div className="space-y-5 relative">
                {customer360?.timeline?.length > 0 ? customer360.timeline.map((event: any, idx: number) => (
                  <div key={`${event.type}-${event.id}-${idx}`} className="relative pl-8">
                    <div className={`absolute left-[-5px] top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${TIMELINE_DOT_COLOR[event.status] || 'bg-slate-400'}`}></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:border-purple-200 transition-colors cursor-default">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">{event.status_label || event.status}</h4>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                          {event.created_at ? timeAgo(event.created_at) : 'Hoy'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{event.description}</p>
                      {event.total > 0 && (
                        <p className="text-xs font-bold text-slate-700 mt-1">${parseFloat(event.total).toLocaleString('es-CO')}</p>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="relative pl-8">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-purple-500 border-2 border-white shadow-sm"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">Cliente Creado</h4>
                        <span className="text-[10px] text-slate-400 font-medium">Hoy</span>
                      </div>
                      <p className="text-xs text-slate-500">Ficha del cliente registrada en el sistema CRM.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODALS ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 text-white rounded-lg shadow-sm">
                  {showModal === 'Agendar' ? <Calendar size={20} /> : showModal === 'Contactar' ? <MessageSquare size={20} /> : showModal === 'Opciones de Cliente' ? <Settings size={20} /> : <Plus size={20} />}
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{showModal}</h3>
              </div>
              <button onClick={() => setShowModal(null)} className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">

              {/* ── AGENDAR ── */}
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
                  <button onClick={() => { toast.success('Reunión agendada en el calendario.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2">
                    Confirmar Agenda
                  </button>
                </div>
              )}

              {/* ── CONTACTAR ── */}
              {showModal === 'Contactar' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-2">Selecciona el canal de comunicación:</p>
                  {[
                    { label: 'WhatsApp', color: 'green', icon: <MessageSquare size={16} /> },
                    { label: 'Instagram', color: 'pink', icon: <MessageSquare size={16} /> },
                    { label: 'Facebook Messenger', color: 'blue', icon: <MessageSquare size={16} /> },
                    { label: 'Correo Electrónico', color: 'red', icon: <Mail size={16} /> },
                    { label: 'Llamada Telefónica', color: 'purple', icon: <Phone size={16} /> },
                  ].map(ch => (
                    <button key={ch.label} onClick={() => { toast.success(`Abriendo ${ch.label}...`); setShowModal(null); }} className={`w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-${ch.color}-50 hover:border-${ch.color}-300 transition-colors group`}>
                      <div className={`w-8 h-8 rounded-full bg-${ch.color}-100 flex items-center justify-center text-${ch.color}-600`}>{ch.icon}</div>
                      <span className="font-bold text-slate-700">{ch.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── NUEVA SOLICITUD ── */}
              {showModal === 'Nueva Solicitud' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Tipo de Solicitud</label>
                    <div className="relative">
                      <select
                        value={solicitudForm.tipo}
                        onChange={e => setSolicitudForm({ ...solicitudForm, tipo: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 appearance-none focus:outline-none focus:border-purple-600"
                      >
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
                    <input
                      type="text"
                      value={solicitudForm.producto}
                      onChange={e => setSolicitudForm({ ...solicitudForm, producto: e.target.value })}
                      placeholder="Ej. Extractor eléctrico doble..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Detalles Adicionales</label>
                    <textarea
                      rows={3}
                      value={solicitudForm.detalles}
                      onChange={e => setSolicitudForm({ ...solicitudForm, detalles: e.target.value })}
                      placeholder="Describe brevemente lo que necesita el cliente..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleCreateSolicitud}
                    className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2 flex items-center justify-center gap-2"
                  >
                    Ingresar al Pipeline de Ventas <ArrowRight size={16} />
                  </button>
                </div>
              )}

              {/* ── OPCIONES DE CLIENTE ── */}
              {showModal === 'Opciones de Cliente' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-4 text-center">Configuración y gestión de datos de este cliente:</p>
                  <button onClick={() => { setActiveTab('Información y Bitácora'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Edit size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-blue-700">Modificar Cliente</h4>
                      <p className="text-xs text-slate-500">Actualiza la información básica del cliente.</p>
                    </div>
                  </button>
                  <button onClick={() => { toast.success('Descarga de reporte iniciada...'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Download size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-emerald-700">Exportar Información</h4>
                      <p className="text-xs text-slate-500">Descarga su historial, compras y bitácora.</p>
                    </div>
                  </button>
                  <div className="pt-4 mt-4 border-t border-slate-100">
                    <button onClick={handleDelete} className="w-full flex items-center gap-3 p-4 border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group shadow-sm bg-red-50/50">
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
