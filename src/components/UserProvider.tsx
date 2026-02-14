import { useEffect } from 'react';
import { useUserStore } from '../stores/userStore';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const initialize = useUserStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return children;
}
