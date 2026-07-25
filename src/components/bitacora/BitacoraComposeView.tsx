"use client";

import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import {
  EMPTY_TIPTAP_DOC,
  isTipTapDocEmpty,
  TipTapEditor,
} from "@/components/bitacora/TipTapEditor";
import {
  BitacoraKindSegment,
  BitacoraPageShell,
  BitacoraPinToggle,
} from "@/components/bitacora/BitacoraUi";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input, Select } from "@/components/ui/input";
import { COMPOSE_KIND_HINTS, type BitacoraKind } from "@/lib/bitacora-shared";
import {
  currentShiftNow,
  SHIFT_LABEL,
  shiftWindowLabel,
  todayYmd,
  type ShiftKey,
} from "@/lib/shift-utils";

const DRAFT_KEY = "ccmgc_bitacora_compose_v1";

export function BitacoraComposeView() {
  const router = useRouter();
  const activeShift = currentShiftNow();

  const [composeKind, setComposeKind] = useState<BitacoraKind>("nota");
  const [composeTitle, setComposeTitle] = useState("");
  const [composePinned, setComposePinned] = useState(false);
  const [shiftDate, setShiftDate] = useState(todayYmd);
  const [shift, setShift] = useState<ShiftKey>(activeShift);
  const [composeContent, setComposeContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        composeKind?: BitacoraKind;
        composeTitle?: string;
        composePinned?: boolean;
        shiftDate?: string;
        shift?: ShiftKey;
        composeContent?: JSONContent;
      };
      if (d.composeKind) setComposeKind(d.composeKind);
      if (typeof d.composeTitle === "string") setComposeTitle(d.composeTitle);
      if (typeof d.composePinned === "boolean") setComposePinned(d.composePinned);
      if (d.shiftDate) setShiftDate(d.shiftDate);
      if (d.shift) setShift(d.shift);
      if (d.composeContent) setComposeContent(d.composeContent);
      setHasDraft(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ composeKind, composeTitle, composePinned, shiftDate, shift, composeContent }),
      );
      if (!isTipTapDocEmpty(composeContent) || composeTitle.trim()) {
        setHasDraft(true);
      }
    } catch {
      /* ignore */
    }
  }, [composeKind, composeTitle, composePinned, shiftDate, shift, composeContent]);

  const canPost = !isTipTapDocEmpty(composeContent);

  const publish = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/bitacora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftDate,
          shift,
          kind: composeKind,
          title: composeTitle.trim() || null,
          contentJson: composeContent,
          pinned: composePinned,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo publicar");
      }
      const data = (await res.json()) as { entry: { id: string } };
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/bitacora/${data.entry.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al publicar");
    } finally {
      setPosting(false);
    }
  };

  return (
    <BitacoraPageShell className="max-w-[720px]" showSectionTabs>
      <div className="b-log-compose">
        <header className="b-log-compose__header">
          <div className="min-w-0 flex-1">
            <p className="b-log-compose__eyebrow">Nueva entrada</p>
            <Input
              value={composeTitle}
              onChange={(e) => setComposeTitle(e.target.value)}
              placeholder="Título opcional (ej. Bus 1234 sin SAE)"
              maxLength={160}
              className="b-log-input b-log-compose__title-input mt-2"
              aria-label="Título de la entrada"
            />
            <p className="b-log-compose__hint mt-2">{COMPOSE_KIND_HINTS[composeKind]}</p>
            <p className="b-log-compose__hint mt-1 opacity-80">
              {SHIFT_LABEL[activeShift]} en curso · {shiftWindowLabel(activeShift)}
            </p>
          </div>
          <BitacoraKindSegment value={composeKind} onChange={setComposeKind} className="shrink-0" />
        </header>

        <div className="b-log-compose__meta-row">
          <div className="b-log-compose__meta-row-sub">
            <DatePickerField
              compact
              value={shiftDate}
              onChange={setShiftDate}
              className="b-log-compose__date"
              ariaLabel="Fecha del turno"
            />
            <Select
              size="compact"
              value={shift}
              onChange={(e) => setShift(e.target.value as ShiftKey)}
              className="b-log-input"
              aria-label="Turno"
            >
              <option value="M">Mañana (M)</option>
              <option value="T">Tarde (T)</option>
              <option value="N">Noche (N)</option>
            </Select>
          </div>
        </div>

        <div className="b-log-compose__editor">
          <TipTapEditor
            value={composeContent}
            onChange={setComposeContent}
            placeholder="Escribe lo que el próximo turno debe saber… Usa @ para mencionar."
            minHeight="18rem"
            autoFocus
            variant="embedded"
          />
        </div>

        {error ? <p className="b-log-alert b-log-alert--error">{error}</p> : null}

        <footer className="b-log-compose__footer b-log-compose__footer-sticky">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <BitacoraPinToggle checked={composePinned} onChange={setComposePinned} id="compose-pin" />
              {hasDraft ? (
                <p className="b-log-compose__draft-note">Borrador guardado en esta sesión</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={posting}
              startIcon={!posting ? <Send size={16} strokeWidth={2} aria-hidden /> : undefined}
              disabled={!canPost || posting}
              className="h-11 min-w-[200px] shrink-0 sm:w-auto"
              onClick={() => void publish()}
            >
              Publicar en bitácora
            </Button>
          </div>
        </footer>
      </div>
    </BitacoraPageShell>
  );
}
