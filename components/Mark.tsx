import Link from "next/link";

/** The wordmark: a small waveform, because the product is about talking your thinking through. */
export function Mark() {
  return (
    <Link href="/" className="mark" aria-label="ThinkAloud home">
      <svg viewBox="0 0 26 26" aria-hidden="true">
        {[3, 8, 13, 18, 23].map((x, i) => {
          const h = [8, 16, 22, 14, 6][i];
          return <rect key={x} x={x - 1.5} y={13 - h / 2} width="3" height={h} rx="1.5" fill="currentColor" />;
        })}
      </svg>
      ThinkAloud
    </Link>
  );
}
