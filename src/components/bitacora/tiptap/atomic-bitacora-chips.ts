import { Extension, getMarkRange } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";

function isEntityLinkMark(mark: Mark | undefined | null): mark is Mark {
  return Boolean(mark && mark.type.name === "link" && mark.attrs?.["data-link-kind"]);
}

function entityMarkInSet(marks: readonly Mark[]): Mark | null {
  return marks.find((m) => isEntityLinkMark(m)) ?? null;
}

/**
 * Borra de golpe el chip de entidad (ticket/desvío/…) o la mención @
 * al pulsar Backspace/Delete sobre él, en vez de letra a letra.
 */
function deleteAtomicChip(editor: Editor, direction: "backward" | "forward"): boolean {
  const { state } = editor;
  const { selection, doc, schema } = state;
  const { empty, $from } = selection;
  if (!empty) return false;

  if (direction === "backward" && $from.nodeBefore?.type.name === "mention") {
    return editor
      .chain()
      .deleteRange({ from: $from.pos - $from.nodeBefore.nodeSize, to: $from.pos })
      .run();
  }
  if (direction === "forward" && $from.nodeAfter?.type.name === "mention") {
    return editor
      .chain()
      .deleteRange({ from: $from.pos, to: $from.pos + $from.nodeAfter.nodeSize })
      .run();
  }

  const linkType = schema.marks.link;
  if (!linkType) return false;

  let rangeMark: Mark | null = null;
  let insidePos = $from.pos;

  if (direction === "backward") {
    if ($from.pos === 0) return false;
    // Dentro del chip, o justo después (inclusive:false → nodeBefore lleva el mark).
    rangeMark =
      entityMarkInSet($from.marks()) ??
      ($from.nodeBefore?.isText ? entityMarkInSet($from.nodeBefore.marks) : null);
    insidePos = Math.max(0, $from.pos - 1);
  } else {
    if ($from.pos >= doc.content.size) return false;
    rangeMark =
      entityMarkInSet($from.marks()) ??
      ($from.nodeAfter?.isText ? entityMarkInSet($from.nodeAfter.marks) : null);
    insidePos = Math.min(doc.content.size, $from.pos + 1);
  }

  if (!rangeMark) return false;

  const range = getMarkRange(doc.resolve(insidePos), linkType, rangeMark.attrs);
  if (!range) return false;

  return editor.chain().focus().deleteRange(range).run();
}

export const AtomicBitacoraChips = Extension.create({
  name: "atomicBitacoraChips",

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => deleteAtomicChip(editor, "backward"),
      Delete: ({ editor }) => deleteAtomicChip(editor, "forward"),
    };
  },
});
