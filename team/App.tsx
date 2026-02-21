import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import TeamAuthLayout from './components/TeamAuthLayout';
import TeamLogin from './components/TeamLogin';
import TeamRegister from './components/TeamRegister';
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

type TeamView = 'dashboard' | 'jobs' | 'schedule' | 'profile' | 'messages';

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

const ChatBubbleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
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

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
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
        className="border-2 border-gray-300 rounded-lg cursor-crosshair bg-white w-full touch-none"
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

  const [bankForm, setBankForm] = useState({
    account_holder_name: '',
    routing_number: '',
    account_number: '',
    account_type: 'checking' as 'checking' | 'savings',
  });
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [bankSuccess, setBankSuccess] = useState(false);
  const [depositMethod, setDepositMethod] = useState<'select' | 'manual' | 'skip' | null>(null);
  const [skipLoading, setSkipLoading] = useState(false);

  const updateW9 = (field: string, value: any) => setW9Form(prev => ({ ...prev, [field]: value }));
  const updateBank = (field: string, value: any) => setBankForm(prev => ({ ...prev, [field]: value }));

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

  const handleBankAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError('');

    // Client-side validation
    if (!bankForm.account_holder_name.trim()) {
      setBankError('Account holder name is required');
      return;
    }
    if (!bankForm.routing_number.trim()) {
      setBankError('Routing number is required');
      return;
    }
    if (!/^\d{9}$/.test(bankForm.routing_number)) {
      setBankError('Routing number must be 9 digits');
      return;
    }
    if (!bankForm.account_number.trim()) {
      setBankError('Account number is required');
      return;
    }
    if (!/^\d{1,17}$/.test(bankForm.account_number)) {
      setBankError('Account number must be 1-17 digits');
      return;
    }

    setBankLoading(true);
    try {
      const res = await fetch('/api/team/onboarding/bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          account_holder_name: bankForm.account_holder_name,
          routing_number: bankForm.routing_number,
          account_number: bankForm.account_number,
          account_type: bankForm.account_type,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit bank account');
      setBankSuccess(true);
      onRefresh();
    } catch (err: any) {
      setBankError(err.message);
    } finally {
      setBankLoading(false);
    }
  };

  const handleSkipDirectDeposit = async () => {
    setSkipLoading(true);
    try {
      const res = await fetch('/api/team/onboarding/bank-account/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to skip direct deposit setup');
      onRefresh();
    } catch (err: any) {
      setBankError(err.message);
    } finally {
      setSkipLoading(false);
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
                type="button"
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
                    <input type="text" title="Legal name" value={w9Form.legal_name} onChange={e => updateW9('legal_name', e.target.value)} required className={inputClass} />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">2. Business name/disregarded entity name, if different from above</label>
                    <input type="text" title="Business name" value={w9Form.business_name} onChange={e => updateW9('business_name', e.target.value)} className={inputClass} />
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
                        <select title="LLC tax classification" value={w9Form.llc_classification} onChange={e => updateW9('llc_classification', e.target.value)} className={inputClass + ' max-w-xs'}>
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
                      <input type="text" title="Exempt payee code" value={w9Form.exempt_payee_code} onChange={e => updateW9('exempt_payee_code', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">FATCA exemption code (if any)</label>
                      <input type="text" title="FATCA exemption code" value={w9Form.fatca_exemption_code} onChange={e => updateW9('fatca_exemption_code', e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">5. Address (number, street, and apt. or suite no.) *</label>
                    <input type="text" title="Address" value={w9Form.address} onChange={e => updateW9('address', e.target.value)} required className={inputClass} />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">6. City *</label>
                      <input type="text" title="City" value={w9Form.city} onChange={e => updateW9('city', e.target.value)} required className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">State *</label>
                      <select title="State" value={w9Form.state} onChange={e => updateW9('state', e.target.value)} required className={inputClass}>
                        <option value="">Select...</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">ZIP code *</label>
                      <input type="text" title="ZIP code" value={w9Form.zip} onChange={e => updateW9('zip', e.target.value)} required className={inputClass} />
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
                    <input type="date" title="Signature date" value={w9Form.signature_date} readOnly className={inputClass + ' bg-gray-50 max-w-xs'} />
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
              ) : depositMethod === null || depositMethod === 'select' ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Direct Deposit</h2>
                    <p className="text-gray-500 mb-6">Choose how you'd like to connect your bank account</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <button
                      type="button"
                      onClick={() => setDepositMethod('manual')}
                      className="p-4 border-2 border-teal-200 rounded-lg hover:border-teal-600 hover:bg-teal-50 transition-all text-left"
                    >
                      <h3 className="font-bold text-gray-900 mb-1">Enter Bank Account Manually</h3>
                      <p className="text-sm text-gray-600">Securely enter your routing and account number</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDepositMethod('skip');
                        handleSkipDirectDeposit();
                      }}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
                    >
                      <h3 className="font-bold text-gray-900 mb-1">Set Up Later</h3>
                      <p className="text-sm text-gray-600">Complete onboarding now, add bank details anytime</p>
                    </button>
                  </div>
                </div>
              ) : depositMethod === 'manual' ? (
                <form onSubmit={handleBankAccountSubmit} className="space-y-5">
                  <div className="border-b border-gray-200 pb-4 mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Direct Deposit Setup</h2>
                    <p className="text-xs text-gray-400 mt-1">Enter your bank account information to receive payments</p>
                  </div>

                  {bankError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{bankError}</div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      value={bankForm.account_holder_name}
                      onChange={e => updateBank('account_holder_name', e.target.value)}
                      placeholder="John Doe"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Account Type *</label>
                    <select
                      title="Account type"
                      value={bankForm.account_type}
                      onChange={e => updateBank('account_type', e.target.value as 'checking' | 'savings')}
                      className={inputClass}
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Routing Number *</label>
                      <input
                        type="text"
                        value={bankForm.routing_number}
                        onChange={e => updateBank('routing_number', e.target.value.replace(/\D/g, ''))}
                        placeholder="000000000"
                        maxLength={9}
                        required
                        className={inputClass}
                      />
                      <p className="text-xs text-gray-400 mt-1">9-digit ABA routing number</p>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Account Number *</label>
                      <input
                        type="password"
                        value={bankForm.account_number}
                        onChange={e => updateBank('account_number', e.target.value.replace(/\D/g, ''))}
                        placeholder="•••••••••••"
                        required
                        className={inputClass}
                      />
                      <p className="text-xs text-gray-400 mt-1">Up to 17 digits</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs text-blue-700">
                      <strong>Secure:</strong> Your bank account information is encrypted and stored securely. We never share this information with third parties.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDepositMethod('select')}
                      className="flex-1"
                      disabled={bankLoading}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={bankLoading} className="flex-1">
                      {bankLoading ? 'Submitting...' : 'Submit Bank Account'}
                    </Button>
                  </div>
                </form>
              ) : null}
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
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingJobId, setCompletingJobId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [jobsRes, myJobsRes] = await Promise.all([
        fetch('/api/team/jobs', { credentials: 'include' }),
        fetch('/api/team/my-jobs', { credentials: 'include' }),
      ]);
      if (jobsRes.ok) { const j = await jobsRes.json(); setAvailableJobs(j.data || []); }
      if (myJobsRes.ok) { const j = await myJobsRes.json(); setMyJobs(j.data || []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCompleteJob = async (jobId: string) => {
    if (!window.confirm('Mark this job as complete?')) return;
    setCompletingJobId(jobId);
    try {
      const res = await fetch(`/api/team/jobs/${jobId}/complete`, { method: 'POST', credentials: 'include' });
      if (res.ok) await loadData();
    } catch {}
    setCompletingJobId(null);
  };

  const rating = parseFloat(driver.rating ?? '') || 0;
  const totalCompleted = driver.total_jobs_completed || 0;
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
              <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{job.title}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(job.scheduled_date)} · {job.start_time}–{job.end_time}
                    {job.area && <> · {job.area}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={job.status} />
                  <Button
                    size="sm"
                    onClick={() => handleCompleteJob(job.id)}
                    disabled={completingJobId === job.id}
                  >
                    {completingJobId === job.id ? 'Completing…' : 'Complete'}
                  </Button>
                </div>
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
            <button type="button" onClick={() => onNavigate('jobs')} className="text-sm font-bold text-teal-600 hover:underline">
              View All →
            </button>
          )}
        </div>
        {availableJobs.length === 0 ? (
          <p className="text-gray-500 text-sm">No available jobs at the moment. Check back later.</p>
        ) : (
          <>
            <div className="space-y-2">
              {availableJobs.slice(0, 3).map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      {job.area && <>{job.area} · </>}
                      {formatDate(job.scheduled_date)}
                      {job.base_pay != null && <> · <span className="font-bold text-teal-700">${job.base_pay.toFixed(2)}</span></>}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
            {availableJobs.length > 3 && (
              <p className="text-xs text-gray-400 mt-2">+{availableJobs.length - 3} more on the job board</p>
            )}
          </>
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
    if (!window.confirm('Are you sure you want to withdraw your bid? This cannot be undone.')) return;
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
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500">Browse and bid on available jobs in your area.</p>
        <button
          type="button"
          onClick={fetchJobs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select title="Sort jobs" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="date">Sort by Date</option>
          <option value="area">Sort by Area</option>
          <option value="pay">Sort by Pay (High to Low)</option>
        </select>
        <select title="Filter by area" value={filterArea} onChange={e => setFilterArea(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
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
                {job.scheduled_date && <p className="flex items-center gap-1"><CalendarDaysIcon className="w-4 h-4" />{formatDate(job.scheduled_date)}</p>}
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
              <button type="button" title="Close" onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
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
                  {selectedJob.scheduled_date && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Date</span><span className="font-bold">{formatDate(selectedJob.scheduled_date)}</span></div>}
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
                            title="Bid amount"
                            step="0.01"
                            min="0.01"
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
                      <Button onClick={handleBid} disabled={bidLoading || !bidAmount || parseFloat(bidAmount) <= 0} className="w-full">
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

  const [completingJobId, setCompletingJobId] = useState<string | null>(null);

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

  const handleCompleteJob = useCallback(async (jobId: string) => {
    if (!window.confirm('Mark this job as complete?')) return;
    setCompletingJobId(jobId);
    try {
      const res = await fetch(`/api/team/jobs/${jobId}/complete`, { method: 'POST', credentials: 'include' });
      if (res.ok) await fetchSchedule();
    } catch {}
    setCompletingJobId(null);
  }, [fetchSchedule]);

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
        <p className="text-gray-500">View your upcoming jobs and schedule.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Calendar view"
            onClick={() => setViewMode('calendar')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'calendar' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CalendarDaysIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            title="List view"
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
              <button type="button" title="Previous month" onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeftIcon className="w-5 h-5 text-gray-600" /></button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">{monthName}</h3>
                <button type="button" onClick={goToday} className="text-xs font-bold text-teal-600 hover:underline px-2 py-1 bg-teal-50 rounded">Today</button>
              </div>
              <button type="button" title="Next month" onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRightIcon className="w-5 h-5 text-gray-600" /></button>
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
                    type="button"
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
                      {(job.status === 'assigned' || job.status === 'in_progress') && (
                        <Button
                          size="sm"
                          onClick={() => handleCompleteJob(job.id)}
                          disabled={completingJobId === job.id}
                          className="mt-2"
                        >
                          {completingJobId === job.id ? 'Completing…' : 'Mark Complete'}
                        </Button>
                      )}
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
                <div key={job.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(job.scheduled_date)} · {job.start_time}–{job.end_time}
                      {job.area && <> · {job.area}</>}
                      {job.estimated_stops != null && <> · {job.estimated_stops} stops</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={job.status} />
                    {(job.status === 'assigned' || job.status === 'in_progress') && (
                      <Button
                        size="sm"
                        onClick={() => handleCompleteJob(job.id)}
                        disabled={completingJobId === job.id}
                      >
                        {completingJobId === job.id ? 'Completing…' : 'Complete'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

function parseTaxClass(stored: string) {
  if (stored?.startsWith('LLC (')) {
    return { federal_tax_classification: 'llc', llc_classification: stored.slice(5, -1), other_classification: '' };
  }
  if (stored?.startsWith('Other: ')) {
    return { federal_tax_classification: 'other', llc_classification: '', other_classification: stored.slice(7) };
  }
  return { federal_tax_classification: stored || '', llc_classification: '', other_classification: '' };
}

const W9UpdateModal: React.FC<{ existingW9: any | null; onClose: () => void; onSuccess: () => void }> = ({ existingW9, onClose, onSuccess }) => {
  const parsed = parseTaxClass(existingW9?.federal_tax_classification);
  const [form, setForm] = useState({
    legal_name: existingW9?.legal_name || '',
    business_name: existingW9?.business_name || '',
    federal_tax_classification: parsed.federal_tax_classification,
    llc_classification: parsed.llc_classification,
    other_classification: parsed.other_classification,
    exempt_payee_code: existingW9?.exempt_payee_code || '',
    fatca_exemption_code: existingW9?.fatca_exemption_code || '',
    address: existingW9?.address || '',
    city: existingW9?.city || '',
    state: existingW9?.state || '',
    zip: existingW9?.zip || '',
    tin_type: (existingW9?.tin_type as 'ssn' | 'ein') || 'ssn',
    certification: false,
    signature_data: '',
    signature_date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.legal_name || !form.federal_tax_classification || !form.address || !form.city || !form.state || !form.zip) {
      setError('Please fill in all required fields.'); return;
    }
    if (!form.certification) { setError('You must certify the information is correct.'); return; }
    if (!form.signature_data) { setError('Please provide your signature.'); return; }

    const federal_tax_classification = form.federal_tax_classification === 'llc'
      ? `LLC (${form.llc_classification})`
      : form.federal_tax_classification === 'other'
        ? `Other: ${form.other_classification}`
        : form.federal_tax_classification;

    setLoading(true);
    try {
      const res = await fetch('/api/team/onboarding/w9', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          legal_name: form.legal_name, business_name: form.business_name,
          federal_tax_classification,
          exempt_payee_code: form.exempt_payee_code, fatca_exemption_code: form.fatca_exemption_code,
          address: form.address, city: form.city, state: form.state, zip: form.zip,
          tin_type: form.tin_type, certification: form.certification,
          signature_data: form.signature_data, signature_date: form.signature_date,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update W9');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-black text-gray-900">Update W9 Form</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fields are pre-filled from your last submission. Re-sign to save.</p>
            </div>
            <button type="button" title="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">1. Legal name *</label>
              <input type="text" title="Legal name" value={form.legal_name} onChange={e => update('legal_name', e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">2. Business name (if different)</label>
              <input type="text" title="Business name" value={form.business_name} onChange={e => update('business_name', e.target.value)} className={inputClass} />
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
                    <input type="radio" name="w9_update_tax_class" value={opt.value} checked={form.federal_tax_classification === opt.value} onChange={e => update('federal_tax_classification', e.target.value)} className="text-teal-600 focus:ring-teal-500" />
                    {opt.label}
                  </label>
                ))}
              </div>
              {form.federal_tax_classification === 'llc' && (
                <div className="mt-2 ml-6">
                  <label className="block text-xs font-bold text-gray-600 mb-1">LLC tax classification</label>
                  <select title="LLC tax classification" value={form.llc_classification} onChange={e => update('llc_classification', e.target.value)} className={inputClass + ' max-w-xs'}>
                    <option value="">Select...</option>
                    <option value="C">C - C Corporation</option>
                    <option value="S">S - S Corporation</option>
                    <option value="P">P - Partnership</option>
                  </select>
                </div>
              )}
              {form.federal_tax_classification === 'other' && (
                <div className="mt-2 ml-6">
                  <input type="text" title="Other classification" placeholder="Specify..." value={form.other_classification} onChange={e => update('other_classification', e.target.value)} className={inputClass + ' max-w-xs'} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">4. Exempt payee code</label>
                <input type="text" title="Exempt payee code" value={form.exempt_payee_code} onChange={e => update('exempt_payee_code', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">FATCA exemption code</label>
                <input type="text" title="FATCA exemption code" value={form.fatca_exemption_code} onChange={e => update('fatca_exemption_code', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">5. Address *</label>
              <input type="text" title="Address" value={form.address} onChange={e => update('address', e.target.value)} required className={inputClass} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">City *</label>
                <input type="text" title="City" value={form.city} onChange={e => update('city', e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">State *</label>
                <select title="State" value={form.state} onChange={e => update('state', e.target.value)} required className={inputClass}>
                  <option value="">Select...</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">ZIP *</label>
                <input type="text" title="ZIP code" value={form.zip} onChange={e => update('zip', e.target.value)} required className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">TIN type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="w9_update_tin_type" value="ssn" checked={form.tin_type === 'ssn'} onChange={() => update('tin_type', 'ssn')} className="text-teal-600 focus:ring-teal-500" />
                  Social Security Number (SSN)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="w9_update_tin_type" value="ein" checked={form.tin_type === 'ein'} onChange={() => update('tin_type', 'ein')} className="text-teal-600 focus:ring-teal-500" />
                  Employer Identification Number (EIN)
                </label>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={form.certification} onChange={e => update('certification', e.target.checked)} className="mt-1 text-teal-600 focus:ring-teal-500" />
                <span className="text-gray-700 leading-relaxed">
                  Under penalties of perjury, I certify that the information on this form is correct and I am a U.S. citizen or other U.S. person.
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Signature *</label>
              <SignaturePad onSignatureChange={(data) => update('signature_data', data)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
              <input type="date" title="Signature date" value={form.signature_date} readOnly className={inputClass + ' bg-gray-50 max-w-xs'} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {loading ? 'Saving...' : 'Save W9'}
              </button>
            </div>
          </form>
        </div>
      </div>
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

  // W9 update state
  const [showW9Modal, setShowW9Modal] = useState(false);
  const [w9Data, setW9Data] = useState<any>(null);
  const [w9Msg, setW9Msg] = useState('');

  // Message email opt-in
  const [msgEmailEnabled, setMsgEmailEnabled] = useState(false);

  // Bank account state
  const [bankInfo, setBankInfo] = useState<{ has_bank_account: boolean; account_holder_name?: string; masked_account?: string; account_type?: string } | null>(null);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm] = useState({ account_holder_name: '', routing_number: '', account_number: '', account_type: 'checking' as 'checking' | 'savings' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState('');
  const [bankMsg, setBankMsg] = useState('');

  const loadBankInfo = async () => {
    try {
      const res = await fetch('/api/team/profile/bank-account', { credentials: 'include' });
      if (res.ok) setBankInfo(await res.json());
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes] = await Promise.all([
          fetch('/api/team/profile', { credentials: 'include' }),
        ]);
        if (profileRes.ok) {
          const j = await profileRes.json();
          const d = j.data;
          setProfile(d);
          setEditName(d.name || '');
          setEditPhone(d.phone || '');
          if (d.availability) {
            const av = typeof d.availability === 'string' ? JSON.parse(d.availability) : d.availability;
            setAvailability({
              days: Array.isArray(av.days) ? av.days : [],
              start_time: av.start_time || '08:00',
              end_time: av.end_time || '17:00',
            });
          }
        }
      } catch {}
      await loadBankInfo();
      // Load message email preference
      try {
        const pref = await fetch('/api/team/profile/message-notifications', { credentials: 'include' });
        if (pref.ok) { const j = await pref.json(); setMsgEmailEnabled(j.message_email_notifications ?? false); }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const openW9Modal = async () => {
    if (!w9Data) {
      try {
        const res = await fetch('/api/team/onboarding/w9', { credentials: 'include' });
        if (res.ok) { const j = await res.json(); setW9Data(j.data); }
      } catch {}
    }
    setShowW9Modal(true);
  };

  const handleBankSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError('');
    if (!bankForm.account_holder_name.trim()) { setBankError('Account holder name is required'); return; }
    if (!/^\d{9}$/.test(bankForm.routing_number)) { setBankError('Routing number must be 9 digits'); return; }
    if (!/^\d{1,17}$/.test(bankForm.account_number)) { setBankError('Account number must be 1-17 digits'); return; }
    setBankSaving(true);
    try {
      const res = await fetch('/api/team/onboarding/bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bankForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save bank account');
      await loadBankInfo();
      setShowBankForm(false);
      setBankForm({ account_holder_name: '', routing_number: '', account_number: '', account_type: 'checking' });
      setBankMsg('Bank account updated successfully.');
      setTimeout(() => setBankMsg(''), 4000);
    } catch (err: any) {
      setBankError(err.message);
    } finally {
      setBankSaving(false);
    }
  };

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
                <button type="button" onClick={() => setEditing(true)} className="text-sm font-bold text-teal-600 hover:underline">Edit</button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                  <input type="text" title="Full name" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email (read-only)</label>
                  <input type="email" title="Email" value={profile.email || ''} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                  <input type="tel" title="Phone" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
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
                      type="button"
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
                  <input type="time" title="Preferred start time" value={availability.start_time} onChange={e => setAvailability(prev => ({ ...prev, start_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Preferred End Time</label>
                  <input type="time" title="Preferred end time" value={availability.end_time} onChange={e => setAvailability(prev => ({ ...prev, end_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saveLoading} size="sm">
                {saveLoading ? 'Saving...' : 'Save Availability'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* W9 Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">W9 Form</h3>
              {profile.w9_completed && (
                <button type="button" onClick={openW9Modal} className="text-sm font-bold text-teal-600 hover:underline">
                  Update
                </button>
              )}
            </div>
            {w9Msg && <p className="text-xs text-green-600 mb-2">{w9Msg}</p>}
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

          {/* Bank Account Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">Bank Account</h3>
              {bankInfo?.has_bank_account && !showBankForm && (
                <button type="button" onClick={() => { setShowBankForm(true); setBankError(''); }} className="text-sm font-bold text-teal-600 hover:underline">
                  Update
                </button>
              )}
            </div>
            {bankMsg && <p className="text-xs text-green-600 mb-2">{bankMsg}</p>}

            {!showBankForm && (
              bankInfo?.has_bank_account ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="text-sm font-bold">Connected</span>
                  </div>
                  {bankInfo.account_holder_name && (
                    <p className="text-xs text-gray-500">{bankInfo.account_holder_name}</p>
                  )}
                  {bankInfo.masked_account && (
                    <p className="text-xs text-gray-500 font-mono">{bankInfo.masked_account} · {bankInfo.account_type}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-yellow-600">
                    <ClockIcon className="w-5 h-5" />
                    <span className="text-sm font-bold">Not Connected</span>
                  </div>
                  <button type="button" onClick={() => { setShowBankForm(true); setBankError(''); }} className="text-sm font-bold text-teal-600 hover:underline">
                    Add bank account →
                  </button>
                </div>
              )
            )}

            {showBankForm && (
              <form onSubmit={handleBankSave} className="space-y-4 mt-2">
                {bankError && <p className="text-xs text-red-600">{bankError}</p>}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Account Holder Name *</label>
                  <input
                    type="text"
                    title="Account holder name"
                    value={bankForm.account_holder_name}
                    onChange={e => setBankForm(p => ({ ...p, account_holder_name: e.target.value }))}
                    placeholder="John Doe"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Account Type *</label>
                  <select
                    title="Account type"
                    value={bankForm.account_type}
                    onChange={e => setBankForm(p => ({ ...p, account_type: e.target.value as 'checking' | 'savings' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Routing Number *</label>
                  <input
                    type="text"
                    title="Routing number"
                    value={bankForm.routing_number}
                    onChange={e => setBankForm(p => ({ ...p, routing_number: e.target.value.replace(/\D/g, '') }))}
                    placeholder="000000000"
                    maxLength={9}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">9-digit ABA routing number</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Account Number *</label>
                  <input
                    type="password"
                    title="Account number"
                    value={bankForm.account_number}
                    onChange={e => setBankForm(p => ({ ...p, account_number: e.target.value.replace(/\D/g, '') }))}
                    placeholder="•••••••••••"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Up to 17 digits</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowBankForm(false); setBankError(''); setBankForm({ account_holder_name: '', routing_number: '', account_number: '', account_type: 'checking' }); }}
                    disabled={bankSaving}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bankSaving}
                    className="flex-1 px-3 py-2 bg-teal-500 text-white rounded-lg text-xs font-bold hover:bg-teal-600 disabled:opacity-50"
                  >
                    {bankSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </Card>

          {/* Message Notifications */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Message Notifications</h3>
                <p className="text-sm text-gray-500 mt-1">Receive an email when you get a new message from dispatch.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = !msgEmailEnabled;
                  setMsgEmailEnabled(next);
                  try {
                    await fetch('/api/team/profile/message-notifications', {
                      method: 'PUT',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: next }),
                    });
                  } catch { setMsgEmailEnabled(!next); }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${msgEmailEnabled ? 'bg-teal-500' : 'bg-gray-200'}`}
                aria-label="Toggle message email notifications"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${msgEmailEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </Card>

        </div>
      </div>

      {showW9Modal && (
        <W9UpdateModal
          existingW9={w9Data}
          onClose={() => setShowW9Modal(false)}
          onSuccess={() => { setW9Msg('W9 updated successfully.'); setTimeout(() => setW9Msg(''), 4000); }}
        />
      )}
    </div>
  );
};

interface Conversation {
  id: string;
  subject?: string;
  type: string;
  status: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  message_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  sender_name?: string;
  body: string;
  created_at: string;
}

const DriverMessages: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New conversation compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeError, setComposeError] = useState('');
  const [composeSending, setComposeSending] = useState(false);

  const formatMsgDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/team/conversations', { credentials: 'include' });
      if (res.ok) setConversations(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    setMsgLoading(true);
    try {
      const res = await fetch(`/api/team/conversations/${convId}/messages`, { credentials: 'include' });
      if (res.ok) setMessages(await res.json());
      await fetch(`/api/team/conversations/${convId}/read`, { method: 'PUT', credentials: 'include' });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    } catch {}
    setMsgLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onmessage = (evt) => {
      try {
        const { event, data } = JSON.parse(evt.data);
        if (event === 'message:new') {
          setSelectedId(current => {
            if (data.conversationId === current) {
              setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
              fetch(`/api/team/conversations/${data.conversationId}/read`, { method: 'PUT', credentials: 'include' });
            } else {
              setConversations(prev => {
                const exists = prev.find(c => c.id === data.conversationId);
                if (exists) {
                  return prev.map(c => c.id === data.conversationId
                    ? { ...c, unread_count: (c.unread_count || 0) + 1, last_message: data.message.body, last_message_at: data.message.created_at }
                    : c
                  );
                }
                // New conversation we haven't loaded yet — reload list
                return prev;
              });
              // Reload if the conv isn't in our list yet
              fetch('/api/team/conversations', { credentials: 'include' })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data) setConversations(data); })
                .catch(() => {});
            }
            return current;
          });
        }
        if (event === 'conversation:new') {
          // Admin started a new conversation with us — reload list
          loadConversations();
        }
      } catch {}
    };

    return () => { ws.close(); };
  }, [loadConversations]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/team/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: newMessage.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
        setNewMessage('');
        setConversations(prev => prev.map(c => c.id === selectedId
          ? { ...c, last_message: msg.body, last_message_at: msg.created_at }
          : c
        ));
      } else {
        const json = await res.json().catch(() => ({}));
        setSendError(json.error || `Error ${res.status}: failed to send`);
      }
    } catch {
      setSendError('Network error — please try again');
    }
    setSending(false);
  };

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeBody.trim()) { setComposeError('Message is required'); return; }
    setComposeSending(true);
    setComposeError('');
    try {
      const res = await fetch('/api/team/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: composeSubject.trim() || undefined, body: composeBody.trim() }),
      });
      if (res.ok) {
        const { conversation } = await res.json();
        setShowCompose(false);
        setComposeSubject('');
        setComposeBody('');
        await loadConversations();
        setSelectedId(conversation.id);
      } else {
        const json = await res.json();
        setComposeError(json.error || 'Failed to send message');
      }
    } catch {
      setComposeError('Failed to send message');
    }
    setComposeSending(false);
  };

  const selectedConv = conversations.find(c => c.id === selectedId);

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;

  return (
    <>
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      {/* Conversation list */}
      <div className={`${selectedId ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 bg-white rounded-xl border border-gray-200 overflow-hidden flex-shrink-0`}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Messages</h3>
          <button
            type="button"
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {conversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ChatBubbleIcon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-3">No conversations yet</p>
              <button
                type="button"
                onClick={() => setShowCompose(true)}
                className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 transition-colors"
              >
                Contact Support
              </button>
            </div>
          ) : conversations.map(conv => (
            <button
              type="button"
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedId === conv.id ? 'bg-teal-50 border-l-2 border-teal-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-900 truncate flex-1">{conv.subject || 'Support'}</p>
                {conv.unread_count > 0 && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-black">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              {conv.last_message && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message}</p>
              )}
              {conv.last_message_at && (
                <p className="text-[10px] text-gray-300 mt-0.5">{formatMsgDate(conv.last_message_at)}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      {selectedId ? (
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <button type="button" onClick={() => setSelectedId(null)} title="Back to conversations" className="lg:hidden text-gray-400 hover:text-gray-700">
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate">{selectedConv?.subject || 'Support'}</h3>
            </div>
            {selectedConv?.status && (
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                selectedConv.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>{selectedConv.status}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgLoading ? (
              <div className="text-center text-sm text-gray-400 py-8">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No messages yet</div>
            ) : messages.map(msg => {
              const isDriver = msg.sender_type === 'driver';
              return (
                <div key={msg.id} className={`flex ${isDriver ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isDriver ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
                    {!isDriver && (
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-gray-500">
                        {msg.sender_name || (msg.sender_type === 'admin' ? 'Admin' : msg.sender_type)}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isDriver ? 'text-teal-200' : 'text-gray-400'}`}>{formatMsgDate(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {selectedConv?.status === 'closed' ? (
            <div className="px-4 py-3 border-t border-gray-100 text-center text-sm text-gray-400">
              This conversation has been closed by support.
            </div>
          ) : (
            <div className="border-t border-gray-100">
              {sendError && (
                <div className="px-4 pt-2 text-xs text-red-600">{sendError}</div>
              )}
            <form onSubmit={handleSend} className="px-4 py-3 flex gap-2 items-end">
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none max-h-[120px] overflow-y-auto"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {sending ? '...' : 'Send'}
              </button>
            </form>
            </div>
          )}
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-4 text-gray-400 bg-white rounded-xl border border-gray-200">
          <ChatBubbleIcon className="w-12 h-12 text-gray-200" />
          <div className="text-center">
            <p className="text-sm font-bold text-gray-500 mb-1">Select a conversation</p>
            <p className="text-xs text-gray-400">or start a new one to contact support</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 transition-colors"
          >
            New Message
          </button>
        </div>
      )}
    </div>

    {/* Compose modal */}
    {showCompose && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompose(false)} />
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-black text-gray-900 mb-1">New Message</h2>
          <p className="text-sm text-gray-400 mb-4">Send a message to the support team</p>
          {composeError && <p className="text-sm text-red-600 mb-3">{composeError}</p>}
          <form onSubmit={handleCompose} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Subject <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="e.g. Question about my schedule"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Message</label>
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Describe your question or issue..."
                rows={4}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowCompose(false); setComposeError(''); }}
                disabled={composeSending}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={composeSending || !composeBody.trim()}
                className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {composeSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
};

const TeamApp: React.FC = () => {
  const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
  const [currentView, setCurrentView] = useState<TeamView>('dashboard');
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [impersonating, setImpersonating] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState('');
  const [msgUnreadCount, setMsgUnreadCount] = useState(0);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/team/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const json = await res.json();
      setCurrentDriver(normalizeDriver(json.data || json.driver));
      if (json.impersonating) {
        setImpersonating(true);
        setImpersonatedBy(json.impersonatedBy || 'Admin');
      }
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

  useEffect(() => {
    if (!currentDriver) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/team/conversations/unread-count', { credentials: 'include' });
        if (res.ok) { const d = await res.json(); setMsgUnreadCount(d.count || 0); }
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [currentDriver]);

  const handleLogout = async () => {
    try {
      await fetch('/api/team/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setCurrentDriver(null);
    setOnboardingStatus(null);
    setCurrentView('dashboard');
  };

  const handleStopImpersonation = async () => {
    try {
      await fetch('/api/admin/stop-impersonate-driver', { method: 'POST', credentials: 'include' });
      window.location.href = '/admin/';
    } catch {
      alert('Failed to exit driver view');
    }
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
      <TeamAuthLayout error={authError}>
        {authMode === 'login' ? (
          <TeamLogin
            onLogin={async (email, password) => {
              setAuthError('');
              setAuthLoading(true);
              try {
                const res = await fetch('/api/team/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ email, password }),
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
            }}
            switchToRegister={() => {
              setAuthMode('register');
              setAuthError('');
            }}
            isLoading={authLoading}
          />
        ) : (
          <TeamRegister
            onRegister={async (data) => {
              setAuthError('');
              setAuthLoading(true);
              try {
                const res = await fetch('/api/team/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    full_name: data.full_name,
                    email: data.email,
                    phone: data.phone,
                    password: data.password,
                  }),
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
            }}
            switchToLogin={() => {
              setAuthMode('login');
              setAuthError('');
            }}
            isLoading={authLoading}
          />
        )}
      </TeamAuthLayout>
    );
  }

  if (onboardingStatus && onboardingStatus.onboarding_status !== 'completed') {
    return <OnboardingFlow status={onboardingStatus} onRefresh={checkOnboarding} />;
  }

  const navItems: { view: TeamView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <HomeIcon className="w-5 h-5" /> },
    { view: 'jobs', label: 'Available Jobs', icon: <BriefcaseIcon className="w-5 h-5" /> },
    { view: 'schedule', label: 'My Schedule', icon: <CalendarDaysIcon className="w-5 h-5" /> },
    { view: 'messages', label: 'Messages', icon: <ChatBubbleIcon className="w-5 h-5" />, badge: msgUnreadCount > 0 ? msgUnreadCount : undefined },
    { view: 'profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {impersonating && (
        <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between z-50 relative">
          <span className="text-sm font-bold">
            Viewing as driver: {currentDriver?.full_name} (signed in by {impersonatedBy})
          </span>
          <button
            type="button"
            onClick={handleStopImpersonation}
            className="px-4 py-1 bg-white text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors"
          >
            Back to Admin
          </button>
        </div>
      )}
      <div className="flex-1 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${impersonating ? 'lg:top-[40px]' : ''}`}>
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
              type="button"
              key={item.view}
              onClick={() => { setCurrentView(item.view); setSidebarOpen(false); if (item.view === 'messages') setMsgUnreadCount(0); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                currentView === item.view
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-400 text-white text-[10px] font-black">
                  {item.badge}
                </span>
              )}
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
            type="button"
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
          <button type="button" title="Open menu" onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-900">
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
          {currentView === 'messages' && <DriverMessages />}
          {currentView === 'profile' && <Profile />}
        </div>
      </main>
      </div>
    </div>
  );
};

export default TeamApp;
