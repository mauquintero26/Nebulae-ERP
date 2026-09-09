/**
 * CategoryTree — Normalizador recursivo de categorías para el menú
 *
 * Convierte cualquier forma de respuesta de la API en un árbol de NavNode
 * de profundidad arbitraria, con las siguientes garantías:
 *
 *   ✓ Jerarquía de 2 niveles (formato legacy sub_categorias: string[])
 *   ✓ Jerarquía de 3+ niveles (sub_categorias o children como objetos anidados)
 *   ✓ Lista plana relacionada por parent_id → árbol
 *   ✓ Slugs estables del backend (preferred) con fallback generado
 *   ✓ Categorías inactivas filtradas (activa === false)
 *   ✓ Nodos huérfanos → se adjuntan como hijos de un nodo raíz sintético
 *   ✓ Ciclos detectados y cortados
 *   ✓ Nombres duplicados con distintos padres → IDs únicos
 *   ✓ Tildes y caracteres especiales en slugs fallback
 */

import type { RawCategoria, RawSubCategoria, NavNode } from '@/types/store';

// ─── Slug helpers ─────────────────────────────────────────────────────────────

/**
 * Generates a URL-safe slug from arbitrary text.
 * Used ONLY as fallback when the backend does not provide a slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics (tildes, etc.)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');              // collapse multiple dashes
}

function buildHref(slugOrName: string): string {
  // Always encode for URL safety; slugs from backend are already ASCII-safe
  return `/store/categoria/${encodeURIComponent(slugOrName)}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Stable ID: prefer backend id, fall back to composed string */
function makeId(raw: { id?: string | number | null; slug?: string | null; nombre: string }, parentId: string): string {
  if (raw.id != null) return String(raw.id);
  const slug = raw.slug ?? slugify(raw.nombre);
  return parentId ? `${parentId}__${slug}` : slug;
}

/**
 * Determines whether an item is considered active (visible).
 * Items without an explicit `activa` field are treated as active.
 */
function isActive(item: { activa?: boolean | null }): boolean {
  return item.activa !== false;
}

// ─── Core recursive normalizer ────────────────────────────────────────────────

/**
 * Recursively converts a RawSubCategoria (or any compatible object)
 * into a NavNode tree of arbitrary depth.
 *
 * @param raw       The raw sub-category object or legacy string
 * @param parentId  Stable ID of the parent node (for ID composition)
 * @param idx       Index within the parent's children list (for order fallback)
 * @param visited   Set of IDs already visited in the current DFS path (cycle guard)
 */
function normalizeNode(
  raw: string | RawSubCategoria,
  parentId: string,
  idx: number,
  visited: Set<string>,
): NavNode | null {
  // ── Legacy string leaf ──
  if (typeof raw === 'string') {
    const slug = slugify(raw);
    const id   = `${parentId}__${slug}`;
    if (visited.has(id)) return null;  // cycle guard
    return {
      id,
      label:    raw,
      slug,
      href:     buildHref(raw),   // use original for API compat
      children: [],
      orden:    idx,
    };
  }

  // ── Inactive node → skip (and its subtree) ──
  if (!isActive(raw)) return null;

  const slug = raw.slug ?? slugify(raw.nombre);
  const id   = makeId(raw, parentId);

  // ── Cycle detection ──
  if (visited.has(id)) return null;
  visited.add(id);

  // ── Collect children from both `children` and `sub_categorias` fields ──
  const childrenSrc: (string | RawSubCategoria)[] = [
    ...((raw.children ?? []) as RawSubCategoria[]),
    ...((raw.sub_categorias ?? []) as (string | RawSubCategoria)[]),
  ];

  const children = childrenSrc
    .map((child, i) => normalizeNode(child, id, i, new Set(visited)))
    .filter((n): n is NavNode => n !== null)
    .sort((a, b) => a.orden - b.orden);

  visited.delete(id); // allow same node under a different parent

  return {
    id,
    label:    raw.nombre,
    slug,
    href:     buildHref(raw.slug ?? raw.nombre),
    children,
    orden:    raw.orden ?? idx,
  };
}

// ─── Flat list → tree (parent_id assembly) ───────────────────────────────────

/**
 * Assembles a flat list of RawCategoria objects (related by parent_id)
 * into a tree structure.
 *
 * Items without parent_id (or with a parent_id that does not match any id)
 * are treated as root nodes. Orphans are detected and placed at root level.
 */
function assembleFlatTree(raw: RawCategoria[]): NavNode[] {
  const nodeMap = new Map<string, NavNode>();
  const childrenOf = new Map<string, NavNode[]>();
  const order      = new Map<string, number>();

  // First pass: create all NavNodes (without children)
  raw.forEach((item, idx) => {
    if (!isActive(item)) return;
    const slug = item.slug ?? slugify(item.nombre);
    const id   = makeId(item, '');
    const node: NavNode = {
      id,
      label:    item.nombre,
      slug,
      href:     buildHref(item.slug ?? item.nombre),
      children: [],
      orden:    item.orden ?? idx,
    };
    nodeMap.set(id, node);
    order.set(id, item.orden ?? idx);
  });

  // Second pass: wire children by parent_id
  const roots: NavNode[] = [];
  raw.forEach((item) => {
    if (!isActive(item)) return;
    const id     = makeId(item, '');
    const node   = nodeMap.get(id);
    if (!node) return;

    const parentIdStr = item.parent_id != null ? String(item.parent_id) : null;
    if (parentIdStr && nodeMap.has(parentIdStr)) {
      const parentNode = nodeMap.get(parentIdStr)!;
      if (!childrenOf.has(parentIdStr)) childrenOf.set(parentIdStr, []);
      childrenOf.get(parentIdStr)!.push(node);
    } else {
      // Root node or orphan (no matching parent found → attach at root)
      roots.push(node);
    }
  });

  // Third pass: attach collected children
  childrenOf.forEach((kids, parentId) => {
    const parentNode = nodeMap.get(parentId);
    if (parentNode) {
      parentNode.children = kids.sort((a, b) => a.orden - b.orden);
    }
  });

  return roots.sort((a, b) => a.orden - b.orden);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalizes any API response to a NavNode[] tree of arbitrary depth.
 *
 * Handles:
 *   - Nested (children / sub_categorias) hierarchies → recursive normalizer
 *   - Flat parent_id-related lists → assembleFlatTree
 *   - Mixed: nested items within a flat list
 *   - Inactive, orphaned, and cyclically-referenced nodes
 *   - Legacy string-only sub_categorias
 *
 * @param raw Array of raw category objects from the API
 */
export function normalizeCategories(raw: RawCategoria[]): NavNode[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // Detect flat (parent_id) format: any item has a non-null parent_id
  const hasFlatRelations = raw.some((c) => c.parent_id != null);

  if (hasFlatRelations) {
    return assembleFlatTree(raw);
  }

  // Nested format (hierarchical API response)
  return raw
    .filter(isActive)
    .filter((c) => c.visible_en_menu !== false)
    .map((cat, idx): NavNode | null => {
      if (!isActive(cat)) return null;

      const slug = cat.slug ?? slugify(cat.nombre);
      const id   = makeId(cat, '');
      const visited = new Set<string>([id]);

      // Collect children from both `children` and `sub_categorias`
      const childrenSrc: (string | RawSubCategoria)[] = [
        ...((cat.children ?? []) as RawSubCategoria[]),
        ...((cat.sub_categorias ?? []) as (string | RawSubCategoria)[]),
      ];

      const children = childrenSrc
        .map((child, i) => normalizeNode(child, id, i, new Set(visited)))
        .filter((n): n is NavNode => n !== null)
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
    .filter((n): n is NavNode => n !== null)
    .sort((a, b) => a.orden - b.orden);
}
