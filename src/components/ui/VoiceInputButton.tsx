"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Botón de dictado por voz reutilizable.
 *
 * Wrapper minimal sobre la Web Speech API (`SpeechRecognition`/
 * `webkitSpeechRecognition`). Si el navegador no la soporta, el botón se
 * oculta para no llamar la atención sobre una función no disponible.
 *
 * Al detectar texto, llama a `onTranscript(text)` con el resultado
 * acumulado (interim + final). El padre decide si lo añade al campo o
 * lo sustituye — para el caso normal (textarea de comentarios o
 * descripción), recomendamos appendear con un espacio:
 *
 *   <VoiceInputButton onTranscript={(t) => setValue((v) => `${v} ${t}`.trim())} />
 *
 * Idioma por defecto `es-ES`; configurable vía prop.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type Props = {
  onTranscript: (text: string) => void;
  language?: string;
  className?: string;
  size?: "sm" | "md";
  /** Cuando es true, el botón anuncia "escribiendo por voz…". */
  showHint?: boolean;
};

export function VoiceInputButton({
  onTranscript,
  language = "es-ES",
  className,
  size = "sm",
  showHint = false,
}: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognizer = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(Boolean(Recognizer));
  }, []);

  const start = () => {
    if (typeof window === "undefined") return;
    const Recognizer = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let text = "";
      const results = event.results;
      for (let i = 0; i < results.length; i++) {
        const alt = results[i][0];
        if (alt && alt.transcript) text += alt.transcript;
      }
      onTranscript(text.trim());
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      // Algunos navegadores arrojan InvalidStateError si ya hay un recognition activo.
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  if (supported === null || supported === false) return null;

  const sizeClass = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const iconSize = size === "md" ? 14 : 12;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-pressed={listening}
      title={listening ? "Detener dictado" : "Dictar por voz"}
      aria-label={listening ? "Detener dictado" : "Dictar por voz"}
      className={cn(
        "inline-flex items-center justify-center rounded-md border transition-colors",
        sizeClass,
        listening
          ? "animate-pulse border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
        className,
      )}
    >
      {listening ? <MicOff size={iconSize} aria-hidden /> : <Mic size={iconSize} aria-hidden />}
      {showHint ? (
        <span className="ml-1 text-[10px]">{listening ? "Escuchando…" : "Voz"}</span>
      ) : null}
    </button>
  );
}
