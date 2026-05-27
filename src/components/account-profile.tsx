"use client";

import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Pencil,
  Trash2,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveAccountImageUrl } from "@/lib/account-media";
import type { UserRole } from "@/lib/domain";

type InitialUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  position: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  passwordUpdatedAt: string | null;
  mustChangePassword: boolean;
};

type ImageKind = "avatar" | "banner";

type Feedback = { kind: "ok"; message: string } | { kind: "error"; message: string } | null;

const ROLE_LABEL: Record<UserRole, string> = {
  conductor: "Conductor",
  tecnico_campo: "Técnico de campo",
  gestor_centro_control: "Gestor del centro de control",
};

const MAX_FILE_MB = 8;
const ACCEPT_MIME = "image/png,image/jpeg,image/jpg,image/gif,image/webp";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AccountProfile({ initialUser }: { initialUser: InitialUser }) {
  const router = useRouter();
  const [user, setUser] = useState<InitialUser>(initialUser);
  const [form, setForm] = useState({
    name: initialUser.name ?? "",
    position: initialUser.position ?? "",
    bio: initialUser.bio ?? "",
    phone: initialUser.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [uploading, setUploading] = useState<{ avatar: boolean; banner: boolean }>({
    avatar: false,
    banner: false,
  });
  const [urlEditor, setUrlEditor] = useState<ImageKind | null>(null);
  const [urlInput, setUrlInput] = useState("");

  const avatarFileInput = useRef<HTMLInputElement | null>(null);
  const bannerFileInput = useRef<HTMLInputElement | null>(null);

  // El mensaje de éxito desaparece tras unos segundos para no quedarse colgado.
  useEffect(() => {
    if (feedback?.kind !== "ok") return;
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const initials = useMemo(() => initialsFromName(user.name || "?"), [user.name]);
  const positionLabel = (form.position || "").trim();

  const isDirty =
    form.name.trim() !== (user.name ?? "") ||
    (form.position.trim() || null) !== (user.position ?? null) ||
    (form.bio.trim() || null) !== (user.bio ?? null) ||
    (form.phone.trim() || null) !== (user.phone ?? null);

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isDirty || saving) return;
    if (form.name.trim().length === 0) {
      setFeedback({ kind: "error", message: "El nombre no puede estar vacío." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          position: form.position.trim() || null,
          bio: form.bio.trim() || null,
          phone: form.phone.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        user?: Partial<InitialUser>;
      };
      if (!response.ok) {
        setFeedback({ kind: "error", message: data.message ?? "No se pudo guardar." });
        return;
      }
      if (data.user) {
        setUser((prev) => ({
          ...prev,
          name: data.user!.name ?? prev.name,
          position: (data.user!.position as string | null | undefined) ?? null,
          bio: (data.user!.bio as string | null | undefined) ?? null,
          phone: (data.user!.phone as string | null | undefined) ?? null,
        }));
      }
      setFeedback({ kind: "ok", message: "Perfil actualizado." });
      // Refrescamos para que el header (que muestra el nombre) y la sidebar se actualicen.
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Error de red." });
    } finally {
      setSaving(false);
    }
  };

  const validateFile = (file: File): string | null => {
    if (!ACCEPT_MIME.split(",").includes(file.type)) {
      return "Formato no admitido. Usa GIF, PNG, JPG o WebP.";
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return `El archivo supera ${MAX_FILE_MB} MB.`;
    }
    return null;
  };

  const uploadFile = async (kind: ImageKind, file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setFeedback({ kind: "error", message: validationError });
      return;
    }
    setUploading((prev) => ({ ...prev, [kind]: true }));
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/account/${kind}`, { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string; message?: string };
      if (!response.ok || !data.url) {
        setFeedback({ kind: "error", message: data.message ?? "No se pudo subir el archivo." });
        return;
      }
      setUser((prev) => ({ ...prev, [kind === "avatar" ? "avatarUrl" : "bannerUrl"]: data.url ?? null }));
      setFeedback({ kind: "ok", message: kind === "avatar" ? "Avatar actualizado." : "Banner actualizado." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Error de red." });
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const setRemoteImage = async (kind: ImageKind, url: string | null) => {
    setUploading((prev) => ({ ...prev, [kind]: true }));
    setFeedback(null);
    try {
      const body = kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url };
      const response = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        user?: Partial<InitialUser>;
        issues?: { fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const fieldMsg = data.issues?.fieldErrors?.[kind === "avatar" ? "avatarUrl" : "bannerUrl"]?.[0];
        setFeedback({ kind: "error", message: fieldMsg ?? data.message ?? "No se pudo guardar la URL." });
        return;
      }
      setUser((prev) => ({ ...prev, [kind === "avatar" ? "avatarUrl" : "bannerUrl"]: url }));
      setFeedback({
        kind: "ok",
        message: url ? `${kind === "avatar" ? "Avatar" : "Banner"} actualizado.` : `${kind === "avatar" ? "Avatar" : "Banner"} quitado.`,
      });
      setUrlEditor(null);
      setUrlInput("");
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Error de red." });
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const openUrlEditor = (kind: ImageKind) => {
    setUrlEditor(kind);
    setUrlInput((kind === "avatar" ? user.avatarUrl : user.bannerUrl) ?? "");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* ============ CABECERA: BANNER + AVATAR + IDENTIDAD ============ */}
      <section
        className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
        aria-label="Cabecera del perfil"
      >
        <BannerArea
          url={resolveAccountImageUrl(user.bannerUrl)}
          uploading={uploading.banner}
          onPickFile={() => bannerFileInput.current?.click()}
          onOpenUrl={() => openUrlEditor("banner")}
          onRemove={user.bannerUrl ? () => setRemoteImage("banner", null) : null}
        />
        <input
          ref={bannerFileInput}
          type="file"
          accept={ACCEPT_MIME}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile("banner", file);
            event.target.value = "";
          }}
        />

        {/* Avatar superpuesto */}
        <div className="relative -mt-16 flex flex-col items-center px-4 pb-6 sm:-mt-20">
          <AvatarArea
            url={resolveAccountImageUrl(user.avatarUrl)}
            initials={initials}
            uploading={uploading.avatar}
            onPickFile={() => avatarFileInput.current?.click()}
            onOpenUrl={() => openUrlEditor("avatar")}
            onRemove={user.avatarUrl ? () => setRemoteImage("avatar", null) : null}
          />
          <input
            ref={avatarFileInput}
            type="file"
            accept={ACCEPT_MIME}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile("avatar", file);
              event.target.value = "";
            }}
          />
          <h1 className="mt-4 text-center text-2xl font-semibold text-[var(--color-text-1)]">{user.name}</h1>
          <p className="text-sm text-[var(--color-text-3)]">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-medium text-[var(--color-text-2)] ring-1 ring-inset ring-[var(--color-border)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
              {ROLE_LABEL[user.role]}
            </span>
            {positionLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-light)] px-3 py-1 text-xs font-medium text-[var(--color-accent)]">
                {positionLabel}
              </span>
            ) : null}
          </div>
          {user.bio ? (
            <p className="mt-3 max-w-md text-center text-sm text-[var(--color-text-2)]">{user.bio}</p>
          ) : null}
        </div>
      </section>

      {feedback ? (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={
            feedback.kind === "error"
              ? "flex items-start gap-2 rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]"
              : "flex items-start gap-2 rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success-light)] px-4 py-3 text-sm text-[var(--color-success)]"
          }
        >
          {feedback.kind === "error" ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-auto rounded p-0.5 text-current/70 hover:text-current"
            aria-label="Cerrar"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* ============ INFORMACIÓN + SEGURIDAD ============ */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form
          onSubmit={submitProfile}
          className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6"
          aria-label="Información personal"
        >
          <header className="mb-4 flex items-center gap-2">
            <UserCircle2 size={18} className="text-[var(--color-accent)]" aria-hidden />
            <h2 className="text-base font-semibold text-[var(--color-text-1)]">Información personal</h2>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" required>
              <input
                type="text"
                value={form.name}
                maxLength={80}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Correo (no editable)">
              <input type="email" value={user.email} disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
              <p className="mt-1 text-xs text-[var(--color-text-3)]">
                Sólo un gestor puede cambiar tu correo.
              </p>
            </Field>
            <Field label="Puesto / departamento">
              <input
                type="text"
                value={form.position}
                maxLength={60}
                placeholder="Ej. Sistemas"
                onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Teléfono de contacto">
              <input
                type="tel"
                value={form.phone}
                maxLength={30}
                placeholder="Ej. +34 600 000 000"
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Biografía corta" className="sm:col-span-2">
              <textarea
                value={form.bio}
                maxLength={280}
                rows={3}
                placeholder="Una frase que te describa."
                onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1 text-right text-xs text-[var(--color-text-3)]">
                {form.bio.length}/280
              </p>
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setForm({
                  name: user.name ?? "",
                  position: user.position ?? "",
                  bio: user.bio ?? "",
                  phone: user.phone ?? "",
                })
              }
              disabled={!isDirty || saving}
            >
              Descartar
            </Button>
            <Button type="submit" disabled={!isDirty || saving}>
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…
                </span>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </div>
        </form>

        <aside
          className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6"
          aria-label="Seguridad y sesión"
        >
          <header className="flex items-center gap-2">
            <KeyRound size={18} className="text-[var(--color-accent)]" aria-hidden />
            <h2 className="text-base font-semibold text-[var(--color-text-1)]">Seguridad</h2>
          </header>

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <InfoRow label="Último cambio de contraseña" value={formatDate(user.passwordUpdatedAt)} />
            <InfoRow label="Último inicio de sesión" value={formatDate(user.lastLoginAt)} />
            {user.mustChangePassword ? (
              <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] px-3 py-2 text-xs text-[var(--color-warning)]">
                Tu contraseña es temporal. Cámbiala lo antes posible.
              </div>
            ) : null}
          </dl>

          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/account/cambiar-password")}
          >
            <span className="inline-flex items-center gap-2">
              <KeyRound size={14} aria-hidden /> Cambiar contraseña
            </span>
          </Button>

          <div className="mt-auto border-t border-[var(--color-border)] pt-4">
            <Button type="button" variant="ghost" onClick={handleLogout} className="w-full">
              <span className="inline-flex items-center justify-center gap-2">
                <LogOut size={14} aria-hidden /> Cerrar sesión
              </span>
            </Button>
          </div>
        </aside>
      </div>

      {/* ============ PREVIEW EN LA LISTA ============ */}
      <section
        className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6"
        aria-label="Vista previa en la lista de usuarios"
      >
        <header className="mb-3 flex items-center gap-2">
          <ImageIcon size={18} className="text-[var(--color-accent)]" aria-hidden />
          <h2 className="text-base font-semibold text-[var(--color-text-1)]">Así te verán los demás</h2>
        </header>
        <p className="mb-4 text-xs text-[var(--color-text-3)]">
          Vista previa en la barra lateral y en la lista de usuarios.
        </p>
        <div className="flex flex-wrap items-stretch gap-3">
          <PreviewCard user={{ ...user, name: form.name || user.name, position: form.position || user.position }} variant="sidebar" />
          <PreviewCard user={{ ...user, name: form.name || user.name, position: form.position || user.position }} variant="list" />
        </div>
      </section>

      {/* ============ DIÁLOGO URL EXTERNA ============ */}
      {urlEditor ? (
        <UrlEditorDialog
          kind={urlEditor}
          value={urlInput}
          onChange={setUrlInput}
          onCancel={() => {
            setUrlEditor(null);
            setUrlInput("");
          }}
          onSave={() => setRemoteImage(urlEditor, urlInput.trim() || null)}
          loading={uploading[urlEditor]}
        />
      ) : null}
    </div>
  );
}

/* ----------------------- Sub-componentes UI ----------------------- */

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] focus:border-[color-mix(in_oklab,var(--color-accent)_60%,var(--color-border))] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-3)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--color-error)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-text-3)]">{label}</dt>
      <dd className="text-sm text-[var(--color-text-1)]">{value}</dd>
    </div>
  );
}

function BannerArea({
  url,
  uploading,
  onPickFile,
  onOpenUrl,
  onRemove,
}: {
  url: string | null;
  uploading: boolean;
  onPickFile: () => void;
  onOpenUrl: () => void;
  onRemove: (() => void) | null;
}) {
  return (
    <div className="relative h-48 w-full sm:h-60">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Banner del perfil" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-[var(--color-accent)]/40 via-[var(--color-surface-3)] to-[var(--color-surface-2)]" />
      )}
      {/* Gradiente para legibilidad de los botones */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/40 to-transparent" />

      <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <BannerAction onClick={onPickFile} disabled={uploading} icon={<Upload size={13} />} label="Subir imagen" />
        <BannerAction onClick={onOpenUrl} disabled={uploading} icon={<LinkIcon size={13} />} label="URL" />
        {onRemove ? (
          <BannerAction
            onClick={onRemove}
            disabled={uploading}
            icon={<Trash2 size={13} />}
            label="Quitar"
            tone="danger"
          />
        ) : null}
      </div>
      {uploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Loader2 className="size-6 animate-spin text-white" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

function BannerAction({
  onClick,
  disabled,
  icon,
  label,
  tone = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        tone === "danger"
          ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-rose-100 backdrop-blur transition hover:border-rose-300/60 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {icon}
      {label}
    </button>
  );
}

function AvatarArea({
  url,
  initials,
  uploading,
  onPickFile,
  onOpenUrl,
  onRemove,
}: {
  url: string | null;
  initials: string;
  uploading: boolean;
  onPickFile: () => void;
  onOpenUrl: () => void;
  onRemove: (() => void) | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="rounded-full bg-gradient-to-br from-fuchsia-500 via-amber-300 to-cyan-400 p-[3px] shadow-xl">
          <div className="rounded-full bg-[var(--color-surface)] p-1">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Avatar"
                className="h-28 w-28 rounded-full object-cover sm:h-32 sm:w-32"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-2xl font-semibold text-[var(--color-accent)] sm:h-32 sm:w-32">
                {initials}
              </div>
            )}
          </div>
        </div>
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Loader2 className="size-6 animate-spin text-white" aria-hidden />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onPickFile}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-2)] transition hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pencil size={12} aria-hidden /> Cambiar foto
        </button>
        <button
          type="button"
          onClick={onOpenUrl}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-2)] transition hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LinkIcon size={12} aria-hidden /> URL
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-400/50 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={12} aria-hidden /> Quitar
          </button>
        ) : null}
      </div>
      <p className="max-w-xs text-center text-xs text-[var(--color-text-3)]">
        Acepta GIF animado · PNG · JPG · WebP · hasta {MAX_FILE_MB} MB
      </p>
    </div>
  );
}

function PreviewCard({
  user,
  variant,
}: {
  user: Pick<InitialUser, "name" | "email" | "avatarUrl" | "bannerUrl" | "position" | "role">;
  variant: "sidebar" | "list";
}) {
  const initials = initialsFromName(user.name || "?");
  const avatarSrc = resolveAccountImageUrl(user.avatarUrl);
  const bannerSrc = resolveAccountImageUrl(user.bannerUrl);
  if (variant === "sidebar") {
    return (
      <div className="flex min-w-[16rem] flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
          Barra lateral
        </span>
        <div className="flex items-center gap-2">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={user.name}
              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-xs font-semibold text-[var(--color-accent)]">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs text-[var(--color-text-1)]">{user.name}</p>
            <p className="truncate text-xs text-[var(--color-text-3)]">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-[18rem] flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <div className="relative h-12 w-full">
        {bannerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-[var(--color-accent)]/40 to-[var(--color-surface-3)]" />
        )}
      </div>
      <div className="flex items-center gap-3 px-3 pb-3 pt-1">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={user.name}
            className="-mt-7 h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[var(--color-surface-2)]"
          />
        ) : (
          <div className="-mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-sm font-semibold text-[var(--color-accent)] ring-2 ring-[var(--color-surface-2)]">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{user.name}</p>
          <p className="truncate text-xs text-[var(--color-text-3)]">{user.email}</p>
          {user.position ? (
            <p className="truncate text-xs text-[var(--color-accent)]">{user.position}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UrlEditorDialog({
  kind,
  value,
  onChange,
  onSave,
  onCancel,
  loading,
}: {
  kind: ImageKind;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="url-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="url-editor-title" className="text-base font-semibold text-[var(--color-text-1)]">
            Usar URL externa para {kind === "avatar" ? "el avatar" : "el banner"}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            aria-label="Cerrar"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--color-text-3)]">
          Pega el enlace público de una imagen o GIF (https://…). Déjalo vacío para usar sólo lo que subas.
        </p>
        <input
          type="url"
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
          className={inputClass}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…
              </span>
            ) : (
              "Aplicar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
