'use client';

import { useEffect, useId, useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { Button } from '@/components/ui';
import {
  ETIQUETA_NOMBRE_PARA_MOSTRAR, AYUDA_NOMBRE_PARA_MOSTRAR, nombreParaMostrarCambio, cuerpoNombreParaMostrar,
  puedeEditarNombreParaMostrar,
} from '@/lib/nombre-para-mostrar';

// B3 T20b (parte A, decisión del usuario): el «Nombre para mostrar» del usuario elegido en Empleados (la página solo
// lo monta, R15). Es como verá el cliente a su asesor en los documentos. La lógica y los textos vienen de
// lib/nombre-para-mostrar.js (probada con node); la regla completa la aplica el servidor y su 400 sale aquí.

type UsuarioConNombre = { id: number; nombre_para_mostrar?: string | null };

/**
 * El campo con su ayuda, editable solo por un ADMIN (los demás lo ven en solo lectura y sin «Guardar»), y una sola
 * región `role="alert"` siempre montada para los errores del servidor. «Guardar» se habilita solo si lo escrito cambia
 * el nombre guardado (normalizado); Enter también guarda. Al guardar llama a `onGuardado` con el usuario que devuelve
 * el servidor. Si se elige otro usuario, el campo vuelve a lo guardado.
 */
export function CampoNombreParaMostrar({ usuario, onGuardado }: {
  usuario: UsuarioConNombre;
  onGuardado: (usuario: UsuarioConNombre) => void;
}) {
  const id = useId();
  const ayudaId = `${id}-ayuda`;
  const guardado = usuario.nombre_para_mostrar ?? '';
  const [valor, setValor] = useState(guardado);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // El rol lo escribe AuthGuard (/auth/me); se lee después de montar para no desajustar la hidratación.
  const [rol, setRol] = useState('');
  useEffect(() => {
    try { setRol(localStorage.getItem('user_role') || ''); } catch { setRol(''); }
  }, []);
  useEffect(() => {
    setValor(guardado);
    setError('');
  }, [usuario.id, guardado]);
  const puedeEditar = puedeEditarNombreParaMostrar(rol);
  const cambio = nombreParaMostrarCambio(guardado, valor);

  async function guardar() {
    if (!puedeEditar || !cambio || guardando) return;
    setGuardando(true);
    setError('');
    try {
      const respuesta = await apiFetch(`/auth/users/${usuario.id}/nombre-para-mostrar`, {
        method: 'PATCH',
        body: JSON.stringify(cuerpoNombreParaMostrar(valor)),
      });
      const actualizado: UsuarioConNombre = respuesta?.data ?? { ...usuario, ...cuerpoNombreParaMostrar(valor) };
      setValor(actualizado.nombre_para_mostrar ?? '');
      onGuardado(actualizado);
    } catch (err) {
      setError(textoDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <label htmlFor={id} className="text-sm font-black text-slate-800 uppercase tracking-wider block">
        {ETIQUETA_NOMBRE_PARA_MOSTRAR}
      </label>
      <p id={ayudaId} className="text-xs text-slate-500 mt-0.5">{AYUDA_NOMBRE_PARA_MOSTRAR}</p>
      <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
        <input id={id} type="text" value={valor} maxLength={80} readOnly={!puedeEditar} aria-describedby={ayudaId}
          placeholder="Ej: Laura Gómez"
          onChange={e => { setValor(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void guardar(); } }}
          className={`flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ${puedeEditar ? 'bg-white text-slate-800' : 'bg-slate-50 text-slate-500'}`} />
        {puedeEditar && (
          <Button color="indigo" icon={Save} loading={guardando} disabled={!cambio} onClick={() => void guardar()}>Guardar</Button>
        )}
      </div>
      <div role="alert">{error ? <p className="mt-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p> : null}</div>
    </div>
  );
}
