'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { API_URL } from '@/lib/api';
import {
  claveIdempotencia, pedirPublico, respuestaDeAccion, tituloDeLaPagina, vistaConDocumento, vistaDeRespuesta,
  type VistaPublica,
} from '@/lib/confirmacion-publica';
import { AvisoEnlace, CargandoDocumento } from '@/components/documento';
import { PanelPedirCambios, type TipoCambios } from './panel-cambios';
import { VistaCotizacion } from './vista-cotizacion';
import { VistaSolicitud } from './vista-solicitud';

/**
 * La página que abre el cliente con su enlace de confirmación (B3 T15: U17+H28 punto 9, U22+H38 punto 7, H28-cambios
 * punto 6; C3, C9, C10, C26). Solo despacha:
 * - UNA llamada al cargar (POST /confirmar/ver, C26): la marca de la empresa viene en la respuesta, también en el 400;
 * - 'pendiente' con su documento: la solicitud (VistaSolicitud, 'degradado') o la cotización (VistaCotizacion,
 *   'acento'), con 'Confirmar' y 'Pedir cambios' (PanelPedirCambios, que reemplaza a los botones);
 * - todo lo demás (los estados del enlace, el 200 de confirmar o de pedir cambios, sin conexión, un error): AvisoEnlace.
 * Las respuestas se leen con vistaDeRespuesta y respuestaDeAccion (lib/confirmacion-publica.js): el 422 y los errores
 * de una acción se muestran en la misma pantalla sin borrar lo escrito; un 400 muestra el estado que manda el servidor
 * (doble clic u otra pestaña: 'ya fue confirmada'). La pestaña sale de tituloDeLaPagina.
 * T15 r1: cuando una acción del cliente cambia la pantalla (confirmar, pedir cambios, 'Reintentar'), el foco va al h1
 * del aviso o, si vuelve la hoja, a la página; al cerrar el panel con 'Volver', a 'Pedir cambios'.
 */
export default function ConfirmarPublicoPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [vista, setVista] = useState<VistaPublica | null>(null);
  // Cada 'Reintentar' vuelve a pedir /confirmar/ver.
  const [intento, setIntento] = useState(0);
  const [enviando, setEnviando] = useState<'confirmar' | 'cambios' | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [errorCambios, setErrorCambios] = useState<string | null>(null);
  // T15 r1 (accesibilidad): la pantalla cambió por una acción del cliente, así que la vista nueva toma el foco.
  const [enfocar, setEnfocar] = useState(false);
  const [enfocarPedirCambios, setEnfocarPedirCambios] = useState(false);
  const principal = useRef<HTMLElement>(null);
  const hojaPendiente = vista !== null && vista.estado_enlace === 'pendiente' && vistaConDocumento(vista)
    && (vista.tipo === 'SC' || vista.tipo === 'COT');

  useEffect(() => {
    // Round 7: el token va en el body JSON, nunca en la URL de la API (la URL de
    // ESTA pagina si lo lleva -- params.token, inevitable, igual que
    // /reset-password?token= -- lo que cambia es solo como esta pagina habla con
    // el backend, para que un access log de uvicorn nunca vea el token crudo).
    // pedirPublico no manda la sesion del personal ni Referer, nunca lleva a /login y nunca lanza.
    let vigente = true;
    pedirPublico(API_URL, '/confirmar/ver', { token }).then((r) => {
      if (vigente) setVista(vistaDeRespuesta(r));
    });
    return () => {
      vigente = false;
    };
  }, [token, intento]);

  // La pestaña dice el documento y la empresa en cualquier estado ('Solicitud SC-… · Empresa').
  useEffect(() => {
    if (vista) document.title = tituloDeLaPagina(vista, 'Documento');
  }, [vista]);

  // Tras 'Reintentar' la hoja vuelve sin h1 propio que enfocar: el foco va a la página (el aviso enfoca su h1).
  useEffect(() => {
    if (enfocar && hojaPendiente) principal.current?.focus();
  }, [enfocar, hojaPendiente, vista]);

  function reintentar() {
    setVista(null);
    setErrorAccion(null);
    setErrorCambios(null);
    setPanelAbierto(false);
    setEnfocar(true);
    setIntento((n) => n + 1);
  }

  // Una Idempotency-Key nueva por intento, sin el token. Si el POST no llega (sin red o un error), la hoja y lo escrito
  // se quedan con el mensaje; un 400 trae el estado del enlace (otra pestaña ya confirmó: 'ya fue confirmada').
  // T15 r1: try/finally, así los botones nunca quedan en «Confirmando…» (pedirPublico ya corta a los 30 s).
  async function confirmar() {
    if (enviando) return;
    setEnviando('confirmar');
    setErrorAccion(null);
    try {
      const r = await pedirPublico(API_URL, '/confirmar/confirmar', { token },
        { 'Idempotency-Key': claveIdempotencia('confirmar') });
      const resultado = respuestaDeAccion(r, 'confirmar', vista);
      if (resultado.vista) {
        setVista(resultado.vista);
        setEnfocar(true);
      } else {
        setErrorAccion(resultado.error);
      }
    } finally {
      setEnviando(null);
    }
  }

  async function pedirCambios(tipo: TipoCambios, comentario: string) {
    if (enviando) return;
    setEnviando('cambios');
    setErrorCambios(null);
    try {
      const r = await pedirPublico(API_URL, '/confirmar/pedir-cambios', { token, tipo, comentario },
        { 'Idempotency-Key': claveIdempotencia('cambios') });
      const resultado = respuestaDeAccion(r, 'cambios', vista);
      if (resultado.vista) {
        setVista(resultado.vista);
        setPanelAbierto(false);
        setEnfocar(true);
      } else {
        setErrorCambios(resultado.error);
      }
    } finally {
      setEnviando(null);
    }
  }

  function abrirPanel() {
    setErrorAccion(null);
    setErrorCambios(null);
    setEnfocarPedirCambios(false);
    setPanelAbierto(true);
  }

  function cerrarPanel() {
    setErrorCambios(null);
    setPanelAbierto(false);
    setEnfocarPedirCambios(true);
  }

  let contenido;
  if (!vista) {
    contenido = <CargandoDocumento />;
  } else if (hojaPendiente) {
    // Hallazgo #4 (adversarial review): el cliente ve lo que confirma (productos y, en la COT, precios y totales); los
    // números vienen del servidor y DocumentoComercial no recalcula nada.
    const panel = panelAbierto ? (
      <PanelPedirCambios
        tipo={vista.tipo === 'COT' ? 'COT' : 'SC'}
        asesor={vista.documento?.atendido_por}
        marca={vista.empresa}
        onEnviar={pedirCambios}
        enviando={enviando === 'cambios'}
        error={errorCambios}
        onVolver={cerrarPanel}
      />
    ) : null;
    const props = {
      vista, apiUrl: API_URL, onConfirmar: confirmar, confirmando: enviando === 'confirmar', onPedirCambios: abrirPanel,
      errorAccion, panel, enfocarPedirCambios,
    };
    contenido = vista.tipo === 'SC' ? <VistaSolicitud {...props} /> : <VistaCotizacion {...props} />;
  } else {
    // Revisión final B3 (F2, M17): AvisoEnlace vive en components/documento; la hoja confirmada (en solo lectura, bajo
    // el aviso verde) se la pasa esta página.
    contenido = <AvisoEnlace vista={vista} apiUrl={API_URL} onReintentar={reintentar} enfocar={enfocar}
      hojaConfirmada={(aviso) => (vista.tipo === 'SC'
          ? <VistaSolicitud vista={vista} apiUrl={API_URL} soloLectura aviso={aviso} />
          : <VistaCotizacion vista={vista} apiUrl={API_URL} soloLectura aviso={aviso} />)} />;
  }

  return (
    <main
      ref={principal}
      tabIndex={-1}
      className="min-h-screen bg-gray-100 px-4 py-6 text-gray-900 outline-none print:bg-white print:p-0"
    >
      {contenido}
    </main>
  );
}
