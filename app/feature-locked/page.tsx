import React from 'react';
import { FEATURES, type FeatureKey } from '@/lib/features';

/** Where a page of a feature the Super Admin switched off sends the user (see LicenseGuard). */
export default async function FeatureLockedPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const key = (await searchParams).feature;
  const feature = typeof key === 'string' && key in FEATURES ? FEATURES[key as FeatureKey] : null;

  return (
    <div className="glass-panel" style={{maxWidth: '560px', margin: '4rem auto', padding: '2.5rem', textAlign: 'center'}}>
      <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🔒</div>
      <h1 style={{marginBottom: '0.75rem'}}>{feature ? `${feature.label} is switched off` : 'This feature is switched off'}</h1>
      <p style={{marginBottom: '1.5rem'}}>
        {feature ? `${feature.description}. ` : ''}Your service provider has not enabled it for this school. Everything else keeps working.
      </p>
      <div style={{textAlign: 'left', background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', fontSize: '0.9rem'}}>
        <div style={{fontWeight: 700, marginBottom: '0.4rem'}}>To have it switched on, contact:</div>
        <div>📞 WhatsApp / Support Line: +92 349 5999656</div>
        <div>✉️ Email: sameerabdullah930@gmail.com</div>
      </div>
    </div>
  );
}
