"use client";

import { useState, useEffect } from 'react';
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  createClienteSolicitud, getSolicitudTipos, getHeaders, API_URL, apiFetch
} from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Search, Plus, Calendar, MessageSquare, Settings,
  User, DollarSign, ShoppingBag, MapPin, Activity,
  Phone, Mail, X, ArrowRight, Trash2, CheckCircle2, ExternalLink,
  MessageCircle, Clock, AlertTriangle, ChevronRight, FileText,
  Truck, Building2, Globe, Edit2, ShieldAlert
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
  // ─── PESTAÑA PRINCIPAL (Clientes vs Proveedores) ───────────────────────────
  const [mainTab, setMainTab] = useState<'clientes' | 'proveedores'>('clientes');

  // ─── ESTADOS DE CLIENTES ───────────────────────────────────────────────────
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información y Ficha');
  const [entityType, setEntityType] = useState('Individuo');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [deleteConfirmClient, setDeleteConfirmClient] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  // ─── ESTADOS DE PROVEEDORES ───────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierPecs, setSupplierPecs] = useState<any[]>([]);
  const [supplierModal, setSupplierModal] = useState<'NEW' | 'EDIT' | null>(null);
  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState<any | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    nombre: '',
    contacto_nombre: '',
    email: '',
    telefono: '',
    direccion: '',
    ciudad: '',
    pais: 'Colombia',
    moneda_default: 'COP',
    condiciones_pago: 'Contado',
    tiempo_entrega_dias: 7,
  });

  // ─── CARGA DE CLIENTES ─────────────────────────────────────────────────────
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

  // ─── CARGA DE PROVEEDORES ──────────────────────────────────────────────────
  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const res = await apiFetch('/compras/proveedores');
      const list = res?.data || res || [];
      setSuppliers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Error cargando proveedores', e);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const openSupplier = async (sup: any) => {
    setSelectedSupplier(sup);
    try {
      const res = await apiFetch(`/compras/pedidos?supplier_id=${sup.id}`);
      setSupplierPecs(res?.data || res || []);
    } catch {
      setSupplierPecs([]);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchSuppliers();
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
    setCustomer360(null);
  };

  const goBackSupplier = () => {
    setSelectedSupplier(null);
    setSupplierPecs([]);
  };

  // ─── ACCIONES CLIENTES ─────────────────────────────────────────────────────
  const handleSaveClient = async () => {
    setIsSaving(true);
    const tid = toast.loading('Guardando cliente...');
    try {
      if (selectedClient === 'NEW') {
        if (!formData.first_name && !formData.last_name) {
          toast.error('Nombre o apellido requerido', { id: tid });
          setIsSaving(false);
          return;
        }
        const created = await createCustomer({
          first_name: formData.first_name || '',
          last_name: formData.last_name || '',
          email: formData.email || '',
          phone: formData.phone || '',
          document: formData.document || '',
          address: formData.address || '',
          city: formData.city || '',
        });
        toast.success('Cliente creado con éxito', { id: tid });
        await fetchCustomers();
        if (created?.data?.id) {
          openClient({
            id: `CLI-${String(created.data.id).padStart(4, '0')}`,
            realId: created.data.id,
            name: `${created.data.first_name || ''} ${created.data.last_name || ''}`.trim(),
            first_name: created.data.first_name,
            last_name: created.data.last_name,
            email: created.data.email,
            phone: created.data.phone,
            document: created.data.document,
            address: created.data.address,
            city: created.data.city,
            initial: (created.data.first_name ? created.data.first_name.charAt(0).toUpperCase() : 'C'),
          });
        } else {
          goBack();
        }
      } else {
        const payload: any = {};
        if (formData.first_name !== undefined) payload.first_name = formData.first_name;
        if (formData.last_name !== undefined) payload.last_name = formData.last_name;
        if (formData.email !== undefined) payload.email = formData.email;
        if (formData.phone !== undefined) payload.phone = formData.phone;
        if (formData.document !== undefined) payload.document = formData.document;
        if (formData.address !== undefined) payload.address = formData.address;
        if (formData.city !== undefined) payload.city = formData.city;

        await updateCustomer(selectedClient.realId, payload);
        toast.success('Cliente actualizado correctamente', { id: tid });
        await fetchCustomers();
        setSelectedClient((prev: any) => ({ ...prev, ...payload, name: `${payload.first_name ?? prev.first_name} ${payload.last_name ?? prev.last_name}`.trim() }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar', { id: tid });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteClient = async () => {
    const rawId = deleteConfirmClient?.realId ?? deleteConfirmClient?.id;
    const targetId = typeof rawId === 'string' && rawId.startsWith('CLI-')
      ? parseInt(rawId.replace('CLI-', ''), 10)
      : Number(rawId);

    if (!targetId || isNaN(targetId)) {
      toast.error('No se pudo identificar el ID del cliente');
      return;
    }

    setIsDeleting(true);
    const tid = toast.loading('Eliminando cliente...');
    try {
      await deleteCustomer(targetId);
      toast.success('Cliente eliminado correctamente.', { id: tid });
      setDeleteConfirmClient(null);
      if (selectedClient?.realId === targetId || selectedClient?.id === deleteConfirmClient?.id) {
        goBack();
      }
      await fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar cliente', { id: tid });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateSolicitud = async () => {
    if (!selectedClient?.realId) return;
    const tid = toast.loading('Ingresando solicitud al CRM...');
    try {
      await createClienteSolicitud(selectedClient.realId, {
        sale_type: solicitudForm.sale_type || 'ON_DEMAND',
        tipo: solicitudForm.tipo,
        producto: solicitudForm.producto,
        detalles: solicitudForm.detalles,
      });
      toast.success('¡Solicitud creada!', { id: tid });
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
    const tid = toast.loading('Guardando en la agenda...');
    try {
      const res = await fetch(`${API_URL}/crm/calendar/events`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          title: agendaForm.title,
          description: agendaForm.notes || undefined,
          start_datetime: new Date(agendaForm.start_datetime).toISOString(),
          end_datetime: agendaForm.end_datetime ? new Date(agendaForm.end_datetime).toISOString() : undefined,
          event_type: agendaForm.event_type || 'MEETING',
          location: agendaForm.location || undefined,
          color: agendaForm.color || 'indigo',
          customer_id: selectedClient?.realId || undefined,
          customer_name: selectedClient?.name || undefined,
        }),
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

  // ─── ACCIONES PROVEEDORES ─────────────────────────────────────────────────
  const openNewSupplier = () => {
    setSupplierForm({
      nombre: '',
      contacto_nombre: '',
      email: '',
      telefono: '',
      direccion: '',
      ciudad: '',
      pais: 'Colombia',
      moneda_default: 'COP',
      condiciones_pago: 'Contado',
      tiempo_entrega_dias: 7,
    });
    setSupplierModal('NEW');
  };

  const openEditSupplier = (sup: any) => {
    setSupplierForm({
      nombre: sup.nombre || '',
      contacto_nombre: sup.contacto_nombre || '',
      email: sup.email || '',
      telefono: sup.telefono || '',
      direccion: sup.direccion || '',
      ciudad: sup.ciudad || '',
      pais: sup.pais || 'Colombia',
      moneda_default: sup.moneda_default || 'COP',
      condiciones_pago: sup.condiciones_pago || 'Contado',
      tiempo_entrega_dias: sup.tiempo_entrega_dias || 7,
    });
    setSupplierModal('EDIT');
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.nombre.trim()) {
      toast.error('El nombre comercial del proveedor es obligatorio');
      return;
    }
    const tid = toast.loading('Guardando proveedor...');
    try {
      if (supplierModal === 'EDIT' && selectedSupplier?.id) {
        const res = await apiFetch(`/compras/proveedores/${selectedSupplier.id}`, {
          method: 'PUT',
          body: JSON.stringify(supplierForm),
        });
        toast.success('Proveedor actualizado', { id: tid });
        setSelectedSupplier(res.data || { ...selectedSupplier, ...supplierForm });
      } else {
        await apiFetch('/compras/proveedores', {
          method: 'POST',
          body: JSON.stringify(supplierForm),
        });
        toast.success('Proveedor creado exitosamente', { id: tid });
      }
      setSupplierModal(null);
      await fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Error guardando proveedor', { id: tid });
    }
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!deleteConfirmSupplier?.id) return;
    const tid = toast.loading('Eliminando proveedor...');
    try {
      await apiFetch(`/compras/proveedores/${deleteConfirmSupplier.id}`, {
        method: 'DELETE',
      });
      toast.success('Proveedor eliminado correctamente.', { id: tid });
      setDeleteConfirmSupplier(null);
      if (selectedSupplier?.id === deleteConfirmSupplier.id) {
        goBackSupplier();
      }
      await fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar proveedor', { id: tid });
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    c.id.includes(searchTerm)
  );

  const filteredSuppliers = suppliers.filter(s =>
    (s.nombre || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.contacto_nombre || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.ciudad || '').toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const sf = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));
  const fv = (field: string) => formData[field] !== undefined ? formData[field] : (selectedClient && selectedClient !== 'NEW' ? selectedClient[field] : '');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN PROVEEDORES
  // ═══════════════════════════════════════════════════════════════════════════
  if (mainTab === 'proveedores') {
    if (!selectedSupplier) {
      return (
        <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-6 overflow-y-auto animate-in fade-in">
          {/* Top Switcher Tab Bar */}
          <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit mb-6">
            <button
              onClick={() => { setMainTab('clientes'); setSelectedClient(null); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            >
              <User size={15} /> Clientes ({customers.length})
            </button>
            <button
              onClick={() => { setMainTab('proveedores'); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-teal-600 text-white shadow-sm"
            >
              <Truck size={15} /> Proveedores ({suppliers.length})
            </button>
          </div>

          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-md">
                <Truck size={26} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900">Agenda de Proveedores</h1>
                <p className="text-slate-500 text-xs mt-0.5">Gestión de fabricantes, distribuidores, condiciones comerciales y pedidos de compra.</p>
              </div>
            </div>
            <button
              onClick={openNewSupplier}
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              <Plus size={16} /> Nuevo Proveedor
            </button>
          </div>

          {/* Search Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 mb-6 flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por nombre de empresa, contacto, ciudad o email..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-teal-600 transition-colors"
              />
            </div>
            <span className="text-xs font-bold text-slate-500 shrink-0">
              {filteredSuppliers.length} proveedores registrados
            </span>
          </div>

          {/* Grid Proveedores */}
          {loadingSuppliers ? (
            <div className="py-20 text-center text-slate-400 text-sm">Cargando proveedores...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm max-w-lg mx-auto">
              <Building2 className="text-slate-300 mx-auto mb-3" size={48} />
              <h3 className="font-black text-slate-800 text-lg">Sin proveedores registrados</h3>
              <p className="text-xs text-slate-500 mt-1 mb-6">Crea el primer proveedor para gestionar compras y pedidos PEC.</p>
              <button
                onClick={openNewSupplier}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md"
              >
                + Registrar Proveedor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers.map(sup => {
                const cleanPhone = (sup.telefono || '').replace(/\D/g, '');
                return (
                  <div
                    key={sup.id}
                    onClick={() => openSupplier(sup)}
                    className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-black text-lg flex items-center justify-center shadow-sm uppercase">
                            {(sup.nombre || 'P').charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-base group-hover:text-teal-600 transition-colors leading-tight">
                              {sup.nombre}
                            </h3>
                            <span className="text-[11px] font-semibold text-slate-400">PROV-{String(sup.id).padStart(4, '0')}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmSupplier(sup);
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar Proveedor"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                        {sup.contacto_nombre && (
                          <div className="flex items-center gap-2">
                            <User size={13} className="text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700">{sup.contacto_nombre}</span>
                          </div>
                        )}
                        {sup.telefono && (
                          <div className="flex items-center gap-2">
                            <Phone size={13} className="text-slate-400 shrink-0" />
                            <span className="font-medium">{sup.telefono}</span>
                          </div>
                        )}
                        {sup.email && (
                          <div className="flex items-center gap-2">
                            <Mail size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">{sup.email}</span>
                          </div>
                        )}
                        {(sup.ciudad || sup.pais) && (
                          <div className="flex items-center gap-2">
                            <MapPin size={13} className="text-slate-400 shrink-0" />
                            <span>{[sup.ciudad, sup.pais].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                        {sup.condiciones_pago || 'Contado'} · {sup.moneda_default || 'COP'}
                      </span>
                      <span className="text-xs font-bold text-teal-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Ficha 360 <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal Confirmación Eliminación Proveedor */}
          {deleteConfirmSupplier && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-800">Eliminar Proveedor</h3>
                    <p className="text-xs text-slate-400">Esta acción no se puede revertir</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ¿Estás seguro de que deseas eliminar a <strong className="text-slate-800">{deleteConfirmSupplier.nombre}</strong>?
                </p>
                <div className="pt-2 flex gap-2.5">
                  <button
                    onClick={() => setDeleteConfirmSupplier(null)}
                    className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmDeleteSupplier}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-sm"
                  >
                    Sí, Eliminar Proveedor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Crear / Editar Proveedor */}
          {supplierModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-800">
                    {supplierModal === 'EDIT' ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                  </h3>
                  <button onClick={() => setSupplierModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSupplier} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial *</label>
                    <input
                      required
                      type="text"
                      value={supplierForm.nombre}
                      onChange={e => setSupplierForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej. MegaDistribuciones SAS"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Persona de Contacto</label>
                      <input
                        type="text"
                        value={supplierForm.contacto_nombre}
                        onChange={e => setSupplierForm(f => ({ ...f, contacto_nombre: e.target.value }))}
                        placeholder="Ej. Juan Pérez"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                      <input
                        type="tel"
                        value={supplierForm.telefono}
                        onChange={e => setSupplierForm(f => ({ ...f, telefono: e.target.value }))}
                        placeholder="Ej. 3001234567"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                      <input
                        type="email"
                        value={supplierForm.email}
                        onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="contacto@proveedor.com"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad / País</label>
                      <input
                        type="text"
                        value={supplierForm.ciudad}
                        onChange={e => setSupplierForm(f => ({ ...f, ciudad: e.target.value }))}
                        placeholder="Barranquilla, Colombia"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Condiciones de Pago</label>
                      <select
                        value={supplierForm.condiciones_pago}
                        onChange={e => setSupplierForm(f => ({ ...f, condiciones_pago: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none bg-white focus:border-teal-600"
                      >
                        <option value="Contado">Contado</option>
                        <option value="Anticipo 50% / Saldo Entrega">Anticipo 50% / Saldo Entrega</option>
                        <option value="Credito 15 Dias">Crédito 15 Días</option>
                        <option value="Credito 30 Dias">Crédito 30 Días</option>
                        <option value="Contra Entrega">Contra Entrega</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Moneda Principal</label>
                      <select
                        value={supplierForm.moneda_default}
                        onChange={e => setSupplierForm(f => ({ ...f, moneda_default: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none bg-white focus:border-teal-600"
                      >
                        <option value="COP">COP ($)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSupplierModal(null)}
                      className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-sm"
                    >
                      {supplierModal === 'EDIT' ? 'Guardar Cambios' : 'Crear Proveedor'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ─── DETALLE PROVEEDOR (FICHA 360) ─────────────────────────────────────────
    const cleanPhone = (selectedSupplier.telefono || '').replace(/\D/g, '');

    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-6 overflow-y-auto animate-in fade-in">
        {/* Back Button */}
        <div className="mb-4">
          <button
            onClick={goBackSupplier}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-3"
          >
            ← Volver a la lista de proveedores
          </button>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white font-black text-2xl flex items-center justify-center shadow-md uppercase">
                {(selectedSupplier.nombre || 'P').charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-slate-900">{selectedSupplier.nombre}</h1>
                  <span className="text-xs font-bold px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full border border-teal-200">
                    PROV-{String(selectedSupplier.id).padStart(4, '0')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Contacto: <span className="font-semibold text-slate-700">{selectedSupplier.contacto_nombre || 'N/A'}</span> · 
                  Ubicación: <span className="font-semibold text-slate-700">{[selectedSupplier.ciudad, selectedSupplier.pais].filter(Boolean).join(', ') || 'No especificada'}</span>
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              {cleanPhone && (
                <a
                  href={`https://wa.me/57${cleanPhone}?text=${encodeURIComponent('Hola ' + (selectedSupplier.contacto_nombre || selectedSupplier.nombre) + ', te saludamos del equipo de Compras de Nebulae.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
              )}
              {selectedSupplier.email && (
                <a
                  href={`mailto:${selectedSupplier.email}`}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Mail size={14} /> Correo
                </a>
              )}
              <button
                onClick={() => openEditSupplier(selectedSupplier)}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Edit2 size={14} /> Editar
              </button>
              <button
                onClick={() => setDeleteConfirmSupplier(selectedSupplier)}
                className="p-2 border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                title="Eliminar Proveedor"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* KPIs Proveedor */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Condiciones de Pago</span>
            <p className="text-lg font-black text-slate-800 mt-1">{selectedSupplier.condiciones_pago || 'Contado'}</p>
          </div>
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Moneda Habitual</span>
            <p className="text-lg font-black text-teal-600 mt-1">{selectedSupplier.moneda_default || 'COP'}</p>
          </div>
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Tiempo Entrega Estimado</span>
            <p className="text-lg font-black text-slate-800 mt-1">{selectedSupplier.tiempo_entrega_dias || 7} días</p>
          </div>
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Pedidos PEC Emitidos</span>
            <p className="text-lg font-black text-indigo-600 mt-1">{supplierPecs.length} ordenes</p>
          </div>
        </div>

        {/* Historial de Pedidos de Compra (PECs) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Truck size={18} className="text-teal-600" /> Pedidos de Compra Asociados (PECs)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Historial de órdenes de compra emitidas a este proveedor.</p>
            </div>
            <Link
              href="/dashboard/compras/pedidos"
              className="px-4 py-2 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs font-bold hover:bg-teal-100 transition-colors flex items-center gap-1.5"
            >
              + Nuevo Pedido PEC
            </Link>
          </div>

          {supplierPecs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No hay pedidos de compra emitidos aún a este proveedor.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {supplierPecs.map((pec: any) => (
                <div key={pec.id} className="py-3.5 flex items-center justify-between hover:bg-slate-50 px-3 rounded-xl transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800">{pec.numero}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_COLOR_MAP[pec.estado] || 'bg-slate-100 text-slate-600'}`}>
                        {pec.estado}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Fecha: {pec.fecha_pedido ? new Date(pec.fecha_pedido).toLocaleDateString('es-CO') : '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-800">{formatCOP(pec.total_cop)}</p>
                    <Link
                      href="/dashboard/compras/pedidos"
                      className="text-[10px] font-bold text-teal-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                    >
                      Ver en Compras <ChevronRight size={11} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Confirmación Eliminación Proveedor */}
        {deleteConfirmSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-800">Eliminar Proveedor</h3>
                  <p className="text-xs text-slate-400">Esta acción no se puede revertir</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar permanentemente a <strong className="text-slate-800">{deleteConfirmSupplier.nombre}</strong>?
              </p>
              <div className="pt-2 flex gap-2.5">
                <button
                  onClick={() => setDeleteConfirmSupplier(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDeleteSupplier}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-sm"
                >
                  Sí, Eliminar Proveedor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Editar Proveedor */}
        {supplierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-base text-slate-800">Editar Proveedor</h3>
                <button onClick={() => setSupplierModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveSupplier} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial *</label>
                  <input
                    required
                    type="text"
                    value={supplierForm.nombre}
                    onChange={e => setSupplierForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Persona de Contacto</label>
                    <input
                      type="text"
                      value={supplierForm.contacto_nombre}
                      onChange={e => setSupplierForm(f => ({ ...f, contacto_nombre: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      value={supplierForm.telefono}
                      onChange={e => setSupplierForm(f => ({ ...f, telefono: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={supplierForm.email}
                      onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad / País</label>
                    <input
                      type="text"
                      value={supplierForm.ciudad}
                      onChange={e => setSupplierForm(f => ({ ...f, ciudad: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Condiciones de Pago</label>
                    <select
                      value={supplierForm.condiciones_pago}
                      onChange={e => setSupplierForm(f => ({ ...f, condiciones_pago: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none bg-white focus:border-teal-600"
                    >
                      <option value="Contado">Contado</option>
                      <option value="Anticipo 50% / Saldo Entrega">Anticipo 50% / Saldo Entrega</option>
                      <option value="Credito 15 Dias">Crédito 15 Días</option>
                      <option value="Credito 30 Dias">Crédito 30 Días</option>
                      <option value="Contra Entrega">Contra Entrega</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Moneda Principal</label>
                    <select
                      value={supplierForm.moneda_default}
                      onChange={e => setSupplierForm(f => ({ ...f, moneda_default: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none bg-white focus:border-teal-600"
                    >
                      <option value="COP">COP ($)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSupplierModal(null)}
                    className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-sm"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN CLIENTES — VIEW 1: LISTADO CLIENTES
  // ═══════════════════════════════════════════════════════════════════════════
  if (!selectedClient) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-6 overflow-y-auto animate-in fade-in">
        {/* Top Switcher Tab Bar */}
        <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit mb-6">
          <button
            onClick={() => { setMainTab('clientes'); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-purple-600 text-white shadow-sm"
          >
            <User size={15} /> Clientes ({customers.length})
          </button>
          <button
            onClick={() => { setMainTab('proveedores'); setSelectedSupplier(null); fetchSuppliers(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          >
            <Truck size={15} /> Proveedores ({suppliers.length})
          </button>
        </div>

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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmClient(client);
                      }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar Cliente"
                    >
                      <Trash2 size={14} />
                    </button>
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

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  {cleanPhone ? (
                    <a
                      href={`https://wa.me/57${cleanPhone}?text=${encodeURIComponent('Hola ' + client.name + ', te saludamos de Nebulae.')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <MessageCircle size={13} /> WhatsApp
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

        {/* Modal Confirmación Eliminación Cliente */}
        {deleteConfirmClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-800">Eliminar Cliente</h3>
                  <p className="text-xs text-slate-400">Esta acción no se puede revertir</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar a <strong className="text-slate-800">{deleteConfirmClient.name}</strong>? Se desvincularán sus documentos asociados y se eliminará su ficha del CRM.
              </p>
              <div className="pt-2 flex gap-2.5">
                <button
                  disabled={isDeleting}
                  onClick={() => setDeleteConfirmClient(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteClient}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-sm disabled:opacity-50"
                >
                  {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Cliente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN CLIENTES — VIEW 2: FICHA ÚNICA DEL CLIENTE SELECCIONADO
  // ═══════════════════════════════════════════════════════════════════════════
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
              <button
                onClick={() => setShowModal('Solicitud')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Plus size={15} /> Nueva Solicitud
              </button>
              <Link
                href={`/dashboard/ventas/cotizacion?customer_id=${selectedClient.realId}`}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <FileText size={14} /> Cotizar
              </Link>
              <button
                onClick={() => setShowModal('Agendar')}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Calendar size={14} /> Agendar
              </button>
              <button
                onClick={() => setDeleteConfirmClient(selectedClient)}
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
            <p className="text-2xl font-black">{formatCOP(saldoPendiente)}</p>
            <p className="text-[10px] opacity-75 mt-0.5">
              {saldoPendiente > 0 ? 'Cobro pendiente antes del despacho' : 'Al día con pagos'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Comprado (LTV)</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatCOP(totalComprado)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{customer360?.sales_orders?.length || 0} pedidos históricos</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Pagado</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{formatCOP(totalPagado)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Anticipos + pagos registrados</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Cotizaciones Vivas</span>
            <p className="text-2xl font-black text-indigo-600 mt-1">{customer360?.quotations?.length || 0}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{customer360?.customer_requests?.length || 0} solicitudes activas</p>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="bg-white border-b border-slate-200 px-6 rounded-t-3xl flex gap-6 shrink-0 shadow-sm">
        {['Información y Ficha', 'Historial Comercial', 'Timeline Unificado'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === tab
                ? 'border-purple-600 text-purple-600 font-black'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {tab === 'Información y Ficha' && <User size={14} />}
            {tab === 'Historial Comercial' && <ShoppingBag size={14} />}
            {tab === 'Timeline Unificado' && <Activity size={14} />}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="bg-white border border-t-0 border-slate-200 rounded-b-3xl p-6 shadow-sm flex-1">
        {/* TAB 1: INFORMACIÓN Y FICHA */}
        {activeTab === 'Información y Ficha' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={fv('first_name')}
                  onChange={e => sf('first_name', e.target.value)}
                  placeholder="Ej. Juan"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Apellido *</label>
                <input
                  type="text"
                  value={fv('last_name')}
                  onChange={e => sf('last_name', e.target.value)}
                  placeholder="Ej. Pérez"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={fv('email')}
                  onChange={e => sf('email', e.target.value)}
                  placeholder="juan.perez@ejemplo.com"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / Celular (WhatsApp)</label>
                <input
                  type="tel"
                  value={fv('phone')}
                  onChange={e => sf('phone', e.target.value)}
                  placeholder="3001234567"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Documento / NIT</label>
                <input
                  type="text"
                  value={fv('document')}
                  onChange={e => sf('document', e.target.value)}
                  placeholder="CC o NIT"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Ciudad</label>
                <input
                  type="text"
                  value={fv('city')}
                  onChange={e => sf('city', e.target.value)}
                  placeholder="Barranquilla"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Dirección de Entrega</label>
                <input
                  type="text"
                  value={fv('address')}
                  onChange={e => sf('address', e.target.value)}
                  placeholder="Calle 100 # 50 - 20, Apto 502"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              {!isNew && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmClient(selectedClient)}
                  className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> Eliminar este cliente
                </button>
              )}
              <div className="flex gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={goBack}
                  className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveClient}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : (isNew ? 'Crear Cliente' : 'Guardar Cambios')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HISTORIAL COMERCIAL */}
        {activeTab === 'Historial Comercial' && (
          <div className="space-y-6">
            {/* Solicitudes de Cliente */}
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Solicitudes de Cliente</h3>
              <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {(customer360?.customer_requests || []).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">Sin solicitudes registradas</div>
                ) : (
                  (customer360?.customer_requests || []).map((sc: any) => (
                    <div key={sc.id} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800">{sc.numero}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_COLOR_MAP[sc.estado] || 'bg-slate-100 text-slate-600'}`}>{sc.estado}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{sc.tipo_solicitud || 'Cotización'} · {timeAgo(sc.created_at)}</p>
                      </div>
                      <Link href={`/dashboard/ventas/solicitudes`} className="text-xs font-bold text-indigo-600 hover:underline">Ver SC →</Link>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pedidos de Venta */}
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Pedidos de Venta (PVEN)</h3>
              <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {(customer360?.sales_orders || []).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">Sin pedidos de venta registrados</div>
                ) : (
                  (customer360?.sales_orders || []).map((so: any) => (
                    <div key={so.id} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800">{so.numero}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_COLOR_MAP[so.estado] || 'bg-slate-100 text-slate-600'}`}>{so.estado}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Total: {formatCOP(so.total_cop)} · Anticipo: {formatCOP(so.anticipo_cop)}</p>
                      </div>
                      <Link href={`/dashboard/ventas/pedidos`} className="text-xs font-bold text-indigo-600 hover:underline">Ver Pedido →</Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TIMELINE UNIFICADO */}
        {activeTab === 'Timeline Unificado' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Actividad Cronológica del Cliente</h3>
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
              {(customer360?.timeline || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Sin eventos cronológicos aún</div>
              ) : (
                (customer360?.timeline || []).map((t: any, idx: number) => (
                  <div key={idx} className="relative">
                    <span className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${TIMELINE_DOT_COLOR[t.event_type] || 'bg-slate-400'}`} />
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-white transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800">{t.title}</span>
                        <span className="text-[10px] text-slate-400">{timeAgo(t.date)}</span>
                      </div>
                      <p className="text-xs text-slate-600">{t.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Confirmación Eliminación Cliente */}
      {deleteConfirmClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-800">Eliminar Cliente</h3>
                <p className="text-xs text-slate-400">Esta acción no se puede revertir</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Estás seguro de que deseas eliminar permanentemente a <strong className="text-slate-800">{deleteConfirmClient.name}</strong>? Se desvincularán sus documentos asociados y se eliminará su ficha del CRM.
            </p>
            <div className="pt-2 flex gap-2.5">
              <button
                disabled={isDeleting}
                onClick={() => setDeleteConfirmClient(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                disabled={isDeleting}
                onClick={handleConfirmDeleteClient}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-sm disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva Solicitud */}
      {showModal === 'Solicitud' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-800">Nueva Solicitud de Cliente</h3>
              <button onClick={() => setShowModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Tipo de Solicitud</label>
                <select
                  value={solicitudForm.tipo}
                  onChange={e => setSolicitudForm((prev: any) => ({ ...prev, tipo: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none bg-white focus:border-indigo-600"
                >
                  {solicitudTipos.map((t, idx) => (
                    <option key={idx} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Producto o Interés *</label>
                <input
                  type="text"
                  value={solicitudForm.producto}
                  onChange={e => setSolicitudForm((prev: any) => ({ ...prev, producto: e.target.value }))}
                  placeholder="Ej. Coche Paseador Bebé"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Detalles / Requerimiento</label>
                <textarea
                  value={solicitudForm.detalles}
                  onChange={e => setSolicitudForm((prev: any) => ({ ...prev, detalles: e.target.value }))}
                  rows={3}
                  placeholder="Especificaciones o notas adicionales..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-indigo-600 resize-none"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2.5">
              <button
                onClick={() => setShowModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSolicitud}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm"
              >
                Crear Solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agendar Evento */}
      {showModal === 'Agendar' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-800">Agendar Evento / Cita</h3>
              <button onClick={() => setShowModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha y Hora Inicio *</label>
                  <input
                    type="datetime-local"
                    value={agendaForm.start_datetime}
                    onChange={e => setAgendaForm((prev: any) => ({ ...prev, start_datetime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha y Hora Fin</label>
                  <input
                    type="datetime-local"
                    value={agendaForm.end_datetime}
                    onChange={e => setAgendaForm((prev: any) => ({ ...prev, end_datetime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium outline-none focus:border-purple-600"
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Notas / Objetivo</label>
                <textarea
                  value={agendaForm.notes}
                  onChange={e => setAgendaForm((prev: any) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Detalles sobre la reunión..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-purple-600 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateAgendaEvent}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-sm"
              >
                Guardar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
