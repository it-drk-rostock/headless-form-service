"use client";

import "@mantine/tiptap/styles.css";
import {
  Alert,
  Box,
  Button,
  Code,
  Group,
  Input,
  Menu,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { Link, RichTextEditor } from "@mantine/tiptap";
import {
  IconAlertTriangle,
  IconBraces,
  IconInfoCircle,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type DraftSaveResult,
  saveEmailTemplate,
} from "@/lib/forms/actions.ts";
import {
  DEFAULT_STANDARD_BODY,
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_SUBJECT_MAX_LENGTH,
} from "@/lib/forms/email-template.ts";
import { t } from "@/lib/i18n/index.ts";
import {
  ANSWERS_TABLE,
  answerPlaceholders,
  type EmailTemplate,
  type EmailTemplateMode,
  FORM_NAME,
  fitsSubject,
  isEmailTemplateMode,
  knownPlaceholders,
  passKey,
  placeholderText,
  SUBMITTED_AT,
  standardLayoutHtml,
  unknownPlaceholders,
} from "@/lib/shared/notification.ts";
import { FormError } from "../../../_components/FormError.tsx";
import { DraftSavedStatus, useDraftStatus } from "./DraftStatus.tsx";
import { EmailPreview } from "./EmailPreview.tsx";
import classes from "./EmailTemplateEditor.module.css";
import {
  PlaceholderHighlight,
  refreshPlaceholderHighlight,
} from "./placeholder-highlight.ts";

/** How long typing pauses before the template is saved. */
const SAVE_DELAY_MS = 800;
/** How long a save that failed for no fault of the template waits to retry. */
const RETRY_DELAY_MS = 5000;

/**
 * The email editor (blueprint §5.2): the subject and the body of the draft's
 * email template, with the draft's questions to insert as placeholders and a
 * preview through the shared renderer. The body is the Standard Layout's,
 * edited visually, or a Custom HTML Template's whole email, edited as code.
 * Every change is saved shortly after it is made; concurrent saves are
 * last-write-wins. Reopens on the draft that restoring or discarding left.
 */
export function EmailTemplateEditor({
  formId,
  formName,
  initialTemplate,
  passPlaceholders,
}: {
  formId: string;
  formName: string;
  initialTemplate: EmailTemplate;
  /**
   * For a protected form, the `{{pass.<key>}}` placeholders its passes'
   * metadata has, to offer (ticket 28); null for a public form, whose
   * submissions come without a form pass.
   */
  passPlaceholders: string[] | null;
}) {
  const { reset } = useDraftStatus();
  return (
    <TemplateEditor
      key={reset.resetCount}
      formId={formId}
      formName={formName}
      initialTemplate={reset.draft?.emailTemplate ?? initialTemplate}
      passPlaceholders={passPlaceholders}
    />
  );
}

function TemplateEditor({
  formId,
  formName,
  initialTemplate,
  passPlaceholders,
}: {
  formId: string;
  formName: string;
  initialTemplate: EmailTemplate;
  passPlaceholders: string[] | null;
}) {
  const { schema, setStamp, setUnsaved, setEmailTemplate } = useDraftStatus();
  const [mode, setMode] = useState(initialTemplate.mode);
  const [subject, setSubject] = useState(initialTemplate.subject);
  const [body, setBody] = useState(initialTemplate.body);
  const [result, setResult] = useState<DraftSaveResult | null>(null);
  const [confirmingStandard, setConfirmingStandard] = useState(false);
  const template: EmailTemplate = { mode, subject, body };
  const withPasses = passPlaceholders !== null;
  const unknown = unknownPlaceholders(template, schema, withPasses);

  // Where *Platzhalter einfügen* inserts: the field last focused, and the
  // cursor in the subject or the HTML when it left it.
  const target = useRef<"subject" | "body">("body");
  const subjectInput = useRef<HTMLInputElement>(null);
  const subjectCursor = useRef<number | null>(null);
  const htmlInput = useRef<HTMLTextAreaElement>(null);
  const htmlCursor = useRef<number | null>(null);
  // Set when an insert moved the cursor, which writing the value resets.
  const restoreHtmlCursor = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the inserted HTML is written.
  useLayoutEffect(() => {
    if (!restoreHtmlCursor.current || htmlCursor.current === null) return;
    restoreHtmlCursor.current = false;
    htmlInput.current?.setSelectionRange(
      htmlCursor.current,
      htmlCursor.current,
    );
  }, [body]);

  // The placeholders the body highlights as known, read by the editor's
  // decorations on every redraw.
  const known = useRef(knownPlaceholders(schema, withPasses));

  // Changes made, and the last of them a successful save covered.
  const changes = useRef({ made: 0, saved: 0 });
  const latest = useRef(template);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function change(next: EmailTemplate) {
    latest.current = next;
    changes.current.made += 1;
    setUnsaved("emailTemplate", true);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
  }

  async function save() {
    const changesAtSave = changes.current.made;
    const saving = latest.current;
    const saved = await saveEmailTemplate(formId, saving).catch(
      (): DraftSaveResult => ({ error: "forms.errorGeneric" }),
    );
    setResult(saved);
    if (saved.error === null) {
      setEmailTemplate(saving);
      changes.current.saved = Math.max(changes.current.saved, changesAtSave);
      setStamp(saved.stamp);
      setUnsaved("emailTemplate", changes.current.made > changes.current.saved);
    } else if (
      saved.error === "forms.errorGeneric" &&
      changesAtSave === changes.current.made
    ) {
      // A passing failure: try again, unless a newer change already will.
      // Other errors need the person to change the template.
      timer.current = setTimeout(save, RETRY_DELAY_MS);
    }
  }

  const editor = useEditor({
    // Rendered on the server too, so no content before hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Mantine's own Link below; the rest has no place in an email.
        link: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        strike: false,
      }),
      Link.configure({ openOnClick: false }),
      PlaceholderHighlight.configure({
        isKnown: (name) => known.current.has(name),
        knownClass: classes.known,
        unknownClass: classes.unknown,
        unknownTitle: t("forms.emailUnknownTitle"),
      }),
    ],
    // A Custom HTML Template is no Standard Layout body. While the HTML is
    // edited, the editor keeps the Standard Layout body to switch back to.
    content:
      initialTemplate.mode === "standard"
        ? initialTemplate.body
        : DEFAULT_STANDARD_BODY,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setBody(html);
      change({ ...latest.current, body: html });
    },
    onFocus: () => {
      target.current = "body";
    },
  });

  // The designer may add or rename questions while this view stays open,
  // and saving the settings, which refreshes the page, may make the form
  // protected or public.
  useEffect(() => {
    known.current = knownPlaceholders(schema, withPasses);
    if (editor) refreshPlaceholderHighlight(editor.view);
  }, [schema, withPasses, editor]);

  // Leaving the page before the last change is saved would lose it.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (changes.current.made > changes.current.saved) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function changeSubject(next: string) {
    setSubject(next);
    change({ ...latest.current, subject: next });
  }

  function changeHtml(next: string) {
    setBody(next);
    change({ ...latest.current, body: next });
  }

  function switchMode(next: EmailTemplateMode) {
    if (next === mode) return;
    if (next === "standard") {
      // It discards the HTML, so it asks first.
      setConfirmingStandard(true);
      return;
    }
    // The HTML starts as the email the Standard Layout sends.
    htmlCursor.current = null;
    applyMode("custom", standardLayoutHtml(body));
  }

  function switchToStandard() {
    setConfirmingStandard(false);
    applyMode("standard", editor?.getHTML() ?? DEFAULT_STANDARD_BODY);
  }

  function applyMode(next: EmailTemplateMode, nextBody: string) {
    setMode(next);
    setBody(nextBody);
    target.current = "body";
    change({ ...latest.current, mode: next, body: nextBody });
  }

  function insert(name: string) {
    const placeholder = placeholderText(name);
    if (target.current === "subject" && fitsSubject(name)) {
      const at = subjectCursor.current ?? subject.length;
      changeSubject(subject.slice(0, at) + placeholder + subject.slice(at));
      subjectCursor.current = at + placeholder.length;
      subjectInput.current?.focus();
      return;
    }
    if (mode === "custom") {
      // The author's HTML: the answers table goes wherever they put it.
      const at = htmlCursor.current ?? body.length;
      const after = at + placeholder.length;
      changeHtml(body.slice(0, at) + placeholder + body.slice(at));
      htmlCursor.current = after;
      restoreHtmlCursor.current = true;
      htmlInput.current?.focus();
      return;
    }
    if (!editor) return;
    if (name === ANSWERS_TABLE) {
      // A block of its own: the renderer puts the table in its place.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [{ type: "text", text: placeholder }],
        })
        .run();
    } else {
      // As text, so a question name is never read as HTML.
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: placeholder })
        .run();
    }
  }

  return (
    <Box mt="xl">
      <Group justify="space-between" align="center" mb="sm" gap="xs">
        <Alert
          variant="outline"
          color="gray"
          icon={<IconInfoCircle size={16} stroke={1.5} />}
          py={6}
        >
          <Text fz={13}>{t("forms.emailHint")}</Text>
        </Alert>
        <DraftSavedStatus />
      </Group>
      {result?.error && (
        <Box mb="sm">
          <FormError>
            {t(result.error, {
              max:
                result.error === "forms.errorEmailBodyTooLong"
                  ? EMAIL_BODY_MAX_LENGTH
                  : EMAIL_SUBJECT_MAX_LENGTH,
            })}
          </FormError>
        </Box>
      )}

      <Modal
        opened={confirmingStandard}
        onClose={() => setConfirmingStandard(false)}
        title={t("forms.emailSwitchStandardTitle")}
        closeButtonProps={{ "aria-label": t("forms.close") }}
        centered
      >
        <Stack gap="sm">
          <Text fz="sm">{t("forms.emailSwitchStandardText")}</Text>
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button
              variant="default"
              onClick={() => setConfirmingStandard(false)}
            >
              {t("forms.cancel")}
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} stroke={1.5} />}
              onClick={switchToStandard}
            >
              {t("forms.emailSwitchStandardSubmit")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
        <Stack gap="md">
          <Input.Wrapper
            label={t("forms.emailMode")}
            description={t(
              mode === "standard"
                ? "forms.emailModeStandardHint"
                : "forms.emailModeCustomHint",
            )}
          >
            <SegmentedControl
              display="flex"
              w="fit-content"
              mt={4}
              value={mode}
              onChange={(value) => {
                if (isEmailTemplateMode(value)) switchMode(value);
              }}
              data={[
                { value: "standard", label: t("forms.emailModeStandard") },
                { value: "custom", label: t("forms.emailModeCustom") },
              ]}
            />
          </Input.Wrapper>

          <TextInput
            ref={subjectInput}
            label={t("forms.emailSubject")}
            description={t("forms.emailSubjectHint", {
              max: EMAIL_SUBJECT_MAX_LENGTH,
            })}
            value={subject}
            maxLength={EMAIL_SUBJECT_MAX_LENGTH}
            // Orange like unknown placeholders in the body: attention, not
            // an error (ui-design §2.3).
            classNames={{
              input: unknown.subject.length > 0 ? classes.unknownInput : "",
            }}
            onChange={(event) => {
              subjectCursor.current = event.currentTarget.selectionStart;
              changeSubject(event.currentTarget.value);
            }}
            onFocus={() => {
              target.current = "subject";
            }}
            onSelect={(event) => {
              subjectCursor.current = event.currentTarget.selectionStart;
            }}
          />

          {mode === "custom" && (
            <Input.Wrapper
              label={t("forms.emailHtml")}
              description={t("forms.emailHtmlHint")}
            >
              <Group justify="flex-end" mt={4} mb={6}>
                <PlaceholderMenu
                  schema={schema}
                  passPlaceholders={passPlaceholders}
                  onInsert={insert}
                />
              </Group>
              <Textarea
                ref={htmlInput}
                aria-label={t("forms.emailHtml")}
                value={body}
                maxLength={EMAIL_BODY_MAX_LENGTH}
                autosize
                minRows={16}
                maxRows={32}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                // Orange like the subject when it has unknown placeholders.
                classNames={{
                  input: `${classes.htmlInput} ${unknown.body.length > 0 ? classes.unknownInput : ""}`,
                }}
                onChange={(event) => {
                  htmlCursor.current = event.currentTarget.selectionStart;
                  changeHtml(event.currentTarget.value);
                }}
                onFocus={() => {
                  target.current = "body";
                }}
                onSelect={(event) => {
                  htmlCursor.current = event.currentTarget.selectionStart;
                }}
              />
            </Input.Wrapper>
          )}

          {/* Hidden, not unmounted, for Custom HTML: it keeps the Standard
              Layout body to switch back to. */}
          <Input.Wrapper
            label={t("forms.emailBody")}
            description={t("forms.emailBodyHint")}
            display={mode === "standard" ? undefined : "none"}
          >
            <RichTextEditor editor={editor} labels={editorLabels()} mt={4}>
              <RichTextEditor.Toolbar>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Bold />
                  <RichTextEditor.Italic />
                  <RichTextEditor.Underline />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.H2 />
                  <RichTextEditor.H3 />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.BulletList />
                  <RichTextEditor.OrderedList />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Link />
                  <RichTextEditor.Unlink />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Hr />
                  <RichTextEditor.Control
                    onClick={() => {
                      target.current = "body";
                      insert(ANSWERS_TABLE);
                    }}
                    aria-label={t("forms.emailAnswersTable")}
                    title={t("forms.emailAnswersTable")}
                  >
                    <IconTable size={16} stroke={1.5} />
                  </RichTextEditor.Control>
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Undo />
                  <RichTextEditor.Redo />
                </RichTextEditor.ControlsGroup>
                <PlaceholderMenu
                  schema={schema}
                  passPlaceholders={passPlaceholders}
                  onInsert={insert}
                />
              </RichTextEditor.Toolbar>
              <RichTextEditor.Content className={classes.content} />
            </RichTextEditor>
          </Input.Wrapper>

          {(unknown.subject.length > 0 || unknown.body.length > 0) && (
            <Alert
              variant="light"
              color="orange"
              icon={<IconAlertTriangle size={16} stroke={1.5} />}
              title={t("forms.emailUnknownTitle")}
            >
              <Stack gap={6}>
                <Text fz={13}>{t("forms.emailUnknownHint")}</Text>
                <UnknownList
                  label={t("forms.emailUnknownSubject")}
                  names={unknown.subject}
                />
                <UnknownList
                  label={t("forms.emailUnknownBody")}
                  names={unknown.body}
                />
              </Stack>
            </Alert>
          )}
        </Stack>

        <EmailPreview
          template={template}
          formName={formName}
          schema={schema}
          withPasses={withPasses}
        />
      </SimpleGrid>
    </Box>
  );
}

/**
 * *Platzhalter einfügen*: the answer of every question of the draft, then
 * the form's name, the time of submission and the answers table, and for a
 * protected form the pass metadata its passes have.
 */
function PlaceholderMenu({
  schema,
  passPlaceholders,
  onInsert,
}: {
  schema: unknown;
  passPlaceholders: string[] | null;
  onInsert: (name: string) => void;
}) {
  const questions = answerPlaceholders(schema);
  const item = (name: string, label: string) => (
    <Menu.Item key={name} onClick={() => onInsert(name)}>
      <Text fz={13}>{label}</Text>
      <Text fz={11} c="gray.6" ff="monospace">
        {placeholderText(name)}
      </Text>
    </Menu.Item>
  );

  return (
    <Menu position="bottom-end" width={300} shadow="md">
      <Menu.Target>
        <Button
          size="compact-xs"
          variant="default"
          ml="auto"
          leftSection={<IconBraces size={14} stroke={1.5} />}
          // Keeps the cursor where it is in the body or the subject.
          onMouseDown={(event) => event.preventDefault()}
        >
          {t("forms.emailInsert")}
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah={420} style={{ overflowY: "auto" }}>
        <Menu.Label>{t("forms.emailInsertQuestions")}</Menu.Label>
        {questions.length === 0 ? (
          <Text fz={13} c="gray.6" px="sm" py={6}>
            {t("forms.emailInsertNoQuestions")}
          </Text>
        ) : (
          questions.map(({ name, title }) => item(name, title))
        )}
        <Menu.Divider />
        <Menu.Label>{t("forms.emailInsertGeneral")}</Menu.Label>
        {item(FORM_NAME, t("forms.emailPlaceholderFormName"))}
        {item(SUBMITTED_AT, t("forms.emailPlaceholderSubmittedAt"))}
        {item(ANSWERS_TABLE, t("forms.emailPlaceholderAnswersTable"))}
        {passPlaceholders !== null && (
          <>
            <Menu.Divider />
            <Menu.Label>{t("forms.emailInsertPass")}</Menu.Label>
            {passPlaceholders.length === 0 ? (
              <Text fz={13} c="gray.6" px="sm" py={6}>
                {t("forms.emailInsertNoPassKeys")}
              </Text>
            ) : (
              passPlaceholders.map((name) => item(name, passKey(name) ?? name))
            )}
            <Text fz={11} c="gray.6" px="sm" py={6}>
              {t("forms.emailInsertPassHint")}
            </Text>
          </>
        )}
        <Menu.Divider />
        <Text fz={11} c="gray.6" px="sm" py={6}>
          {t("forms.emailInsertHint")}
        </Text>
      </Menu.Dropdown>
    </Menu>
  );
}

function UnknownList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <Group gap={6}>
      <Text fz={13} fw={500}>
        {label}
      </Text>
      {names.map((name) => (
        <Code key={name}>{placeholderText(name)}</Code>
      ))}
    </Group>
  );
}

function editorLabels() {
  return {
    boldControlLabel: t("editor.bold"),
    italicControlLabel: t("editor.italic"),
    underlineControlLabel: t("editor.underline"),
    h2ControlLabel: t("editor.h2"),
    h3ControlLabel: t("editor.h3"),
    bulletListControlLabel: t("editor.bulletList"),
    orderedListControlLabel: t("editor.orderedList"),
    linkControlLabel: t("editor.link"),
    unlinkControlLabel: t("editor.unlink"),
    hrControlLabel: t("editor.hr"),
    undoControlLabel: t("editor.undo"),
    redoControlLabel: t("editor.redo"),
    linkEditorInputLabel: t("editor.linkUrl"),
    linkEditorInputPlaceholder: t("editor.linkExample"),
    linkEditorExternalLink: t("editor.linkExternal"),
    linkEditorInternalLink: t("editor.linkInternal"),
    linkEditorSave: t("editor.linkSave"),
  };
}
