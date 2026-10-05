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
