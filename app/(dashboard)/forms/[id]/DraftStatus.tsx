"use client";

import { createContext, useContext, useState } from "react";

type DraftStatus = {
  /** Whether the designer has changes it has not saved yet. */
  unsaved: boolean;
  setUnsaved: (unsaved: boolean) => void;
};

const DraftStatusContext = createContext<DraftStatus>({
  unsaved: false,
  setUnsaved: () => {},
});

/**
 * Shares whether the designer's draft is saved, so publishing waits for the
 * last change instead of freezing an older draft.
 */
export function DraftStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unsaved, setUnsaved] = useState(false);
  return (
    <DraftStatusContext value={{ unsaved, setUnsaved }}>
      {children}
    </DraftStatusContext>
  );
}

export function useDraftStatus(): DraftStatus {
  return useContext(DraftStatusContext);
}
