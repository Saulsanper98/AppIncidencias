"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { toast } from "@/components/toast-host";
import {
  isSpeechRecognitionAvailable,
  isVoiceInputSecureContext,
  voiceInsecureDescription,
  VOICE_INSECURE_MESSAGE,
} from "@/lib/voice-input-context";
import { cn } from "@/lib/utils";

/**
 * Botón de dictado por voz (Web Speech API).
 * Requiere HTTPS en IPs de red local; en HTTP el navegador bloquea el micrófono.
 */

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const HTTPS_PORT =
  typeof process.env.NEXT_PUBLIC_HTTPS_PORT === "string" && process.env.NEXT_PUBLIC_HTTPS_PORT
    ? process.env.NEXT_PUBLIC_HTTPS_PORT
    : "3443";

const SPEECH_ERROR_MESSAGES: Record<string, { message: string; description?: string }> = {
  "not-allowed": {
    message: "Micrófono bloqueado por el navegador.",
    description:
      "En Chrome: pulsa el candado junto a la URL → Configuración del sitio → Micrófono → Permitir. Si entras por http://IP, usa la URL HTTPS.",
  },
  "service-not-allowed": {
    message: "Dictado no permitido en este sitio.",
    description: "Comprueba que entras por HTTPS y que el micrófono está permitido para este dominio.",
  },
  "audio-capture": {
    message: "No se detecta ningún micrófono.",
    description: "Conecta un micrófono o revisa Configuración de Windows → Privacidad → Micrófono.",
  },
  network: {
    message: "El dictado necesita conexión a internet.",
    description: "Chrome envía el audio a su servicio de reconocimiento; sin red no funciona.",
  },
};

type VoiceAvailability = "loading" | "ready" | "unsupported" | "insecure";

type Props = {
  onTranscript: (text: string) => void;
  language?: string;
  className?: string;
  size?: "sm" | "md";
  showHint?: boolean;
};

export function VoiceInputButton({
  onTranscript,
  language = "es-ES",
  className,
  size = "sm",
  showHint = false,
}: Props) {
  const [availability, setAvailability] = useState<VoiceAvailability>("loading");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantsListeningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastErrorToastAtRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const showVoiceError = useCallback((message: string, description?: string) => {
    const now = Date.now();
    if (now - lastErrorToastAtRef.current < 2500) return;
    lastErrorToastAtRef.current = now;
    toast.error(message, description ? { description, duration: 8000 } : { duration: 6000 });
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const teardownRecognition = useCallback((recognition: SpeechRecognitionLike) => {
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try {
      recognition.abort();
    } catch {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stop = useCallback(() => {
    wantsListeningRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      teardownRecognition(recognition);
      recognitionRef.current = null;
    }
    setListening(false);
  }, [clearRestartTimer, teardownRecognition]);

  const beginRecognition = useCallback(() => {
    if (typeof window === "undefined" || !wantsListeningRef.current) return;
    if (recognitionRef.current) return;

    const Recognizer = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognizer) return;

    const recognition = new Recognizer();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i];
        if (chunk?.isFinal && chunk[0]?.transcript) {
          finalText += chunk[0].transcript;
        }
      }
      const trimmed = finalText.trim();
      if (trimmed) onTranscriptRef.current(trimmed);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!wantsListeningRef.current) {
        setListening(false);
        return;
      }
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!wantsListeningRef.current) {
          setListening(false);
          return;
        }
        try {
          beginRecognition();
        } catch {
          wantsListeningRef.current = false;
          setListening(false);
          showVoiceError("No se pudo reiniciar el dictado por voz.");
        }
      }, 150);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      wantsListeningRef.current = false;
      clearRestartTimer();
      recognitionRef.current = null;
      setListening(false);
      const mapped = SPEECH_ERROR_MESSAGES[event.error];
      if (mapped) showVoiceError(mapped.message, mapped.description);
      else showVoiceError("No se pudo usar el dictado por voz.");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }, [clearRestartTimer, language, showVoiceError]);

  const start = useCallback(() => {
    if (wantsListeningRef.current || recognitionRef.current) return;

    if (!isVoiceInputSecureContext()) {
      showVoiceError(VOICE_INSECURE_MESSAGE, voiceInsecureDescription(HTTPS_PORT));
      return;
    }

    wantsListeningRef.current = true;
    try {
      beginRecognition();
    } catch {
      wantsListeningRef.current = false;
      setListening(false);
      showVoiceError("No se pudo iniciar el dictado por voz.");
    }
  }, [beginRecognition, showVoiceError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSpeechRecognitionAvailable()) {
      setAvailability("unsupported");
      return;
    }
    if (!isVoiceInputSecureContext()) {
      setAvailability("insecure");
      return;
    }
    setAvailability("ready");
    return () => {
      stop();
    };
  }, [stop]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (availability === "insecure") {
      showVoiceError(VOICE_INSECURE_MESSAGE, voiceInsecureDescription(HTTPS_PORT));
      return;
    }
    if (listening || wantsListeningRef.current) stop();
    else start();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (availability === "loading" || availability === "unsupported") return null;

  const sizeClass = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const iconSize = size === "md" ? 14 : 12;
  const insecure = availability === "insecure";

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      aria-pressed={listening}
      title={
        insecure
          ? "Dictado requiere HTTPS (pulsa para ver cómo activarlo)"
          : listening
            ? "Detener dictado"
            : "Dictar por voz"
      }
      aria-label={
        insecure
          ? "Dictado por voz no disponible en HTTP"
          : listening
            ? "Detener dictado"
            : "Dictar por voz"
      }
      className={cn(
        "inline-flex items-center justify-center rounded-md border transition-colors",
        sizeClass,
        insecure
          ? "border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-[var(--color-text-3)] opacity-80"
          : listening
            ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/25"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
        className,
      )}
    >
      {listening ? <MicOff size={iconSize} aria-hidden /> : <Mic size={iconSize} aria-hidden />}
      {showHint ? (
        <span className="ml-1 text-[10px]">{listening ? "Escuchando…" : insecure ? "HTTPS" : "Voz"}</span>
      ) : null}
    </button>
  );
}
