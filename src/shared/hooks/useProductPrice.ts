import { useState, useEffect } from 'react';
import { getLocalizedPrice } from '../lib/payments';

export function useProductPrice(vendorProductId: string): string | null {
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    getLocalizedPrice(vendorProductId).then(p => { if (mounted) setPrice(p); });
    return () => { mounted = false; };
  }, [vendorProductId]);
  return price;
}
