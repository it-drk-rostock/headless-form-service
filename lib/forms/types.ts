/** How a form shows in lists: its most significant state (ui-design §2.3). */
export type FormStatus = "draft" | "published" | "closed" | "archived";

/** A form as the list on `/forms` shows it. */
export type FormSummary = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  status: FormStatus;
  updatedAt: string;
};

/** Who can fill in a form (GLOSSARY: Public Form, Protected Form). */
export type FormAccessType = "public" | "protected";

export function isFormAccessType(value: unknown): value is FormAccessType {
  return value === "public" || value === "protected";
}

/** A form with its settings, for `/forms/[id]`. */
export type FormDetails = FormSummary & {
  /** Normalised addresses that receive the notification emails. */
  recipients: string[];
  /** Whether visitors pass Cloudflare Turnstile before submitting. */
  turnstileEnabled: boolean;
  /** Closed: the embed shows a closed notice and submissions are refused. */
  isClosed: boolean;
  /** Answer key of the question whose answer becomes Reply-To; null for none. */
  replyToQuestion: string | null;
  /** Shown with the global sender address; empty for the service's own name. */
  senderDisplayName: string;
  /** The version visitors are served; null until the first publish. */
  currentVersion: number | null;
  /** When the form was archived; null while in use. */
  archivedAt: string | null;
  /** Protected forms are filled in only with a valid form pass. */
  accessType: FormAccessType;
  /** The form page, used to build form pass links; null while unset. */
  pageUrl: string | null;
  createdAt: string;
};

export function formStatus(form: {
  archivedAt: string | null;
  isClosed: boolean;
  currentVersion: number | null;
}): FormStatus {
  if (form.archivedAt) return "archived";
  if (form.isClosed) return "closed";
  return form.currentVersion === null ? "draft" : "published";
}

/** Which forms `/forms` lists: those in use, or the archived ones. */
export type FormsFilter = "active" | "archived";

/** The filter a `?filter=` search parameter asks for, the forms in use if none or unknown. */
export function formsFilter(param: string | string[] | undefined): FormsFilter {
  return param === "archived" ? "archived" : "active";
}

/** A shareable forms list, retaining archive and team filters together. */
export function formsListHref(
  filter: FormsFilter,
  teamId?: string | null,
): string {
  const params = new URLSearchParams();
  if (filter === "archived") params.set("filter", filter);
  if (teamId) params.set("team", teamId);
  const query = params.toString();
  return query ? `/forms?${query}` : "/forms";
}

/** The views of a form's page; the first, the designer, is the default. */
export const FORM_VIEWS = [
  "designer",
  "email",
  "versions",
  "settings",
  "embed",
  "passes",
  "statistics",
  "failures",
] as const;
export type FormView = (typeof FORM_VIEWS)[number];

/** The view a `?view=` search parameter asks for, the designer if none or unknown. */
export function formView(param: string | string[] | undefined): FormView {
  return (FORM_VIEWS as readonly unknown[]).includes(param)
    ? (param as FormView)
    : "designer";
}
