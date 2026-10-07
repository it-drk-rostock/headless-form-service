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

/** A form with its settings, for `/forms/[id]`. */
export type FormDetails = FormSummary & {
  /** Normalised addresses that receive the notification emails. */
  recipients: string[];
  /** Whether visitors pass Cloudflare Turnstile before submitting. */
  turnstileEnabled: boolean;
  /** Answer key of the question whose answer becomes Reply-To; null for none. */
  replyToQuestion: string | null;
  /** Shown with the global sender address; empty for the service's own name. */
  senderDisplayName: string;
  /** The version visitors are served; null until the first publish. */
  currentVersion: number | null;
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

/** The views of a form's page; the first, the designer, is the default. */
export const FORM_VIEWS = [
  "designer",
  "email",
  "versions",
  "settings",
] as const;
export type FormView = (typeof FORM_VIEWS)[number];

/** The view a `?view=` search parameter asks for, the designer if none or unknown. */
export function formView(param: string | string[] | undefined): FormView {
  return (FORM_VIEWS as readonly unknown[]).includes(param)
    ? (param as FormView)
    : "designer";
}
