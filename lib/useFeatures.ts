import { useEffect, useState } from 'react';
import { DEFAULT_FEATURES, featureOn, type FeatureKey, type Features } from './features';

/**
 * The features the Super Admin has left on for this school, for hiding what is switched off.
 * Everything counts as on until the license has loaded; the server refuses switched-off features anyway.
 */
export function useFeatures() {
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);

  useEffect(() => {
    fetch('/api/admin/license')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.features) setFeatures({ ...DEFAULT_FEATURES, ...data.features });
      })
      .catch(() => {});
  }, []);

  return { features, has: (key: FeatureKey) => featureOn(features, key) };
}
