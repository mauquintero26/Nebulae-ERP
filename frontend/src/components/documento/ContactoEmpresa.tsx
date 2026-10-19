import { Globe, Mail, MessageCircle, Phone } from 'lucide-react';
import {
  colorTextoSobre, contactosEmpresa, mensajeWhatsAppDocumento, type ContactoEmpresa as Contacto,
} from '@/lib/documento-comercial';
import { normalizarMarca } from '@/lib/marca-empresa';

const ICONOS = { whatsapp: MessageCircle, telefono: Phone, correo: Mail, web: Globe } as const;
// El orden de los botones de U17: WhatsApp primero (el canal del cliente), luego llamar, correo y la página web.
const ORDEN: Contacto['tipo'][] = ['whatsapp', 'telefono', 'correo', 'web'];

/**
 * Cómo contactar a la empresa desde las páginas del cliente (Bloque 3, T12: U17+H28 punto 12, C3): 'Tu asesor:
 * {asesor}' y los botones WhatsApp (con el saludo 'Hola, te escribo por la solicitud {numero}.'), Llamar, Correo y
 * Página web. Los enlaces salen de contactosEmpresa (lib/documento-comercial.js: solo hrefs seguros); los que abren
 * otra pestaña llevan rel noopener noreferrer. Sin datos de la empresa ni asesor no muestra nada.
 * @param empresa la marca (perfil_publico o la respuesta pública)
 * @param tipo 'SC' | 'COT' | 'PVEN' (para el saludo de WhatsApp)
 */
export function ContactoEmpresa({ empresa, asesor, numero, tipo }: {
  empresa: unknown;
  asesor?: string | null;
  numero?: string | null;
  tipo?: 'SC' | 'COT' | 'PVEN';
}) {
  const m = normalizarMarca(empresa);
  const contactos = contactosEmpresa(m, mensajeWhatsAppDocumento(tipo ?? 'SC', numero));
  const ordenados = ORDEN.map((t) => contactos.find((c) => c.tipo === t)).filter((c): c is Contacto => Boolean(c));
  const nombreAsesor = typeof asesor === 'string' ? asesor.trim() : '';
  if (!nombreAsesor && ordenados.length === 0) return null;
  const acento = m.colores.acento;
  return (
    <section aria-label="Contacto" className="space-y-3 text-gray-800">
      {nombreAsesor && (
        <p className="break-words text-sm">
          Tu asesor: <strong className="font-semibold">{nombreAsesor}</strong>
        </p>
      )}
      {ordenados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ordenados.map((c) => {
            const Icono = ICONOS[c.tipo];
            const principal = c.tipo === 'whatsapp';
            const clase = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold '
              + (principal ? '' : 'border border-gray-300 bg-white hover:bg-gray-50');
            const estilo = principal ? { backgroundColor: acento, color: colorTextoSobre(acento) } : undefined;
            return c.externo ? (
              <a key={c.tipo} href={c.href} target="_blank" rel="noopener noreferrer" className={clase} style={estilo}>
                <Icono size={16} aria-hidden="true" />
                {c.etiqueta}
              </a>
            ) : (
              <a key={c.tipo} href={c.href} className={clase} style={estilo}>
                <Icono size={16} aria-hidden="true" />
                {c.etiqueta}
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
