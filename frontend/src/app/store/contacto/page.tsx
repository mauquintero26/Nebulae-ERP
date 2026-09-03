"use client";
import { useState, useEffect } from "react";
import { Phone, Mail, MapPin, MessageCircle, Clock, Send, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nebulaekids.com/api/v1";
const TIPOS = ["Consulta sobre un producto","Estado de mi pedido","Devolucion o cambio","Problema con mi cuenta","Sugerencia","Otro"];
export default function ContactoPage() {
  const [info, setInfo] = useState({ phone: "+57 (604) 000-0000", whatsapp: "", email: "hola@nebulaekids.com", address: "Medellin, Colombia" });
  const [form, setForm] = useState({ nombre:"",email:"",telefono:"",tipo:TIPOS[0],mensaje:"" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch(API+"/ecommerce/web-builder/config").then(r=>r.json()).then(d=>{ if(d.data?.contact) setInfo({...info,...d.data.contact}); }).catch(()=>{}); }, []);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!form.nombre||!form.email||!form.mensaje){setError("Completa los campos requeridos.");return;}
    setSending(true);setError("");
    await new Promise(r=>setTimeout(r,1200));
    setSent(true);setSending(false);
  };
  const wa = info.whatsapp ? `https://wa.me/${info.whatsapp.replace(/\D/g,"")}?text=${encodeURIComponent("Hola, contacto desde la tienda web de Nebulae. ")}` : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
            <Link href="/store" className="hover:text-slate-700">Inicio</Link><ChevronRight size={14}/><span className="text-slate-700 font-medium">Contacto</span>
          </nav>
          <h1 className="text-4xl font-black text-slate-900 mb-2">Contáctanos</h1>
          <p className="text-slate-500 text-lg">Estamos aqui para ayudarte. Escribenos y te respondemos lo antes posible.</p>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              <h2 className="text-xl font-black text-slate-900 mb-6">Envianos un mensaje</h2>
              {sent ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32} className="text-emerald-600"/></div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">Mensaje enviado!</h3>
                  <p className="text-slate-500 mb-6">Te responderemos pronto a <strong>{form.email}</strong>.</p>
                  <button onClick={()=>{setSent(false);setForm({nombre:"",email:"",telefono:"",tipo:TIPOS[0],mensaje:""});}} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800">Enviar otro</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error&&<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm"><AlertCircle size={16}/>{error}</div>}
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre *</label><input required value={form.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Tu nombre" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                    <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Telefono</label><input value={form.telefono} onChange={e=>set("telefono",e.target.value)} placeholder="+57 300..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                  </div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Correo *</label><input required type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="tu@correo.com" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo</label><select value={form.tipo} onChange={e=>set("tipo",e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Mensaje *</label><textarea required value={form.mensaje} onChange={e=>set("mensaje",e.target.value)} rows={5} placeholder="Cuentanos como podemos ayudarte..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 resize-none"/></div>
                  <button type="submit" disabled={sending} className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"><Send size={16}/>{sending?"Enviando...":"Enviar Mensaje"}</button>
                </form>
              )}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {wa&&<a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-3xl p-6 shadow-lg transition-colors"><div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0"><MessageCircle size={28}/></div><div><p className="font-black text-lg">Chat por WhatsApp</p><p className="text-emerald-100 text-sm">{info.whatsapp}</p></div></a>}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="font-black text-slate-900">Informacion de Contacto</h3>
              {[{icon:Phone,l:"Telefono",v:info.phone},{icon:Mail,l:"Email",v:info.email},{icon:MapPin,l:"Direccion",v:info.address}].map(({icon:Icon,l,v})=>(
                <div key={l} className="flex items-start gap-3"><div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0"><Icon size={16} className="text-slate-600"/></div><div><p className="text-xs font-black text-slate-400 uppercase">{l}</p><p className="font-semibold text-slate-800 text-sm">{v||"-"}</p></div></div>
              ))}
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Clock size={16} className="text-emerald-600"/>Horarios</h3>
              {[["Lunes - Viernes","8:00 AM - 6:00 PM"],["Sabados","9:00 AM - 2:00 PM"],["Domingos y Festivos","Cerrado"]].map(([d,h])=>(
                <div key={d} className="flex justify-between text-sm mb-1.5"><span className="text-slate-500">{d}</span><span className="font-bold text-slate-800">{h}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}