import { useCallback, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';

// Small GET helper that exposes loading / error state and a retry function.
// The backend still enforces auth + role on every endpoint called through it.
const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get(url);
      setData(res.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.request ? 'Could not reach the server. Check your connection and try again.' : 'Something went wrong.')
      );
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, retry: load };
};

export default useFetch;
