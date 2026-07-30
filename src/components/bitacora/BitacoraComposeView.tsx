"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Moon, Send, Sunrise, Sunset } from "lucide-react";
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
const SHIFT_ICONS = { M: Sunrise, T: Sunset, N: Moon } as const;

function parseKindParam(raw: string | null): BitacoraKind | null {
  if (raw === "nota" || raw === "alerta" || raw === "pendiente") return raw;
  return null;
}

export function BitacoraComposeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kindFromUrl = parseKindParam(searchParams.get("kind"));
  const activeShift = currentShiftNow();
  const ShiftIcon = SHIFT_ICONS[activeShift];

  const [composeKind, setComposeKind] = useState<BitacoraKind>(kindFromUrl ?? "nota");
  const [composeTitle, setComposeTitle] = useState("");
  const [composePinned, setComposePinned] = useState(false);
  const [shiftDate, setShiftDate] = useState(todayYmd);
  const [shift, setShift] = useState<ShiftKey>(activeShift);
  const [composeContent, setComposeContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (kindFromUrl) setComposeKind(kindFromUrl);
  }, [kindFromUrl]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      // Si venimos con ?kind= desde dashboard/atajo, no pisamos el tipo con el borrador.
      const preferUrlKind = Boolean(kindFromUrl);
      const d = JSON.parse(raw) as {
        composeKind?: BitacoraKind;
        composeTitle?: string;
        composePinned?: boolean;
        shiftDate?: string;
        shift?: ShiftKey;
        composeContent?: JSONContent;
      };
      if (!preferUrlKind && d.composeKind) setComposeKind(d.composeKind);
      if (typeof d.composeTitle === "string") setComposeTitle(d.composeTitle);
      if (typeof d.composePinned === "boolean") setComposePinned(d.composePinned);
      if (d.shiftDate) setShiftDate(d.shiftDate);
      if (d.shift) setShift(d.shift);
      if (d.composeContent) setComposeContent(d.composeContent);
      setHasDraft(true);
    } catch {
      /* ignore */
    }
    // Solo hidratar borrador al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className="b-log-compose__top">
            <div className="min-w-0">
              <p className="b-log-compose__eyebrow">Nueva entrada</p>
              <p className="b-log-compose__shift" title="Turno en curso">
                <ShiftIcon size={13} strokeWidth={2} aria-hidden />
                {SHIFT_LABEL[activeShift]} · {shiftWindowLabel(activeShift)}
              </p>
            </div>
            <BitacoraKindSegment
              value={composeKind}
              onChange={setComposeKind}
              className="b-log-compose__kinds"
            />
          </div>

          <Input
            value={composeTitle}
            onChange={(e) => setComposeTitle(e.target.value)}
            placeholder="Título opcional (ej. Bus 1234 sin SAE)"
            maxLength={160}
            className="b-log-input b-log-compose__title-input"
            aria-label="Título de la entrada"
          />
          <p className="b-log-compose__hint">{COMPOSE_KIND_HINTS[composeKind]}</p>

          <div className="b-log-compose__meta-row">
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
              className="b-log-input b-log-compose__shift-select"
              aria-label="Turno"
            >
              <option value="M">Mañana (M)</option>
              <option value="T">Tarde (T)</option>
              <option value="N">Noche (N)</option>
            </Select>
          </div>
        </header>

        <div className="b-log-compose__editor">
          <TipTapEditor
            value={composeContent}
            onChange={setComposeContent}
            placeholder="Escribe la nota… Usa @ para mencionar o Vincular para un ticket, bus o desvío."
            minHeight="16rem"
            autoFocus
            variant="embedded"
          />
        </div>

        {error ? <p className="b-log-alert b-log-alert--error">{error}</p> : null}

        <footer className="b-log-compose__footer b-log-compose__footer-sticky">
          <div className="b-log-compose__footer-inner">
            <div className="b-log-compose__footer-meta">
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
              className="b-log-compose__publish"
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
