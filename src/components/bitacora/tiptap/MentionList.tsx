"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { cn } from "@/lib/utils";

export type MentionUser = { id: string; name: string };

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type Props = {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
};

export const MentionList = forwardRef<MentionListRef, Props>(function MentionList(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
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
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="b-log-editor__suggest">
        <p className="px-3 py-2 text-xs text-[var(--color-text-3)]">Sin coincidencias</p>
      </div>
    );
  }

  return (
    <div className="b-log-editor__suggest" role="listbox">
      {items.map((item, index) => (
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
          <span className="b-log-editor__suggest-avatar">
            {item.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("")}
          </span>
          <span className="truncate">{item.name}</span>
        </button>
      ))}
    </div>
  );
});
