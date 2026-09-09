"use client";

/**
 * NavTreeItem — Recursive navigation node component.
 *
 * Used by both the desktop mega-menu and the mobile navigation drawer
 * to render NavNode trees of arbitrary depth without any hardcoded limit.
 *
 * Desktop mode: renders nested dropdowns / mega-menu columns
 * Mobile mode: renders expandable accordion items
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NavNode } from '@/types/store';

// ─── Types ───────────────────────────────────────────────────────────────────

type NavTreeItemProps = {
  node: NavNode;
  /** 'desktop' renders hover dropdowns; 'mobile' renders accordion */
  mode: 'desktop' | 'mobile';
  /** Current nesting depth (0 = root) */
  depth?: number;
  /** Callback when any link inside this node is clicked */
  onNavigate?: () => void;
};

// ─── Desktop variant ──────────────────────────────────────────────────────────

function DesktopNavItem({ node, depth = 0, onNavigate }: Omit<NavTreeItemProps, 'mode'>) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  if (!hasChildren) {
    return (
      <Link
        href={node.href}
        onClick={onNavigate}
        className={`
          block whitespace-nowrap font-semibold transition-colors
          ${depth === 0
            ? 'text-sm text-[#1C1C1E] hover:text-[#ED87B6] py-1'
            : 'text-sm text-[#4A4A4A] hover:text-[#ED87B6] px-4 py-2 rounded-lg hover:bg-[#FFF5FA]'
          }
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]
        `}
      >
        {node.label}
      </Link>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger */}
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className={`
          inline-flex items-center gap-1 font-semibold transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]
          ${depth === 0
            ? 'text-sm text-[#1C1C1E] hover:text-[#ED87B6] py-1'
            : 'w-full text-sm text-[#4A4A4A] hover:text-[#ED87B6] px-4 py-2 rounded-lg hover:bg-[#FFF5FA] justify-between'
          }
        `}
      >
        {node.label}
        {depth === 0
          ? <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          : <ChevronRight size={12} aria-hidden="true" />
        }
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={`
            absolute z-50 bg-white rounded-2xl shadow-xl border border-[#F0E0EC]
            min-w-[180px] py-2
            ${depth === 0 ? 'top-full left-0 mt-1' : 'top-0 left-full ml-1'}
          `}
          role="menu"
        >
          {/* Link to the parent category itself */}
          <Link
            href={node.href}
            onClick={onNavigate}
            role="menuitem"
            className="block px-4 py-2 text-sm font-black text-[#ED87B6] hover:bg-[#FFF5FA] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
          >
            Ver todo en {node.label}
          </Link>
          <div className="border-t border-[#F0E0EC] my-1" aria-hidden="true" />
          {node.children.map((child) => (
            <div key={child.id} role="none" className="px-2">
              <DesktopNavItem node={child} depth={depth + 1} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile variant ───────────────────────────────────────────────────────────

function MobileNavItem({ node, depth = 0, onNavigate }: Omit<NavTreeItemProps, 'mode'>) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const indent = depth * 12; // px indent per level

  return (
    <div>
      {hasChildren ? (
        <>
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            style={{ paddingLeft: `${16 + indent}px` }}
            className="w-full flex items-center justify-between pr-4 py-3 text-sm font-bold text-[#1C1C1E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
          >
            <span>{node.label}</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          {expanded && (
            <div className="border-l-2 border-[#F0E0EC] ml-6">
              {/* Link to the parent category itself */}
              <Link
                href={node.href}
                onClick={onNavigate}
                style={{ paddingLeft: `${16 + indent}px` }}
                className="block pr-4 py-2.5 text-sm font-black text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
              >
                Ver todo en {node.label}
              </Link>
              {node.children.map((child) => (
                <MobileNavItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <Link
          href={node.href}
          onClick={onNavigate}
          style={{ paddingLeft: `${16 + indent}px` }}
          className="block pr-4 py-3 text-sm font-semibold text-[#4A4A4A] hover:text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
        >
          {node.label}
        </Link>
      )}
    </div>
  );
}

// ─── Public export (mode dispatcher) ─────────────────────────────────────────

export function NavTreeItem({ node, mode, depth = 0, onNavigate }: NavTreeItemProps) {
  if (mode === 'mobile') {
    return <MobileNavItem node={node} depth={depth} onNavigate={onNavigate} />;
  }
  return <DesktopNavItem node={node} depth={depth} onNavigate={onNavigate} />;
}
