/**
 * /store/product/[id] — Redirects to canonical route /store/producto/[id]
 *
 * This route is kept for backwards compatibility.
 * Per ADR-002, /store/producto/[id] is the canonical product detail route.
 * This redirect preserves any existing links.
 *
 * WEB-1: Added redirect (was: mock page with no API calls)
 */
import { redirect } from 'next/navigation';

export default function LegacyProductPage({ params }: { params: { id: string } }) {
  redirect(`/store/producto/${params.id}`);
}
