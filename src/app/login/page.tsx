import { Suspense } from "react";

import { LoginAmbientShell } from "@/app/login/login-ambient-shell";
import { LoginCardFooter } from "@/app/login/login-card-footer";
import { LoginCardMotion } from "@/app/login/login-card-shell";
import { LoginDebugGrid } from "@/app/login/login-debug-grid";
import { LoginHero } from "@/app/login/login-hero";
import { AccessGateway } from "@/components/access-gateway";
import { Card } from "@/components/ui/card";
import { LoginFormSkeleton } from "@/components/ui/view-skeletons";

export default function LoginPage() {
  const guestTicketsUrl = process.env.NEXT_PUBLIC_GUEST_TICKETS_URL ?? null;

  return (
    <LoginAmbientShell>
      <Suspense fallback={null}>
        <LoginDebugGrid />
      </Suspense>
      <LoginCardMotion>
        <div className="login-card-glow login-card-responsive-width w-full">
          <Card className="login-card-shell login-card-premium login-card-elevation login-card-surface-transition w-full border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
            <LoginHero />
            <Suspense fallback={<LoginFormSkeleton />}>
              <AccessGateway guestTicketsUrl={guestTicketsUrl} />
            </Suspense>
            <LoginCardFooter />
          </Card>
        </div>
      </LoginCardMotion>
    </LoginAmbientShell>
  );
}
