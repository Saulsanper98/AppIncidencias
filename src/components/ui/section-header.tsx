import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-heading">{title}</h2>
          {description ? <p className="mt-1 text-body">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
