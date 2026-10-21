import { useEffect } from 'react';
import { ClassroomCanvas } from './components/canvas/ClassroomCanvas';
import { ExportHost } from './components/canvas/ExportHost';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { Toasts } from './components/ui/Toasts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store/appStore';

export default function App() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const requestFit = useAppStore((s) => s.requestFit);
  useKeyboardShortcuts();

  // Na het in- of uitklappen van het paneel de plattegrond opnieuw passend maken.
  useEffect(() => {
    const t = setTimeout(requestFit, 60);
    return () => clearTimeout(t);
  }, [sidebarOpen, requestFit]);

  return (
    <div className="flex h-full min-h-[480px] w-full overflow-hidden">
      {/* Linkerpaneel: op grote schermen ~33%, op kleinere schermen een inklapbare lade. */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 left-0 z-30 w-[min(440px,92vw)] shadow-xl lg:static lg:z-auto lg:w-[33%] lg:min-w-[360px] lg:max-w-[560px] lg:shadow-none">
            <Sidebar />
          </div>
        </>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <div className="min-h-0 flex-1">
          <ClassroomCanvas />
        </div>
      </main>
      <Toasts />
      <ExportHost />
    </div>
  );
}
