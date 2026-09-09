/**
 * Unit tests for categoryTree.ts — normalizeCategories()
 *
 * Test cases (all 8 required by WEB-1 spec):
 *   1. Two-level hierarchy (nested sub_categorias objects)
 *   2. Three or more levels (deeply nested children)
 *   3. Legacy string sub_categorias
 *   4. Flat parent_id relations
 *   5. Inactive categories filtered out
 *   6. Orphan node (parent_id not found → placed at root)
 *   7. Cycle between categories (cycle guard)
 *   8. Tildes, spaces, and duplicate names under different parents
 */

import { describe, it, expect } from 'vitest';
import { normalizeCategories, slugify } from '../categoryTree';
import type { RawCategoria } from '../../types/store';

// ─── Helper ───────────────────────────────────────────────────────────────────

function findById(nodes: ReturnType<typeof normalizeCategories>, id: string): ReturnType<typeof normalizeCategories>[0] | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findById(n.children, id);
    if (found) return found;
  }
  return undefined;
}

// ─── Test 1: Two-level hierarchy ──────────────────────────────────────────────

describe('normalizeCategories', () => {

  it('test 1 — two-level nested hierarchy (objects)', () => {
    const raw: RawCategoria[] = [
      {
        id: '1',
        nombre: 'Ropa',
        slug: 'ropa',
        sub_categorias: [
          { id: '1-1', nombre: 'Niño',  slug: 'nino',  orden: 0 },
          { id: '1-2', nombre: 'Niña',  slug: 'nina',  orden: 1 },
        ],
      },
    ];

    const result = normalizeCategories(raw);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('ropa');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].slug).toBe('nino');
    expect(result[0].children[1].slug).toBe('nina');
    // Children should have no further children
    expect(result[0].children[0].children).toHaveLength(0);
  });

  // ─── Test 2: Three or more levels ──────────────────────────────────────────

  it('test 2 — three or more levels (deeply nested children)', () => {
    const raw: RawCategoria[] = [
      {
        id: 'a',
        nombre: 'Nivel 1',
        slug: 'nivel-1',
        children: [
          {
            id: 'b',
            nombre: 'Nivel 2',
            slug: 'nivel-2',
            children: [
              {
                id: 'c',
                nombre: 'Nivel 3',
                slug: 'nivel-3',
                children: [
                  { id: 'd', nombre: 'Nivel 4', slug: 'nivel-4' },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = normalizeCategories(raw);
    expect(result[0].label).toBe('Nivel 1');
    const l2 = result[0].children[0];
    expect(l2.label).toBe('Nivel 2');
    const l3 = l2.children[0];
    expect(l3.label).toBe('Nivel 3');
    const l4 = l3.children[0];
    expect(l4.label).toBe('Nivel 4');
    expect(l4.children).toHaveLength(0);
  });

  // ─── Test 3: Legacy string sub_categorias ───────────────────────────────────

  it('test 3 — legacy string[] sub_categorias', () => {
    const raw: RawCategoria[] = [
      {
        nombre: 'Calzado',
        sub_categorias: ['Niño', 'Niña', 'Hombre', 'Mujer'],
      },
    ];

    const result = normalizeCategories(raw);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(4);
    const labels = result[0].children.map((c) => c.label);
    expect(labels).toEqual(['Niño', 'Niña', 'Hombre', 'Mujer']);
    // Slug for "Niño" should strip tilde
    expect(result[0].children[0].slug).toBe('nino');
    // Slug for "Niña" should strip tilde
    expect(result[0].children[1].slug).toBe('nina');
  });

  // ─── Test 4: Flat parent_id relations ──────────────────────────────────────

  it('test 4 — flat list with parent_id relations', () => {
    const raw: RawCategoria[] = [
      { id: 'root', nombre: 'Ropa', parent_id: null },
      { id: 'sub1', nombre: 'Niño', parent_id: 'root' },
      { id: 'sub2', nombre: 'Niña', parent_id: 'root' },
      { id: 'sub1a', nombre: 'Camisetas', parent_id: 'sub1' },
    ];

    const result = normalizeCategories(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('root');
    expect(result[0].children).toHaveLength(2);
    // sub1 (Niño) should have a child Camisetas
    const nino = result[0].children.find((c) => c.id === 'sub1');
    expect(nino).toBeDefined();
    expect(nino!.children).toHaveLength(1);
    expect(nino!.children[0].label).toBe('Camisetas');
  });

  // ─── Test 5: Inactive categories filtered ──────────────────────────────────

  it('test 5 — inactive categories are filtered out (along with their subtrees)', () => {
    const raw: RawCategoria[] = [
      {
        id: 'act',
        nombre: 'Activa',
        activa: true,
        sub_categorias: [
          { id: 'sub-act', nombre: 'SubActiva', activa: true },
          { id: 'sub-inact', nombre: 'SubInactiva', activa: false },
        ],
      },
      {
        id: 'inact',
        nombre: 'Inactiva',
        activa: false,
        sub_categorias: [
          { id: 'orphan-child', nombre: 'HijoDeInactiva' },
        ],
      },
    ];

    const result = normalizeCategories(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Activa');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].label).toBe('SubActiva');
  });

  // ─── Test 6: Orphan node ────────────────────────────────────────────────────

  it('test 6 — orphan node (missing parent_id) is placed at root level', () => {
    const raw: RawCategoria[] = [
      { id: 'r1', nombre: 'Raiz', parent_id: null },
      { id: 'orphan', nombre: 'Huérfano', parent_id: 'id-inexistente' },
    ];

    const result = normalizeCategories(raw);
    // Both should appear at root because the parent is unknown
    expect(result).toHaveLength(2);
    const labels = result.map((n) => n.label);
    expect(labels).toContain('Raiz');
    expect(labels).toContain('Huérfano');
  });

  // ─── Test 7: Cycle detection ────────────────────────────────────────────────

  it('test 7 — cycle between subcategories is broken (no infinite loop)', () => {
    // Cycle via children: A -> B -> A
    const raw: RawCategoria[] = [
      {
        id: 'A',
        nombre: 'Cat A',
        slug: 'cat-a',
        children: [
          {
            id: 'B',
            nombre: 'Cat B',
            slug: 'cat-b',
            children: [
              // Points back to A (cycle)
              { id: 'A', nombre: 'Cat A (cycle)', slug: 'cat-a' },
            ],
          },
        ],
      },
    ];

    // Should complete without hanging or throwing
    const result = normalizeCategories(raw);
    expect(result).toHaveLength(1);
    const b = result[0].children[0];
    expect(b.label).toBe('Cat B');
    // The cyclic reference back to A should be removed
    expect(b.children).toHaveLength(0);
  });

  // ─── Test 8: Tildes, spaces, and duplicate names under different parents ─────

  it('test 8 — tildes, spaces, and duplicate names produce unique IDs', () => {
    const raw: RawCategoria[] = [
      {
        id: '1',
        nombre: 'Bienestar y Salud',
        // No slug → should be generated
        sub_categorias: [
          { nombre: 'Niño' },
        ],
      },
      {
        id: '2',
        nombre: 'Ropa',
        sub_categorias: [
          // Same label "Niño" under a different parent
          { nombre: 'Niño' },
        ],
      },
    ];

    const result = normalizeCategories(raw);
    expect(result).toHaveLength(2);

    const bienestar = result.find((n) => n.id === '1')!;
    const ropa      = result.find((n) => n.id === '2')!;

    // Slugs for "Bienestar y Salud"
    expect(bienestar.slug).toBe('bienestar-y-salud');

    // Children named "Niño" under different parents must have distinct IDs
    const ninoUnderBienestar = bienestar.children[0];
    const ninoUnderRopa      = ropa.children[0];

    expect(ninoUnderBienestar.slug).toBe('nino');
    expect(ninoUnderRopa.slug).toBe('nino');
    // IDs differ because parent differs
    expect(ninoUnderBienestar.id).not.toBe(ninoUnderRopa.id);
  });

});

// ─── slugify helper tests ─────────────────────────────────────────────────────

describe('slugify', () => {
  it('strips diacritics', () => {
    expect(slugify('Niño')).toBe('nino');
    expect(slugify('Niña')).toBe('nina');
    expect(slugify('Bebé')).toBe('bebe');
    expect(slugify('Bienestar y Salud')).toBe('bienestar-y-salud');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('A  B')).toBe('a-b');
  });

  it('removes special characters', () => {
    // & and ! are stripped; space becomes -; result collapses to single dash
    expect(slugify('Ropa & Calzado!')).toBe('ropa-calzado');
  });
});
