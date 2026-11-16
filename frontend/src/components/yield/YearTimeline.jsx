/**
 * Small indicator that places the selected year on the timeline the model knows about:
 *   - shaded track  = years present in the training data (trainedMin-trainedMax)
 *   - tick          = year where the dataset's recorded yield scale changes (scaleBreakYear)
 *   - dot           = the year you chose
 * All values come from the model metadata (via the options endpoint). It is not a forecast or a benchmark.
 */
const YearTimeline = ({ year, years }) => {
  const { min, max, trainedMin, trainedMax, scaleBreakYear } = years;
  const span = max - min || 1;
  const pct = (y) => `${Math.min(100, Math.max(0, ((y - min) / span) * 100))}%`;
  const inTrained = year >= trainedMin && year <= trainedMax;

  const summary =
    `Selected year ${year} is ${inTrained ? 'within' : 'after'} the years the model learned from (${trainedMin} to ${trainedMax}).` +
    (scaleBreakYear ? ` The dataset's recorded values change scale around ${scaleBreakYear}.` : '');

  return (
    <div role="img" aria-label={summary} className="pt-6">
      <div className="relative h-2 rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 rounded-full bg-agri-300"
          style={{ left: pct(trainedMin), width: `calc(${pct(trainedMax)} - ${pct(trainedMin)})` }}
        />
        {scaleBreakYear && (
          <div className="absolute -top-1 h-4 w-0.5 bg-amber-500" style={{ left: pct(scaleBreakYear) }}>
            <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-amber-700">
              {scaleBreakYear}
            </span>
          </div>
        )}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-agri-700 shadow"
          style={{ left: pct(year) }}
        />
        <span
          className="absolute -top-6 -translate-x-1/2 rounded-full bg-agri-700 px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ left: pct(Math.min(Math.max(year, min + span * 0.05), max - span * 0.05)) }}
        >
          {year}
        </span>
      </div>
      <div className="mt-7 flex justify-between text-[10px] text-gray-500" aria-hidden="true">
        <span>{min}</span>
        <span className="text-agri-700">Learned from {trainedMin}–{trainedMax}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export default YearTimeline;
