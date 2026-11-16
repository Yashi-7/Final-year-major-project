import Icon from '../common/Icon.jsx';
import { CLAIM_ID_EXAMPLE } from '../../config/fraConfig.js';

const ClaimIdForm = ({ value, error, disabled, onChange, onSubmit }) => (
  <form onSubmit={onSubmit} noValidate className="card flex flex-col gap-4 p-5 sm:p-6" aria-label="Claim reference ID lookup">
    <div className="flex flex-col gap-1.5">
      <label htmlFor="claimId" className="text-sm font-semibold text-gray-800">Claim reference ID</label>
      <input
        id="claimId"
        name="claimId"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck="false"
        className={`field font-mono tracking-wide ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
        placeholder={CLAIM_ID_EXAMPLE}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'claimId-help claimId-error' : 'claimId-help'}
        aria-required="true"
      />
      <p id="claimId-help" className="text-xs text-gray-500">
        Enter the ID you received in person from your Gram Sarpanch or the authorized registration desk. Example: {CLAIM_ID_EXAMPLE}.
      </p>
      {error && <p id="claimId-error" role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
    <div className="flex justify-end">
      <button type="submit" className="btn-primary" disabled={disabled}>
        <Icon name="lock" className="h-4 w-4" />
        {disabled ? 'Verifying…' : 'View my claim'}
      </button>
    </div>
  </form>
);

export default ClaimIdForm;
