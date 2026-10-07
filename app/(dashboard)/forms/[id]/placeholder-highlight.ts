import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";
import { findPlaceholders } from "@/lib/shared/notification.ts";

type PlaceholderHighlightOptions = {
  /** Read on every redraw, so it may change; then dispatch a `refresh`. */
  isKnown: (name: string) => boolean;
  knownClass: string;
  unknownClass: string;
  unknownTitle: string;
};

const key = new PluginKey<DecorationSet>("placeholderHighlight");

/** Redraws the highlights, e.g. after the known placeholders changed. */
export function refreshPlaceholderHighlight(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(key, true));
}

/**
 * Marks every `{{ placeholder }}` in the body, those the renderer does not
 * know differently, so a misspelt or deleted question stands out. Only a
 * decoration: the stored HTML keeps the placeholder as plain text.
 */
export const PlaceholderHighlight =
  Extension.create<PlaceholderHighlightOptions>({
    name: "placeholderHighlight",

    addOptions() {
      return {
        isKnown: () => true,
        knownClass: "",
        unknownClass: "",
        unknownTitle: "",
      };
    },

    addProseMirrorPlugins() {
      const options = this.options;
      return [
        new Plugin({
          key,
          state: {
            init: (_, state) => decorate(state.doc, options),
            apply: (tr, decorations) =>
              tr.docChanged || tr.getMeta(key)
                ? decorate(tr.doc, options)
                : decorations,
          },
          props: {
            decorations: (state) => key.getState(state),
          },
        }),
      ];
    },
  });

function decorate(
  doc: Node,
  options: PlaceholderHighlightOptions,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    // Search the block's text, mapping each character back to its document
    // position and its text node. A placeholder spanning text nodes has
    // formatting inside, which the stored HTML breaks it with, so the
    // renderer won't fill it: flag it.
    let text = "";
    const positions: number[] = [];
    const nodes: number[] = [];
    block.forEach((child, offset, childIndex) => {
      const start = blockPos + 1 + offset;
      const childText = child.isText ? (child.text ?? "") : "￼";
      for (let i = 0; i < childText.length; i++) {
        positions.push(start + i);
        nodes.push(childIndex);
      }
      text += childText;
    });
    for (const { index, length, name } of findPlaceholders(text)) {
      const known =
        nodes[index] === nodes[index + length - 1] && options.isKnown(name);
      decorations.push(
        Decoration.inline(
          positions[index],
          positions[index + length - 1] + 1,
          // Names are no words to spell-check.
          known
            ? { class: options.knownClass, spellcheck: "false" }
            : {
                class: options.unknownClass,
                title: options.unknownTitle,
                spellcheck: "false",
              },
        ),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}
