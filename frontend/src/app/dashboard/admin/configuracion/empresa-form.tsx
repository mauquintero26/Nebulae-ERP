'use client';

import {
  useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode,
} from 'react';
import { AlertCircle, AlertTriangle, Building2, History, ImageUp, Lock, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiFetch, API_URL } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { BTN, LOADING } from '@/lib/design-system';
import { fechaHoraLarga } from '@/lib/fechas-colombia';
import {
  CAMPOS_EMPRESA, GRUPOS_CAMPOS_EMPRESA, avisoLogoParaPdf, cambiosDelFormulario, cambiosDelHistorial,
  erroresDeCambios, perfilDeRespuesta, urlLogo, validarArchivoLogo, validarCampoEmpresa, valoresDeCampos,
} from '@/lib/marca-empresa';
import { useAvisos } from '@/components/ui';

/**
 * «Información de la empresa» de Configuración General (Bloque 3, T14: MARCA punto 6, C1). Un solo lugar, guardado de
 * verdad (GET y PUT /empresa), para los datos de la empresa que ven los clientes en sus documentos, más el logo
 * (PUT y DELETE /empresa/logo) y el historial de cambios (GET /empresa/historial).
 * - Solo un ADMIN cambia (puede_editar); los demás roles del ERP ven los datos sin poder editarlos.
 * - Cada campo se revisa al salir de él con validarCampoEmpresa (los mismos textos del 422); «Guardar» solo con cambios
 *   y manda solo lo que cambió (cambiosDelFormulario). Si el servidor da error, el mensaje queda en el formulario y no se
 *   pierde lo escrito.
 * - Sin datos de ejemplo: lo que no está guardado queda vacío.
 * El hook y las piezas pequeñas (useFormularioEmpresa, Campo, avisos) también los usa FormDocumentos.
 */

/** El perfil de GET /empresa (empresa.leer_perfil + puede_editar). */
export type PerfilEmpresa = Record<string, unknown> & { puede_editar?: boolean; logo_url?: string | null };
type FilaHistorial = { id: number; descripcion: string; user_name: string | null; created_at: string; cambios: unknown };
type Carga = { estado: 'cargando' | 'listo' | 'error'; mensaje?: string };

// r1: el foco se ve (anillo indigo-500 al 40% además del borde): outline-none lleva su reemplazo.
export const ESTILO_CAMPO =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 '
  + 'focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:bg-slate-50 '
  + 'disabled:text-slate-500 aria-[invalid=true]:border-red-400';
const DESHABILITADO = ' disabled:opacity-50 disabled:cursor-not-allowed';
// r1: «Quitar logo» parte de BTN.ghost (design-system.ts) con texto rojo.
const BTN_QUITAR = BTN.ghost.replace('text-gray-600', 'text-red-600').replace('hover:bg-gray-100', 'hover:bg-red-50');

const sinClave = (objeto: Record<string, string>, clave: string) => {
  const copia = { ...objeto };
  delete copia[clave];
  return copia;
};

/**
 * El estado de un formulario de la empresa sobre `campos` (una constante del módulo): carga GET /empresa, guarda los
 * valores sin guardar, revisa cada campo al salir y guarda con PUT /empresa solo lo que cambió. guardar() devuelve true
 * si el servidor lo guardó; con un error, el mensaje queda en errorServidor y los valores no se tocan.
 */
export function useFormularioEmpresa(campos: readonly string[], textoGuardado: string) {
  const { avisar } = useAvisos();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [perfil, setPerfil] = useState<PerfilEmpresa | null>(null);
  const [original, setOriginal] = useState<Record<string, string>>(() => valoresDeCampos(null, campos));
  const [valores, setValores] = useState<Record<string, string>>(() => valoresDeCampos(null, campos));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const aplicarPerfil = useCallback((p: PerfilEmpresa) => {
    const v = valoresDeCampos(p, campos);
    setPerfil(p);
    setOriginal(v);
    setValores(v);
  }, [campos]);

  // El estado solo cambia cuando llega la respuesta (nunca dentro del efecto mismo). r1: una respuesta sin perfil
  // (perfilDeRespuesta lanza) va por la rama de error.
  const pedirPerfil = useCallback(() => apiFetch('/empresa').then(perfilDeRespuesta).then(
    (p) => {
      aplicarPerfil(p);
      setCarga({ estado: 'listo' });
    },
    (err) => setCarga({ estado: 'error', mensaje: textoDeError(err, 'No se pudieron cargar los datos de la empresa') }),
  ), [aplicarPerfil]);

  useEffect(() => {
    pedirPerfil();
  }, [pedirPerfil]);

  const cargar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    pedirPerfil();
  }, [pedirPerfil]);

  const cambiar = useCallback((campo: string, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => (campo in e ? sinClave(e, campo) : e));
  }, []);

  const validar = useCallback((campo: string) => {
    const { error } = validarCampoEmpresa(campo, valores[campo]);
    setErrores((e) => (error ? { ...e, [campo]: error } : sinClave(e, campo)));
  }, [valores]);

  const cambios = cambiosDelFormulario(original, valores);
  const hayCambios = Object.keys(cambios).length > 0;
  const puedeEditar = perfil?.puede_editar === true;

  const guardar = useCallback(async (): Promise<boolean> => {
    if (!puedeEditar || guardando || !hayCambios) return false;
    const nuevos = erroresDeCambios(cambios);
    setErrores(nuevos);
    setErrorServidor(null);
    if (Object.keys(nuevos).length > 0) return false;
    setGuardando(true);
    try {
      const r = await apiFetch('/empresa', { method: 'PUT', body: JSON.stringify(cambios) });
      aplicarPerfil(perfilDeRespuesta(r));
      avisar(textoGuardado, { tono: 'ok' });
      return true;
    } catch (err) {
      setErrorServidor(textoDeError(err, 'No se pudo guardar'));
      return false;
    } finally {
      setGuardando(false);
    }
  }, [puedeEditar, guardando, hayCambios, cambios, aplicarPerfil, avisar, textoGuardado]);

  return {
    carga, cargar, perfil, setPerfil, valores, cambiar, validar, errores, errorServidor, guardando, guardar, hayCambios,
    puedeEditar,
  };
}

/** Un campo con su etiqueta, la ayuda y el error en línea (el control recibe id, aria-describedby y aria-invalid). */
export function Campo({ etiqueta, ayuda, error, children }: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid': boolean }) => ReactNode;
}) {
  const id = useId();
  const describe = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-1.5">{etiqueta}</label>
      {children({ id, 'aria-describedby': describe, 'aria-invalid': Boolean(error) })}
      {ayuda && <p id={`${id}-ayuda`} className="mt-1 text-xs text-slate-500">{ayuda}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-600">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Quien no es administrador ve los datos sin poder editarlos. */
export function AvisoSoloLectura() {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
      <Lock size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      Solo un administrador puede cambiar estos datos.
    </p>
  );
}

/** El error del servidor, dentro del formulario (lo escrito no se pierde). */
export function ErrorDelServidor({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{mensaje}</span>
    </p>
  );
}

/** Cargando o el error de carga con «Reintentar». */
export function EstadoDeCarga({ carga, onReintentar }: { carga: Carga; onReintentar: () => void }) {
  if (carga.estado === 'cargando') {
    return (
      <div className={LOADING.wrapper} role="status">
        <div className={LOADING.spinner} aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ErrorDelServidor mensaje={carga.mensaje ?? 'No se pudieron cargar los datos de la empresa.'} />
      <button type="button" onClick={onReintentar} className={BTN.secondary}>
        <RefreshCw size={14} aria-hidden="true" /> Reintentar
      </button>
    </div>
  );
}

/** Lo que no está en empresa.CAMPOS: placeholder, ayuda, el teclado del celular y el autocompletado. */
const DETALLES: Record<string, { placeholder: string; ayuda?: string; inputMode?: 'text' | 'tel' | 'email' | 'url';
  autoComplete?: string; ancho?: boolean }> = {
  nombre_comercial: { placeholder: 'Como te conocen tus clientes', autoComplete: 'organization',
    ayuda: 'Obligatorio para que tus datos salgan en los documentos.' },
  razon_social: { placeholder: 'El nombre legal de la empresa', autoComplete: 'off' },
  nit: { placeholder: '900.123.456-7', autoComplete: 'off' },
  direccion: { placeholder: 'Calle, número y barrio', autoComplete: 'street-address', ancho: true },
  ciudad: { placeholder: 'Ciudad', autoComplete: 'address-level2' },
  telefono: { placeholder: '601 123 4567', inputMode: 'tel', autoComplete: 'tel' },
  whatsapp: { placeholder: '+57 300 123 4567', inputMode: 'tel', autoComplete: 'tel', ayuda: 'El número conectado a Chatwoot.' },
  correo: { placeholder: 'ventas@tuempresa.com', inputMode: 'email', autoComplete: 'email' },
  sitio_web: { placeholder: 'www.tuempresa.com', inputMode: 'url', autoComplete: 'url',
    ayuda: 'Si no escribes http:// o https://, se guarda con https://.' },
};

const leerComoDataUrl = (archivo: File) => new Promise<string>((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(String(lector.result ?? ''));
  lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
  lector.readAsDataURL(archivo);
});

/**
 * El logo: un <label> con el <input type=file> oculto (sr-only). validarArchivoLogo antes de leerlo; el servidor lo
 * vuelve a revisar. «Quitar logo» solo si hay un logo con versión (logo_url; nota del controlador después de T2) y con
 * confirmar(). Si pasa de 4000 px por lado, avisa que no saldrá en el PDF (nota después de T9).
 * r1: `trabajando` vive en FormEmpresa («Guardar» espera al logo) y `bloqueado` (se están guardando los datos) apaga el
 * logo: las dos respuestas reemplazan el perfil y no pueden cruzarse.
 */
function Logo({ perfil, puedeEditar, bloqueado, trabajando, setTrabajando, onPerfil }: {
  perfil: PerfilEmpresa | null;
  puedeEditar: boolean;
  bloqueado: boolean;
  trabajando: boolean;
  setTrabajando: (valor: boolean) => void;
  onPerfil: (p: PerfilEmpresa) => void;
}) {
  const { avisar, confirmar } = useAvisos();
  const [error, setError] = useState<string | null>(null);
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);
  const logo = urlLogo(perfil, API_URL);
  const ayudaId = useId();

  async function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const archivo = input.files?.[0];
    input.value = ''; // el mismo archivo se puede volver a elegir
    if (!archivo || trabajando || bloqueado) return;
    const problema = validarArchivoLogo(archivo);
    setError(problema);
    if (problema) return;
    setTrabajando(true);
    try {
      const r = await apiFetch('/empresa/logo', { method: 'PUT', body: JSON.stringify({ logo: await leerComoDataUrl(archivo) }) });
      onPerfil(perfilDeRespuesta(r));
      avisar('Logo guardado', { tono: 'ok' });
    } catch (err) {
      setError(textoDeError(err, 'No se pudo guardar el logo'));
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar() {
    const ok = await confirmar({
      titulo: 'Quitar el logo',
      mensaje: 'El logo deja de salir en los documentos del cliente. Puedes subir otro cuando quieras.',
      textoConfirmar: 'Quitar logo',
      peligro: true,
    });
    if (!ok || trabajando || bloqueado) return;
    setTrabajando(true);
    setError(null);
    try {
      const r = await apiFetch('/empresa/logo', { method: 'DELETE' });
      onPerfil(perfilDeRespuesta(r));
      setAvisoPdf(null);
      avisar('Logo quitado', { tono: 'ok' });
    } catch (err) {
      setError(textoDeError(err, 'No se pudo quitar el logo'));
    } finally {
      setTrabajando(false);
    }
  }

  const habilitado = puedeEditar && !trabajando && !bloqueado;
  return (
    <div className="w-full @xl:w-44 shrink-0 space-y-2">
      <label
        className={`relative flex h-40 w-full @xl:w-44 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-3 text-center transition-colors ${
          habilitado
            ? 'cursor-pointer border-slate-300 text-slate-500 hover:bg-slate-50 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/40'
            : 'cursor-not-allowed border-slate-200 text-slate-400'
        }`}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={!habilitado}
          onChange={alElegir}
          aria-describedby={ayudaId}
        />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt="Logo de la empresa"
            className="max-h-full max-w-full object-contain"
            onLoad={(e) => setAvisoPdf(avisoLogoParaPdf({ ancho: e.currentTarget.naturalWidth, alto: e.currentTarget.naturalHeight }))}
            onError={() => setAvisoPdf(null)}
          />
        ) : (
          <>
            <Building2 size={32} className="mb-2 opacity-50" aria-hidden="true" />
            <span className="text-xs font-bold">{puedeEditar ? 'Subir logo' : 'Sin logo'}</span>
          </>
        )}
        {trabajando && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70" role="status">
            <RefreshCw size={20} className="animate-spin text-indigo-600" aria-hidden="true" />
            <span className="sr-only">Guardando el logo…</span>
          </span>
        )}
        {logo && habilitado && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
            <ImageUp size={12} aria-hidden="true" /> Cambiar
          </span>
        )}
      </label>
      <p id={ayudaId} className="text-xs text-slate-500">PNG, JPG o WebP de hasta 300 KB, mejor con fondo transparente.</p>
      {logo && avisoPdf && (
        <p role="status" className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {avisoPdf}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-semibold text-red-600">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {puedeEditar && perfil?.logo_url && (
        <button
          type="button"
          onClick={quitar}
          disabled={!habilitado}
          className={`${BTN_QUITAR}${DESHABILITADO}`}
        >
          <Trash2 size={14} aria-hidden="true" /> Quitar logo
        </button>
      )}
    </div>
  );
}

/** «Historial de cambios»: los últimos renglones EMPRESA de la Actividad, con la fecha y el año en hora de Colombia. */
function Historial({ filas, error }: { filas: FilaHistorial[] | null; error: string | null }) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-6" aria-labelledby="historial-empresa">
      <h3 id="historial-empresa" className="flex items-center gap-2 text-base font-black text-slate-800">
        <History size={16} className="text-slate-400" aria-hidden="true" /> Historial de cambios
      </h3>
      {error ? (
        <ErrorDelServidor mensaje={error} />
      ) : filas === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay cambios.</p>
      ) : (
        <ol className="space-y-3">
          {filas.map((f) => (
            <li key={f.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
              <p className="text-xs text-slate-500">
                {fechaHoraLarga(f.created_at)} · <span className="font-semibold text-slate-700">{f.user_name || 'Sistema'}</span>
              </p>
              <p className="mt-0.5 font-semibold text-slate-800 break-words">{f.descripcion}</p>
              {cambiosDelHistorial(f).map((c, i) => (
                <p key={`${c.etiqueta}-${i}`} className="mt-1 whitespace-pre-line break-words text-slate-600">
                  <span className="font-semibold text-slate-700">{c.etiqueta}:</span> {c.antes} → {c.despues}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const CAMPOS_FORM = GRUPOS_CAMPOS_EMPRESA.identidad;

/** La pestaña «Información de la empresa». `activo`: la pestaña está a la vista (recarga el historial). */
export function FormEmpresa({ activo = true }: { activo?: boolean }) {
  const f = useFormularioEmpresa(CAMPOS_FORM, 'Datos de la empresa guardados');
  const [historial, setHistorial] = useState<FilaHistorial[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [logoTrabajando, setLogoTrabajando] = useState(false);
  // r1: cada pedido del historial lleva su número; solo la respuesta del último se pinta (una vieja que llega tarde
  // no pisa la nueva).
  const ultimoHistorial = useRef(0);

  const cargarHistorial = useCallback(() => {
    const numero = ++ultimoHistorial.current;
    return apiFetch('/empresa/historial').then(
      (r) => {
        if (numero !== ultimoHistorial.current) return;
        setHistorial(Array.isArray(r?.data) ? r.data : []);
        setErrorHistorial(null);
      },
      (err) => {
        if (numero === ultimoHistorial.current) setErrorHistorial(textoDeError(err, 'No se pudo cargar el historial'));
      },
    );
  }, []);

  // Solo un ADMIN ve el historial (GET /empresa/historial es de ADMIN). Al volver a la pestaña se recarga: «Diseño de
  // documentos» también deja renglones.
  useEffect(() => {
    if (activo && f.puedeEditar) cargarHistorial();
  }, [activo, f.puedeEditar, cargarHistorial]);

  async function alGuardar(e: FormEvent) {
    e.preventDefault();
    if (logoTrabajando) return; // r1: no se cruza con la respuesta del logo
    if (await f.guardar()) cargarHistorial();
  }

  function alCambiarPerfil(p: PerfilEmpresa) {
    f.setPerfil(p);
    cargarHistorial();
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-black text-slate-800 border-b border-slate-100 pb-4">Información de la empresa</h2>
      <p className="-mt-4 text-sm text-slate-500">
        Tus clientes ven estos datos en la solicitud, la cotización, el pedido y los correos.
      </p>

      {f.carga.estado !== 'listo' ? (
        <EstadoDeCarga carga={f.carga} onReintentar={f.cargar} />
      ) : (
        <form onSubmit={alGuardar} noValidate className="space-y-6">
          {!f.puedeEditar && <AvisoSoloLectura />}
          {/* r1: los cortes son del contenedor (@container del área de contenido), no de la ventana. */}
          <div className="flex flex-col gap-6 @xl:flex-row @xl:gap-8">
            <Logo
              perfil={f.perfil}
              puedeEditar={f.puedeEditar}
              bloqueado={f.guardando}
              trabajando={logoTrabajando}
              setTrabajando={setLogoTrabajando}
              onPerfil={alCambiarPerfil}
            />
            <fieldset disabled={!f.puedeEditar || f.guardando} className="min-w-0 flex-1 grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <legend className="sr-only">Datos de la empresa</legend>
              {CAMPOS_FORM.map((campo) => {
                const d = DETALLES[campo];
                return (
                  <div key={campo} className={d?.ancho ? '@xl:col-span-2' : ''}>
                    <Campo etiqueta={CAMPOS_EMPRESA[campo].etiqueta} ayuda={d?.ayuda} error={f.errores[campo]}>
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          value={f.valores[campo]}
                          onChange={(e) => f.cambiar(campo, e.target.value)}
                          onBlur={() => f.validar(campo)}
                          placeholder={d?.placeholder}
                          inputMode={d?.inputMode}
                          autoComplete={d?.autoComplete}
                          maxLength={CAMPOS_EMPRESA[campo].maximo}
                          className={ESTILO_CAMPO}
                        />
                      )}
                    </Campo>
                  </div>
                );
              })}
            </fieldset>
          </div>

          <ErrorDelServidor mensaje={f.errorServidor} />

          {f.puedeEditar && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!f.hayCambios || f.guardando || logoTrabajando} className={`${BTN.primary}${DESHABILITADO}`}>
                {f.guardando ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                {f.guardando ? 'Guardando…' : 'Guardar'}
              </button>
              {!f.hayCambios && <span className="text-xs text-slate-400">Sin cambios por guardar.</span>}
            </div>
          )}
        </form>
      )}

      {f.carga.estado === 'listo' && f.puedeEditar && <Historial filas={historial} error={errorHistorial} />}
    </div>
  );
}
