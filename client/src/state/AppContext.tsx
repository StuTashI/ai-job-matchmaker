import { createContext, useContext, type ReactNode } from "react";
import { useResume } from "./useResume";
import { useTracker } from "./useTracker";
import { useJobSearch } from "./useJobSearch";
import { useLinkedInPosts } from "./useLinkedInPosts";

type AppContextValue = ReturnType<typeof useResume> &
  ReturnType<typeof useTracker> &
  ReturnType<typeof useJobSearch> &
  ReturnType<typeof useLinkedInPosts>;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const resumeState = useResume();
  const trackerState = useTracker();
  const jobSearchState = useJobSearch();
  const linkedInPostsState = useLinkedInPosts();
  return (
    <AppContext.Provider value={{ ...resumeState, ...trackerState, ...jobSearchState, ...linkedInPostsState }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
