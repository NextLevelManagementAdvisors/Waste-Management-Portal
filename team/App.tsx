import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import {
  HomeIcon,
  CalendarDaysIcon,
  UserIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  MapPinIcon,
} from '../components/Icons.tsx';

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  rating?: string;
  total_jobs_completed?: number;
  w9_completed?: boolean;
  direct_deposit_completed?: boolean;
  stripe_connect_onboarded?: boolean;
  onboarding_status?: string;
  availability?: any;
  created_at?: string;
}

interface OnboardingStatus {
  onboarding_status: string;
  w9_completed: boolean;
  direct_deposit_completed: boolean;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  area?: string;
  scheduled_date?: string;
  start_time?: string;
  end_time?: string;
  estimated_stops?: number;
  estimated_hours?: number;
  base_pay?: number;
  status: string;
  assigned_driver_id?: string;
  bids?: Bid[];
}

interface Bid {
  id: string;
  job_id: string;
  driver_id: string;
  bid_amount: number;
  message?: string;
  driver_rating_at_bid?: number;
  created_at?: string;
}

type TeamView = 'dashboard' | 'jobs' | 'schedule' | 'profile';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

const BriefcaseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
  </svg>
);

const ArrowRightOnRectangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
  </svg>
);

const StarIcon: React.FC<{ className?: string; filled?: boolean }> = ({ className, filled }) => (
  <svg className={className} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
  </svg>
);

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const ListIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const StarRating: React.FC<{ rating: number; className?: string }> = ({ rating, className = '' }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <StarIcon
        key={i}
        className={`w-5 h-5 ${i <= Math.round(rating) ? 'text-yellow-500' : 'text-gray-300'} ${className}`}
        filled={i <= Math.round(rating)}
      />
    );
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    bidding: 'bg-yellow-100 text-yellow-700',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

function normalizeDriver(raw: any): Driver {
  return {
    id: raw.id,
    full_name: raw.name || raw.full_name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    rating: raw.rating,
    total_jobs_completed: raw.total_jobs_completed,
    w9_completed: raw.w9_completed,
    direct_deposit_completed: raw.direct_deposit_completed,
    stripe_connect_onboarded: raw.stripe_connect_onboarded,
    onboarding_status: raw.onboarding_status,
    availability: raw.availability,
    created_at: raw.created_at,
  };
}

const SignaturePad: React.FC<{ onSignatureChange: (data: string) => void }> = ({ onSignatureChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      onSignatureChange(canvasRef.current!.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange('');
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        className="border-2 border-gray-300 rounded-lg cursor-crosshair bg-white w-full"
        style={{ touchAction: 'none' }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <button type="button" onClick={clearSignature} className="text-xs text-teal-600 hover:underline mt-1">
        Clear Signature
      </button>
    </div>
  );
};

const OnboardingFlow: React.FC<{ status: OnboardingStatus; onRefresh: () => void }> = ({ status, onRefresh }) => {
  const w9Done = status.w9_completed;
  const ddDone = status.direct_deposit_completed;
  const [currentStep, setCurrentStep] = useState(w9Done ? 2 : 1);

  useEffect(() => {
    if (w9Done && !ddDone) setCurrentStep(2);
  }, [w9Done, ddDone]);

  const [w9Form, setW9Form] = useState({
    legal_name: '', business_name: '', federal_tax_classification: '', llc_classification: '', other_classification: '',
    exempt_payee_code: '', fatca_exemption_code: '', address: '', city: '', state: '', zip: '',
    tin_type: 'ssn' as 'ssn' | 'ein',
    ssn1: '', ssn2: '', ssn3: '', ein1: '', ein2: '',
    certification: false, signature_data: '', signature_date: new Date().toISOString().split('T')[0],
  });
  const [w9Loading, setW9Loading] = useState(false);
  const [w9Error, setW9Error] = useState('');
  const [w9Success, setW9Success] = useState(false);

  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [stripeCheckLoading, setStripeCheckLoading] = useState(false);

  const updateW9 = (field: string, value: any) => setW9Form(prev => ({ ...prev, [field]: value }));

  const handleW9Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setW9Error('');
    if (!w9Form.legal_name || !w9Form.federal_tax_classification || !w9Form.address || !w9Form.city || !w9Form.state || !w9Form.zip) {
      setW9Error('Please fill in all required fields.');
      return;
    }
    if (!w9Form.certification) {
      setW9Error('You must certify the information is correct.');
      return;
    }
    if (!w9Form.signature_data) {
      setW9Error('Please provide your signature.');
      return;
    }

    const tin_last4 = w9Form.tin_type === 'ssn' ? w9Form.ssn3 : w9Form.ein2.slice(-4);

    setW9Loading(true);
    try {
      const res = await fetch('/api/team/onboarding/w9', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          legal_name: w9Form.legal_name,
          business_name: w9Form.business_name,
          federal_tax_classification: w9Form.federal_tax_classification === 'llc'
            ? `LLC (${w9Form.llc_classification})`
            : w9Form.federal_tax_classification === 'other'
              ? `Other: ${w9Form.other_classification}`
              : w9Form.federal_tax_classification,
          exempt_payee_code: w9Form.exempt_payee_code,
          fatca_exemption_code: w9Form.fatca_exemption_code,
          address: w9Form.address,
          city: w9Form.city,
          state: w9Form.state,
          zip: w9Form.zip,
          tin_type: w9Form.tin_type,
          tin_last4,
          certification: w9Form.certification,
          signature_data: w9Form.signature_data,
          signature_date: w9Form.signature_date,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit W9');
      setW9Success(true);
      onRefresh();
    } catch (err: any) {
      setW9Error(err.message);
    } finally {
      setW9Loading(false);
    }
  };

  const handleStripeConnect = async () => {
    setStripeError('');
    setStripeLoading(true);
    try {
      const res = await fetch('/api/team/onboarding/stripe-connect', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start Stripe Connect');
      const url = json.data?.url || json.url;
      if (url) window.location.href = url;
    } catch (err: any) {
      setStripeError(err.message);
    } finally {
      setStripeLoading(false);
    }
  };

  const handleCheckStripeStatus = async () => {
    setStripeCheckLoading(true);
    try {
      await fetch('/api/team/onboarding/stripe-connect/status', { credentials: 'include' });
      onRefresh();
    } catch {} finally {
      setStripeCheckLoading(false);
    }
  };

  const steps = [
    { num: 1, label: 'W9 Form', done: w9Done },
    { num: 2, label: 'Direct Deposit Setup', done: ddDone },
  ];

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900 mb-2">Complete Your Onboarding</h1>
          <p className="text-gray-500">Please complete the following steps to start accepting jobs.</p>
        </div>

        <div className="flex items-center justify-center mb-8">
          {steps.map((step, idx) => (
            <React.Fragment key={step.num}>
              <button
                onClick={() => setCurrentStep(step.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                  currentStep === step.num
                    ? 'bg-teal-600 text-white'
                    : step.done
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step.done ? <CheckCircleIcon className="w-4 h-4" /> : <ClockIcon className="w-4 h-4" />}
                {step.label}
              </button>
              {idx < steps.length - 1 && <div className="w-12 h-0.5 bg-gray-300 mx-2" />}
            </React.Fragment>
          ))}
        </div>

        <Card className="p-8">
          {currentStep === 1 && (
            <div>
              {w9Done || w9Success ? (
                <div className="text-center py-8">
                  <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">W9 Form Submitted</h2>
                  <p className="text-gray-500">Your W9 form has been submitted successfully.</p>
                </div>
              ) : (
                <form onSubmit={handleW9Submit} className="space-y-5">
                  <div className="border-b border-gray-200 pb-4 mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Form W-9</h2>
                    <p className="text-xs text-gray-400 mt-1">Request for Taxpayer Identification Number and Certification</p>
                  </div>

                  {w9Error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{w9Error}</div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">1. Legal name (as shown on your income tax return) *</label>
                    <input type="text" value={w9Form.legal_name} onChange={e => updateW9('legal_name', e.target.value)} required className={inputClass} />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">2. Business name/disregarded entity name, if different from above</label>
                    <input type="text" value={w9Form.business_name} onChange={e => updateW9('business_name', e.target.value)} className={inputClass} />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">3. Federal tax classification *</label>
                    <div className="space-y-2">
                      {[
                        { value: 'individual', label: 'Individual/sole proprietor or single-member LLC' },
                        { value: 'c_corp', label: 'C Corporation' },
                        { value: 's_corp', label: 'S Corporation' },
                        { value: 'partnership', label: 'Partnership' },
                        { value: 'trust_estate', label: 'Trust/estate' },
                        { value: 'llc', label: 'Limited liability company (LLC)' },
                        { value: 'other', label: 'Other' },
                      ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="tax_class"
                            value={opt.value}
                            checked={w9Form.federal_tax_classification === opt.value}
                            onChange={e => updateW9('federal_tax_classification', e.target.value)}
                            className="text-teal-600 focus:ring-teal-500"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                    {w9Form.federal_tax_classification === 'llc' && (
                      <div className="mt-2 ml-6">
                        <label className="block text-xs font-bold text-gray-600 mb-1">LLC tax classification</label>
                        <select value={w9Form.llc_classification} onChange={e => updateW9('llc_classification', e.target.value)} className={inputClass + ' max-w-xs'}>
                          <option value="">Select...</option>
                          <option value="C">C - C Corporation</option>
                          <option value="S">S - S Corporation</option>
                          <option value="P">P - Partnership</option>
                        </select>
                      </div>
                    )}
                    {w9Form.federal_tax_classification === 'other' && (
                      <div className="mt-2 ml-6">
                        <input type="text" placeholder="Specify..." value={w9Form.other_classification} onChange={e => updateW9('other_classification', e.target.value)} className={inputClass + ' max-w-xs'} />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">4. Exempt payee code (if any)</label>
                      <input type="text" value={w9Form.exempt_payee_code} onChange={e => updateW9('exempt_payee_code', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">FATCA exemption code (if any)</label>
                      <input type="text" value={w9Form.fatca_exemption_code} onChange={e => updateW9('fatca_exemption_code', e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">5. Address (number, street, and apt. or suite no.) *</label>
                    <input type="text" value={w9Form.address} onChange={e => updateW9('address', e.target.value)} required className={inputClass} />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">6. City *</label>
                      <input type="text" value={w9Form.city} onChange={e => updateW9('city', e.target.value)} required className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">State *</label>
                      <select value={w9Form.state} onChange={e => updateW9('state', e.target.value)} required className={inputClass}>
                        <option value="">Select...</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">ZIP code *</label>
                      <input type="text" value={w9Form.zip} onChange={e => updateW9('zip', e.target.value)} required className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Taxpayer Identification Number (TIN)</label>
                    <div className="flex gap-4 mb-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="tin_type" value="ssn" checked={w9Form.tin_type === 'ssn'} onChange={() => updateW9('tin_type', 'ssn')} className="text-teal-600 focus:ring-teal-500" />
                        Social Security Number (SSN)
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="tin_type" value="ein" checked={w9Form.tin_type === 'ein'} onChange={() => updateW9('tin_type', 'ein')} className="text-teal-600 focus:ring-teal-500" />
                        Employer Identification Number (EIN)
                      </label>
                    </div>
                    {w9Form.tin_type === 'ssn' ? (
                      <div className="flex items-center gap-2">
                        <input type="text" maxLength={3} placeholder="XXX" value={w9Form.ssn1} onChange={e => updateW9('ssn1', e.target.value.replace(/\D/g, ''))} className={inputClass + ' w-20 text-center'} />
                        <span className="text-gray-400">-</span>
                        <input type="text" maxLength={2} placeholder="XX" value={w9Form.ssn2} onChange={e => updateW9('ssn2', e.target.value.replace(/\D/g, ''))} className={inputClass + ' w-16 text-center'} />
                        <span className="text-gray-400">-</span>
                        <input type="text" maxLength={4} placeholder="XXXX" value={w9Form.ssn3} onChange={e => updateW9('ssn3', e.target.value.replace(/\D/g, ''))} className={inputClass + ' w-20 text-center'} />
                        <span className="text-xs text-gray-400 ml-2">(Only last 4 digits stored)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input type="text" maxLength={2} placeholder="XX" value={w9Form.ein1} onChange={e => updateW9('ein1', e.target.value.replace(/\D/g, ''))} className={inputClass + ' w-16 text-center'} />
                        <span className="text-gray-400">-</span>
                        <input type="text" maxLength={7} placeholder="XXXXXXX" value={w9Form.ein2} onChange={e => updateW9('ein2', e.target.value.replace(/\D/g, ''))} className={inputClass + ' w-28 text-center'} />
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={w9Form.certification}
                        onChange={e => updateW9('certification', e.target.checked)}
                        className="mt-1 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-gray-700 leading-relaxed">
                        Under penalties of perjury, I certify that: 1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); 2. I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the IRS that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; 3. I am a U.S. citizen or other U.S. person; 4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Signature *</label>
                    <SignaturePad onSignatureChange={(data) => updateW9('signature_data', data)} />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                    <input type="date" value={w9Form.signature_date} readOnly className={inputClass + ' bg-gray-50 max-w-xs'} />
                  </div>

                  <Button type="submit" disabled={w9Loading} className="w-full">
                    {w9Loading ? 'Submitting...' : 'Submit W9 Form'}
                  </Button>
                </form>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="text-center py-6">
              {ddDone ? (
                <>
                  <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Direct Deposit Setup Complete</h2>
                  <p className="text-gray-500">Your bank account is connected and ready to receive payments.</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18v-.008Zm-12 0h.008v.008H6v-.008Z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Direct Deposit</h2>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Connect your bank account through Stripe to receive payments directly. This is a secure process powered by Stripe.
                  </p>

                  {stripeError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4 max-w-md mx-auto">{stripeError}</div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={handleStripeConnect} disabled={stripeLoading}>
                      {stripeLoading ? 'Connecting...' : 'Connect Your Bank Account'}
                    </Button>
                    <Button variant="secondary" onClick={handleCheckStripeStatus} disabled={stripeCheckLoading}>
                      {stripeCheckLoading ? 'Checking...' : 'Check Status'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        <div className="flex justify-center mt-6">
          <Button variant="ghost" onClick={onRefresh}>Refresh Status</Button>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ driver: Driver; onNavigate: (view: string) => void }> = ({ driver, onNavigate }) => {
  const [profile, setProfile] = useState<any>(null);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, jobsRes, myJobsRes] = await Promise.all([
          fetch('/api/team/profile', { credentials: 'include' }),
          fetch('/api/team/jobs', { credentials: 'include' }),
          fetch('/api/team/my-jobs', { credentials: 'include' }),
        ]);
        if (profileRes.ok) { const j = await profileRes.json(); setProfile(j.data); }
        if (jobsRes.ok) { const j = await jobsRes.json(); setAvailableJobs(j.data || []); }
        if (myJobsRes.ok) { const j = await myJobsRes.json(); setMyJobs(j.data || []); }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const rating = parseFloat(profile?.rating) || 0;
  const totalCompleted = profile?.total_jobs_completed || 0;
  const activeJobs = myJobs.filter(j => j.status === 'assigned' || j.status === 'in_progress');
  const upcomingJobs = myJobs
    .filter(j => j.status === 'assigned')
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
    .slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 mb-1">Welcome back, {driver.full_name.split(' ')[0]}!</h2>
      <p className="text-gray-500 mb-6">Here's your overview for today.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <StarIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <p className="text-sm font-bold text-gray-500">Rating</p>
          </div>
          {rating > 0 ? (
            <>
              <p className="text-3xl font-black text-gray-900">{rating.toFixed(1)}</p>
              <StarRating rating={rating} className="w-4 h-4" />
            </>
          ) : (
            <>
              <p className="text-3xl font-black text-gray-900">—</p>
              <p className="text-xs text-gray-400 mt-1">No ratings yet</p>
            </>
          )}
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <BriefcaseIcon className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm font-bold text-gray-500">Jobs Completed</p>
          </div>
          <p className="text-3xl font-black text-gray-900">{totalCompleted}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-gray-500">Active Jobs</p>
          </div>
          <p className="text-3xl font-black text-gray-900">{activeJobs.length}</p>
          <p className="text-xs text-gray-400 mt-1">Assigned or in progress</p>
        </Card>
      </div>

      {upcomingJobs.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <CalendarDaysIcon className="w-5 h-5 text-teal-600" />
            <h3 className="text-lg font-bold text-gray-900">Upcoming Jobs</h3>
          </div>
          <div className="space-y-3">
            {upcomingJobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{job.title}</p>
                  <p className="text-xs text-gray-500">
                    {job.scheduled_date} · {job.start_time}–{job.end_time}
                    {job.area && <> · {job.area}</>}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BriefcaseIcon className="w-5 h-5 text-teal-600" />
            <h3 className="text-lg font-bold text-gray-900">Available Jobs</h3>
          </div>
          {availableJobs.length > 0 && (
            <button onClick={() => onNavigate('jobs')} className="text-sm font-bold text-teal-600 hover:underline">
              View All →
            </button>
          )}
        </div>
        {availableJobs.length > 0 ? (
          <p className="text-gray-500 text-sm">
            {availableJobs.length} job{availableJobs.length !== 1 ? 's' : ''} available for bidding.
          </p>
        ) : (
          <p className="text-gray-500 text-sm">No available jobs at the moment. Check back later or view the job board for updates.</p>
        )}
      </Card>
    </div>
  );
};

const JobBoard: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<(Job & { bids?: Bid[] }) | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState('');
  const [myBid, setMyBid] = useState<Bid | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'area' | 'pay'>('date');
  const [filterArea, setFilterArea] = useState('');

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/team/jobs', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setJobs(j.data || []); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchJobs(); }, []);

  const openJobDetail = async (jobId: string) => {
    setJobDetailLoading(true);
    setBidError('');
    setMyBid(null);
    try {
      const res = await fetch(`/api/team/jobs/${jobId}`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        const job = j.data;
        setSelectedJob(job);
        setBidAmount(job.base_pay?.toString() || '');
        setBidMessage('');
        const profileRes = await fetch('/api/team/profile', { credentials: 'include' });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const driverId = profileData.data?.id?.toString();
          const existing = job.bids?.find((b: Bid) => b.driver_id?.toString() === driverId);
          setMyBid(existing || null);
        }
      }
    } catch {}
    setJobDetailLoading(false);
  };

  const handleBid = async () => {
    if (!selectedJob) return;
    setBidError('');
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/jobs/${selectedJob.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bid_amount: parseFloat(bidAmount), message: bidMessage || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to place bid');
      await openJobDetail(selectedJob.id);
      fetchJobs();
    } catch (err: any) {
      setBidError(err.message);
    } finally {
      setBidLoading(false);
    }
  };

  const handleWithdrawBid = async () => {
    if (!selectedJob) return;
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/jobs/${selectedJob.id}/bid`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setMyBid(null);
      await openJobDetail(selectedJob.id);
      fetchJobs();
    } catch (err: any) {
      setBidError(err.message);
    } finally {
      setBidLoading(false);
    }
  };

  const areas = Array.from(new Set(jobs.map(j => j.area).filter(Boolean))) as string[];

  const filteredJobs = jobs
    .filter(j => !filterArea || j.area === filterArea)
    .sort((a, b) => {
      if (sortBy === 'date') return (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
      if (sortBy === 'area') return (a.area || '').localeCompare(b.area || '');
      if (sortBy === 'pay') return (b.base_pay || 0) - (a.base_pay || 0);
      return 0;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 mb-1">Available Jobs</h2>
      <p className="text-gray-500 mb-6">Browse and bid on available jobs in your area.</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="date">Sort by Date</option>
          <option value="area">Sort by Area</option>
          <option value="pay">Sort by Pay (High to Low)</option>
        </select>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {filteredJobs.length === 0 ? (
        <Card className="p-8 text-center">
          <BriefcaseIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-bold">No available jobs</p>
          <p className="text-gray-400 text-sm mt-1">Check back later for new job postings.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredJobs.map(job => (
            <Card key={job.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-gray-900">{job.title}</h3>
                <StatusBadge status={job.status} />
              </div>
              <div className="space-y-1 text-sm text-gray-500 mb-4">
                {job.area && <p className="flex items-center gap-1"><MapPinIcon className="w-4 h-4" />{job.area}</p>}
                {job.scheduled_date && <p className="flex items-center gap-1"><CalendarDaysIcon className="w-4 h-4" />{job.scheduled_date}</p>}
                {(job.start_time || job.end_time) && <p className="flex items-center gap-1"><ClockIcon className="w-4 h-4" />{job.start_time}–{job.end_time}</p>}
                <div className="flex gap-4 mt-2">
                  {job.estimated_stops != null && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{job.estimated_stops} stops</span>}
                  {job.estimated_hours != null && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{job.estimated_hours}h est.</span>}
                  {job.base_pay != null && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded font-bold">${job.base_pay.toFixed(2)}</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => openJobDetail(job.id)} className="w-full">
                View Details & Bid
              </Button>
            </Card>
          ))}
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{selectedJob.title}</h3>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            {jobDetailLoading ? (
              <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedJob.status} />
                  {selectedJob.area && <span className="text-sm text-gray-500 flex items-center gap-1"><MapPinIcon className="w-4 h-4" />{selectedJob.area}</span>}
                </div>

                {selectedJob.description && <p className="text-sm text-gray-600">{selectedJob.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedJob.scheduled_date && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Date</span><span className="font-bold">{selectedJob.scheduled_date}</span></div>}
                  {(selectedJob.start_time || selectedJob.end_time) && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Time</span><span className="font-bold">{selectedJob.start_time}–{selectedJob.end_time}</span></div>}
                  {selectedJob.estimated_stops != null && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Stops</span><span className="font-bold">{selectedJob.estimated_stops}</span></div>}
                  {selectedJob.estimated_hours != null && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Est. Hours</span><span className="font-bold">{selectedJob.estimated_hours}</span></div>}
                  {selectedJob.base_pay != null && <div className="bg-teal-50 p-3 rounded-lg col-span-2"><span className="text-teal-600 text-xs block">Base Pay</span><span className="font-black text-teal-700 text-lg">${selectedJob.base_pay.toFixed(2)}</span></div>}
                </div>

                {selectedJob.bids && selectedJob.bids.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm mb-2">Bids ({selectedJob.bids.length})</h4>
                    <div className="space-y-2">
                      {selectedJob.bids.map((bid, idx) => {
                        const isMyBid = myBid && bid.id === myBid.id;
                        return (
                          <div key={bid.id} className={`p-3 rounded-lg text-sm ${isMyBid ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{isMyBid ? 'Your Bid' : `Driver #${idx + 1}`}</span>
                              <span className="font-bold text-teal-700">${bid.bid_amount.toFixed(2)}</span>
                            </div>
                            {bid.driver_rating_at_bid != null && (
                              <div className="flex items-center gap-1 mt-1">
                                <StarRating rating={bid.driver_rating_at_bid} className="w-3 h-3" />
                                <span className="text-xs text-gray-400">{bid.driver_rating_at_bid.toFixed(1)}</span>
                              </div>
                            )}
                            {bid.message && <p className="text-xs text-gray-500 mt-1">{bid.message}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {bidError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{bidError}</div>
                )}

                {myBid ? (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-teal-800 mb-2">You have already bid on this job</p>
                    <p className="text-sm text-teal-700">Your bid: <span className="font-bold">${myBid.bid_amount.toFixed(2)}</span></p>
                    <Button variant="secondary" size="sm" onClick={handleWithdrawBid} disabled={bidLoading} className="mt-3">
                      {bidLoading ? 'Withdrawing...' : 'Withdraw Bid'}
                    </Button>
                  </div>
                ) : (selectedJob.status === 'open' || selectedJob.status === 'bidding') ? (
                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="font-bold text-gray-900 text-sm mb-3">Place Your Bid</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Bid Amount ($)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bidAmount}
                            onChange={e => setBidAmount(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Message (optional)</label>
                        <textarea
                          value={bidMessage}
                          onChange={e => setBidMessage(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                          placeholder="Add a note to your bid..."
                        />
                      </div>
                      <Button onClick={handleBid} disabled={bidLoading || !bidAmount} className="w-full">
                        {bidLoading ? 'Submitting...' : 'Submit Bid'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Schedule: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/team/schedule?start=${startStr}&end=${endStr}`, { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setJobs(j.data || []); }
    } catch {}
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const jobsByDate: Record<string, Job[]> = {};
  jobs.forEach(j => {
    if (j.scheduled_date) {
      if (!jobsByDate[j.scheduled_date]) jobsByDate[j.scheduled_date] = [];
      jobsByDate[j.scheduled_date].push(j);
    }
  });

  const getJobColor = (status: string) => {
    if (status === 'assigned') return 'bg-teal-100 text-teal-700';
    if (status === 'in_progress') return 'bg-yellow-100 text-yellow-700';
    if (status === 'completed') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-600';
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedDayJobs = selectedDay ? (jobsByDate[selectedDay] || []) : [];

  const allJobsSorted = [...jobs].sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">My Schedule</h2>
          <p className="text-gray-500">View your upcoming jobs and schedule.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('calendar')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'calendar' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CalendarDaysIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ListIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
        </div>
      ) : viewMode === 'calendar' ? (
        <>
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeftIcon className="w-5 h-5 text-gray-600" /></button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">{monthName}</h3>
                <button onClick={goToday} className="text-xs font-bold text-teal-600 hover:underline px-2 py-1 bg-teal-50 rounded">Today</button>
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRightIcon className="w-5 h-5 text-gray-600" /></button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500">{day}</div>
              ))}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-white p-2 min-h-[80px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayJobs = jobsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                    className={`bg-white p-2 min-h-[80px] text-left transition-colors hover:bg-gray-50 ${isSelected ? 'ring-2 ring-teal-500 ring-inset' : ''}`}
                  >
                    <span className={`text-sm font-bold ${isToday ? 'bg-teal-600 text-white w-7 h-7 rounded-full inline-flex items-center justify-center' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayJobs.slice(0, 2).map(j => (
                        <div key={j.id} className={`text-[10px] font-bold px-1 py-0.5 rounded truncate ${getJobColor(j.status)}`}>
                          {j.title}
                        </div>
                      ))}
                      {dayJobs.length > 2 && (
                        <div className="text-[10px] text-gray-400 font-bold">+{dayJobs.length - 2} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selectedDay && (
            <Card className="p-6">
              <h3 className="font-bold text-gray-900 mb-3">
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              {selectedDayJobs.length === 0 ? (
                <p className="text-sm text-gray-400">No jobs scheduled for this day.</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayJobs.map(job => (
                    <div key={job.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-900 text-sm">{job.title}</span>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {job.area && <p>Area: {job.area}</p>}
                        {(job.start_time || job.end_time) && <p>Time: {job.start_time}–{job.end_time}</p>}
                        {job.estimated_stops != null && <p>Estimated stops: {job.estimated_stops}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card className="p-6">
          {allJobsSorted.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No scheduled jobs.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allJobsSorted.map(job => (
                <div key={job.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      {job.scheduled_date} · {job.start_time}–{job.end_time}
                      {job.area && <> · {job.area}</>}
                      {job.estimated_stops != null && <> · {job.estimated_stops} stops</>}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [availability, setAvailability] = useState<{ days: string[]; start_time: string; end_time: string }>({
    days: [], start_time: '08:00', end_time: '17:00'
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/team/profile', { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          const d = j.data;
          setProfile(d);
          setEditName(d.name || '');
          setEditPhone(d.phone || '');
          if (d.availability) {
            setAvailability(typeof d.availability === 'string' ? JSON.parse(d.availability) : d.availability);
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaveLoading(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/team/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName, phone: editPhone, availability }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to save');
      setProfile(j.data);
      setEditing(false);
      setSaveMsg('Profile updated successfully!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err: any) {
      setSaveMsg(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    setAvailability(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!profile) {
    return <p className="text-gray-500">Failed to load profile.</p>;
  }

  const rating = parseFloat(profile.rating) || 0;

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 mb-1">Profile Settings</h2>
      <p className="text-gray-500 mb-6">Manage your account and preferences.</p>

      {saveMsg && (
        <div className={`mb-4 text-sm rounded-lg px-4 py-3 ${saveMsg.includes('success') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {saveMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-sm font-bold text-teal-600 hover:underline">Edit</button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email (read-only)</label>
                  <input type="email" value={profile.email || ''} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={saveLoading} size="sm">
                    {saveLoading ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button variant="secondary" onClick={() => { setEditing(false); setEditName(profile.name || ''); setEditPhone(profile.phone || ''); }} size="sm">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="text-sm font-bold text-gray-900">{profile.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Email</span>
                  <span className="text-sm font-bold text-gray-900">{profile.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-bold text-gray-900">{profile.phone || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Rating</span>
                  <div className="flex items-center gap-2">
                    <StarRating rating={rating} className="w-4 h-4" />
                    <span className="text-sm font-bold text-gray-900">{rating > 0 ? rating.toFixed(1) : '—'}</span>
                  </div>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-500">Jobs Completed</span>
                  <span className="text-sm font-bold text-gray-900">{profile.total_jobs_completed || 0}</span>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Availability</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Available Days</label>
                <div className="flex flex-wrap gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                        availability.days.includes(day)
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Preferred Start Time</label>
                  <input type="time" value={availability.start_time} onChange={e => setAvailability(prev => ({ ...prev, start_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Preferred End Time</label>
                  <input type="time" value={availability.end_time} onChange={e => setAvailability(prev => ({ ...prev, end_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saveLoading} size="sm">
                {saveLoading ? 'Saving...' : 'Save Availability'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">W9 Status</h3>
            {profile.w9_completed ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="text-sm font-bold">Submitted</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <ClockIcon className="w-5 h-5" />
                <span className="text-sm font-bold">Pending</span>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Direct Deposit</h3>
            {profile.direct_deposit_completed || profile.stripe_connect_onboarded ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="text-sm font-bold">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <ClockIcon className="w-5 h-5" />
                <span className="text-sm font-bold">Not Connected</span>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Onboarding</h3>
            <div className="flex items-center gap-2">
              {profile.onboarding_status === 'completed' ? (
                <>
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-600">Completed</span>
                </>
              ) : (
                <>
                  <ClockIcon className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-bold text-yellow-600">{profile.onboarding_status || 'Pending'}</span>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const TeamApp: React.FC = () => {
  const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
  const [currentView, setCurrentView] = useState<TeamView>('dashboard');
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const checkSession = async () => {
    try {
      const res = await fetch('/api/team/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const json = await res.json();
      setCurrentDriver(normalizeDriver(json.data || json.driver));
      await checkOnboarding();
    } catch {
      setCurrentDriver(null);
    } finally {
      setLoading(false);
    }
  };

  const checkOnboarding = async () => {
    try {
      const res = await fetch('/api/team/onboarding/status', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setOnboardingStatus(json.data || json);
      }
    } catch {}
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/api/team/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Login failed');
      setCurrentDriver(normalizeDriver(json.data || json.driver));
      await checkOnboarding();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (regPassword !== regConfirm) {
      setAuthError('Passwords do not match');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/team/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ full_name: regName, email: regEmail, phone: regPhone, password: regPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Registration failed');
      setCurrentDriver(normalizeDriver(json.data || json.driver));
      await checkOnboarding();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/team/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setCurrentDriver(null);
    setOnboardingStatus(null);
    setCurrentView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!currentDriver) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
              <BriefcaseIcon className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Team Portal</h1>
            <p className="text-gray-500 text-sm mt-1">Driver & Contractor Access</p>
          </div>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
              {authError}
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={authLoading} className="w-full">
                {authLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <p className="text-center text-sm text-gray-500">
                Don't have an account?{' '}
                <button type="button" onClick={() => { setAuthMode('register'); setAuthError(''); }} className="text-teal-600 font-bold hover:underline">
                  Register
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={regConfirm}
                  onChange={e => setRegConfirm(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={authLoading} className="w-full">
                {authLoading ? 'Creating account...' : 'Create Account'}
              </Button>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-teal-600 font-bold hover:underline">
                  Sign In
                </button>
              </p>
            </form>
          )}
        </Card>
      </div>
    );
  }

  if (onboardingStatus && onboardingStatus.onboarding_status !== 'completed') {
    return <OnboardingFlow status={onboardingStatus} onRefresh={checkOnboarding} />;
  }

  const navItems: { view: TeamView; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <HomeIcon className="w-5 h-5" /> },
    { view: 'jobs', label: 'Available Jobs', icon: <BriefcaseIcon className="w-5 h-5" /> },
    { view: 'schedule', label: 'My Schedule', icon: <CalendarDaysIcon className="w-5 h-5" /> },
    { view: 'profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <BriefcaseIcon className="w-8 h-8 text-teal-400" />
            <div>
              <h1 className="text-lg font-black tracking-tight">Team Portal</h1>
              <p className="text-xs text-gray-400">Waste Management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.view}
              onClick={() => { setCurrentView(item.view); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                currentView === item.view
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-black">
              {currentDriver.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{currentDriver.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{currentDriver.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-white transition-colors py-2 rounded-lg hover:bg-gray-800"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-lg font-black text-gray-900">
            {navItems.find(n => n.view === currentView)?.label || 'Team'}
          </h2>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {currentView === 'dashboard' && <Dashboard driver={currentDriver} onNavigate={(view) => setCurrentView(view as TeamView)} />}
          {currentView === 'jobs' && <JobBoard />}
          {currentView === 'schedule' && <Schedule />}
          {currentView === 'profile' && <Profile />}
        </div>
      </main>
    </div>
  );
};

export default TeamApp;
