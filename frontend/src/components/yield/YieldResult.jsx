import CropImage from '../crop/CropImage.jsx';
import FieldAccent from './FieldAccent.jsx';
import YearTimeline from './YearTimeline.jsx';

const formatValue = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-agri-100 py-2 last:border-b-0">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className="text-right text-sm font-semibold text-gray-900">{children}</dd>
  </div>
);

/** Success view: large predicted value, inputs used, year indicator and honest notes. */
const YieldResult = ({ result, years }) => {
  const { prediction, inputs, notice, dataNote } = result;

  return (
    <article className="card overflow-hidden" aria-label="Yield prediction result">
      <div className="relative bg-gradient-to-br from-agri-50 to-agri-100 px-5 pb-10 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-agri-700">Predicted yield</p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-agri-800 sm:text-6xl" data-testid="predicted-value">
              {formatValue(prediction.value)}
            </p>
            <p className="mt-2 max-w-xs text-xs text-gray-600">
              Model estimate for {inputs.cropLabel}. The dataset does not state a unit, so none is shown.
            </p>
          </div>
          <CropImage crop={inputs.cropLabel} slug={inputs.cropSlug} className="!h-24 !w-32 shrink-0 shadow-card" />
        </div>
        <FieldAccent className="absolute inset-x-0 bottom-0 h-8 w-full" />
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <section aria-labelledby="inputs-heading">
          <h4 id="inputs-heading" className="text-sm font-semibold text-agri-900">Inputs used</h4>
          <dl className="mt-1">
            <Row label="State">{inputs.state}</Row>
            <Row label="Season">{inputs.season}</Row>
            <Row label="Crop">{inputs.cropLabel}</Row>
            <Row label="Year">{inputs.year}</Row>
          </dl>
        </section>

        {years && (
          <section aria-labelledby="timeline-heading">
            <h4 id="timeline-heading" className="text-sm font-semibold text-agri-900">Where this year sits</h4>
            <YearTimeline year={inputs.year} years={years} />
          </section>
        )}

        {/* {notice && (
          <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>
        )} */}
        {/* {dataNote && (
          <p role="note" className="rounded-xl border border-agri-200 bg-agri-50 px-4 py-3 text-xs text-gray-700">
            <span className="font-semibold text-agri-800">About this number: </span>{dataNote}
          </p>
        )} */}
      </div>
    </article>
  );
};

export default YieldResult;
