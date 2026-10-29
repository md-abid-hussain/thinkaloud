/** The one-line footer of the inner pages. `left` replaces "ThinkAloud · 2026" when a page has its own credit line. */
export default function Footer({ left }: { left?: React.ReactNode }) {
  return (
    <footer className="foot">
      <p className="fine">{left ?? "ThinkAloud · 2026"}</p>
      <p className="fine">Voice input works with <a href="https://wisprflow.ai/r?MD13753" rel="sponsored noopener">Wispr Flow</a> (referral link)</p>
    </footer>
  );
}
