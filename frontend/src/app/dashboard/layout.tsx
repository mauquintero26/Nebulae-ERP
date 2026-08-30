import { Sidebar } from '@/components/Sidebar';
import { GlobalAIChat } from '@/components/GlobalAIChat';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative bg-white custom-scrollbar flex flex-col">
        {children}
        <GlobalAIChat />
      </main>
    </div>
  );
}
