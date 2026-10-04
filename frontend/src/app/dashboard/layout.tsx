import { Sidebar } from '@/components/Sidebar';
import { GlobalAIChat } from '@/components/GlobalAIChat';
import { AlertasBadge } from '@/components/AlertasBadge';
import { AuthGuard } from '@/components/AuthGuard';
import { SessionKeeper } from '@/components/SessionKeeper';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen bg-white overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-white custom-scrollbar flex flex-col">
          {children}
          <GlobalAIChat />
          <AlertasBadge />
          <SessionKeeper />
        </main>
      </div>
    </AuthGuard>
  );
}

