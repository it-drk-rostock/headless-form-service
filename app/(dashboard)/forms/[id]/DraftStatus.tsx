"use client";

import { Text } from "@mantine/core";
import { createContext, useContext, useState } from "react";
import type { DraftSchema, DraftStamp, FormDraft } from "@/lib/forms/draft.ts";
import { formatDateTime, t } from "@/lib/i18n/index.ts";

/** The parts of the draft, each with its own editor and autosave. */
export type DraftPart = "questions" | "emailTemplate" | "theme";

type DraftStatus = {
  /** Whether an editor has changes it has not saved yet. */
  unsaved: boolean;
  setUnsaved: (part: DraftPart, unsaved: boolean) => void;
  /** The draft's questions as last saved, for the email editor's placeholders. */
  schema: DraftSchema;
  setSchema: (schema: DraftSchema) => void;
  /** Who saved the draft last and when, whichever part. */
  stamp: DraftStamp;
  setStamp: (stamp: DraftStamp) => void;
  /**
   * The draft as restoring or discarding left it, and how often that
   * happened. The editors key on `resetCount`, so they reopen on this draft;
   * null until then, when they open on the page's draft.
   */
  reset: { resetCount: number; draft: FormDraft | null };
  resetDraft: (draft: FormDraft) => void;
};

const DraftStatusContext = createContext<DraftStatus>({
  unsaved: false,
  setUnsaved: () => {},
  schema: {},
  setSchema: () => {},
  stamp: { savedAt: null, savedBy: null },
  setStamp: () => {},
  reset: { resetCount: 0, draft: null },
  resetDraft: () => {},
});

/**
 * Shares the draft between the designer, the email editor, publishing,
 * restoring and discarding: publishing waits for the last change instead of
 * freezing an older draft, the email editor offers the questions the
 * designer saved last, and both editors reopen on a restored draft.
 */
export function DraftStatusProvider({
  initialSchema,
  initialStamp,
  children,
}: {
  initialSchema: DraftSchema;
  initialStamp: DraftStamp;
  children: React.ReactNode;
}) {
  const [unsavedParts, setUnsavedParts] = useState<Set<DraftPart>>(
    () => new Set(),
  );
  const [schema, setSchema] = useState(initialSchema);
  const [stamp, setStamp] = useState(initialStamp);
  const [reset, setReset] = useState<DraftStatus["reset"]>({
    resetCount: 0,
    draft: null,
  });

  function resetDraft(draft: FormDraft) {
    setSchema(draft.schema);
    setStamp(draft.stamp);
    setReset(({ resetCount }) => ({ resetCount: resetCount + 1, draft }));
  }

  // Only uses the state setter, so it works from callbacks set up once.
  function setUnsaved(part: DraftPart, unsaved: boolean) {
    setUnsavedParts((parts) => {
      if (parts.has(part) === unsaved) return parts;
      const next = new Set(parts);
      if (unsaved) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  return (
    <DraftStatusContext
      value={{
        unsaved: unsavedParts.size > 0,
        setUnsaved,
        schema,
        setSchema,
        stamp,
        setStamp,
        reset,
        resetDraft,
      }}
    >
      {children}
    </DraftStatusContext>
  );
}

export function useDraftStatus(): DraftStatus {
  return useContext(DraftStatusContext);
}

/** Who saved the draft last and when, in the designer and the email editor. */
export function DraftSavedStatus() {
  const { savedAt, savedBy } = useDraftStatus().stamp;
  let text = t("forms.draftNeverSaved");
  if (savedAt) {
    const at = formatDateTime(savedAt);
    text = savedBy
      ? t("forms.draftSavedBy", { at, by: savedBy })
      : t("forms.draftSaved", { at });
  }
  return (
    <Text fz={13} c="gray.6" role="status">
      {text}
    </Text>
  );
}
