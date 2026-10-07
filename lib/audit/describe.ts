import { t } from "../i18n/index.ts";
import { DEFAULT_SENDER_NAME } from "../shared/notification.ts";
import { isTeamRole } from "../teams/types.ts";
import type { AuditEntry } from "./types.ts";

type Details = AuditEntry["details"];

/**
 * How each known action reads: its label and a one-line summary of its
 * details. Keys match the actions recorded in `supabase/migrations/`.
 */
const actions: Record<
  string,
  { label: string; summary: (d: Details) => string }
> = {
  "member.added": {
    label: t("audit.action.memberAdded"),
    summary: (d) =>
      t("audit.summary.memberAdded", { who: member(d), role: role(d.role) }),
  },
  "member.role_changed": {
    label: t("audit.action.memberRoleChanged"),
    summary: (d) =>
      t("audit.summary.memberRoleChanged", {
        who: member(d),
        from: role(d.from),
        to: role(d.to),
      }),
  },
  "member.removed": {
    label: t("audit.action.memberRemoved"),
    summary: (d) =>
      t("audit.summary.memberRemoved", { who: member(d), role: role(d.role) }),
  },
  "form.created": {
    label: t("audit.action.formCreated"),
    summary: (d) => t("audit.summary.formCreated", { name: text(d.name) }),
  },
  "form.renamed": {
    label: t("audit.action.formRenamed"),
    summary: (d) =>
      t("audit.summary.formRenamed", { from: text(d.from), to: text(d.to) }),
  },
  "form.recipients_changed": {
    label: t("audit.action.formRecipientsChanged"),
    summary: (d) =>
      t("audit.summary.formRecipientsChanged", {
        name: text(d.name),
        changes: listChanges(texts(d.from), texts(d.to)),
      }),
  },
  "form.turnstile_changed": {
    label: t("audit.action.formTurnstileChanged"),
    summary: (d) =>
      t(
        d.enabled === true
          ? "audit.summary.formTurnstileOn"
          : "audit.summary.formTurnstileOff",
        { name: text(d.name) },
      ),
  },
  "form.reply_to_changed": {
    label: t("audit.action.formReplyToChanged"),
    summary: (d) =>
      t("audit.summary.formSettingChanged", {
        name: text(d.name),
        from: text(d.from) || t("audit.summary.none"),
        to: text(d.to) || t("audit.summary.none"),
      }),
  },
  "form.sender_name_changed": {
    label: t("audit.action.formSenderNameChanged"),
    summary: (d) =>
      t("audit.summary.formSettingChanged", {
        name: text(d.name),
        from: text(d.from) || DEFAULT_SENDER_NAME,
        to: text(d.to) || DEFAULT_SENDER_NAME,
      }),
  },
  "settings.origins_changed": {
    label: t("audit.action.settingsOriginsChanged"),
    summary: (d) => listChanges(texts(d.from), texts(d.to)),
  },
  "settings.recipient_domains_changed": {
    label: t("audit.action.settingsRecipientDomainsChanged"),
    summary: (d) => listChanges(texts(d.from), texts(d.to)),
  },
  "settings.load_limit_changed": {
    label: t("audit.action.settingsLoadLimitChanged"),
    summary: (d) =>
      t("audit.summary.settingsLoadLimit", {
        from: text(d.from),
        to: text(d.to),
      }),
  },
  "settings.submit_limit_changed": {
    label: t("audit.action.settingsSubmitLimitChanged"),
    summary: (d) =>
      t("audit.summary.settingsSubmitLimit", {
        from: text(d.from),
        to: text(d.to),
      }),
  },
  "form.published": {
    label: t("audit.action.formPublished"),
    summary: (d) =>
      t("audit.summary.formPublished", {
        name: text(d.name),
        version: text(d.version),
      }),
  },
  "form.version_restored": {
    label: t("audit.action.formVersionRestored"),
    summary: (d) =>
      t("audit.summary.formVersionRestored", {
        name: text(d.name),
        version: text(d.version),
      }),
  },
  "form.draft_discarded": {
    label: t("audit.action.formDraftDiscarded"),
    summary: (d) =>
      t("audit.summary.formDraftDiscarded", {
        name: text(d.name),
        version: text(d.version),
      }),
  },
};

/**
 * An entry as German text: what happened, and to whom or what. Actions added
 * by later tickets show their stored key and details until they get a label.
 */
export function describeAuditEntry(
  entry: Pick<AuditEntry, "action" | "details">,
): { action: string; summary: string } {
  const known = actions[entry.action];
  if (!known) {
    return { action: entry.action, summary: plainDetails(entry.details) };
  }
  return { action: known.label, summary: known.summary(entry.details) };
}

/** Who acted: their address at the time, or the system (service role, SQL editor). */
export function actorName(entry: Pick<AuditEntry, "actorEmail">): string {
  return entry.actorEmail || t("audit.actorSystem");
}

function member(details: Details): string {
  return text(details.email) || t("audit.deletedAccount");
}

function role(value: unknown): string {
  const name = text(value);
  return isTeamRole(name) ? t(`teams.role.${name}`) : name;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : [];
}

/** Added and removed entries (addresses, origins); only the order changed, the new list. */
function listChanges(from: string[], to: string[]): string {
  const changes = [
    ...to.filter((entry) => !from.includes(entry)).map((e) => `+ ${e}`),
    ...from.filter((entry) => !to.includes(entry)).map((e) => `− ${e}`),
  ];
  if (changes.length > 0) return changes.join(", ");
  return to.length > 0 ? to.join(", ") : t("audit.summary.none");
}

function plainDetails(details: Details): string {
  return Object.entries(details)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`,
    )
    .join(", ");
}
