import { Suspense } from "react";

import { LoginAmbientShell } from "@/app/login/login-ambient-shell";
import { LoginBrandStage } from "@/app/login/login-brand-stage";
import { LoginCardFooter } from "@/app/login/login-card-footer";
import { LoginBrandMotion, LoginCardMotion } from "@/app/login/login-card-shell";
import { LoginDebugGrid } from "@/app/login/login-debug-grid";
import { AccessGateway } from "@/components/access-gateway";
import { LoginFormSkeleton } from "@/components/ui/view-skeletons";

export default function LoginPage() {
  const guestTicketsUrl = process.env.NEXT_PUBLIC_GUEST_TICKETS_URL ?? null;

  return (
    <LoginAmbientShell>
      <Suspense fallback={null}>
        <LoginDebugGrid />
      </Suspense>

      <LoginBrandMotion>
        <LoginBrandStage />
      </LoginBrandMotion>

      <LoginCardMotion>
        <div className="login-access-plane">
          <div className="login-access-plane__inner">
            <Suspense fallback={<LoginFormSkeleton />}>
              <AccessGateway guestTicketsUrl={guestTicketsUrl} />
            </Suspense>
            <LoginCardFooter />
          </div>
        </div>
      </LoginCardMotion>
    </LoginAmbientShell>
  );
}
