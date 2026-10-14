"use client";

import "survey-core/i18n/german";
import "survey-creator-core/i18n/german";
import "survey-core/survey-core.css";
import "survey-creator-core/survey-creator-core.css";
import { useEffect, useRef, useState } from "react";
import { surveyLocalization } from "survey-core";
import { SurveyCreator, SurveyCreatorComponent } from "survey-creator-react";
import { type DraftSaveResult, saveDraft } from "@/lib/forms/actions.ts";
import {
  DISABLED_QUESTION_TYPES,
  type DraftSchema,
} from "@/lib/forms/draft.ts";
import { useDraftStatus } from "./DraftStatus.tsx";

// The questions are written in German, so the survey's own texts (buttons,
// messages) in the preview are German too. The embed must use the same
// default locale.
surveyLocalization.defaultLocale = "de";

/**
 * SurveyJS Creator on the form's draft, in German. Every change is saved
 * shortly after it is made; concurrent saves are last-write-wins. Runs
 * without a licence key for now, so Creator shows its licence notice.
 * Browser only: load it with `ssr: false`.
 */
export default function DraftCreator({
  formId,
  schema,
  onSaved,
}: {
  formId: string;
  schema: DraftSchema;
  onSaved: (result: DraftSaveResult) => void;
}) {
  // Saves run from Creator's callback, which is set up once; it calls the
  // latest `onSaved` through this ref.
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // Changes made, and the last of them a successful save covered.
  const changes = useRef({ made: 0, saved: 0 });
  // Only state setters, so they work from Creator's callbacks set up once.
  const { setUnsaved, setSchema } = useDraftStatus();

  const [creator] = useState(() => {
    const creator = new SurveyCreator({
      autoSaveEnabled: true,
      showThemeTab: false,
      showTranslationTab: false,
      showJSONEditorTab: true,
    });
    creator.locale = "de";
    for (const type of DISABLED_QUESTION_TYPES) {
      creator.toolbox.removeItem(type);
    }
    creator.JSON = schema;
    creator.onModified.add(() => {
      changes.current.made += 1;
      setUnsaved("questions", true);
    });
    creator.saveSurveyFunc = (
      saveNo: number,
      callback: (saveNo: number, success: boolean) => void,
    ) => {
      const changesAtSave = changes.current.made;
      const saved = creator.JSON;
      saveDraft(formId, saved)
        .catch((): DraftSaveResult => ({ error: "forms.errorGeneric" }))
        .then((result) => {
          if (result.error === null) {
            changes.current.saved = Math.max(
              changes.current.saved,
              changesAtSave,
            );
            setUnsaved(
              "questions",
              changes.current.made > changes.current.saved,
            );
            setSchema(saved);
          }
          callback(saveNo, result.error === null);
          onSavedRef.current(result);
        });
    };
    return creator;
  });

  // Leaving the page before the last change is saved would lose it.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (changes.current.made > changes.current.saved) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return <SurveyCreatorComponent creator={creator} />;
}
