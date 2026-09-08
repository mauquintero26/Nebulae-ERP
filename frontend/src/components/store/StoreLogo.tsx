"use client";

import Link from 'next/link';
import Image from 'next/image';

type Props = {
  /** URL of the logo — falls back to public/logo.png */
  logoUrl?: string | null;
  href?: string;
  className?: string;
};

/**
 * StoreLogo — Logo dinámico del storefront.
 *
 * Prioridad de fuente:
 * 1. logoUrl prop (viene de web_builder_config.logo_url)
 * 2. /logo.png (archivo en public/ — reemplazable sin redeploy)
 * 3. Fallback tipográfico "NEBULAE Kids"
 *
 * Para reemplazar el logo:
 * - Desde el admin: Dashboard > Sitio Web > Configuración > Logo
 * - O subir un nuevo archivo en public/logo.png
 */
export function StoreLogo({ logoUrl, href = '/store', className = '' }: Props) {
  const src = logoUrl ?? '/logo.png';

  return (
    <Link
      href={href}
      className={`focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none rounded-lg inline-block ${className}`}
      aria-label="Nebulae Kids — Ir al inicio de la tienda"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Nebulae Kids"
        className="h-12 w-auto object-contain"
        onError={(e) => {
          // If logo.png fails, show text fallback
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      {/* Text fallback — hidden by default */}
      <span
        className="hidden items-center font-black tracking-tight text-xl text-[#ED87B6] select-none"
        aria-hidden="true"
      >
        NEBULAE<span className="text-[#B5E1F6]"> Kids</span>
      </span>
    </Link>
  );
}
