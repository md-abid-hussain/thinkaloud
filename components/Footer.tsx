/** The one-line footer of the inner pages. `left` replaces "ThinkAloud · 2026" when a page has its own credit line. */
export default function Footer({ left }: { left?: React.ReactNode }) {
  return (
    <footer className="foot">
      <p className="fine">{left ?? "ThinkAloud · 2026"}</p>
      <p className="fine">Projects from <a href="https://codingchallenges.fyi/">Coding Challenges</a> by John Crickett</p>
    </footer>
  );
}
