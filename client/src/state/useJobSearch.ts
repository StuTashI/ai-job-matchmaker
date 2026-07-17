import { useState } from "react";
import type { Job, JobType, Portal } from "../lib/types";

export interface JobSearchFormState {
  titles: string[];
  locations: string[];
  jobType: JobType | "All";
  sources: Portal[];
}

const ALL_PORTALS: Portal[] = ["LinkedIn", "Indeed", "Wellfound", "Naukri", "Flexjobs", "Google"];

export const DEFAULT_ROLE_TITLES = [
  "Product Manager",
  "Senior Product Manager",
  "Staff Product Manager",
  "Lead Product Manager",
  "Associate Director of Product",
  "Director of Product",
];

const DEFAULT_FORM_STATE: JobSearchFormState = {
  titles: DEFAULT_ROLE_TITLES,
  locations: ["Bengaluru, Karnataka"],
  jobType: "All",
  sources: ALL_PORTALS,
};

export function useJobSearch() {
  const [form, setForm] = useState<JobSearchFormState>(DEFAULT_FORM_STATE);
  const [jobs, setJobs] = useState<Job[]>([]);

  return { form, setForm, jobs, setJobs };
}
