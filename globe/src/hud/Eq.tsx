/** the faint equaliser behind an action button: it plays while the button is hovered (see `.ms-eq` in styles.css) */
export function Eq({ bars = 24 }: { bars?: number }) {
  return (
    <span className="ms-eq" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 37) % 17) / 10}s`, animationDuration: `${0.7 + ((i * 53) % 9) / 10}s` }} />)}
    </span>
  );
}
