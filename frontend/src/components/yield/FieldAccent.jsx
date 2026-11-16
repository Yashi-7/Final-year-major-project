// Decorative field rows for the result header. Purely visual (aria-hidden).
const FieldAccent = ({ className = '' }) => (
  <svg viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true" focusable="false" className={className}>
    <path d="M0 40 C80 20 160 50 240 30 C300 15 350 35 400 25 L400 60 L0 60Z" fill="#c2e0b6" opacity=".55" />
    <path d="M0 48 C90 32 170 58 250 42 C310 30 360 46 400 38 L400 60 L0 60Z" fill="#9bcb8b" opacity=".6" />
    <path d="M0 55 C100 45 180 60 260 52 C320 46 370 56 400 50 L400 60 L0 60Z" fill="#63ad57" opacity=".55" />
  </svg>
);

export default FieldAccent;
