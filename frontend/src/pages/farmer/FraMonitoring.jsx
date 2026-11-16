import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader.jsx';
import Icon from '../../components/common/Icon.jsx';
import Loading from '../../components/common/Loading.jsx';
import ClaimIdForm from '../../components/fra/ClaimIdForm.jsx';
import ClaimDetailsCard from '../../components/fra/ClaimDetailsCard.jsx';
import StatusTimeline from '../../components/fra/StatusTimeline.jsx';
import FraClaimMap from '../../components/fra/FraClaimMap.jsx';
import { lookUpClaim } from '../../api/fraApi.js';
import { normalizeClaimId, validateClaimIdInput } from '../../utils/claimId.js';

// status: 'idle' | 'loading' | 'success'.  Nothing is loaded until the farmer enters a reference ID, and the claim
// lives only in this component's memory: leaving or refreshing the page clears it.
const FraMonitoring = () => {
  const [claimIdInput, setClaimIdInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [status, setStatus] = useState('idle');
  const [claim, setClaim] = useState(null);
  const [failure, setFailure] = useState(null);
  const requestRef = useRef(null);
  const resultHeadingRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (status === 'success') resultHeadingRef.current?.focus();
  }, [status]);

  const handleChange = (e) => {
    setClaimIdInput(e.target.value);
    if (fieldError) setFieldError('');
    if (failure) setFailure(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'loading') return;

    const message = validateClaimIdInput(claimIdInput);
    if (message) {
      setFieldError(message);
      document.getElementById('claimId')?.focus();
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setFailure(null);
    setFieldError('');

    try {
      const found = await lookUpClaim(normalizeClaimId(claimIdInput), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setClaim(found);
      setStatus('success');
    } catch (err) {
      if (controller.signal.aborted) return;
      setClaim(null);
      setFailure(err);
      if (err.kind === 'validation') setFieldError(err.fieldError);
      setStatus('idle');
    }
  };

  const handleReset = () => {
    requestRef.current?.abort();
    setClaim(null);
    setFailure(null);
    setFieldError('');
    setClaimIdInput('');
    setStatus('idle');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="FRA Monitoring"
        description="View the status of your own Forest Rights Act (FRA) claim using the reference ID you were given."
      />

      {status !== 'success' && (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-agri-200 bg-agri-50 px-4 py-3 text-sm text-agri-900">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-agri-600" />
            <p>
              <span className="font-semibold">Your claims are private.</span> No claims are shown automatically. Get your reference ID
              in person from your Gram Sarpanch or the authorized registration desk, then enter it below. You can only open claims that
              belong to your own account.
            </p>
          </div>

          <ClaimIdForm value={claimIdInput} error={fieldError} disabled={status === 'loading'} onChange={handleChange} onSubmit={handleSubmit} />

          {status === 'loading' && <Loading label="Verifying your reference ID…" />}

          {failure && failure.kind !== 'validation' && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="lookup-error">
              {failure.message}
            </div>
          )}
        </>
      )}

      {status === 'success' && claim && (
        <section aria-labelledby="fra-result-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 id="fra-result-heading" ref={resultHeadingRef} tabIndex={-1} className="text-lg font-semibold text-agri-900 focus:outline-none">
              Your claim
            </h3>
            <button type="button" className="btn-secondary" onClick={handleReset}>Look up a different claim</button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-6">
              <ClaimDetailsCard claim={claim} />
              <section className="card p-5 sm:p-6" aria-labelledby="timeline-heading">
                <h4 id="timeline-heading" className="mb-4 text-base font-semibold text-agri-900">Status timeline</h4>
                <StatusTimeline history={claim.statusHistory} />
              </section>
            </div>

            <section className="card flex flex-col gap-3 self-start p-5 sm:p-6" aria-labelledby="map-heading">
              <h4 id="map-heading" className="text-base font-semibold text-agri-900">Claim boundary</h4>
              <FraClaimMap geometry={claim.geometry} claimId={claim.claimId} />
              {claim.isDemo && <p className="text-xs text-gray-500">Demo boundary for illustration only; it does not mark a real parcel.</p>}
            </section>
          </div>
        </section>
      )}
    </div>
  );
};

export default FraMonitoring;
