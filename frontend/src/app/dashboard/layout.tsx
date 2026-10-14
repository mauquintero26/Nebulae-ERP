import { Sidebar } from '@/components/Sidebar';
import { GlobalAIChat } from '@/components/GlobalAIChat';
import { AuthGuard } from '@/components/AuthGuard';
import { SessionKeeper } from '@/components/SessionKeeper';
// Import directo (no el barril de ui/): este layout es un Server Component y Avisos.tsx es 'use client'.
import { AvisosProvider } from '@/components/ui/Avisos';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      {/* H49: avisos y confirmaciones del sistema (useAvisos); el modal de sesión de SessionKeeper (z-[100]) queda encima. */}
      <AvisosProvider>
        <div className="flex h-screen bg-white overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto relative bg-white custom-scrollbar flex flex-col">
            {children}
            <GlobalAIChat />
            <SessionKeeper />
          </main>
        </div>
      </AvisosProvider>
    </AuthGuard>
  );
}

