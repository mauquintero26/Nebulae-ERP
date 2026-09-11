"use client";

import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, createClienteSolicitud, getSolicitudTipos, getHeaders, API_URL } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Search, Plus, Calendar, MessageSquare, Settings,
  User, DollarSign, ShoppingBag, MapPin, Activity,
  Phone, Mail, X, ArrowRight, Trash2, CheckCircle2, ExternalLink,
  MessageCircle, Clock, AlertTriangle, ChevronRight, FileText
} from 'lucide-react';

function timeAgo(isoString: string) {
  if (!isoString) return 'Hoy';
  const date = new Date(isoString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Hace unos segundos';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCOP(v: number | string | null | undefined) {
  const num = Number(v) || 0;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
}

const STATUS_COLOR_MAP: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  BORRADOR: 'bg-slate-100 text-slate-700',
  QUOTATION: 'bg-indigo-100 text-indigo-700',
  COTIZADA: 'bg-indigo-100 text-indigo-700',
  CONFIRMADA: 'bg-emerald-100 text-emerald-700',
  PENDIENTE_COMPRA: 'bg-amber-100 text-amber-700',
  EN_COMPRA: 'bg-blue-100 text-blue-700',
  EN_TRANSITO: 'bg-purple-100 text-purple-700',
  RECIBIDO: 'bg-teal-100 text-teal-700',
  ENTREGADO: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CANCELADA: 'bg-red-100 text-red-700',
};

const TIMELINE_DOT_COLOR: Record<string, string> = {
  customer_request: 'bg-indigo-500',
  quotation: 'bg-amber-500',
  sale_order: 'bg-blue-500',
  payment: 'bg-emerald-500',
  delivery: 'bg-teal-500',
  calendar_event: 'bg-purple-500',
  created: 'bg-slate-400',
};

export default function AgendaPage() {
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información y Ficha');
  const [entityType, setEntityType] = useState('Individuo');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({});
  const [solicitudForm, setSolicitudForm] = useState<any>({ sale_type: 'ON_DEMAND', tipo: 'Solicitud de Cotización', producto: '', detalles: '' });
  const [solicitudTipos, setSolicitudTipos] = useState<string[]>([
    'Solicitud de Cotización',
    'Solicitud de Seguimiento',
    'Solicitud de Devolución / Garantía',
    'Solicitud de Soporte Técnico',
  ]);
  const [customer360, setCustomer360] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [agendaForm, setAgendaForm] = useState<any>({
    title: '', event_type: 'MEETING', color: 'indigo',
    start_datetime: '', end_datetime: '', location: '', notes: '',
  });

  const fetchCustomers = async () => {
    try {
      const raw = await getCustomers();
      const list = raw.data || raw;
      if (Array.isArray(list)) {
        setCustomers(list.map((c: any) => ({
          id: `CLI-${String(c.id).padStart(4, '0')}`,
          realId: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente Sin Nombre',
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email || '',
          phone: c.phone || '',
          document: c.document || '',
          address: c.address || '',
          city: c.city || '',
          type: 'Regular',
          source: 'Registro CRM',
          initial: (c.first_name ? c.first_name.charAt(0).toUpperCase() : 'C'),
        })));
      }
    } catch (e) {
      console.error('Error cargando clientes', e);
    }
  };

  const fetchProfile = async (realId: number) => {
    try {
      const res = await fetch(`${API_URL}/crm/customers/${realId}/profile-360`, { headers: getHeaders() });
      const json = await res.json();
      if (json.status === 'success') {
        setCustomer360(json.data);
      }
    } catch (e) {
      console.error('Error perfil 360', e);
    }
  };

  useEffect(() => {
    fetchCustomers();
    getSolicitudTipos().then(tipos => { if (tipos && tipos.length > 0) setSolicitudTipos(tipos); });
  }, []);

  useEffect(() => {
    if (selectedClient && selectedClient !== 'NEW') {
      fetchProfile(selectedClient.realId);
    } else {
      setCustomer360(null);
    }
  }, [selectedClient]);

  const openClient = (client: any) => {
    setSelectedClient(client);
    setFormData({});
    setActiveTab('Información y Ficha');
  };

  const openNew = () => {
    setSelectedClient('NEW');
    setFormData({ first_name: '', last_name: '', email: '', phone: '', document: '', address: '', city: '' });
    setActiveTab('Información y Ficha');
  };

  const goBack = () => {
    setSelectedClient(null);
    setFormData({});
    setCustomer360(null);
  };

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
      setSelectedClient({ ...selectedClient, ...payload, name: `${payload.first_name || selectedClient.first_name} ${payload.last_name || selectedClient.last_name}` });
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar', { id: tid });
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
      toast.success(`¡Solicitud creada!`, { id: tid });
      setShowModal(null);
      setSolicitudForm({ sale_type: 'ON_DEMAND', tipo: 'Solicitud de Cotización', producto: '', detalles: '' });
      fetchProfile(selectedClient.realId);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear solicitud', { id: tid });
    }
  };

  const handleCreateAgendaEvent = async () => {
    if (!agendaForm.title.trim()) { toast.error('El título del evento es obligatorio.'); return; }
    if (!agendaForm.start_datetime) { toast.error('Selecciona la fecha y hora de inicio.'); return; }
    const tid = toast.loading('Creando evento en el calendario...');
    try {
      const payload: any = {
        title: agendaForm.title.trim(),
        event_type: agendaForm.event_type,
        color: agendaForm.color,
        start_datetime: agendaForm.start_datetime,
        end_datetime: agendaForm.end_datetime || null,
        location: agendaForm.location || '',
        description: agendaForm.notes || '',
        customer_id: selectedClient?.realId || null,
        customer_name: selectedClient?.name || '',
        created_by: 'Agenda CRM',
        sync_source: 'INTERNAL',
      };
      const res = await fetch(`${API_URL}/crm/events`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Error'); }
      toast.success('¡Evento creado en el Calendario! ✅', { id: tid });
      setShowModal(null);
      setAgendaForm({ title: '', event_type: 'MEETING', color: 'indigo', start_datetime: '', end_datetime: '', location: '', notes: '' });
      if (selectedClient?.realId) fetchProfile(selectedClient.realId);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear evento', { id: tid });
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    c.id.includes(searchTerm)
  );

  const sf = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));
  const fv = (field: string) => formData[field] !== undefined ? formData[field] : (selectedClient && selectedClient !== 'NEW' ? selectedClient[field] : '');

  // ─── VIEW 1: LISTADO CLIENTES ───────────────────────────────────────────────
  if (!selectedClient) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-6 overflow-y-auto animate-in fade-in">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-md">
              <User size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Agenda de Clientes</h1>
              <p className="text-slate-500 text-xs mt-0.5">Ficha única centralizada, historial comercial y contacto directo.</p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 mb-6 flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, email, identificación..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-purple-600 transition-colors"
            />
          </div>
          <span className="text-xs font-bold text-slate-500 shrink-0">
            {filteredCustomers.length} clientes encontrados
          </span>
        </div>

        {/* Customer Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(client => {
            const cleanPhone = client.phone.replace(/\D/g, '');
            return (
              <div
                key={client.id}
                onClick={() => openClient(client)}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-sm">
                        {client.initial}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base group-hover:text-purple-600 transition-colors leading-tight">
                          {client.name}
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-400">{client.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                    {client.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-slate-400 shrink-0" />
                        <span className="font-medium">{client.phone}</span>
                      </div>
                    )}
                    {client.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.city && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-slate-400 shrink-0" />
                        <span>{client.city}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  {cleanPhone ? (
                    <a
                      href={`https://wa.me/57${cleanPhone}?text=${encodeURIComponent('Hola ' + client.name + ', te saludamos de Nebulae Hub.')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400">Sin teléfono</span>
                  )}

                  <span className="text-xs font-bold text-purple-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Ver ficha <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── VIEW 2: FICHA ÚNICA DEL CLIENTE SELECCIONADO ───────────────────────────
  const isNew = selectedClient === 'NEW';
  const clientData = isNew ? {} : selectedClient;
  const cleanPhone = (clientData.phone || '').replace(/\D/g, '');

  const saldoPendiente = customer360?.financials?.saldo_pendiente_cop ?? customer360?.saldo_pendiente_cop ?? 0;
  const totalComprado = customer360?.financials?.total_comprado_cop ?? customer360?.ltv ?? 0;
  const totalPagado = customer360?.financials?.total_pagado_cop ?? 0;

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-6 overflow-y-auto animate-in fade-in">
      {/* Back Button & Header */}
      <div className="mb-4">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-3"
        >
          ← Volver al listado de clientes
        </button>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-black text-2xl flex items-center justify-center shadow-md">
              {isNew ? <Plus size={28} /> : clientData.initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">{isNew ? 'Nuevo Cliente' : clientData.name}</h1>
                {!isNew && (
                  <span className="text-xs font-bold px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    {clientData.id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isNew ? 'Ingresa los datos para registrar en el CRM.' : (
                  <>
                    Doc: <span className="font-semibold text-slate-700">{clientData.document || 'N/A'}</span> · 
                    Ciudad: <span className="font-semibold text-slate-700">{clientData.city || 'No especificada'}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          {!isNew && (
            <div className="flex flex-wrap items-center gap-2.5">
              {cleanPhone && (
                <a
                  href={`https://wa.me/57${cleanPhone}?text=${encodeURIComponent('Hola ' + clientData.name + ', te saludamos de Nebulae Hub.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
              )}
              {clientData.phone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Phone size={14} /> Llamar
                </a>
              )}
              <Link
                href={`/dashboard/ventas/solicitud?customer_id=${clientData.realId}`}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Plus size={14} /> Nueva Solicitud
              </Link>
              <button
                onClick={() => setShowModal('Agendar')}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Calendar size={14} /> Agendar
              </button>
              <button
                onClick={handleDelete}
                className="p-2 border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                title="Eliminar Cliente"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Financial KPI Banner */}
      {!isNew && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-5 rounded-2xl border shadow-sm ${saldoPendiente > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-black uppercase tracking-wider">Saldo por Cobrar</span>
              {saldoPendiente > 0 ? <AlertTriangle size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            </div>
            <h3 className="text-2xl font-black">{formatCOP(saldoPendiente)}</h3>
            <p className="text-[11px] font-semibold mt-1 opacity-80">
              {saldoPendiente > 0 ? 'Pendiente pago de saldos (40%)' : 'Cliente al día con sus pagos'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Total Comprado (LTV)</span>
            <h3 className="text-2xl font-black text-slate-900">{formatCOP(totalComprado)}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Facturación histórica total</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Total Pagado</span>
            <h3 className="text-2xl font-black text-emerald-600">{formatCOP(totalPagado)}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Recibido en caja / bancos</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Pedidos Activos</span>
            <h3 className="text-2xl font-black text-purple-600">{customer360?.pedidos?.length || customer360?.active_orders?.length || 0}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">En compras, tránsito o entrega</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!isNew && (
        <div className="flex border-b border-slate-200 mb-6 gap-6">
          {[
            { id: 'Información y Ficha', label: 'Información y Ficha' },
            { id: 'Solicitudes y Cotizaciones', label: `Solicitudes (${customer360?.solicitudes?.length || 0}) / Cotizaciones (${customer360?.cotizaciones?.length || 0})` },
            { id: 'Pedidos de Venta (PVEN)', label: `Pedidos de Venta (${customer360?.pedidos?.length || 0})` },
            { id: 'Historial y Bitácora', label: 'Historial y Bitácora' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* Main Content Area */}
        <div className="flex-1 space-y-6">

          {/* TAB 1: INFORMACIÓN Y FICHA */}
          {(isNew || activeTab === 'Información y Ficha') && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Datos Personales y Ubicación</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Tipo de Entidad</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setEntityType('Individuo')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${entityType === 'Individuo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Individuo</button>
                    <button onClick={() => setEntityType('Compañía')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${entityType === 'Compañía' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Compañía</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Identificación (CC / NIT / Pasaporte)</label>
                  <input type="text" value={fv('document')} onChange={e => sf('document', e.target.value)} placeholder="12345678" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre (s) *</label>
                  <input type="text" value={fv('first_name')} onChange={e => sf('first_name', e.target.value)} placeholder="Ej. Carlos" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Apellido (s)</label>
                  <input type="text" value={fv('last_name')} onChange={e => sf('last_name', e.target.value)} placeholder="Ej. Restrepo" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                  <input type="text" value={fv('phone')} onChange={e => sf('phone', e.target.value)} placeholder="3109876543" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                  <input type="email" value={fv('email')} onChange={e => sf('email', e.target.value)} placeholder="cliente@ejemplo.co" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad</label>
                  <input type="text" value={fv('city')} onChange={e => sf('city', e.target.value)} placeholder="Barranquilla" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Dirección de Entrega</label>
                  <input type="text" value={fv('address')} onChange={e => sf('address', e.target.value)} placeholder="Carrera 53 # 82-100" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  onClick={isNew ? handleCreate : handleUpdate}
                  disabled={isSaving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition-colors"
                >
                  {isSaving ? 'Guardando...' : isNew ? '✓ Crear Cliente' : 'Guardar Cambios'}
                </button>
                {!isNew && (
                  <button onClick={goBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SOLICITUDES Y COTIZACIONES */}
          {!isNew && activeTab === 'Solicitudes y Cotizaciones' && (
            <div className="space-y-6">
              {/* Solicitudes (SC) */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-purple-600" /> Solicitudes de Cotización (SC)
                  </h3>
                  <Link
                    href={`/dashboard/ventas/solicitud?customer_id=${clientData.realId}`}
                    className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-3.5 py-1.5 rounded-xl font-bold text-xs border border-purple-200 flex items-center gap-1"
                  >
                    <Plus size={14} /> Nueva Solicitud
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <th className="px-4 py-3">Número</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer360?.solicitudes?.length > 0 ? customer360.solicitudes.map((sc: any) => (
                        <tr key={sc.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3.5 font-bold text-slate-900">{sc.numero}</td>
                          <td className="px-4 py-3.5 text-slate-500">{timeAgo(sc.created_at)}</td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${STATUS_COLOR_MAP[sc.estado] || 'bg-slate-100 text-slate-700'}`}>
                              {sc.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Link
                              href={`/dashboard/ventas/solicitud?sc_id=${sc.id}`}
                              className="text-purple-600 hover:underline font-bold inline-flex items-center gap-1"
                            >
                              Ver en Solicitud <ExternalLink size={12} />
                            </Link>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sin solicitudes registradas para este cliente.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cotizaciones (COT) */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <DollarSign size={16} className="text-indigo-600" /> Cotizaciones Emitidas (COT)
                  </h3>
                  <Link
                    href={`/dashboard/ventas/cotizacion`}
                    className="text-indigo-600 hover:underline text-xs font-bold flex items-center gap-1"
                  >
                    Ver todas las cotizaciones <ArrowRight size={14} />
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <th className="px-4 py-3">Número</th>
                        <th className="px-4 py-3">Total COP</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer360?.cotizaciones?.length > 0 ? customer360.cotizaciones.map((cot: any) => (
                        <tr key={cot.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3.5 font-bold text-slate-900">{cot.numero}</td>
                          <td className="px-4 py-3.5 font-bold text-slate-900">{formatCOP(cot.total_cop)}</td>
                          <td className="px-4 py-3.5 text-slate-500">{timeAgo(cot.created_at)}</td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${STATUS_COLOR_MAP[cot.estado] || 'bg-slate-100 text-slate-700'}`}>
                              {cot.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Link
                              href={`/dashboard/ventas/cotizacion?id=${cot.id}`}
                              className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-1"
                            >
                              Ver Cotización <ExternalLink size={12} />
                            </Link>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin cotizaciones registradas para este cliente.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PEDIDOS DE VENTA (PVEN) */}
          {!isNew && activeTab === 'Pedidos de Venta (PVEN)' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <ShoppingBag size={16} className="text-blue-600" /> Pedidos de Venta Canónicos (PVEN)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Control de Anticipo 60%, Saldo 40% y estado de despacho.</p>
                </div>
                <Link
                  href="/dashboard/ventas/venta"
                  className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3.5 py-1.5 rounded-xl font-bold text-xs border border-blue-200 flex items-center gap-1"
                >
                  Ir a Ventas Hub <ArrowRight size={14} />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Anticipo (60%)</th>
                      <th className="px-4 py-3">Saldo (40%)</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer360?.pedidos?.length > 0 ? customer360.pedidos.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3.5">
                          <span className="font-bold text-slate-900 block">{p.numero}</span>
                          <span className="text-[10px] text-slate-400">{timeAgo(p.created_at)}</span>
                        </td>
                        <td className="px-4 py-3.5 font-black text-slate-900">{formatCOP(p.total_cop)}</td>
                        <td className="px-4 py-3.5 font-bold text-emerald-600">{formatCOP(p.anticipo_cop)}</td>
                        <td className="px-4 py-3.5 font-black text-rose-600">{formatCOP(p.saldo_cop)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full font-black text-[10px] ${STATUS_COLOR_MAP[p.estado] || 'bg-blue-100 text-blue-700'}`}>
                            {p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/dashboard/ventas/venta?id=${p.id}`}
                            className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                          >
                            Abrir Pedido <ExternalLink size={12} />
                          </Link>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sin pedidos de venta registrados aún.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: HISTORIAL Y BITÁCORA */}
          {!isNew && activeTab === 'Historial y Bitácora' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Activity size={16} className="text-purple-600" /> Bitácora de Eventos y Actividad
              </h3>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {customer360?.timeline?.length > 0 ? customer360.timeline.map((event: any, idx: number) => {
                  const dotColor = TIMELINE_DOT_COLOR[event.type] || 'bg-purple-600';
                  return (
                    <div key={`${event.type}-${event.id}-${idx}`} className="relative">
                      <div className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${dotColor}`} />
                      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-slate-900 text-xs">{event.status_label || event.type}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{event.created_at ? timeAgo(event.created_at) : 'Hoy'}</span>
                        </div>
                        <p className="text-xs text-slate-600">{event.description}</p>
                        {event.total > 0 && (
                          <p className="text-xs font-black text-slate-900 mt-1">{formatCOP(event.total)}</p>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-xs text-slate-400">Sin historial registrado.</p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Sidebar Widget: Acciones Rápidas & Contacto */}
        {!isNew && (
          <div className="w-80 shrink-0 bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-5">
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Contacto Directo</h4>
              <div className="space-y-2">
                {cleanPhone ? (
                  <a
                    href={`https://wa.me/57${cleanPhone}?text=${encodeURIComponent('Hola ' + clientData.name + ', te saludamos de Nebulae Hub.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <MessageCircle size={16} /> Abrir WhatsApp
                  </a>
                ) : (
                  <button disabled className="w-full bg-slate-100 text-slate-400 font-bold text-xs py-2.5 px-4 rounded-xl cursor-not-allowed">
                    Sin WhatsApp registrado
                  </button>
                )}

                {clientData.phone && (
                  <a
                    href={`tel:${cleanPhone}`}
                    className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <Phone size={15} /> Llamar ({clientData.phone})
                  </a>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Trámites Activos</h4>
              {customer360?.pedidos?.length > 0 ? (
                <div className="space-y-2">
                  {customer360.pedidos.slice(0, 3).map((ped: any) => (
                    <div key={ped.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800 text-xs">{ped.numero}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${STATUS_COLOR_MAP[ped.estado] || 'bg-blue-100 text-blue-700'}`}>
                          {ped.estado}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Saldo pendiente:</span>
                        <span className="font-bold text-rose-600">{formatCOP(ped.saldo_cop)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No hay pedidos activos.</p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <Link
                href={`/dashboard/ventas/solicitud?customer_id=${clientData.realId}`}
                className="w-full py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={14} /> Crear Solicitud Comercial
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Agendar Reunión */}
      {showModal === 'Agendar' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                <Calendar size={18} className="text-purple-600" /> Agendar Evento
              </h3>
              <button onClick={() => setShowModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Título *</label>
                <input
                  type="text"
                  value={agendaForm.title}
                  onChange={e => setAgendaForm((prev: any) => ({ ...prev, title: e.target.value }))}
                  placeholder={`Llamada con ${selectedClient?.name || 'Cliente'}`}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-purple-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha y Hora Inicio *</label>
                  <input
                    type="datetime-local"
                    value={agendaForm.start_datetime}
                    onChange={e => setAgendaForm((prev: any) => ({ ...prev, start_datetime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha y Hora Fin</label>
                  <input
                    type="datetime-local"
                    value={agendaForm.end_datetime}
                    onChange={e => setAgendaForm((prev: any) => ({ ...prev, end_datetime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Lugar / Medio</label>
                <input
                  type="text"
                  value={agendaForm.location}
                  onChange={e => setAgendaForm((prev: any) => ({ ...prev, location: e.target.value }))}
                  placeholder="Google Meet, WhatsApp o Presencial"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Notas / Objetivo</label>
                <textarea
                  value={agendaForm.notes}
                  onChange={e => setAgendaForm((prev: any) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Detalles sobre la reunión..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-purple-600 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button
                onClick={handleCreateAgendaEvent}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm py-2.5 rounded-xl shadow-sm transition-colors"
              >
                Guardar Evento
              </button>
              <button
                onClick={() => setShowModal(null)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
