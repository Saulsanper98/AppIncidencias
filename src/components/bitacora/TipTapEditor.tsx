"use client";

import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AtSign,
  Bold,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Ticket,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BitacoraEntityPicker, type EntityPick } from "@/components/bitacora/tiptap/BitacoraEntityPicker";
import { BitacoraLinkPopover } from "@/components/bitacora/tiptap/BitacoraLinkPopover";
import { AtomicBitacoraChips } from "@/components/bitacora/tiptap/atomic-bitacora-chips";
import { createBitacoraMentionExtension } from "@/components/bitacora/tiptap/create-mention-extension";
import type { MentionUser } from "@/components/bitacora/tiptap/MentionList";
import { cn } from "@/lib/utils";

export const EMPTY_TIPTAP_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function isTipTapDocEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc?.content?.length) return true;
  const text = JSON.stringify(doc);
  return text === JSON.stringify(EMPTY_TIPTAP_DOC) || !text.replace(/[^\w]/g, "").length;
}

const BitacoraLink = Link.extend({
  inclusive: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute("class"),
        renderHTML: (attributes) => (attributes.class ? { class: attributes.class as string } : {}),
      },
      "data-link-kind": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-link-kind"),
        renderHTML: (attributes) =>
          attributes["data-link-kind"]
            ? { "data-link-kind": attributes["data-link-kind"] as string }
            : {},
      },
    };
  },
});

type Props = {
  value?: JSONContent | null;
  onChange?: (json: JSONContent) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  autoFocus?: boolean;
  minHeight?: string;
  variant?: "default" | "embedded";
};

function ToolbarButton({
  active,
  onClick,
  title,
  children,
  disabled,
  buttonRef,
}: {
  active?: boolean;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "b-log-editor__tool",
        active && "is-active",
        disabled && "is-disabled",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarLabelButton({
  onClick,
  title,
  icon: Icon,
  label,
  active,
  buttonRef,
}: {
  onClick?: () => void;
  title: string;
  icon: typeof AtSign;
  label: string;
  active?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn("b-log-editor__tool-label", active && "is-active")}
    >
      <Icon size={14} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export function TipTapEditor({
  value,
  onChange,
  placeholder = "Escribe lo que el próximo turno debe saber… Usa @ para mencionar.",
  className,
  editable = true,
  autoFocus = false,
  minHeight = "7rem",
  variant = "default",
}: Props) {
  const usersRef = useRef<MentionUser[]>([]);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const skipExternalSyncRef = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);

  useEffect(() => {
    if (!editable) return;
    void (async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          users: {
            id: string;
            name: string;
            role?: string;
            position?: string | null;
            avatarUrl?: string | null;
          }[];
        };
        usersRef.current = (data.users ?? []).map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role ?? null,
          position: u.position ?? null,
          avatarUrl: u.avatarUrl ?? null,
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [editable]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      BitacoraLink.configure({
        openOnClick: !editable,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: "b-log-editor__link" },
      }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      createBitacoraMentionExtension(usersRef),
      AtomicBitacoraChips,
    ],
    [placeholder, editable],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: value ?? EMPTY_TIPTAP_DOC,
    editorProps: {
      attributes: {
        class: "b-log-editor__surface outline-none",
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      skipExternalSyncRef.current = true;
      onChange?.(ed.getJSON());
    },
  });

  useEffect(() => {
    if (!editor || value === undefined) return;
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value ?? EMPTY_TIPTAP_DOC);
    if (current !== next) {
      editor.commands.setContent(value ?? EMPTY_TIPTAP_DOC, { emitUpdate: false });
    }
  }, [editor, value]);

  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (editor && autoFocus && !didAutoFocusRef.current) {
      didAutoFocusRef.current = true;
      editor.commands.focus("end");
    }
  }, [editor, autoFocus]);

  const insertEntity = useCallback(
    (entity: EntityPick) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: entity.href,
                  class: `b-log-editor__entity b-log-editor__entity--${entity.kind}`,
                  "data-link-kind": entity.kind,
                  target: "_self",
                },
              },
            ],
            text: entity.kind === "ticket" ? entity.label.split(" · ")[0] || entity.label : entity.label,
          },
          { type: "text", text: " " },
        ])
        .unsetMark("link")
        .run();
    },
    [editor],
  );

  const applyLink = useCallback(
    (url: string) => {
      if (!editor) return;
      if (!url) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              marks: [{ type: "link", attrs: { href: url, class: "b-log-editor__link" } }],
              text: url,
            },
            { type: "text", text: " " },
          ])
          .unsetMark("link")
          .run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: url, class: "b-log-editor__link" })
          .unsetMark("link")
          .run();
      }
      setLinkOpen(false);
    },
    [editor],
  );

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }, [editor]);

  if (!editor) return null;

  const prevHref = editor.getAttributes("link").href as string | undefined;

  return (
    <div
      className={cn(
        "b-log-editor",
        variant === "embedded" && "b-log-editor--embedded",
        !editable && "b-log-editor--readonly",
        className,
      )}
    >
      {editable ? (
        <div className="b-log-editor__toolbar" role="toolbar" aria-label="Formato de texto">
          <div className="b-log-editor__toolbar-row">
            <ToolbarButton
              title="Negrita"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              title="Cursiva"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              title="Resaltar"
              active={editor.isActive("highlight")}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
            >
              <Highlighter size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              title="Título (H2)"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <span className="b-log-editor__sep" aria-hidden />
            <ToolbarButton
              title="Lista con viñetas"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              title="Lista numerada"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              title="Lista de tareas"
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              <ListChecks size={15} strokeWidth={2} aria-hidden />
            </ToolbarButton>
          </div>
          <div className="b-log-editor__toolbar-row b-log-editor__toolbar-row--insert">
            <ToolbarLabelButton
              title="Mencionar compañero (@)"
              icon={AtSign}
              label="Mencionar"
              onClick={() => editor.chain().focus().insertContent("@").run()}
            />
            <ToolbarLabelButton
              title="Vincular ticket, desvío, KB o bus"
              icon={Ticket}
              label="Vincular"
              onClick={() => setEntityOpen(true)}
            />
            <ToolbarLabelButton
              buttonRef={linkBtnRef}
              title="Enlace web externo"
              icon={Link2}
              label="URL"
              active={editor.isActive("link")}
              onClick={() => setLinkOpen(true)}
            />
            {editor.isActive("link") ? (
              <ToolbarButton title="Quitar enlace" onClick={removeLink}>
                <Unlink size={15} strokeWidth={2} aria-hidden />
              </ToolbarButton>
            ) : null}
          </div>
        </div>
      ) : null}
      <EditorContent editor={editor} />

      {editable ? (
        <>
          <BitacoraLinkPopover
            open={linkOpen}
            anchorRef={linkBtnRef}
            initialUrl={prevHref ?? ""}
            onClose={() => setLinkOpen(false)}
            onApply={applyLink}
            onRemove={editor.isActive("link") ? removeLink : undefined}
          />
          <BitacoraEntityPicker open={entityOpen} onClose={() => setEntityOpen(false)} onSelect={insertEntity} />
        </>
      ) : null}
    </div>
  );
}

/** Solo lectura — reutiliza el mismo render TipTap sin toolbar. */
export function TipTapContent({ content, className }: { content: JSONContent; className?: string }) {
  return (
    <TipTapEditor
      value={content}
      editable={false}
      className={className}
      minHeight="0"
    />
  );
}

export function getEditorJson(editor: ReturnType<typeof useEditor>): JSONContent {
  return editor?.getJSON() ?? EMPTY_TIPTAP_DOC;
}
