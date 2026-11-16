import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader.jsx';
import Loading from '../../components/common/Loading.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import CropRecommendationForm from '../../components/crop/CropRecommendationForm.jsx';
import CropResultCard from '../../components/crop/CropResultCard.jsx';
import { requestCropRecommendation } from '../../api/cropRecommendationApi.js';
import { buildCropModelInput } from '../../utils/farmInputBuilder.js';

const EMPTY_FORM = { location: '', soilType: '' };

const CropRecommendation = () => {
  const [values, setValues] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const requestRef = useRef(null);
  const resultsHeadingRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (status === 'success') resultsHeadingRef.current?.focus();
  }, [status]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
  };

  const handleReset = () => {
    requestRef.current?.abort();
    setValues(EMPTY_FORM);
    setStatus('idle');
    setResult(null);
    setFailure(null);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (status === 'loading') return;
    if (!values.location.trim() || !values.soilType) {
      setFailure({ message: 'Enter your farm location and select a soil type.', kind: 'validation' });
      setStatus('error');
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setFailure(null);
    setResult(null);

    try {
      const modelInput = await buildCropModelInput(values);
      if (controller.signal.aborted) return;

      // Only send the fields in the existing backend/ML schema. UI metadata stays in the browser.
      const { nitrogen, phosphorus, potassium, ph, temperature, rainfall, humidity, season } = modelInput;
      const data = await requestCropRecommendation(
        { nitrogen, phosphorus, potassium, ph, temperature, rainfall, humidity, season },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setResult({
        ...data,
        locationLabel: modelInput.locationLabel,
        soilLabel: modelInput.soilLabel,
        notice: [modelInput.notice, data.notice].filter(Boolean).join(' '),
      });
      setStatus('success');
    } catch (err) {
      if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
      setFailure({
        message: err.message || 'We could not generate recommendations. Please try again.',
        kind: err.kind || 'service',
      });
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crop Recommendation"
        description="Enter your farm location and soil type. The system retrieves climate data and uses the existing machine-learning model to recommend suitable crops."
      />

      <CropRecommendationForm
        values={values}
        disabled={status === 'loading'}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onReset={handleReset}
      />

      <section aria-labelledby="results-heading" aria-live="polite" className="flex flex-col gap-4">
        <h3
          id="results-heading"
          ref={resultsHeadingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-agri-900 focus:outline-none"
        >
          {status === 'success' ? 'Recommended crops' : 'Results'}
        </h3>

        {status === 'idle' && (
          <EmptyState
            icon="sprout"
            title="No recommendation yet"
            description="Enter your farm location and soil type. Your suggested crops will appear here."
          />
        )}

        {status === 'loading' && <Loading label="Fetching climate data and finding suitable crops…" />}

        {status === 'error' && failure && (
          <ErrorState
            title="We couldn’t get your recommendations"
            message={failure.message}
            onRetry={failure.kind === 'validation' || failure.kind === 'auth' ? undefined : handleSubmit}
          />
        )}

        {status === 'success' && result && (
          <>
            <div className="rounded-xl border border-agri-100 bg-white p-4 text-sm text-gray-700">
              <p><strong>Farm location:</strong> {result.locationLabel}</p>
              <p><strong>Soil category:</strong> {result.soilLabel}</p>
            </div>
            
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.recommendations.map((recommendation) => (
                <CropResultCard
                  key={recommendation.slug}
                  rank={recommendation.rank}
                  crop={recommendation.crop}
                  slug={recommendation.slug}
                />
              ))}
            </ul>
            
          </>
        )}
      </section>
    </div>
  );
};

export default CropRecommendation;
