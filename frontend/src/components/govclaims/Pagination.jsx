import { PAGE_SIZES } from '../../config/govClaimsConfig.js';

const Pagination = ({ pagination, disabled, onPage, onLimit }) => {
  const { page, limit, total, totalPages } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <nav aria-label="Claims pagination" className="flex flex-col gap-3 border-t border-agri-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="pagination">
      <p className="text-sm text-gray-600" aria-live="polite" data-testid="range-text">
        {total === 0 ? 'No claims' : <>Showing <span className="font-semibold">{from}–{to}</span> of <span className="font-semibold">{total}</span></>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          Rows per page
          <select className="field !w-auto !py-1" value={limit} onChange={(e) => onLimit(Number(e.target.value))} disabled={disabled} aria-label="Rows per page">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-xs text-gray-600" data-testid="page-text">Page {totalPages === 0 ? 0 : page} of {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} data-testid="prev-page">Previous</button>
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} data-testid="next-page">Next</button>
        </div>
      </div>
    </nav>
  );
};

export default Pagination;
