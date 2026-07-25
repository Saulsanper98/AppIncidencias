import { LoginAmbientShell } from "@/app/login/login-ambient-shell";
import { LoginCardMotion } from "@/app/login/login-card-shell";
import { LoginFormSkeleton } from "@/components/ui/view-skeletons";
import { Card } from "@/components/ui/card";

export default function LoginLoading() {
  return (
    <LoginAmbientShell>
      <LoginCardMotion>
        <div className="login-card-glow login-card-responsive-width w-full">
          <Card className="login-card-shell login-card-premium login-card-elevation login-card-surface-transition w-full border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
            <div
              className="mb-5 space-y-3 ccmgc-stagger-in ccmgc-stagger-in-1"
              aria-hidden
            >
              <div className="flex items-start gap-4">
                <div className="h-9 w-[7rem] shrink-0 rounded-md bg-[var(--color-border)]/35" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-6 w-28 rounded-full bg-[var(--color-border)]/30" />
                  <div className="h-7 w-3/4 max-w-[14rem] rounded bg-[var(--color-border)]/35" />
                  <div className="h-4 w-full max-w-[18rem] rounded bg-[var(--color-border)]/25" />
                </div>
              </div>
              <div className="login-divider-gradient" />
            </div>
            <div className="ccmgc-stagger-in ccmgc-stagger-in-2">
              <LoginFormSkeleton />
            </div>
          </Card>
        </div>
      </LoginCardMotion>
    </LoginAmbientShell>
  );
}
