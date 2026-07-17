import { useState } from "react";
import { AppProvider } from "./state/AppContext";
import { ToastProvider } from "./components/Toast";
import { Sidebar, SIDEBAR_WIDTH_PX, type AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { TrackerPage } from "./pages/TrackerPage";
import { ConfigPage } from "./pages/ConfigPage";

function AppShell() {
  const [page, setPage] = useState<AppPage>("search");

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar page={page} onNavigate={setPage} />

      <div style={{ paddingLeft: SIDEBAR_WIDTH_PX }}>
        {page === "search" && <HomePage />}
        {page === "tracker" && <TrackerPage />}
        {page === "config" && <ConfigPage />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ToastProvider>
  );
}
