"use client";

import { useState, useRef, useEffect } from 'react';

export function ResizableHeader({ 
  children, 
  minWidth = 50 
}: { 
  children: React.ReactNode, 
  minWidth?: number 
}) {
  const [width, setWidth] = useState<number | 'auto'>('auto');
  const thRef = useRef<HTMLTableCellElement>(null);
  
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (thRef.current) {
      startX.current = e.clientX;
      startWidth.current = thRef.current.getBoundingClientRect().width;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX.current;
    const newWidth = Math.max(minWidth, startWidth.current + delta);
    setWidth(newWidth);
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <th 
      ref={thRef}
      style={{ width: width === 'auto' ? undefined : width, minWidth }} 
      className="px-6 py-4 font-bold border-r border-slate-200 relative group truncate bg-white"
    >
      {children}
      {/* Divisor de redimensionamiento */}
      <div 
        onMouseDown={onMouseDown}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500 hover:w-2 z-10 flex items-center justify-center group-hover:bg-slate-200 transition-colors"
        title="Arrastrar para ajustar ancho"
      >
        <div className="w-px h-full bg-slate-300 pointer-events-none" />
      </div>
    </th>
  );
}
