import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const badgeClasses: Record<BadgeVariant, string> = {
  success: "ccmgc-badge ccmgc-badge--success",
  warning: "ccmgc-badge ccmgc-badge--warning",
  error: "ccmgc-badge ccmgc-badge--error",
  info: "ccmgc-badge ccmgc-badge--info",
  neutral: "ccmgc-badge",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn(badgeClasses[variant], className)} {...props} />;
}
