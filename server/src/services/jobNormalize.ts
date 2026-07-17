import type { CompanySize, Job, JobType, Portal } from "../types.js";
import { extractRequirements, guessPortalFromUrl, inferType, stripHtml } from "./textHeuristics.js";
import type { GroundingResult } from "./gemini.js";

function makeId(portal: string, url: string | undefined, fallback: string): string {
  return `${portal}:${url ?? fallback}`;
}

function parseApplicantCount(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/[^\d]/g, ""));
    return Number.isFinite(num) && num > 0 ? num : undefined;
  }
  return undefined;
}

function classifyCompanySizeFromEmployeeCount(value: unknown): CompanySize {
  if (typeof value !== "string") return "unknown";
  const num = Number(value.replace(/[^\d]/g, ""));
  if (!Number.isFinite(num) || num === 0) return "unknown";
  if (num >= 1000) return "large_enterprise";
  if (num <= 50) return "startup_small";
  return "unknown";
}

function normalizeLinkedIn(r: any): Job | null {
  const url: string | undefined = r.link ?? r.applyUrl ?? r.jobUrl;
  const title = r.title;
  const company = r.companyName;
  if (!title || !company) return null;
  const description = r.descriptionText ?? (r.descriptionHtml ? stripHtml(r.descriptionHtml) : "");
  return {
    id: makeId("LinkedIn", url, title),
    title,
    company,
    location: r.location ?? "",
    type: inferType(`${r.location ?? ""} ${description}`),
    portal: "LinkedIn",
    url: url ?? "",
    description,
    requirements: extractRequirements(description),
    postedAt: r.postedAt ?? "",
    applicantCount: parseApplicantCount(r.applicantsCount),
  };
}

function normalizeIndeed(r: any): Job | null {
  const url: string | undefined = r.url ?? r.jobUrl;
  const title = r.title;
  const company = r.employer?.name ?? r.companyName;
  if (!title || !company) return null;
  const description = r.description?.text ?? (r.description?.html ? stripHtml(r.description.html) : "");
  const locObj = r.location;
  const location = typeof locObj === "string"
    ? locObj
    : [locObj?.city, locObj?.admin1Code, locObj?.countryName].filter(Boolean).join(", ");
  const attributeValues: string[] = Object.values(r.attributes ?? {});
  const employerAttrValues: string[] = Object.values(r.employerAttributes ?? {});
  return {
    id: makeId("Indeed", url, title),
    title,
    company,
    location,
    type: inferType(`${employerAttrValues.join(" ")} ${location} ${description}`),
    portal: "Indeed",
    url: url ?? "",
    description,
    requirements: extractRequirements(description, attributeValues),
    postedAt: r.datePublished ?? r.dateOnIndeed ?? "",
    companySize: classifyCompanySizeFromEmployeeCount(r.employer?.employeesCount),
  };
}

function normalizeNaukri(r: any): Job | null {
  const url: string | undefined = r.portalUrl ?? r.url;
  const title = r.title;
  const company = r.companyName;
  if (!title || !company) return null;
  const description = r.description ?? (r.descriptionHtml ? stripHtml(r.descriptionHtml) : "");
  const wfhType = (r.wfhType ?? "").toLowerCase();
  const type: JobType = wfhType.includes("remote") || wfhType.includes("wfh")
    ? "Remote"
    : wfhType.includes("hybrid")
      ? "Hybrid"
      : inferType(`${r.location ?? ""} ${description}`);
  return {
    id: makeId("Naukri", url, title),
    title,
    company,
    location: r.location ?? "",
    type,
    portal: "Naukri",
    url: url ?? "",
    description,
    requirements: extractRequirements(description, Array.isArray(r.skills) ? r.skills : []),
    postedAt: r.createdDate ?? "",
    applicantCount: parseApplicantCount(r.applyCount),
  };
}

function normalizeWellfound(r: any): Job | null {
  const url: string | undefined = r.jobUrl;
  const title = r.title;
  const company = r.companyName;
  if (!title || !company) return null;
  const location = Array.isArray(r.locations) ? r.locations.join(", ") : (r.locations ?? "");
  const description = r.compensation ? `Compensation: ${r.compensation}` : "";
  return {
    id: makeId("Wellfound", url, title),
    title,
    company,
    location,
    type: r.remote ? "Remote" : inferType(`${location}`),
    portal: "Wellfound",
    url: url ?? "",
    description,
    requirements: extractRequirements(description || title),
    postedAt: r.postedAt ?? r.scrapedAt ?? "",
    // Wellfound (formerly AngelList Talent) is a startup-focused job board —
    // treat every listing as startup-sized unless we later learn otherwise.
    companySize: "startup_small",
  };
}

function normalizeFlexjobs(r: any): Job | null {
  const url: string | undefined = r.apply_url ?? r.url;
  const title = r.title;
  const company = r.company;
  if (!title || !company) return null;
  const description = r.description_text ?? r.job_summary ?? "";
  const remoteLevel = (r.remote_level ?? "").toLowerCase();
  const type: JobType = remoteLevel.includes("remote")
    ? "Remote"
    : remoteLevel.includes("hybrid")
      ? "Hybrid"
      : inferType(`${r.location ?? ""} ${description}`);
  return {
    id: makeId("Flexjobs", url, title),
    title,
    company,
    location: r.location ?? "",
    type,
    portal: "Flexjobs",
    url: url ?? "",
    description,
    requirements: extractRequirements(description),
    postedAt: r.date_posted ?? r.created_on ?? "",
  };
}

function normalizeGoogle(r: any): Job | null {
  const title = r.title;
  const company = r.company_name;
  if (!title || !company) return null;
  const description = r.description ?? "";
  const url: string | undefined = r.apply_options?.[0]?.link ?? r.share_link;
  const qualifications: string[] = Array.isArray(r.job_highlights)
    ? r.job_highlights.find((h: any) => /qualification/i.test(h?.title ?? ""))?.items ?? []
    : [];
  const extensions: string[] = Array.isArray(r.extensions) ? r.extensions : [];
  return {
    id: makeId("Google", url, title),
    title,
    company,
    location: r.location ?? "",
    type: inferType(`${extensions.join(" ")} ${r.location ?? ""} ${description}`),
    portal: "Google",
    url: url ?? "",
    description,
    requirements: extractRequirements(description, qualifications),
    postedAt: r.detected_extensions?.posted_at ?? r.search_timestamp ?? "",
  };
}

const normalizers: Record<Portal, (raw: any) => Job | null> = {
  LinkedIn: normalizeLinkedIn,
  Indeed: normalizeIndeed,
  Naukri: normalizeNaukri,
  Wellfound: normalizeWellfound,
  Flexjobs: normalizeFlexjobs,
  Google: normalizeGoogle,
};

export function normalizeActorItems(portal: Portal, rawItems: unknown[]): Job[] {
  const results: Job[] = [];
  for (const raw of rawItems) {
    try {
      const job = normalizers[portal](raw);
      if (job) results.push(job);
    } catch {
      // skip malformed record, never fail the whole batch
    }
  }
  return results;
}

export function normalizeGroundingResult(portal: Portal, grounding: GroundingResult, searchTitle: string): Job[] {
  return grounding.sources.map((source, idx) => {
    const inferredPortal = source.uri ? guessPortalFromUrl(source.uri) : portal;
    const title = source.title ?? searchTitle;
    return {
      id: makeId(inferredPortal, source.uri, `${searchTitle}-${idx}`),
      title,
      company: "",
      location: "",
      type: inferType(grounding.text),
      portal: inferredPortal,
      url: source.uri ?? "",
      description: grounding.text.slice(0, 600),
      requirements: extractRequirements(grounding.text),
      postedAt: "",
    };
  });
}
