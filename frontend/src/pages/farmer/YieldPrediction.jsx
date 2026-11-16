import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader.jsx';
import Loading from '../../components/common/Loading.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import YieldPredictionForm from '../../components/yield/YieldPredictionForm.jsx';
import YieldResult from '../../components/yield/YieldResult.jsx';
import useFetch from '../../hooks/useFetch.js';
import { EMPTY_YIELD_FORM } from '../../config/yieldPredictionFields.js';
import { toYieldPayload, validateYieldField, validateYieldForm } from '../../utils/yieldFormValidation.js';
import { requestYieldPrediction } from '../../api/yieldPredictionApi.js';

// status: 'idle' | 'loading' | 'success' | 'error'
const YieldPrediction = () => {
  // Choices come from the trained model's own metadata (farmer-only endpoint).
  const { data: optionsResponse, loading: optionsLoading, error: optionsError, retry: retryOptions } =
    useFetch('/farmer/yield-prediction/options');
  const options = optionsResponse?.data || null;

  const [values, setValues] = useState(EMPTY_YIELD_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const requestRef = useRef(null);
  const resultsHeadingRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (status === 'success') resultsHeadingRef.current?.focus();
  }, [status]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      // Keep the cascade consistent: changing state/season clears choices that no longer apply.
      if (name === 'state') { next.season = ''; next.crop = ''; }
      if (name === 'season') next.crop = '';
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      if (name === 'state') { delete next.season; delete next.crop; }
      if (name === 'season') delete next.crop;
      if (prev[name]) {
        const message = validateYieldField(name, value, { ...values, [name]: value }, options);
        if (message) next[name] = message; else delete next[name];
      }
      return next;
    });
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (value !== '' || errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateYieldField(name, value, values, options) }));
    }
  };

  const handleReset = () => {
    requestRef.current?.abort();
    setValues(EMPTY_YIELD_FORM);
    setErrors({});
    setStatus('idle');
    setResult(null);
    setFailure(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'loading') return;

    const check = validateYieldForm(values, options);
    setErrors(check.errors);
    if (!check.isValid) {
      setStatus('idle');
      setFailure(null);
      document.getElementById(Object.keys(check.errors)[0])?.focus();
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setFailure(null);
    setResult(null);

    try {
      const data = await requestYieldPrediction(toYieldPayload(values), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(data);
      setStatus('success');
    } catch (err) {
      if (controller.signal.aborted) return;
      setFailure(err);
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      setStatus('error');
    }
  };

  const errorCount = Object.keys(errors).filter((k) => errors[k]).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Yield Prediction"
        description="Choose a state, season, crop and year to see the yield value the trained model predicts."
      />

      {optionsLoading && <Loading label="Loading choices…" />}
      {optionsError && (
        <ErrorState title="Could not load the form" message={optionsError} onRetry={retryOptions} />
      )}

      {options && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-4">
            {errorCount > 0 && status !== 'loading' && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Please fix {errorCount === 1 ? '1 field' : `${errorCount} fields`} below before continuing.
              </div>
            )}
            <YieldPredictionForm
              options={options}
              values={values}
              errors={errors}
              disabled={status === 'loading'}
              onChange={handleChange}
              onBlur={handleBlur}
              onSubmit={handleSubmit}
              onReset={handleReset}
            />
          </div>

          <section aria-labelledby="yield-results-heading" aria-live="polite" className="flex flex-col gap-4">
            <h3
              id="yield-results-heading"
              ref={resultsHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-agri-900 focus:outline-none"
            >
              {status === 'success' ? 'Your prediction' : 'Result'}
            </h3>

            {status === 'idle' && (
              <EmptyState
                icon="trend"
                title="No prediction yet"
                description="Fill in the form and choose “Predict yield”. The predicted value will appear here."
              />
            )}
            {status === 'loading' && <Loading label="Predicting yield…" />}
            {status === 'error' && failure && (
              <ErrorState
                title="We couldn’t get your prediction"
                message={failure.message}
                onRetry={failure.kind === 'validation' || failure.kind === 'auth' ? undefined : handleSubmit}
              />
            )}
            {status === 'success' && result && <YieldResult result={result} years={options.years} />}
          </section>
        </div>
      )}
    </div>
  );
};

export default YieldPrediction;
