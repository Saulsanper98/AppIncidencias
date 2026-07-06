import { cn } from "@/lib/utils";

/** Fade sutil al entrar en login (z44 #383). */
export default function LoginTemplate({ children }: { children: React.ReactNode }) {
  return <div className={cn("ccmgc-page-enter min-h-0 flex-1")}>{children}</div>;
}
