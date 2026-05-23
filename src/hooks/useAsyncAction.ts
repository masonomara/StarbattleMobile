import { useState, useCallback } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, onSuccess?: () => void) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
