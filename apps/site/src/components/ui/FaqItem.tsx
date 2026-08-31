import { type ReactNode } from "react";

interface FaqItemProps {
  q: ReactNode;
  a: ReactNode;
  summaryPy?: string;
  bodyPb?: string;
  bodyMaxWidth?: string;
  bodyLeading?: string;
}

export function FaqItem({
  q,
  a,
  summaryPy = "py-[22px]",
  bodyPb = "pb-6",
  bodyMaxWidth = "max-w-[680px]",
  bodyLeading = "leading-relaxed",
}: FaqItemProps) {
  return (
    <details
      className="faq-details rounded-modal border overflow-hidden transition-colors"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <summary
        className={`flex items-center justify-between gap-4 px-6 ${summaryPy} cursor-pointer text-base font-medium tracking-[-0.01em] list-none hover:bg-[var(--bg)] transition-colors`}
        style={{ color: "var(--ink)" }}
      >
        {q}
        <span
          className="faq-icon w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
          style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </summary>
      <div
        className={`px-6 ${bodyPb} text-[14.5px] font-light ${bodyLeading} ${bodyMaxWidth}`}
        style={{ color: "var(--stone)" }}
      >
        {a}
      </div>
    </details>
  );
}
