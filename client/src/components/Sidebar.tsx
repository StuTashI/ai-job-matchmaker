import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Briefcase, ChevronDown, KeyRound, LayoutGrid, Settings } from "lucide-react";

export type AppPage = "search" | "tracker" | "config";

export const SIDEBAR_WIDTH_PX = 288;

interface SidebarProps {
  page: AppPage;
  onNavigate: (page: AppPage) => void;
}

function SidebarSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-slate-100 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown size={16} className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 px-2 pb-1 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <aside
      style={{ width: SIDEBAR_WIDTH_PX }}
      className="fixed left-0 top-0 z-30 flex h-full flex-col border-r border-slate-200 bg-white"
    >
      <div className="flex items-center border-b border-slate-200 p-4">
        <h2 className="text-sm font-bold text-slate-900">AI Job Matchmaker</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SidebarSection title="Search Jobs" icon={<LayoutGrid size={16} />}>
          <SidebarLink
            label="Search"
            icon={<LayoutGrid size={15} />}
            active={page === "search"}
            onClick={() => onNavigate("search")}
          />
          <SidebarLink
            label="Tracker"
            icon={<Briefcase size={15} />}
            active={page === "tracker"}
            onClick={() => onNavigate("tracker")}
          />
        </SidebarSection>

        <SidebarSection title="Configuration" icon={<Settings size={16} />}>
          <SidebarLink
            label="API Keys"
            icon={<KeyRound size={15} />}
            active={page === "config"}
            onClick={() => onNavigate("config")}
          />
        </SidebarSection>
      </div>
    </aside>
  );
}
