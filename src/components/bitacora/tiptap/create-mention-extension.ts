import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { RefObject } from "react";
import type { SuggestionOptions } from "@tiptap/suggestion";

import {
  MentionList,
  type MentionListRef,
  type MentionUser,
} from "@/components/bitacora/tiptap/MentionList";

function updatePosition(element: HTMLElement, clientRect?: (() => DOMRect | null) | null) {
  const rect = clientRect?.();
  if (!rect) return;
  element.style.position = "fixed";
  element.style.left = `${Math.max(8, rect.left)}px`;
  element.style.top = `${rect.bottom + 6}px`;
  element.style.zIndex = "900";
  element.style.pointerEvents = "auto";
}

export function createMentionSuggestion(
  usersRef: RefObject<MentionUser[]>,
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "@",
    allowSpaces: false,
    items: ({ query }) => {
      const q = query.toLowerCase();
      return (usersRef.current ?? [])
        .filter((u) => u.name.toLowerCase().includes(q))
        .slice(0, 8);
    },
    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null;
      let element: HTMLElement | null = null;

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          element = renderer.element as HTMLElement;
          element.classList.add("b-log-editor__suggest-portal");
          document.body.appendChild(element);
          updatePosition(element, props.clientRect);
        },
        onUpdate(props) {
          renderer?.updateProps(props);
          if (element) updatePosition(element, props.clientRect);
        },
        onKeyDown(props) {
          if (props.event.key === "Escape") return true;
          return renderer?.ref?.onKeyDown(props) ?? false;
        },
        onExit() {
          renderer?.destroy();
          element?.remove();
          renderer = null;
          element = null;
        },
      };
    },
  };
}

export function createBitacoraMentionExtension(usersRef: RefObject<MentionUser[]>) {
  return Mention.configure({
    HTMLAttributes: {
      class: "b-log-editor__mention",
      "data-mention": "",
    },
    deleteTriggerWithBackspace: true,
    suggestion: createMentionSuggestion(usersRef),
  });
}
