import { useCallback, useEffect, useRef, useState } from 'react';
import Badge from '../common/Badge.jsx';
import Icon from '../common/Icon.jsx';
import Loading from '../common/Loading.jsx';
import ErrorState from '../common/ErrorState.jsx';
import StatusBadge from '../fra/StatusBadge.jsx';
import FraClaimMap from '../fra/FraClaimMap.jsx';
import AuditTimeline from './AuditTimeline.jsx';
import WorkflowActions from './WorkflowActions.jsx';
import { formatDate } from '../fra/ClaimDetailsCard.jsx';
import { CLAIM_TYPE_LABELS, DEMO_LABEL } from '../../config/fraConfig.js';
import { getClaim, performClaimAction } from '../../api/govClaimsApi.js';

const Item = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 py-2">
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-gray-900">{children || '—'}</dd>
  </div>
);

const Section = ({ title, children, id }) => (
  <section aria-labelledby={id} className="flex flex-col gap-3">
    <h4 id={id} className="text-sm font-semibold text-agri-900">{title}</h4>
    {children}
  </section>
);

/** Slide-over with claim details, audit trail, map preview (authorized claim only) and workflow actions. */
const ClaimDrawer = ({ claimId, onClose, onChanged }) => {
  const [state, setState] = useState({ status: 'loading', claim: null, error: null });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const closeRef = useRef(null);

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const claim = await getClaim(claimId, { signal });
      if (!signal?.aborted) setState({ status: 'ready', claim, error: null });
    } catch (err) {
      if (!signal?.aborted) setState({ status: 'error', claim: null, error: err });
    }
  }, [claimId]);

  useEffect(() => {
    const controller = new AbortController();
    setNotice(''); setActionError(''); setFieldErrors({});
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const submitAction = async (body) => {
    setSaving(true); setActionError(''); setFieldErrors({}); setNotice('');
    try {
      const updated = await performClaimAction(claimId, body);
      setState({ status: 'ready', claim: updated, error: null });
      setNotice(`Claim updated: it is now ${updated.status.replace(/_/g, ' ').toLowerCase()}.`);
      onChanged?.();
    } catch (err) {
      setActionError(err.message);
      setFieldErrors(err.fieldErrors || {});
      if (err.kind === 'conflict') {           // someone else changed it: show the current state so the official can decide again
        await load();
        setActionError(err.message);
        onChanged?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const { claim } = state;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="claim-drawer-root">
      <div className="absolute inset-0 bg-agri-900/40" onClick={saving ? undefined : onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="drawer-title" className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-xl" data-testid="claim-drawer">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-agri-100 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-agri-700">Claim details</p>
            <h3 id="drawer-title" className="font-mono text-lg font-bold text-agri-900" data-testid="drawer-claim-id">{claimId}</h3>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={saving} className="btn-secondary !px-3 !py-1.5 text-xs" aria-label="Close claim details">Close</button>
        </div>

        <div className="flex flex-col gap-6 p-5">
          {state.status === 'loading' && !claim && <Loading label="Loading claim…" />}
          {state.status === 'error' && (
            <ErrorState title="Could not open this claim" message={state.error?.message} onRetry={state.error?.kind === 'not_found' || state.error?.kind === 'auth' || state.error?.kind === 'no_jurisdiction' ? undefined : () => load()} />
          )}

          {claim && (
            <>
              {claim.isDemo && (
                <div role="note" data-testid="drawer-demo-banner" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                  <p><Badge tone="amber">{DEMO_LABEL}</Badge> This record is demo data for testing. It is not an official government record.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1"><span className="text-xs font-medium uppercase tracking-wide text-gray-500">Current status</span><StatusBadge status={claim.status} /></div>
                <span className="text-xs text-gray-500">Last updated {formatDate(claim.updatedAt)}</span>
              </div>

              {claim.status === 'REJECTED' && (
                <div role="note" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" data-testid="drawer-rejection">
                  <p className="text-sm font-semibold text-red-800">Reason for rejection (shown to the applicant)</p>
                  <p className="mt-1 text-sm text-red-700">{claim.rejectionReason || 'No reason recorded.'}</p>
                </div>
              )}

              <Section title="Workflow" id="drawer-actions">
                {notice && <p role="status" className="rounded-lg border border-agri-200 bg-agri-50 px-3 py-2 text-sm text-agri-900" data-testid="action-notice">{notice}</p>}
                {/*
                  WorkflowActions remounts whenever the claim's status changes (its key includes claim.status), which
                  resets its own "selected action" state and hides its inline error. So a conflict/service error is
                  always shown here too, outside that component, or it would silently vanish when the claim reloads.
                */}
                {actionError && !saving && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="action-error-outside">{actionError}</p>
                )}
                <WorkflowActions key={`${claim.claimId}-${claim.status}`} claim={claim} busy={saving} error={fieldErrors?._form || ''} fieldErrors={fieldErrors} onSubmit={submitAction} />
              </Section>

              <Section title="Claim information" id="drawer-info">
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <Item label="Applicant">{claim.applicantName}</Item>
                  <Item label="Claim type">{CLAIM_TYPE_LABELS[claim.claimType] || claim.claimType}</Item>
                  <Item label="Claimed area">{claim.claimedAreaHectares != null ? `${claim.claimedAreaHectares} hectares` : null}</Item>
                  <Item label="Application date">{formatDate(claim.submittedAt)}</Item>
                  <Item label="Village">{claim.village || claim.applicantVillage}</Item>
                  <Item label="Tehsil">{claim.tehsil}</Item>
                  <Item label="Gram Panchayat">{claim.gramPanchayat}</Item>
                  <Item label="District, state">{[claim.district, claim.state].filter(Boolean).join(', ')}</Item>
                  <Item label="Gram Sabha">{claim.jurisdiction?.gramSabha}</Item>
                  <Item label="Sub-divisional committee">{claim.jurisdiction?.subDivisionalCommittee}</Item>
                  <Item label="District committee">{claim.jurisdiction?.districtCommittee}</Item>
                </dl>
              </Section>

              <Section title="History and audit trail" id="drawer-history">
                <AuditTimeline history={claim.statusHistory} />
              </Section>

              <Section title="Claim boundary" id="drawer-map">
                <FraClaimMap geometry={claim.geometry} claimId={claim.claimId} />
                <p className="text-xs text-gray-500">Shown because this claim is inside your assigned area.{claim.isDemo ? ' Demo boundary for illustration only.' : ''}</p>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClaimDrawer;
