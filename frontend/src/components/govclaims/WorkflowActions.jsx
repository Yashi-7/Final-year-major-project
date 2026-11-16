import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import { MAX_TEXT } from '../../config/govClaimsConfig.js';

/**
 * Workflow actions for one claim. The buttons come from the server's `allowedActions`; this component contains no
 * transition rules. A chosen action opens a confirmation form (remarks; a reason when the server says it is required).
 */
const WorkflowActions = ({ claim, busy, error, fieldErrors, onSubmit }) => {
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');

  const actions = claim.allowedActions || [];

  if (actions.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700" data-testid="no-actions">
        This claim is <span className="font-semibold">{claim.status === 'APPROVED' ? 'approved' : claim.status === 'REJECTED' ? 'rejected' : claim.status}</span> and cannot be changed.
      </p>
    );
  }

  const choose = (a) => { setSelected(a); setRemarks(''); setReason(''); setLocalError(''); };
  const cancel = () => { setSelected(null); setLocalError(''); };

  const submit = (e) => {
    e.preventDefault();
    if (selected.requiresReason && !reason.trim()) { setLocalError('A reason is required to reject a claim.'); return; }
    setLocalError('');
    onSubmit({ action: selected.action, expectedStatus: claim.status, remarks: remarks.trim() || undefined, reason: selected.requiresReason ? reason.trim() : undefined });
  };

  if (!selected) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Available actions" data-testid="action-buttons">
        {actions.map((a) => (
          <button key={a.action} type="button" onClick={() => choose(a)} data-action={a.action} title={a.description}
            className={a.action === 'REJECT' ? 'inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50' : 'btn-primary'}>
            {a.label}
          </button>
        ))}
      </div>
    );
  }

  const reasonError = localError || fieldErrors?.reason;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-agri-200 bg-agri-50/50 p-4" data-testid="action-form" aria-label={`Confirm: ${selected.label}`}>
      <div>
        <h5 className="text-sm font-semibold text-agri-900">{selected.label}</h5>
        <p className="text-xs text-gray-600">{selected.description}</p>
      </div>

      {selected.requiresReason && (
        <div className="flex flex-col gap-1">
          <label htmlFor="action-reason" className="text-sm font-semibold text-gray-800">Reason for rejection <span className="font-normal text-gray-500">(required, shown to the applicant)</span></label>
          <textarea id="action-reason" rows={3} maxLength={MAX_TEXT} className={`field ${reasonError ? 'border-red-500' : ''}`} value={reason} onChange={(e) => { setReason(e.target.value); setLocalError(''); }}
            aria-invalid={reasonError ? 'true' : 'false'} aria-describedby={reasonError ? 'action-reason-error' : undefined} aria-required="true" disabled={busy} />
          {reasonError && <p id="action-reason-error" role="alert" className="text-xs font-medium text-red-700">{reasonError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="action-remarks" className="text-sm font-semibold text-gray-800">Remarks <span className="font-normal text-gray-500">(optional, internal: officials only)</span></label>
        <textarea id="action-remarks" rows={2} maxLength={MAX_TEXT} className="field" value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={busy} />
        {fieldErrors?.remarks && <p role="alert" className="text-xs font-medium text-red-700">{fieldErrors.remarks}</p>}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="action-error">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy} data-testid="confirm-action">
          <Icon name="check" className="h-4 w-4" />{busy ? 'Saving…' : `Confirm: ${selected.label}`}
        </button>
      </div>
    </form>
  );
};

export default WorkflowActions;
