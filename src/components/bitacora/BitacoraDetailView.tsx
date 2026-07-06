"use client";

import { useRouter } from "next/navigation";
import { Pin, PinOff, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BitacoraEntryCrumbSync } from "@/components/bitacora/BitacoraEntryCrumbSync";
import {
  isTipTapDocEmpty,
  TipTapContent,
  TipTapEditor,
} from "@/components/bitacora/TipTapEditor";
import {
  BitacoraInlineSpinner,
  BitacoraKindSegment,
  BitacoraPageShell,
  BitacoraPinToggle,
} from "@/components/bitacora/BitacoraUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import type { SessionUser } from "@/lib/domain";
import {
  entryDisplayTitle,
  formatBitacoraDate,
  formatShiftDateHuman,
  initials,
  KIND_META,
  SHIFT_ICON,
  type BitacoraEntry,
  type BitacoraKind,
} from "@/lib/bitacora-shared";
import { formatRelativeShort, SHIFT_LABEL } from "@/lib/shift-utils";
import { cn } from "@/lib/utils";

type Props = {
  entry: BitacoraEntry;
};

export function BitacoraDetailView({ entry: initialEntry }: Props) {
  const router = useRouter();
  const [entry, setEntry] = useState(initialEntry);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title ?? "");
  const [editKind, setEditKind] = useState<BitacoraKind>(entry.kind);
  const [editPinned, setEditPinned] = useState(entry.pinned);
  const [editContent, setEditContent] = useState(entry.contentJson);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = KIND_META[entry.kind];
  const KindIcon = meta.icon;
  const ShiftIco = SHIFT_ICON[entry.shift];
  const title = entryDisplayTitle(entry);
  const mine = entry.authorId === sessionUser?.id;
  const canModify = mine || sessionUser?.role === "gestor_centro_control";

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { authenticated: boolean; user?: SessionUser };
          if (data.authenticated && data.user) setSessionUser(data.user);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const togglePin = async () => {
    if (pinning) return;
    setPinning(true);
    try {
      const res = await fetch(`/api/bitacora/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !entry.pinned }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
      const data = (await res.json()) as { entry: BitacoraEntry };
      setEntry(data.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setPinning(false);
    }
  };

  const saveEdit = async () => {
    if (saving || isTipTapDocEmpty(editContent)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bitacora/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: editKind,
          title: editTitle.trim() || null,
          contentJson: editContent,
          pinned: editPinned,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo guardar");
      }
      const data = (await res.json()) as { entry: BitacoraEntry };
      setEntry(data.entry);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bitacora/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      router.push("/bitacora");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const openEdit = () => {
    setEditTitle(entry.title ?? "");
    setEditKind(entry.kind);
    setEditPinned(entry.pinned);
    setEditContent(entry.contentJson);
    setEditing(true);
  };

  return (
    <BitacoraPageShell className="max-w-[720px]" showSectionTabs>
      <BitacoraEntryCrumbSync entry={entry} />

      <article className={cn("b-log-read", entry.kind)}>
        <header className="b-log-read__header">
          <div className="b-log-read__header-top">
            <ul className="b-log-read__tags" aria-label="Metadatos">
              <li className={cn("b-log-read__tag", entry.kind)}>
                <KindIcon size={12} strokeWidth={2.25} aria-hidden />
                {meta.label}
              </li>
              <li className="b-log-read__tag b-log-read__tag--muted">
                <ShiftIco size={12} strokeWidth={2} aria-hidden />
                {SHIFT_LABEL[entry.shift]}
              </li>
              <li className="b-log-read__tag b-log-read__tag--muted">
                {formatShiftDateHuman(entry.shiftDate)}
              </li>
              {entry.pinned ? (
                <li className="b-log-read__tag b-log-read__tag--pin">
                  <Pin size={11} aria-hidden />
                  Fijada
                </li>
              ) : null}
            </ul>

            {canModify ? (
              <div className="b-log-read__toolbar-wrap">
                <div className="b-log-read__toolbar" role="toolbar" aria-label="Acciones">
                  <button
                    type="button"
                    className={cn("b-log-read__tool", entry.pinned && "is-active")}
                    title={entry.pinned ? "Desfijar" : "Fijar arriba"}
                    disabled={pinning}
                    onClick={() => void togglePin()}
                  >
                    {pinning ? (
                      <BitacoraInlineSpinner />
                    ) : entry.pinned ? (
                      <PinOff size={16} strokeWidth={2} />
                    ) : (
                      <Pin size={16} strokeWidth={2} />
                    )}
                  </button>
                  <button type="button" className="b-log-read__tool" title="Editar" onClick={openEdit}>
                    <Pencil size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="b-log-read__tool b-log-read__tool--danger"
                    title="Eliminar"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <h1 className="b-log-read__title">{title}</h1>

          <div className="b-log-read__byline">
            <span className="b-log-read__avatar">{initials(entry.authorName)}</span>
            <span className="b-log-read__byline-text">
              <strong>{entry.authorName ?? "Anónimo"}</strong>
              <span aria-hidden> · </span>
              {formatBitacoraDate(entry.createdAt)}
              <span className="b-log-read__byline-rel">
                ({formatRelativeShort(Date.now() - new Date(entry.createdAt).getTime())})
              </span>
            </span>
          </div>
        </header>

        <div className="b-log-read__prose">
          <TipTapContent content={entry.contentJson} className="b-log-read__content" />
        </div>

        {entry.updatedAt !== entry.createdAt ? (
          <p className="b-log-read__footer-note">Editada · {formatBitacoraDate(entry.updatedAt)}</p>
        ) : null}
      </article>

      {error ? <p className="b-log-alert b-log-alert--error mt-4">{error}</p> : null}

      {editing ? (
        <ModalShell
          open
          onClose={() => setEditing(false)}
          size="lg"
          title="Editar entrada"
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={saving || isTipTapDocEmpty(editContent)}
                onClick={() => void saveEdit()}
              >
                {saving ? <BitacoraInlineSpinner /> : null}
                Guardar cambios
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            <BitacoraKindSegment value={editKind} onChange={setEditKind} size="sm" />
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título opcional"
              maxLength={160}
              className="b-log-input"
            />
            <TipTapEditor
              key={`edit-${entry.id}`}
              value={editContent}
              onChange={setEditContent}
              minHeight="14rem"
              autoFocus
              variant="embedded"
            />
            <BitacoraPinToggle checked={editPinned} onChange={setEditPinned} id="edit-pin" />
          </div>
        </ModalShell>
      ) : null}

      {confirmDelete ? (
        <ModalShell
          open
          onClose={() => setConfirmDelete(false)}
          size="sm"
          title="Eliminar entrada"
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={() => void deleteEntry()}
              >
                {deleting ? <BitacoraInlineSpinner /> : null}
                Eliminar
              </Button>
            </div>
          }
        >
          <p className="text-sm leading-relaxed text-[var(--color-text-2)]">
            Esta acción no se puede deshacer. La entrada desaparecerá del timeline del turno.
          </p>
        </ModalShell>
      ) : null}
    </BitacoraPageShell>
  );
}
