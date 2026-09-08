"use client";

import { Package } from 'lucide-react';

// ─── Product Card Skeleton ────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse" aria-hidden="true">
      <div className="w-full aspect-[4/5] bg-[#F9ECF4] rounded-2xl" />
      <div className="h-4 bg-[#F9ECF4] rounded-lg w-3/4" />
      <div className="h-4 bg-[#F9ECF4] rounded-lg w-1/2" />
    </div>
  );
}

// ─── Product Grid Skeleton ────────────────────────────────────────────────────

export function ProductGridSkeleton({ count = 8, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-4 lg:gap-6`} aria-busy="true" aria-label="Cargando productos">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Page Section Skeleton ────────────────────────────────────────────────────

export function SectionTitleSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6 animate-pulse">
      <div className="h-7 bg-[#F9ECF4] rounded-lg w-48" aria-hidden="true" />
      <div className="h-5 bg-[#F9ECF4] rounded-lg w-20" aria-hidden="true" />
    </div>
  );
}

// ─── Generic Skeleton Block ───────────────────────────────────────────────────

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-[#F9ECF4] animate-pulse rounded-2xl ${className}`}
      aria-hidden="true"
    />
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-20 px-4"
      role="status"
    >
      <div className="text-[#F6BAD6] mb-4">
        {icon ?? <Package size={56} aria-hidden="true" />}
      </div>
      <h3 className="text-lg font-bold text-[#4A4A4A] mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[#8A8A8E] max-w-xs mb-6">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

type ErrorStateProps = {
  title?: string;
  description?: string;
  retry?: () => void;
};

export function ErrorState({
  title = 'No pudimos cargar el contenido',
  description = 'Verifica tu conexión o inténtalo de nuevo.',
  retry,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-20 px-4"
      role="alert"
    >
      <div className="w-16 h-16 bg-[#FFEEF4] rounded-full flex items-center justify-center mb-4">
        <span className="text-2xl" aria-hidden="true">⚠️</span>
      </div>
      <h3 className="text-lg font-bold text-[#1C1C1E] mb-2">{title}</h3>
      <p className="text-sm text-[#8A8A8E] max-w-xs mb-6">{description}</p>
      {retry && (
        <button
          onClick={retry}
          className="px-6 py-2.5 bg-[#ED87B6] hover:bg-[#E06FA3] text-white font-bold rounded-full text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
