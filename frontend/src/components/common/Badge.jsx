const TONES = {
  neutral: 'bg-gray-100 text-gray-600',
  green: 'bg-agri-100 text-agri-700',
  amber: 'bg-amber-100 text-amber-800',
};

const Badge = ({ children, tone = 'neutral' }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
  >
    {children}
  </span>
);

export default Badge;
