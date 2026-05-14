export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Unified Hub"
    >
      <path d="M6 10h20" />
      <path d="M6 16h20" />
      <path d="M6 22h12" />
      <circle cx="24" cy="22" r="3" />
    </svg>
  );
}
