import { useState } from "react";
import type { LinkedInJob } from "../lib/types";
import { PRODUCT_MANAGEMENT_ROLES } from "../lib/searchSuggestions";

export interface LinkedInPostFormState {
  titles: string[];
  locations: string[];
}

const DEFAULT_FORM_STATE: LinkedInPostFormState = {
  titles: PRODUCT_MANAGEMENT_ROLES,
  locations: ["Bengaluru, Karnataka"],
};

// In-memory only (not localStorage) — mirrors useJobSearch.ts exactly, so results and
// form criteria survive switching between the Find Jobs / LinkedIn Job Posts tabs, but
// reset on a real page refresh.
export function useLinkedInPosts() {
  const [linkedInForm, setLinkedInForm] = useState<LinkedInPostFormState>(DEFAULT_FORM_STATE);
  const [linkedInPosts, setLinkedInPosts] = useState<LinkedInJob[]>([]);

  return { linkedInForm, setLinkedInForm, linkedInPosts, setLinkedInPosts };
}
