import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../components/Button';

interface ProviderOnboardingFlowProps {
  onComplete?: () => void;
}

const STEPS = [
  { number: 1, label: 'Business Info' },
  { number: 2, label: 'Insurance' },
  { number: 3, label: 'Service Area' },
  { number: 4, label: 'Stripe Connect' },
  { number: 5, label: 'Review & Submit' },
];

const BUSINESS_TYPES = [
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
];

const ProviderOnboardingFlow: React.FC<ProviderOnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Business Info
  const [businessType, setBusinessType] = useState('llc');
  const [ein, setEin] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [isSoloOperator, setIsSoloOperator] = useState(false);

  // Step 2: Insurance
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [insuranceExpiresAt, setInsuranceExpiresAt] = useState('');
  const [existingInsuranceUrl, setExistingInsuranceUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Service Area
  const [zipInput, setZipInput] = useState('');
  const [zips, setZips] = useState<string[]>([]);

  // Step 4: Stripe
  const [stripeStatus, setStripeStatus] = useState<'not_started' | 'pending' | 'completed'>('not_started');
  const [stripePolling, setStripePolling] = useState(false);

  // Resume from saved step
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/team/provider/onboarding', { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        const p = json.data;
        if (!p) return;

        if (p.onboarding_step) setCurrentStep(p.onboarding_step);
        if (p.business_type) setBusinessType(p.business_type);
        if (p.ein) setEin(p.ein);
        if (p.contact_phone) setContactPhone(p.contact_phone);
        if (p.contact_email) setContactEmail(p.contact_email);
        if (p.website) setWebsite(p.website);
        if (p.service_description) setServiceDescription(p.service_description);
        if (p.is_solo_operator != null) setIsSoloOperator(p.is_solo_operator);
        if (p.license_number) setLicenseNumber(p.license_number);
        if (p.insurance_expires_at) setInsuranceExpiresAt(p.insurance_expires_at.slice(0, 10));
        if (p.insurance_cert_url) setExistingInsuranceUrl(p.insurance_cert_url);
        if (p.service_zips) setZips(p.service_zips);
        if (p.stripe_connect_account_id) setStripeStatus('completed');
      } catch {}
    };
    load();
  }, []);

  const saveStep1 = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/team/provider/onboarding/business-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ business_type: businessType, ein, contact_phone: contactPhone, contact_email: contactEmail, website, service_description: serviceDescription, is_solo_operator: isSoloOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      if (insuranceFile) form.append('insurance_cert', insuranceFile);
      form.append('license_number', licenseNumber);
      form.append('insurance_expires_at', insuranceExpiresAt);
      const res = await fetch('/api/team/provider/onboarding/insurance', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveStep3 = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/team/provider/onboarding/service-area', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ zipCodes: zips }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startStripe = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/team/provider/onboarding/stripe', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start Stripe setup');
      // Redirect to Stripe's hosted onboarding flow
      window.location.href = json.data.url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pollStripeStatus = async () => {
    setStripePolling(true);
    setError('');
    try {
      const res = await fetch('/api/team/provider/onboarding/stripe/status', { credentials: 'include' });
      const json = await res.json();
      if (json.data?.onboarded) {
        setStripeStatus('completed');
      } else if (json.data?.requirementsStatus === 'currently_due' || json.data?.requirementsStatus === 'past_due') {
        setError(`Stripe onboarding is incomplete — there are ${json.data.requirementsStatus.replace('_', ' ')} requirements. Click "Set Up Stripe Account" to continue.`);
      } else {
        setError('Stripe setup is not yet complete. Please finish the Stripe onboarding and try again.');
      }
    } catch {
      setError('Could not check Stripe status. Please try again.');
    } finally {
      setStripePolling(false);
    }
  };

  // Auto-check Stripe status when returning from Stripe onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_return') === '1') {
      setCurrentStep(4);
      pollStripeStatus();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_return');
      window.history.replaceState({}, '', url.pathname);
    }
    if (params.get('stripe_refresh') === '1') {
      setCurrentStep(4);
      setError('Your Stripe link expired. Click below to restart.');
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_refresh');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  const submitForReview = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/team/provider/onboarding/submit', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      onComplete?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addZip = () => {
    const zip = zipInput.trim();
    if (!zip) return;
    if (!/^\d{5}$/.test(zip)) { setError('Enter a valid 5-digit ZIP code'); return; }
    if (zips.includes(zip)) { setZipInput(''); return; }
    setZips(prev => [...prev, zip]);
    setZipInput('');
    setError('');
  };

  const removeZip = (z: string) => setZips(prev => prev.filter(x => x !== z));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Company Setup</h1>
          <p className="text-gray-500 text-sm mt-1">Complete all steps to submit your application</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, i) => {
            const done = currentStep > step.number;
            const active = currentStep === step.number;
            return (
              <React.Fragment key={step.number}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    done ? 'bg-teal-600 border-teal-600 text-white' :
                    active ? 'border-teal-600 text-teal-600 bg-white' :
                    'border-gray-300 text-gray-400 bg-white'
                  }`}>
                    {done ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : step.number}
                  </div>
                  <span className={`text-xs font-medium ${active ? 'text-teal-700' : done ? 'text-teal-600' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-teal-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Business Info */}
          {currentStep === 1 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Business Information</h2>
                <p className="text-sm text-gray-500">Tell us about your company</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Business Type</label>
                <select
                  value={businessType}
                  onChange={e => setBusinessType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">EIN / Tax ID <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={ein}
                  onChange={e => setEin(e.target.value)}
                  placeholder="12-3456789"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="ops@company.com"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Service Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={serviceDescription}
                  onChange={e => setServiceDescription(e.target.value)}
                  rows={3}
                  placeholder="Briefly describe your company's services and experience..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSoloOperator}
                  onChange={e => setIsSoloOperator(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-bold text-gray-700">I am a solo operator</span>
                  <p className="text-xs text-gray-500 mt-0.5">I am both the owner and the only active driver for this company.</p>
                </div>
              </label>

              <Button onClick={saveStep1} disabled={saving || !businessType} className="w-full">
                {saving ? 'Saving...' : 'Continue'}
              </Button>
            </>
          )}

          {/* Step 2: Insurance */}
          {currentStep === 2 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Insurance & Licensing</h2>
                <p className="text-sm text-gray-500">Upload your certificate of insurance and business license info</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Certificate of Insurance {existingInsuranceUrl ? <span className="text-teal-600 font-normal text-xs ml-1">— uploaded</span> : <span className="text-red-500">*</span>}
                </label>
                {existingInsuranceUrl && !insuranceFile && (
                  <div className="mb-2 flex items-center gap-2 p-2 bg-teal-50 border border-teal-200 rounded-lg">
                    <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-teal-700">Insurance certificate uploaded. <a href={existingInsuranceUrl} target="_blank" rel="noopener noreferrer" className="underline">View</a> or upload a new one below.</span>
                  </div>
                )}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl p-6 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
                >
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  {insuranceFile ? (
                    <span className="text-sm text-teal-700 font-medium">{insuranceFile.name}</span>
                  ) : (
                    <>
                      <span className="text-sm text-gray-600 font-medium">Click to upload</span>
                      <span className="text-xs text-gray-400">PDF, JPEG, PNG, WebP — max 10 MB</span>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={e => setInsuranceFile(e.target.files?.[0] || null)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Business License Number <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={e => setLicenseNumber(e.target.value)}
                  placeholder="e.g. WC-123456"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Insurance Expiry Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={insuranceExpiresAt}
                  onChange={e => setInsuranceExpiresAt(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setCurrentStep(1)} disabled={saving} className="flex-1">
                  Back
                </Button>
                <Button onClick={saveStep2} disabled={saving || (!insuranceFile && !existingInsuranceUrl) || !insuranceExpiresAt} className="flex-1">
                  {saving ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Service Area */}
          {currentStep === 3 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Service Area</h2>
                <p className="text-sm text-gray-500">Enter the ZIP codes your company serves</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Add ZIP Codes</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={zipInput}
                    onChange={e => setZipInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addZip(); } }}
                    placeholder="e.g. 72201"
                    maxLength={5}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <Button type="button" onClick={addZip} variant="secondary">Add</Button>
                </div>
              </div>

              {zips.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">{zips.length} ZIP code{zips.length !== 1 ? 's' : ''} added</p>
                  <div className="flex flex-wrap gap-2">
                    {zips.map(z => (
                      <span key={z} className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-100 text-teal-800 text-sm rounded-full font-medium">
                        {z}
                        <button
                          type="button"
                          onClick={() => removeZip(z)}
                          className="ml-0.5 hover:text-teal-600 focus:outline-none"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {zips.length === 0 && (
                <div className="py-6 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                  No ZIP codes added yet
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setCurrentStep(2)} disabled={saving} className="flex-1">
                  Back
                </Button>
                <Button onClick={saveStep3} disabled={saving || zips.length === 0} className="flex-1">
                  {saving ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            </>
          )}

          {/* Step 4: Stripe Connect */}
          {currentStep === 4 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Payment Setup</h2>
                <p className="text-sm text-gray-500">Connect your bank account via Stripe to receive payments from Rural Waste Management.</p>
              </div>

              {stripeStatus === 'completed' ? (
                <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-teal-900">Stripe account connected</p>
                    <p className="text-sm text-teal-700">Your payment information is set up and ready.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                    <p className="font-bold mb-1">What happens next?</p>
                    <ul className="list-disc pl-4 space-y-1 text-sm">
                      <li>You'll be redirected to Stripe to verify your business identity</li>
                      <li>Provide your business information and bank account details</li>
                      <li>Return here after completing Stripe setup</li>
                    </ul>
                  </div>
                  <Button onClick={startStripe} disabled={saving} className="w-full">
                    {saving ? 'Redirecting...' : 'Set Up Stripe Account'}
                  </Button>
                  <button
                    type="button"
                    onClick={pollStripeStatus}
                    disabled={stripePolling}
                    className="w-full text-sm text-teal-600 hover:text-teal-700 font-medium py-1 disabled:opacity-50"
                  >
                    {stripePolling ? 'Checking...' : 'I already completed Stripe setup — check status'}
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setCurrentStep(3)} disabled={saving} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => setCurrentStep(5)} disabled={stripeStatus !== 'completed'} className="flex-1">
                  Continue
                </Button>
              </div>
            </>
          )}

          {/* Step 5: Review & Submit */}
          {currentStep === 5 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Review & Submit</h2>
                <p className="text-sm text-gray-500">Confirm your information and submit for review. Our team will reach out within 1–2 business days.</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Business Type</span>
                  <span className="font-medium text-gray-900 capitalize">{BUSINESS_TYPES.find(t => t.value === businessType)?.label || businessType}</span>
                </div>
                {ein && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">EIN</span>
                    <span className="font-medium text-gray-900">{ein}</span>
                  </div>
                )}
                {contactPhone && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Contact Phone</span>
                    <span className="font-medium text-gray-900">{contactPhone}</span>
                  </div>
                )}
                {contactEmail && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Contact Email</span>
                    <span className="font-medium text-gray-900">{contactEmail}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Insurance Expiry</span>
                  <span className={`font-medium ${insuranceExpiresAt ? 'text-gray-900' : 'text-red-500'}`}>
                    {insuranceExpiresAt || 'Not provided'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Service Area</span>
                  <span className="font-medium text-gray-900">{zips.length} ZIP code{zips.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Stripe Account</span>
                  <span className={`font-medium ${stripeStatus === 'completed' ? 'text-teal-700' : 'text-orange-600'}`}>
                    {stripeStatus === 'completed' ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Solo Operator</span>
                  <span className="font-medium text-gray-900">{isSoloOperator ? 'Yes' : 'No'}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  By submitting, you confirm that all information provided is accurate and that you agree to Rural Waste Management's contractor terms.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setCurrentStep(4)} disabled={saving} className="flex-1">
                  Back
                </Button>
                <Button onClick={submitForReview} disabled={saving} className="flex-1">
                  {saving ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderOnboardingFlow;
