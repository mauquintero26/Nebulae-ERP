"use client";

/**
 * StoreFooter — Footer compartido de la tienda pública
 *
 * Extraído de store/page.tsx (donde estaba inline y duplicado).
 * Ahora se usa desde store/layout.tsx para todos los routes.
 */

import Link from 'next/link';
import { StoreLogo } from './StoreLogo';
import { Share2, MessageSquare, Phone } from 'lucide-react';

type Props = {
  logoUrl?: string | null;
  contactInfo?: {
    email?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
  };
};

export function StoreFooter({ logoUrl, contactInfo }: Props) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-[#F0E0EC] mt-20" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <StoreLogo logoUrl={logoUrl} className="mb-4" />
            <p className="text-sm text-[#8A8A8E] leading-relaxed max-w-xs">
              La energía que conecta el mundo. Ropa maternal y para bebé con diseño y calidad.
            </p>
            {/* Socials */}
            <div className="flex items-center gap-3 mt-5">
              {contactInfo?.whatsapp && (
                <a
                  href={`https://wa.me/${contactInfo.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contactar por WhatsApp"
                  className="w-9 h-9 rounded-full bg-[#FFF5FA] border border-[#F0E0EC] flex items-center justify-center text-[#ED87B6] hover:bg-[#ED87B6] hover:text-white transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                >
                  <MessageSquare size={16} />
                </a>
              )}
              <a
                href="#"
                aria-label="Redes sociales de Nebulae Kids"
                className="w-9 h-9 rounded-full bg-[#FFF5FA] border border-[#F0E0EC] flex items-center justify-center text-[#ED87B6] hover:bg-[#ED87B6] hover:text-white transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                <Share2 size={16} />
              </a>
              <a
                href="#"
                aria-label="Contacto Nebulae Kids"
                className="w-9 h-9 rounded-full bg-[#FFF5FA] border border-[#F0E0EC] flex items-center justify-center text-[#B5E1F6] hover:bg-[#B5E1F6] hover:text-white transition-all focus-visible:ring-2 focus-visible:ring-[#B5E1F6] focus-visible:outline-none"
              >
                <Phone size={16} />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <nav aria-label="Links del footer — Tienda">
            <h3 className="text-xs font-black text-[#1C1C1E] uppercase tracking-widest mb-4">Tienda</h3>
            <ul className="space-y-2.5">
              {[
                { href: '/store',           label: 'Inicio' },
                { href: '/store/catalogo',  label: 'Catálogo' },
                { href: '/store/blog',      label: 'Blog' },
                { href: '/store/contacto',  label: 'Contacto' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-[#4A4A4A] hover:text-[#ED87B6] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account */}
          <nav aria-label="Links del footer — Mi cuenta">
            <h3 className="text-xs font-black text-[#1C1C1E] uppercase tracking-widest mb-4">Mi Cuenta</h3>
            <ul className="space-y-2.5">
              {[
                { href: '/store/cuenta',    label: 'Iniciar Sesión' },
                { href: '/store/cuenta',    label: 'Registrarse' },
                { href: '/store/checkout',  label: 'Mi Carrito' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-[#4A4A4A] hover:text-[#ED87B6] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-black text-[#1C1C1E] uppercase tracking-widest mb-4">Contacto</h3>
            <ul className="space-y-2.5">
              {contactInfo?.email && (
                <li>
                  <a href={`mailto:${contactInfo.email}`} className="text-sm text-[#4A4A4A] hover:text-[#ED87B6] transition-colors break-all">
                    {contactInfo.email}
                  </a>
                </li>
              )}
              {contactInfo?.phone && (
                <li>
                  <a href={`tel:${contactInfo.phone}`} className="text-sm text-[#4A4A4A] hover:text-[#ED87B6] transition-colors">
                    {contactInfo.phone}
                  </a>
                </li>
              )}
              {contactInfo?.address && (
                <li className="text-sm text-[#8A8A8E]">{contactInfo.address}</li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-6 border-t border-[#F0E0EC] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#8A8A8E]">© {year} Nebulae Kids. Todos los derechos reservados.</p>
          <p className="text-xs text-[#8A8A8E]">
            Hecho con ❤️ en Colombia
          </p>
        </div>
      </div>
    </footer>
  );
}
