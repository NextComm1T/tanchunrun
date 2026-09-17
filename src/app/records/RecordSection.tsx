import type { ReactNode } from "react";

type RecordSectionProps = {
  title: string;
  children: ReactNode;
};

/** 기록 탭의 한 묶음 — 누적 러닝 · 개인 최고 기록 · 러닝 기록(디자인 L843 · L859 · L880). */
export function RecordSection({ title, children }: RecordSectionProps) {
  return (
    <section>
      <h2 className="mb-2.5 text-content font-extrabold text-subtle">{title}</h2>
      {children}
    </section>
  );
}
