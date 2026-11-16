// Forest-green hero with a subtle field-furrow pattern as the agricultural accent.
const WelcomeBanner = ({ name, roleLabel, message }) => (
  <section className="relative overflow-hidden rounded-2xl bg-agri-700 p-6 text-white shadow-card sm:p-8">
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-agri-500/40"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMaxYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M120 ${150 - i * 22} C 200 ${120 - i * 22}, 300 ${175 - i * 22}, 420 ${130 - i * 22}`} />
      ))}
    </svg>
    <div className="relative max-w-xl">
      <p className="text-sm text-agri-200">{roleLabel}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {name}</h2>
      <p className="mt-2 text-sm text-agri-100">{message}</p>
    </div>
  </section>
);

export default WelcomeBanner;
