"use client";
import { useState } from "react";
import { Eye, EyeOff, User, Mail, Phone, Lock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
export default function CuentaPage() {
  const [tab, setTab] = useState<"login"|"registro">("login");
  const [showPwd, setShowPwd] = useState(false);
  const [login, setLogin] = useState({email:"",password:""});
  const [reg, setReg] = useState({nombre:"",apellido:"",email:"",telefono:"",password:"",confirm:""});
  const [notice, setNotice] = useState("");
  const setL = (k:string,v:string) => setLogin(f=>({...f,[k]:v}));
  const setR = (k:string,v:string) => setReg(f=>({...f,[k]:v}));
  const handleLogin = (e: React.FormEvent) => { e.preventDefault(); setNotice("Autenticacion de clientes - Proximo lanzamiento. Mientras tanto, sigue tus pedidos por WhatsApp."); };
  const handleReg = (e: React.FormEvent) => { e.preventDefault(); if(reg.password!==reg.confirm){setNotice("Las contraseñas no coinciden.");return;} setNotice("Cuenta creada! Pronto podras iniciar sesion. Te notificaremos por correo."); };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/store" className="text-3xl font-black tracking-tighter text-slate-900">NEBULAE<span className="text-emerald-500">.</span></Link>
          <p className="text-slate-500 mt-1 text-sm">Tu cuenta en Nebulae</p>
        </div>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200">
            {(["login","registro"] as const).map(t=>(
              <button key={t} onClick={()=>{setTab(t);setNotice("");}} className={`flex-1 py-4 font-bold text-sm transition-colors ${tab===t?"bg-slate-900 text-white":"text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>{t==="login"?"Iniciar Sesion":"Crear Cuenta"}</button>
            ))}
          </div>
          <div className="p-8">
            {notice&&(
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-5 text-emerald-800 text-sm"><CheckCircle2 size={16} className="shrink-0 mt-0.5"/><p>{notice}</p></div>
            )}
            {tab==="login"?(
              <form onSubmit={handleLogin} className="space-y-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Correo Electronico</label>
                  <div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input required type="email" value={login.email} onChange={e=>setL("email",e.target.value)} placeholder="tu@correo.com" className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                </div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Contrasena</label>
                  <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input required type={showPwd?"text":"password"} value={login.password} onChange={e=>setL("password",e.target.value)} placeholder="••••••••" className="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/>
                    <button type="button" onClick={()=>setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPwd?<EyeOff size={16}/>:<Eye size={16}/>}</button>
                  </div>
                </div>
                <div className="flex justify-end"><a href="#" className="text-xs text-emerald-600 hover:underline font-medium">Olvidaste tu contrasena?</a></div>
                <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors shadow-md">Iniciar Sesion</button>
                <p className="text-center text-sm text-slate-500">No tienes cuenta? <button onClick={()=>setTab("registro")} type="button" className="text-emerald-600 font-bold hover:underline">Registrate</button></p>
              </form>
            ):(
              <form onSubmit={handleReg} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre *</label><div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input required value={reg.nombre} onChange={e=>setR("nombre",e.target.value)} placeholder="Nombre" className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Apellido *</label><input required value={reg.apellido} onChange={e=>setR("apellido",e.target.value)} placeholder="Apellido" className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                </div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Correo *</label><div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input required type="email" value={reg.email} onChange={e=>setR("email",e.target.value)} placeholder="tu@correo.com" className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Telefono</label><div className="relative"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={reg.telefono} onChange={e=>setR("telefono",e.target.value)} placeholder="+57 300..." className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Contrasena *</label><input required type="password" value={reg.password} onChange={e=>setR("password",e.target.value)} placeholder="••••••••" className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Confirmar *</label><input required type="password" value={reg.confirm} onChange={e=>setR("confirm",e.target.value)} placeholder="••••••••" className={`w-full border rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 ${reg.confirm&&reg.password!==reg.confirm?"border-red-300 focus:ring-red-200":"border-slate-200 focus:ring-emerald-200"}`}/></div>
                </div>
                <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors shadow-md">Crear Cuenta</button>
                <p className="text-center text-sm text-slate-500">Ya tienes cuenta? <button onClick={()=>setTab("login")} type="button" className="text-emerald-600 font-bold hover:underline">Iniciar sesion</button></p>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Al registrarte, aceptas nuestros <a href="#" className="underline">Terminos de Uso</a> y <a href="#" className="underline">Politica de Privacidad</a>.</p>
      </div>
    </div>
  );
}