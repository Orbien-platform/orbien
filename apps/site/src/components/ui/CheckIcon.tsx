interface CheckIconProps {
  size?: "sm" | "md";
  className?: string;
}

export function CheckIcon({ size = "md", className = "" }: CheckIconProps) {
  const isSm = size === "sm";
  return (
    <span
      className={
        (isSm
          ? "w-3.5 h-3.5 rounded-full inline-flex items-center justify-center flex-shrink-0"
          : "w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0") +
        (className ? ` ${className}` : "")
      }
      style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
    >
      <svg
        width={isSm ? 8 : 10}
        height={isSm ? 8 : 10}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
