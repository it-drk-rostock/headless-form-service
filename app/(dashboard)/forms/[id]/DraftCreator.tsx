"use client";

import "survey-core/i18n/german";
import "survey-creator-core/i18n/german";
import "survey-core/survey-core.css";
import "survey-creator-core/survey-creator-core.css";
import { Button, Group, Select } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { type ITheme, surveyLocalization } from "survey-core";
import { DefaultLight } from "survey-core/themes";
import { SurveyCreator, SurveyCreatorComponent } from "survey-creator-react";
import {
  type DraftSaveResult,
  saveDraft,
  saveDraftTheme,
} from "@/lib/forms/actions.ts";
import {
  DISABLED_QUESTION_TYPES,
  type DraftSchema,
} from "@/lib/forms/draft.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";
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
  theme,
  globalTheme,
  onSaved,
}: {
  formId: string;
  schema: DraftSchema;
  theme: ITheme | null;
  globalTheme: ITheme | null;
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
  const themeChanges = useRef({ made: 0, saved: 0 });
  const customRef = useRef(theme !== null);
  const [custom, setCustom] = useState(theme !== null);
  const [themeFailed, setThemeFailed] = useState(false);
  const themeQueue = useRef(Promise.resolve());
  // Only state setters, so they work from Creator's callbacks set up once.
  const { setUnsaved, setSchema } = useDraftStatus();

  const [creator] = useState(() => {
    const creator = new SurveyCreator({
      autoSaveEnabled: true,
      showThemeTab: true,
      showTranslationTab: false,
      showJSONEditorTab: true,
    });
    creator.locale = "de";
    for (const type of DISABLED_QUESTION_TYPES) {
      creator.toolbox.removeItem(type);
    }
    creator.JSON = schema;
    creator.theme = structuredClone(theme ?? globalTheme ?? DefaultLight);
    creator.onActiveTabChanged.add(() => {
      syncThemeEditing(creator);
    });
    creator.themeEditor.onAllowModifyTheme.add((_, options) => {
      options.allow = customRef.current;
    });
    const themeModified = () => {
      if (!customRef.current) return;
      themeChanges.current.made += 1;
      setUnsaved("theme", true);
    };
    creator.themeEditor.onThemeSelected.add(themeModified);
    creator.themeEditor.onThemePropertyChanged.add(themeModified);
    creator.saveThemeFunc = (
      saveNo: number,
      callback: (saveNo: number, success: boolean) => void,
    ) => {
      if (!customRef.current) {
        callback(saveNo, true);
        return;
      }
      persistTheme(
        structuredClone(creator.themeEditor.getCurrentTheme()),
        saveNo,
        callback,
      );
    };
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

  // Serialize theme writes so a slow earlier save cannot overwrite a newer choice.
  function persistTheme(
    value: ITheme | null,
    saveNo?: number,
    callback?: (saveNo: number, success: boolean) => void,
  ) {
    const revision = themeChanges.current.made;
    themeQueue.current = themeQueue.current.then(async () => {
      const result = await saveDraftTheme(formId, value).catch(
        (): DraftSaveResult => ({ error: "forms.errorGeneric" }),
      );
      if (result.error === null) {
        themeChanges.current.saved = revision;
        setUnsaved("theme", themeChanges.current.made > revision);
      }
      setThemeFailed(result.error !== null);
      if (callback && saveNo !== undefined)
        callback(saveNo, result.error === null);
      onSavedRef.current(result);
    });
  }

  function syncThemeEditing(editor: SurveyCreator) {
    if (editor.activeTab !== "theme") {
      editor.readOnly = false;
      return;
    }
    editor.readOnly = !customRef.current;
    // SurveyJS leaves theme selection and import enabled in read-only mode.
    editor.themeEditor.propertyGrid.survey.mode = customRef.current
      ? "edit"
      : "display";
    const importAction = editor.toolbar.getActionById("svc-theme-import");
    if (importAction) importAction.enabled = customRef.current;
  }

  function chooseTheme(next: boolean) {
    if (next === customRef.current) return;
    // The inherited appearance is the same Default Light used by the embed.
    const value = next ? structuredClone(creator.theme) : null;
    customRef.current = next;
    setCustom(next);
    // Reload the Theme tab through public APIs: setting creator.theme while
    // it is active does not refresh SurveyJS's theme editor or its preview.
    const reopenTheme = creator.activeTab === "theme";
    if (reopenTheme) creator.activeTab = "designer";
    creator.theme = structuredClone(value ?? globalTheme ?? DefaultLight);
    if (reopenTheme) creator.activeTab = "theme";
    syncThemeEditing(creator);
    themeChanges.current.made += 1;
    setUnsaved("theme", true);
    persistTheme(value);
  }

  // Leaving the page before the last change is saved would lose it.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        changes.current.made > changes.current.saved ||
        themeChanges.current.made > themeChanges.current.saved
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Group p="sm" gap="sm">
        <Select
          label={t("forms.themeChoice")}
          description={t(
            custom ? "forms.themeCustomHint" : "forms.themeInheritHint",
          )}
          value={custom ? "custom" : "inherit"}
          onChange={(value) => chooseTheme(value === "custom")}
          data={[
            { value: "inherit", label: t("forms.themeInherit") },
            { value: "custom", label: t("forms.themeCustom") },
          ]}
        />
        {themeFailed && (
          <div role="alert">
            <FormError>{t("forms.themeSaveFailed")}</FormError>
          </div>
        )}
        {themeFailed && (
          <Button
            size="xs"
            variant="default"
            onClick={() =>
              persistTheme(
                customRef.current ? structuredClone(creator.theme) : null,
              )
            }
          >
            {t("forms.themeRetry")}
          </Button>
        )}
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SurveyCreatorComponent creator={creator} />
      </div>
    </div>
  );
}
