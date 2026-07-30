"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { cn } from "@/lib/utils";

export type MentionUser = {
  id: string;
  name: string;
  role?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
};

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type Props = {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
};

const ROLE_SHORT: Record<string, string> = {
  gestor_centro_control: "Gestor",
  tecnico_campo: "Técnico",
  conductor: "Conductor",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const MentionList = forwardRef<MentionListRef, Props>(function MentionList(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) command({ id: item.id, label: item.name });
        return true;
      }
      if (event.key === "Escape") {
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="b-log-editor__suggest">
        <p className="px-3 py-2.5 text-xs text-[var(--color-text-3)]">
          Sin coincidencias. Escribe más letras del nombre.
        </p>
      </div>
    );
  }

  return (
    <div className="b-log-editor__suggest" role="listbox" aria-label="Mencionar usuario">
      {items.map((item, index) => {
        const roleLabel = item.role ? ROLE_SHORT[item.role] ?? item.role : null;
        const sub = [roleLabel, item.position].filter(Boolean).join(" · ");
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            className={cn(
              "b-log-editor__suggest-item",
              index === selectedIndex && "is-active",
            )}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              command({ id: item.id, label: item.name });
            }}
          >
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatarUrl}
                alt=""
                className="b-log-editor__suggest-avatar b-log-editor__suggest-avatar--img"
              />
            ) : (
              <span className="b-log-editor__suggest-avatar">{initials(item.name)}</span>
            )}
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-medium">{item.name}</span>
              {sub ? <span className="b-log-editor__suggest-sub truncate">{sub}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
});
