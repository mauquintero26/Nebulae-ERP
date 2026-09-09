"use client";
/**
 * hooks/useCatalog.ts
 *
 * Hook principal del catálogo público.
 *
 * - Sincroniza filtros con la URL (persistencia + navegación atrás/adelante)
 * - Debounce de búsqueda (350ms)
 * - Cancela peticiones anteriores (AbortController)
 * - Paginación client-side (gap documentado: sin paginación real del servidor)
 * - Estado de carga, error y retry controlado
 * - Filtros client-side cuando el backend no los soporta
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  listProductos,
  applyClientFilters,
  applySorting,
  paginate,
  getTotalPages,
  filtersToCatalogParams,
  parseUrlToFilters,
  filtersToUrlParams,
  countActiveFilters,
} from '@/lib/store-api';
import { isStoreError } from '@/lib/store-api';
import type { NormalizedProduct, CatalogFilterState, PaginationState } from '@/lib/store-api';
import { EMPTY_FILTERS } from '@/lib/store-api';
import { useDebounce } from './useDebounce';

// ─── Config ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UseCatalogOptions = {
  /** Initial category filter (from route param, e.g. /store/categoria/[slug]) */
  initialCategoria?: string;
};

type UseCatalogResult = {
  /** Filtered + sorted + paginated products for current page */
  products: NormalizedProduct[];
  /** All fetched products after client filters (for count) */
  filteredCount: number;
  /** Total products from server (before client filtering) */
  serverTotal: number;
  /** Pagination state */
  pagination: PaginationState;
  /** Current filter state */
  filters: CatalogFilterState;
  /** Number of active filters (for badge) */
  activeFilterCount: number;
  /** Loading state */
  loading: boolean;
  /** Error string to show user (null if no error) */
  error: string | null;
  /** Whether error is retryable */
  isRetryable: boolean;
  /** Set a single filter key */
  setFilter: (key: keyof CatalogFilterState, value: string | number) => void;
  /** Reset all filters to empty */
  clearFilters: () => void;
  /** Clear a single filter */
  clearFilter: (key: keyof CatalogFilterState) => void;
  /** Force retry after error */
  retry: () => void;
  /** Go to page */
  setPage: (page: number) => void;
};

export function useCatalog(options?: UseCatalogOptions): UseCatalogResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Initialize filters from URL ──
  const [filters, setFilters] = useState<CatalogFilterState>(() => {
    const parsed = parseUrlToFilters(new URLSearchParams(searchParams.toString()));
    if (options?.initialCategoria && !parsed.categoria) {
      return { ...parsed, categoria: options.initialCategoria };
    }
    return parsed;
  });

  // ── Internal data state ──
  const [allProducts, setAllProducts] = useState<NormalizedProduct[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // ── Debounced search to avoid per-keystroke requests ──
  const debouncedSearch = useDebounce(filters.search, 350);

  // ── AbortController ref for cancelling stale requests ──
  const abortRef = useRef<AbortController | null>(null);

  // ── Sync URL → filters when browser back/forward used ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const parsed = parseUrlToFilters(new URLSearchParams(searchParams.toString()));
    setFilters((prev) => {
      // Only update if URL actually changed (prevents unnecessary re-renders)
      const prevQs = filtersToUrlParams(prev).toString();
      const newQs = filtersToUrlParams(parsed).toString();
      return prevQs === newQs ? prev : parsed;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Fetch data when server params change ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const params = filtersToCatalogParams(
      { ...filters, search: debouncedSearch },
      500,
    );

    listProductos(params, { signal: controller.signal })
      .then(({ products, total }) => {
        setAllProducts(products);
        setServerTotal(total);
        setLoading(false);
      })
      .catch((err) => {
        if (isStoreError(err) && err.isAborted) return; // intentional cancel
        setLoading(false);
        const msg = isStoreError(err) ? err.publicMessage : 'Error al cargar productos.';
        const retryable = isStoreError(err) ? err.isRetryable() : true;
        setError(msg);
        setIsRetryable(retryable);
        console.warn('[useCatalog] fetch error:', err);
      });

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters.categoria, filters.publicado, retryCount]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Apply client-side filters ──
  const filteredProducts = applyClientFilters(allProducts, filters);
  const sortedProducts = applySorting(filteredProducts, filters.ordenar);
  const paginatedProducts = paginate(sortedProducts, filters.page, PAGE_SIZE);
  const totalPages = getTotalPages(sortedProducts.length, PAGE_SIZE);

  const pagination: PaginationState = {
    page: filters.page,
    pageSize: PAGE_SIZE,
    total: sortedProducts.length,
    totalPages,
  };

  // ── Handlers ──

  const updateFiltersAndUrl = useCallback(
    (newFilters: CatalogFilterState) => {
      setFilters(newFilters);
      const params = filtersToUrlParams(newFilters);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    (key: keyof CatalogFilterState, value: string | number) => {
      setFilters((prev) => {
        // Reset to page 1 when any non-page filter changes
        const resetPage = key !== 'page' && key !== 'ordenar';
        const newFilters = {
          ...prev,
          [key]: value,
          ...(resetPage ? { page: 1 } : {}),
        };
        const params = filtersToUrlParams(newFilters);
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        return newFilters;
      });
    },
    [router, pathname],
  );

  const clearFilters = useCallback(() => {
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const fresh: CatalogFilterState = {
      ...EMPTY_FILTERS,
      // Preserve categoria if it was set from route param
      ...(options?.initialCategoria ? { categoria: options.initialCategoria } : {}),
    };
    updateFiltersAndUrl(fresh);
  }, [updateFiltersAndUrl, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilter = useCallback(
    (key: keyof CatalogFilterState) => {
      setFilter(key, EMPTY_FILTERS[key]);
    },
    [setFilter],
  );

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const setPage = useCallback(
    (page: number) => {
      setFilter('page', page);
    },
    [setFilter],
  );

  return {
    products: paginatedProducts,
    filteredCount: sortedProducts.length,
    serverTotal,
    pagination,
    filters,
    activeFilterCount: countActiveFilters(filters),
    loading,
    error,
    isRetryable,
    setFilter,
    clearFilters,
    clearFilter,
    retry,
    setPage,
  };
}
