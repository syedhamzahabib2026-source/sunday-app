import { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export default function SetupSection({ title, children }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-semibold text-[#888888] uppercase tracking-[0.08em]">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
      <div className="pt-4 border-b border-[#2a2a2a]" />
    </section>
  );
}
