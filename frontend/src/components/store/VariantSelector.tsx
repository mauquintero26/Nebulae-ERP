'use client';

/**
 * VariantSelector.tsx — WEB-2B.2
 *
 * Renders product variant attributes (talla, color, presentacion, etc.) as
 * selectable buttons. Updates displayed price, availability, and max orderable
 * whenever the user selects a variant.
 *
 * Rules:
 * - Variant with disponible=false → disabled, shows line-through
 * - Only one variant can be active at a time
 * - Calls onVariantChange with the selected ProductVariantReal (or null)
 * - Never exposes warehouse_id, cost, owner info
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { ProductVariantReal } from '@/lib/store-api/types';

/** Groups variants by a given attribute key */
function groupByAttribute(
  variants: ProductVariantReal[],
  attrKey: string,
): Map<string, ProductVariantReal[]> {
  const map = new Map<string, ProductVariantReal[]>();
  for (const v of variants) {
    const val = v.atributos[attrKey];
    if (val !== undefined) {
      if (!map.has(val)) map.set(val, []);
      map.get(val)!.push(v);
    }
  }
  return map;
}

/** Returns all unique attribute keys present across variants */
function getAttributeKeys(variants: ProductVariantReal[]): string[] {
  const keys = new Set<string>();
  for (const v of variants) {
    for (const k of Object.keys(v.atributos)) {
      keys.add(k);
    }
  }
  return Array.from(keys);
}

const ATTR_LABELS: Record<string, string> = {
  talla: 'Talla',
  color: 'Color',
  presentacion: 'Presentacion',
  material: 'Material',
  capacidad: 'Capacidad',
  sabor: 'Sabor',
};

// --- Props ---

export interface VariantSelectorProps {
  variants: ProductVariantReal[];
  selectedVariantId: number | null;
  onVariantChange: (variant: ProductVariantReal | null) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// --- Component ---

export function VariantSelector({
  variants,
  selectedVariantId,
  onVariantChange,
  loading = false,
  error = null,
  onRetry,
}: VariantSelectorProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (variants.length === 0) return;
    const firstAvailable = variants.find(v => v.disponible) ?? variants[0];
    if (!firstAvailable) return;
    const newSelections: Record<string, string> = {};
    for (const [k, v] of Object.entries(firstAvailable.atributos)) {
      newSelections[k] = v;
    }
    setSelections(newSelections);
    onVariantChange(firstAvailable);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  const attrKeys = getAttributeKeys(variants);

  const findMatchingVariant = useCallback(
    (newSelections: Record<string, string>): ProductVariantReal | null => {
      for (const v of variants) {
        const allMatch = attrKeys.every(key => {
          const selVal = newSelections[key];
          return selVal === undefined || v.atributos[key] === selVal;
        });
        if (allMatch) return v;
      }
      return null;
    },
    [variants, attrKeys],
  );

  const handleSelect = (attrKey: string, attrVal: string) => {
    const newSelections = { ...selections, [attrKey]: attrVal };
    setSelections(newSelections);
    const matched = findMatchingVariant(newSelections);
    onVariantChange(matched);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Cargando variantes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 py-2">
        <span>{error}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-[#ED87B6] hover:underline text-xs"
            aria-label="Reintentar cargar variantes"
          >
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (variants.length === 0 || attrKeys.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4" aria-label="Seleccion de variantes">
      {attrKeys.map(attrKey => {
        const grouped = groupByAttribute(variants, attrKey);
        const label = ATTR_LABELS[attrKey] ?? attrKey;
        const selectedVal = selections[attrKey];

        return (
          <div key={attrKey}>
            <p className="text-sm font-medium text-[#4A4A4A] mb-2">
              {label}
              {selectedVal && (
                <span className="ml-2 font-normal text-[#8A8A8E]">
                  &mdash; {selectedVal}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`Opciones de ${label}`}>
              {Array.from(grouped.entries()).map(([val, matchingVariants]) => {
                const isSelected = selectedVal === val;
                const isAvailable = matchingVariants.some(v => v.disponible);

                return (
                  <button
                    key={val}
                    onClick={() => isAvailable && handleSelect(attrKey, val)}
                    disabled={!isAvailable}
                    aria-pressed={isSelected}
                    aria-label={`${label} ${val}${!isAvailable ? ' (agotado)' : ''}`}
                    className={[
                      'px-3 py-1.5 text-sm rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:ring-offset-1',
                      isSelected
                        ? 'bg-[#ED87B6] border-[#ED87B6] text-white font-medium'
                        : isAvailable
                        ? 'bg-white border-gray-300 text-[#1C1C1E] hover:border-[#ED87B6] hover:text-[#ED87B6]'
                        : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed line-through',
                    ].join(' ')}
                  >
                    {val}
                    {!isAvailable && <span className="sr-only"> (agotado)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default VariantSelector;
