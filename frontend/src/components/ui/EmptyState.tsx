'use client';

/** Estado vacio estandar para tablas (icono + mensaje + pista secundaria). */
export function EmptyState({
  icon: Icon, message, hint,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  message: string;
  hint?: string;
}) {
  return (
    <div className="px-6 py-20 text-center">
      <Icon size={40} className="mx-auto mb-3 text-slate-300" />
      <p className="text-slate-500 font-medium">{message}</p>
      {hint && <p className="text-slate-400 text-sm mt-1">{hint}</p>}
    </div>
  );
}
