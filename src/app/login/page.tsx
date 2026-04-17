import { Suspense } from "react";

import { LoginAmbientShell } from "@/app/login/login-ambient-shell";
import { LoginCardFooter } from "@/app/login/login-card-footer";
import { LoginCardMotion } from "@/app/login/login-card-shell";
import { LoginDebugGrid } from "@/app/login/login-debug-grid";
import { LoginHero } from "@/app/login/login-hero";
import { AccessGateway } from "@/components/access-gateway";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const guestTicketsUrl = process.env.NEXT_PUBLIC_GUEST_TICKETS_URL ?? null;

  return (
    <LoginAmbientShell>
      <Suspense fallback={null}>
        <LoginDebugGrid />
      </Suspense>
      <LoginCardMotion>
        <Card className="login-card-shell login-card-elevation login-card-responsive-width login-card-surface-transition w-full border border-white/[0.1] bg-[var(--color-surface)]/95 p-8 ring-1 ring-white/[0.06] backdrop-blur-sm motion-reduce:hover:transform-none sm:p-10">
          <LoginHero />
          <Suspense
            fallback={
              <div
                className="h-28 rounded-xl bg-[var(--color-surface-2)]/80 motion-safe:animate-pulse motion-reduce:animate-none"
                aria-hidden
              />
            }
          >
            <AccessGateway guestTicketsUrl={guestTicketsUrl} />
          </Suspense>
          <LoginCardFooter />
        </Card>
      </LoginCardMotion>
    </LoginAmbientShell>
  );
}
