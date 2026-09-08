"use client";

/**
 * CategoryTree — Normalizador recursivo de categorías para el menú
 *
 * Convierte la respuesta actual de la API (nombre + sub_categorias string[])
 * en un árbol de NavNode compatible con estructuras más profundas futuras.
 *
 * Si la API entrega parent_id en el futuro, el normalizador lo usará
 * automáticamente sin romper el esquema actual.
 */

import type { RawCategoria, RawSubCategoria, NavNode } from '@/types/store';

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildHref(slug: string): string {
  return `/store/categoria/${encodeURIComponent(slug)}`;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeSubcategoria(
  sub: string | RawSubCategoria,
  parentSlug: string,
  idx: number
): NavNode {
  if (typeof sub === 'string') {
    const slug = slugify(sub);
    return {
      id:       `${parentSlug}__${slug}`,
      label:    sub,
      slug,
      href:     buildHref(sub), // use original for API compat
      children: [],
      orden:    idx,
    };
  }
  const slug = sub.slug ?? slugify(sub.nombre);
  return {
    id:       String(sub.id ?? `${parentSlug}__${slug}`),
    label:    sub.nombre,
    slug,
    href:     buildHref(sub.slug ?? sub.nombre),
    children: [],
    orden:    sub.orden ?? idx,
  };
}

export function normalizeCategories(raw: RawCategoria[]): NavNode[] {
  return raw
    .filter((c) => c.activa !== false && c.visible_en_menu !== false)
    .map((cat, idx): NavNode => {
      const slug = cat.slug ?? slugify(cat.nombre);
      const id   = String(cat.id ?? slug);

      const children = (cat.sub_categorias ?? [])
        .map((sub, i) => normalizeSubcategoria(sub as string | RawSubCategoria, slug, i))
        .sort((a, b) => a.orden - b.orden);

      return {
        id,
        label:    cat.nombre,
        slug,
        href:     buildHref(cat.slug ?? cat.nombre),
        children,
        orden:    cat.orden ?? idx,
      };
    })
    .sort((a, b) => a.orden - b.orden);
}
