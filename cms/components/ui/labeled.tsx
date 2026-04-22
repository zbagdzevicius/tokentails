import { PropsWithChildren } from 'react';

export function Labeled({
  label,
  children
}: PropsWithChildren<{ label: string }>) {
  return (
    <div>
      <div className="text-lg font-bold font-primary">{label}</div>
      {children}
    </div>
  );
}
