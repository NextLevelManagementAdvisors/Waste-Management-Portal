import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import TeamAuthLayout from './components/TeamAuthLayout';
import TeamLogin from './components/TeamLogin';
import TeamRegister from './components/TeamRegister';
import {
  DRIVER_VIEW_TO_PATH,
  PROVIDER_TAB_TO_PATH,
  getAuthModeFromPath,
  getAuthPath,
  getDriverViewFromPath,
  getPortalContextFromPath,
  getProviderTabFromPath,
  isDriverPath,
  isExplicitAuthPath,
  isProviderPath,
  normalizeTeamPath,
} from './portalRoutes.ts';
import type { DriverView, ProviderTab, TeamAuthMode, TeamPortalContext } from './portalRoutes.ts';
import ProviderOnboardingFlow from './components/ProviderOnboardingFlow';
import ProviderTeamPanel from './components/ProviderTeamPanel';
import ProviderClientImport from './components/ProviderClientImport';
const ProviderJoinPage = React.lazy(() => import('./components/ProviderJoinPage'));
import ProviderRolesManager from './components/ProviderRolesManager';
import ProviderFleetPanel from './components/ProviderFleetPanel';
import ProviderRouteDispatch from './components/ProviderRouteDispatch';
import ProviderAccountingView from './components/ProviderAccountingView';
import OnDemandPickups from './components/OnDemandPickups';
import RouteTable, { STATUS_COLORS } from '../shared/components/RouteTable.tsx';
import type { Route as SharedRoute } from '../shared/types/index.ts';
const ZoneMapView = React.lazy(() => import('./components/ZoneMapView'));
import ZoneAssignmentRequests from './components/ZoneAssignmentRequests';
// AvailableLocations merged into ZoneMapView as unified Coverage view
import {
  HomeIcon,
  CalendarDaysIcon,
  UserIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  MapPinIcon,
  ClipboardDocumentIcon,
  getWeatherIcon,
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

interface RouteOrder {
  address?: string;
  customer_name?: string;
  pickup_type?: string;
  order_number?: number;
  status?: string;
}

interface Route extends SharedRoute {
  bids?: Bid[];
  orders?: RouteOrder[];
}

interface Bid {
  id: string;
  routeId: string;
  driverId: string;
  bidAmount: number;
  message?: string;
  driverRatingAtBid?: number;
  createdAt?: string;
}

interface WeatherDay {
  date: string;
  tempHigh: number;
  tempLow: number;
  conditionMain: string;
  conditionDesc: string;
  precipChance: number;
  icon: string;
}

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

const BuildingOfficeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
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

const STATUS_TOOLTIPS: Record<string, string> = {
  draft: 'Draft \u2014 Route is being planned. Only visible to admins.',
  open: 'Open \u2014 Published and available for drivers to bid on.',
  bidding: 'Bidding \u2014 Drivers have submitted bids. Awaiting selection.',
  assigned: 'Assigned \u2014 You have been assigned to this route.',
  in_progress: 'In Progress \u2014 You are actively running this route.',
  completed: 'Completed \u2014 All orders have been finished.',
  cancelled: 'Cancelled \u2014 This route has been cancelled.',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}
    title={STATUS_TOOLTIPS[status]}>
    {status.replace('_', ' ')}
  </span>
);

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
          <p className="text-gray-500">Please complete the following steps to start accepting routes.</p>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

const Dashboard: React.FC<{ driver: Driver; onNavigate: (view: string) => void; showToast?: (msg: string, type: 'success' | 'error') => void }> = ({ driver, onNavigate, showToast }) => {
  const [availableRoutes, setAvailableRoutes] = useState<Route[]>([]);
  const [myRoutes, setMyRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingRouteId, setCompletingRouteId] = useState<string | null>(null);
  const [hasZoneSelections, setHasZoneSelections] = useState(true);
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [routesRes, myRoutesRes] = await Promise.all([
        fetch('/api/team/routes', { credentials: 'include' }),
        fetch('/api/team/my-routes', { credentials: 'include' }),
      ]);
      if (routesRes.ok) {
        const j = await routesRes.json();
        setAvailableRoutes(j.data || []);
        setHasZoneSelections(j.hasZoneSelections !== false);
      }
      if (myRoutesRes.ok) { const j = await myRoutesRes.json(); setMyRoutes(j.data || []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    console.log('Fetching weather data...');
    const today = new Date().toISOString().split('T')[0];
    const end = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    fetch(`/api/team/weather?from=${today}&to=${end}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.days?.length) setWeatherDays(data.days); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCompleteRoute = async (routeId: string) => {
    if (!window.confirm('Mark this route as complete?')) return;
    setCompletingRouteId(routeId);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/complete`, { method: 'POST', credentials: 'include' });
      if (res.ok) { await loadData(); showToast?.('Route marked as complete.', 'success'); }
      else showToast?.('Failed to complete route.', 'error');
    } catch { showToast?.('Failed to complete route.', 'error'); }
    setCompletingRouteId(null);
  };

  const rating = parseFloat(driver.rating ?? '') || 0;
  const totalCompleted = driver.total_jobs_completed || 0;
  const activeRoutes = myRoutes.filter(j => j.status === 'assigned' || j.status === 'in_progress');
  const upcomingRoutes = myRoutes
    .filter(j => j.status === 'assigned')
    .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''))
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
            <p className="text-sm font-bold text-gray-500">Routes Completed</p>
          </div>
          <p className="text-3xl font-black text-gray-900">{totalCompleted}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-gray-500">Active Routes</p>
          </div>
          <p className="text-3xl font-black text-gray-900">{activeRoutes.length}</p>
          <p className="text-xs text-gray-400 mt-1">Assigned or in progress</p>
        </Card>
      </div>

      {weatherDays.length > 0 && (() => {
        const today = weatherDays[0];
        const TodayIcon = getWeatherIcon(today.conditionMain);
        return (
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 flex-shrink-0">
                <TodayIcon className="w-10 h-10 text-sky-500" />
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-gray-900">{Math.round(today.tempHigh)}°F</span>
                    <span className="text-sm text-gray-400">/ {Math.round(today.tempLow)}°F</span>
                  </div>
                  <div className="text-xs text-gray-500 capitalize">{today.conditionDesc}</div>
                  {today.precipChance > 0 && <div className="text-xs text-blue-600">{today.precipChance}% precip</div>}
                </div>
              </div>
              {weatherDays.length > 1 && (
                <div className="flex gap-3 ml-auto">
                  {weatherDays.slice(1, 5).map(d => {
                    const DayIcon = getWeatherIcon(d.conditionMain);
                    const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                    return (
                      <div key={d.date} className="text-center" title={`${d.conditionDesc} | ${Math.round(d.tempHigh)}°/${Math.round(d.tempLow)}°F`}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">{dayLabel}</div>
                        <DayIcon className="w-5 h-5 text-sky-400 mx-auto" />
                        <div className="text-[10px] font-semibold text-gray-600">{Math.round(d.tempHigh)}°</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        );
      })()}

      <ZoneAssignmentRequests />

      {upcomingRoutes.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <CalendarDaysIcon className="w-5 h-5 text-teal-600" />
            <h3 className="text-lg font-bold text-gray-900">Upcoming Routes</h3>
          </div>
          <div className="space-y-3">
            {upcomingRoutes.map(route => (
              <div key={route.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{route.title}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(route.scheduledDate)} · {route.startTime}–{route.endTime}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={route.status} />
                  <Button
                    size="sm"
                    onClick={() => handleCompleteRoute(route.id)}
                    disabled={completingRouteId === route.id}
                  >
                    {completingRouteId === route.id ? 'Completing...' : 'Complete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!hasZoneSelections && (
        <Card className="p-4 mb-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-yellow-800">Select your service zones</p>
              <p className="text-xs text-yellow-600">
                Go to your{' '}
                <button type="button" onClick={() => onNavigate('profile')} className="underline font-bold">Profile</button>
                {' '}to select which zones you want to work in.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BriefcaseIcon className="w-5 h-5 text-teal-600" />
            <h3 className="text-lg font-bold text-gray-900">Available Routes</h3>
          </div>
          {availableRoutes.length > 0 && (
            <button type="button" onClick={() => onNavigate('routes')} className="text-sm font-bold text-teal-600 hover:underline">
              View All →
            </button>
          )}
        </div>
        {availableRoutes.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {!hasZoneSelections ? 'Select service zones in your profile to see available routes.' : 'No available routes at the moment. Check back later.'}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {availableRoutes.slice(0, 3).map(route => (
                <div key={route.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{route.title}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(route.scheduledDate)}
                      {route.basePay != null && <> · <span className="font-bold text-teal-700">${Number(route.basePay).toFixed(2)}</span></>}
                    </p>
                  </div>
                  <StatusBadge status={route.status} />
                </div>
              ))}
            </div>
            {availableRoutes.length > 3 && (
              <p className="text-xs text-gray-400 mt-2">+{availableRoutes.length - 3} more on the route board</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const RouteBoard: React.FC<{ onNavigate?: (view: string) => void; showToast?: (msg: string, type: 'success' | 'error') => void }> = ({ onNavigate, showToast }) => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<(Route & { bids?: Bid[] }) | null>(null);
  const [routeDetailLoading, setRouteDetailLoading] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState('');
  const [myBid, setMyBid] = useState<Bid | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'pay'>('date');
  const [hasZoneSelections, setHasZoneSelections] = useState(true);
  const [weatherByDate, setWeatherByDate] = useState<Map<string, WeatherDay>>(new Map());

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const end = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    fetch(`/api/team/weather?from=${today}&to=${end}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.days?.length) {
          const map = new Map<string, WeatherDay>();
          for (const d of data.days) map.set(d.date, d);
          setWeatherByDate(map);
        }
      })
      .catch(() => {});
  }, []);

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/team/routes', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setRoutes(j.data || []);
        setHasZoneSelections(j.hasZoneSelections !== false);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchRoutes(); }, []);

  const openRouteDetail = async (routeId: string) => {
    setRouteDetailLoading(true);
    setBidError('');
    setMyBid(null);
    try {
      const res = await fetch(`/api/team/routes/${routeId}`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        const route = j.data;
        setSelectedRoute(route);
        setBidAmount(route.basePay && route.estimatedHours ? (Number(route.basePay) * Number(route.estimatedHours)).toFixed(2) : (route.basePay?.toString() || ''));
        setBidMessage('');
        const profileRes = await fetch('/api/team/profile', { credentials: 'include' });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const driverId = profileData.data?.id?.toString();
          const existing = route.bids?.find((b: Bid) => b.driverId?.toString() === driverId);
          setMyBid(existing || null);
        }
      }
    } catch {}
    setRouteDetailLoading(false);
  };

  const handleBid = async () => {
    if (!selectedRoute) return;
    setBidError('');
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/routes/${selectedRoute.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bid_amount: parseFloat(bidAmount), message: bidMessage || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to place bid');
      await openRouteDetail(selectedRoute.id);
      fetchRoutes();
    } catch (err: any) {
      setBidError(err.message);
    } finally {
      setBidLoading(false);
    }
  };

  const handleWithdrawBid = async () => {
    if (!selectedRoute) return;
    if (!window.confirm('Are you sure you want to withdraw your bid? This cannot be undone.')) return;
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/routes/${selectedRoute.id}/bid`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setMyBid(null);
      await openRouteDetail(selectedRoute.id);
      fetchRoutes();
    } catch (err: any) {
      setBidError(err.message);
    } finally {
      setBidLoading(false);
    }
  };

  const filteredRoutes = routes
    .sort((a, b) => {
      if (sortBy === 'date') return (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (sortBy === 'pay') return (b.basePay || 0) - (a.basePay || 0);
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
        <p className="text-gray-500">Browse and bid on available routes.</p>
        <button
          type="button"
          onClick={fetchRoutes}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select title="Sort routes" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="date">Sort by Date</option>
          <option value="pay">Sort by Pay (High to Low)</option>
        </select>
      </div>

      {filteredRoutes.length === 0 ? (
        <Card className="p-8 text-center">
          <BriefcaseIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          {!hasZoneSelections ? (
            <>
              <p className="text-gray-500 font-bold">No zones selected</p>
              <p className="text-gray-400 text-sm mt-1">Select your service zones in your Profile to see available routes.</p>
              {onNavigate && (
                <button type="button" onClick={() => onNavigate('profile')} className="mt-3 text-sm font-bold text-teal-600 hover:underline">
                  Go to Profile →
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-500 font-bold">No available routes</p>
              <p className="text-gray-400 text-sm mt-1">Check back later for new route postings in your zones.</p>
            </>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRoutes.map(route => (
            <Card key={route.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-gray-900">{route.title}</h3>
                <StatusBadge status={route.status} />
              </div>
              <div className="space-y-1 text-sm text-gray-500 mb-4">
                {route.scheduledDate && (() => {
                  const wx = weatherByDate.get(route.scheduledDate);
                  const WxIcon = wx ? getWeatherIcon(wx.conditionMain) : null;
                  return (
                    <p className="flex items-center gap-1">
                      <CalendarDaysIcon className="w-4 h-4" />{formatDate(route.scheduledDate)}
                      {WxIcon && <WxIcon className="w-3.5 h-3.5 text-sky-500 ml-1" />}
                      {wx && <span className="text-[10px] text-sky-600 font-semibold">{Math.round(wx.tempHigh)}°F</span>}
                    </p>
                  );
                })()}
                {(route.startTime || route.endTime) && <p className="flex items-center gap-1"><ClockIcon className="w-4 h-4" />{route.startTime}–{route.endTime}</p>}
                <div className="flex gap-4 mt-2">
                  {route.estimatedOrders != null && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{route.estimatedOrders} orders</span>}
                  {route.estimatedHours != null && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{route.estimatedHours}h est.</span>}
                  {route.basePay != null && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded font-bold">${Number(route.basePay).toFixed(2)}</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => openRouteDetail(route.id)} className="w-full">
                View Details & Bid
              </Button>
            </Card>
          ))}
        </div>
      )}

      {selectedRoute && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRoute(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{selectedRoute.title}</h3>
              <button type="button" title="Close" onClick={() => setSelectedRoute(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            {routeDetailLoading ? (
              <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedRoute.status} />
                </div>

                {selectedRoute.description && <p className="text-sm text-gray-600">{selectedRoute.description}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {selectedRoute.scheduledDate && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Date</span><span className="font-bold">{formatDate(selectedRoute.scheduledDate)}</span></div>}
                  {(selectedRoute.startTime || selectedRoute.endTime) && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Time</span><span className="font-bold">{selectedRoute.startTime}–{selectedRoute.endTime}</span></div>}
                  {selectedRoute.estimatedOrders != null && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Orders</span><span className="font-bold">{selectedRoute.estimatedOrders}</span></div>}
                  {selectedRoute.estimatedHours != null && <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-400 text-xs block">Est. Hours</span><span className="font-bold">{selectedRoute.estimatedHours}</span></div>}
                  {selectedRoute.basePay != null && <div className="bg-teal-50 p-3 rounded-lg col-span-2"><span className="text-teal-600 text-xs block">Base Pay</span><span className="font-black text-teal-700 text-lg">${Number(selectedRoute.basePay).toFixed(2)}</span></div>}
                  {selectedRoute.scheduledDate && (() => {
                    const wx = weatherByDate.get(selectedRoute.scheduledDate);
                    if (!wx) return null;
                    const WxIcon = getWeatherIcon(wx.conditionMain);
                    return (
                      <div className="bg-sky-50 p-3 rounded-lg col-span-2 flex items-center gap-3">
                        <WxIcon className="w-6 h-6 text-sky-500 flex-shrink-0" />
                        <div>
                          <span className="text-sky-600 text-xs block">Weather</span>
                          <span className="font-bold text-gray-900">{Math.round(wx.tempHigh)}° / {Math.round(wx.tempLow)}°F</span>
                          <span className="text-xs text-gray-500 capitalize ml-2">{wx.conditionDesc}</span>
                          {wx.precipChance > 0 && <span className="text-xs text-blue-600 ml-2">{wx.precipChance}% precip</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {selectedRoute.orders && selectedRoute.orders.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm mb-2">Orders ({selectedRoute.orders.length})</h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {selectedRoute.orders
                        .sort((a, b) => (a.order_number || 0) - (b.order_number || 0))
                        .map((order, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg text-sm">
                          <span className="flex-shrink-0 w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                            {order.order_number || idx + 1}
                          </span>
                          <div className="min-w-0">
                            {order.address ? (
                              <>
                                <p className="font-medium text-gray-900 truncate">{order.address}</p>
                                {order.customer_name && <p className="text-xs text-gray-500">{order.customer_name}</p>}
                              </>
                            ) : (
                              <p className="text-gray-400 italic">Address hidden</p>
                            )}
                            {order.pickup_type && <span className="text-[10px] text-gray-400 capitalize">{order.pickup_type}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedRoute.bids && selectedRoute.bids.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm mb-2">Bids ({selectedRoute.bids.length})</h4>
                    <div className="space-y-2">
                      {selectedRoute.bids.map((bid, idx) => {
                        const isMyBid = myBid && bid.id === myBid.id;
                        return (
                          <div key={bid.id} className={`p-3 rounded-lg text-sm ${isMyBid ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{isMyBid ? 'Your Bid' : `Driver #${idx + 1}`}</span>
                              <span className="font-bold text-teal-700">${Number(bid.bidAmount).toFixed(2)}</span>
                            </div>
                            {bid.driverRatingAtBid != null && (
                              <div className="flex items-center gap-1 mt-1">
                                <StarRating rating={bid.driverRatingAtBid} className="w-3 h-3" />
                                <span className="text-xs text-gray-400">{Number(bid.driverRatingAtBid).toFixed(1)}</span>
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
                    <p className="text-sm font-bold text-teal-800 mb-2">You have already bid on this route</p>
                    <p className="text-sm text-teal-700">Your bid: <span className="font-bold">${Number(myBid.bidAmount).toFixed(2)}</span></p>
                    <Button variant="secondary" size="sm" onClick={handleWithdrawBid} disabled={bidLoading} className="mt-3">
                      {bidLoading ? 'Withdrawing...' : 'Withdraw Bid'}
                    </Button>
                  </div>
                ) : (selectedRoute.status === 'open' || selectedRoute.status === 'bidding') ? (
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

const Schedule: React.FC<{ onNavigate?: (view: string) => void; showToast?: (msg: string, type: 'success' | 'error') => void }> = ({ onNavigate, showToast }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [weatherByDate, setWeatherByDate] = useState<Map<string, WeatherDay>>(new Map());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const [completingRouteId, setCompletingRouteId] = useState<string | null>(null);
  const [startingRouteId, setStartingRouteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [driverProfileId, setDriverProfileId] = useState<string | null>(null);
  const [biddingRouteId, setBiddingRouteId] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState('');
  const [myBids, setMyBids] = useState<Map<string, Bid>>(new Map());
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Availability state
  const [availability, setAvailability] = useState<{ days: string[]; start_time: string; end_time: string }>({
    days: [], start_time: '08:00', end_time: '17:00'
  });
  const [avSaveLoading, setAvSaveLoading] = useState(false);
  const [avSaveMsg, setAvSaveMsg] = useState('');
  const [contactingAdmin, setContactingAdmin] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    try {
      const [schedRes, routesRes] = await Promise.all([
        fetch(`/api/team/schedule?start=${startStr}&end=${endStr}`, { credentials: 'include' }),
        fetch(`/api/team/routes?startDate=${startStr}&endDate=${endStr}`, { credentials: 'include' }),
      ]);
      let myRoutes: Route[] = [];
      let openRoutes: Route[] = [];
      if (schedRes.ok) { const j = await schedRes.json(); myRoutes = j.data || []; }
      if (routesRes.ok) {
        const j = await routesRes.json();
        openRoutes = (j.data || []).filter((r: Route) => r.status === 'open' || r.status === 'bidding');
      }
      const routeMap = new Map<string, Route>();
      for (const r of myRoutes) routeMap.set(r.id, r);
      for (const r of openRoutes) { if (!routeMap.has(r.id)) routeMap.set(r.id, r); }
      setRoutes(Array.from(routeMap.values()));
    } catch {}
    // Fetch weather (non-blocking)
    fetch(`/api/team/weather?from=${startStr}&to=${endStr}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.days?.length) {
          const map = new Map<string, WeatherDay>();
          for (const d of data.days) map.set(d.date, d);
          setWeatherByDate(map);
        }
      })
      .catch(() => {});
    setLoading(false);
  }, [year, month]);

  const handleStartRoute = useCallback(async (routeId: string) => {
    if (!window.confirm('Start this route?')) return;
    setStartingRouteId(routeId);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/start`, { method: 'POST', credentials: 'include' });
      if (res.ok) { await fetchSchedule(); showToast?.('Route started.', 'success'); }
      else showToast?.('Failed to start route.', 'error');
    } catch { showToast?.('Failed to start route.', 'error'); }
    setStartingRouteId(null);
  }, [fetchSchedule, showToast]);

  const handleCompleteRoute = useCallback(async (routeId: string) => {
    if (!window.confirm('Mark this route as complete?')) return;
    setCompletingRouteId(routeId);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/complete`, { method: 'POST', credentials: 'include' });
      if (res.ok) { await fetchSchedule(); showToast?.('Route marked as complete.', 'success'); }
      else showToast?.('Failed to complete route.', 'error');
    } catch { showToast?.('Failed to complete route.', 'error'); }
    setCompletingRouteId(null);
  }, [fetchSchedule, showToast]);

  const [decliningRouteId, setDecliningRouteId] = useState<string | null>(null);

  const handleDeclineRoute = useCallback(async (routeId: string) => {
    const reason = window.prompt('Reason for declining (optional):');
    if (reason === null) return; // cancelled prompt
    setDecliningRouteId(routeId);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (res.ok) { await fetchSchedule(); showToast?.('Route declined.', 'success'); }
      else showToast?.('Failed to decline route.', 'error');
    } catch { showToast?.('Failed to decline route.', 'error'); }
    setDecliningRouteId(null);
  }, [fetchSchedule, showToast]);

  const handleContactAdmin = useCallback(async (dateStr: string, routeTitle: string) => {
    setContactingAdmin(true);
    try {
      const dayLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      await fetch('/api/team/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: `Schedule Conflict: ${routeTitle} on ${dayLabel}`,
          body: `I have a scheduling conflict — "${routeTitle}" is assigned on ${dayLabel}, which is outside my availability. Can we work out an alternative?`,
        }),
      });
      if (onNavigate) onNavigate('messages');
    } catch {}
    setContactingAdmin(false);
  }, [onNavigate]);

  const handleDeclineConflict = useCallback(async (routeId: string, routeTitle: string, dateStr: string) => {
    const dayLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    setDecliningRouteId(routeId);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: `Schedule conflict: ${dayLabel} is outside my availability` }),
      });
      if (res.ok) { await fetchSchedule(); showToast?.('Conflict declined.', 'success'); }
      else showToast?.('Failed to decline route.', 'error');
    } catch { showToast?.('Failed to decline route.', 'error'); }
    setDecliningRouteId(null);
  }, [fetchSchedule, showToast]);

  const handleAddDayToAvailability = useCallback((dateStr: string) => {
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    const dayAbbr = DAY_ABBR[dow];
    if (!availability.days.includes(dayAbbr)) {
      setAvailability(prev => ({ ...prev, days: [...prev.days, dayAbbr] }));
    }
    document.getElementById('schedule-availability')?.scrollIntoView({ behavior: 'smooth' });
  }, [availability.days]);

  // Bidding handlers
  const openBidForm = useCallback(async (routeId: string) => {
    setBiddingRouteId(routeId);
    setBidError('');
    setBidAmount('');
    setBidMessage('');
    try {
      const res = await fetch(`/api/team/routes/${routeId}`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        const route = j.data;
        setBidAmount(route.base_pay && route.estimated_hours
          ? (Number(route.base_pay) * Number(route.estimated_hours)).toFixed(2)
          : (route.base_pay?.toString() || ''));
        if (driverProfileId && route.bids?.length) {
          const existing = route.bids.find((b: Bid) => b.driverId?.toString() === driverProfileId);
          if (existing) setMyBids(prev => new Map(prev).set(routeId, existing));
        }
      }
    } catch {}
  }, [driverProfileId]);

  const handleScheduleBid = useCallback(async (routeId: string) => {
    setBidError('');
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bid_amount: parseFloat(bidAmount), message: bidMessage || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to place bid');
      setBiddingRouteId(null);
      await fetchSchedule();
    } catch (err: any) { setBidError(err.message); }
    setBidLoading(false);
  }, [bidAmount, bidMessage, fetchSchedule]);

  const handleScheduleWithdrawBid = useCallback(async (routeId: string) => {
    if (!window.confirm('Withdraw your bid?')) return;
    setBidLoading(true);
    try {
      const res = await fetch(`/api/team/routes/${routeId}/bid`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setMyBids(prev => { const m = new Map(prev); m.delete(routeId); return m; });
      setBiddingRouteId(null);
      await fetchSchedule();
    } catch (err: any) { setBidError(err.message); }
    setBidLoading(false);
  }, [fetchSchedule]);

  // Clear selection on filter/view changes
  useEffect(() => { setSelectedRouteIds(new Set()); }, [statusFilter, viewMode]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  // Load availability from profile
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/team/profile', { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          const d = j.data;
          if (d.id) setDriverProfileId(d.id.toString());
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
    })();
  }, []);

  const toggleDay = (day: string) => {
    setAvailability(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
    }));
  };

  const handleSaveAvailability = async () => {
    setAvSaveLoading(true);
    setAvSaveMsg('');
    try {
      const res = await fetch('/api/team/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ availability }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to save');
      setAvSaveMsg('Availability saved!');
      setTimeout(() => setAvSaveMsg(''), 3000);
    } catch (err: any) {
      setAvSaveMsg(err.message);
    } finally {
      setAvSaveLoading(false);
    }
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const routesByDate: Record<string, Route[]> = {};
  routes.forEach(r => {
    if (r.scheduledDate) {
      if (!routesByDate[r.scheduledDate]) routesByDate[r.scheduledDate] = [];
      routesByDate[r.scheduledDate].push(r);
    }
  });

  const getRouteColor = (status: string) => STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedDayRoutes = selectedDay ? (routesByDate[selectedDay] || []) : [];

  const allRoutesSorted = [...routes]
    .filter(r => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'available') return r.status === 'open' || r.status === 'bidding';
      return r.status === statusFilter;
    })
    .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

  // Blocked day / conflict helpers
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const isBlockedDay = (dateStr: string): boolean => {
    if (availability.days.length === 0) return false;
    if (dateStr < todayStr) return false; // Past dates aren't blocked
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    return !availability.days.includes(DAY_ABBR[dow]);
  };

  const getConflictRoutes = (dateStr: string): Route[] => {
    if (!isBlockedDay(dateStr)) return [];
    return (routesByDate[dateStr] || []).filter(r => r.status === 'assigned' || r.status === 'in_progress');
  };

  const selectedDayConflicts = selectedDay ? getConflictRoutes(selectedDay) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500">Your routes, available work, and schedule at a glance.</p>
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

            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden overflow-x-auto min-w-0" style={{ minWidth: '500px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500">{day}</div>
              ))}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-white p-2 min-h-[80px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayRoutes = routesByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;
                const blocked = isBlockedDay(dateStr);
                const conflicts = getConflictRoutes(dateStr);

                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                    className={`p-2 min-h-[80px] text-left transition-colors hover:bg-gray-50 ${
                      isSelected ? 'ring-2 ring-teal-500 ring-inset' : ''
                    } ${blocked ? 'bg-red-50/60' : 'bg-white'}`}
                    style={blocked ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(239,68,68,0.08) 3px, rgba(239,68,68,0.08) 6px)' } : undefined}
                  >
                    <span className={`text-sm font-bold ${isToday ? 'bg-teal-600 text-white w-7 h-7 rounded-full inline-flex items-center justify-center' : blocked ? 'text-gray-400' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    {(() => {
                      const wx = weatherByDate.get(dateStr);
                      if (!wx) return null;
                      const WxIcon = getWeatherIcon(wx.conditionMain);
                      return (
                        <div className="flex items-center gap-0.5 mt-0.5" title={wx.conditionDesc}>
                          <WxIcon className="w-3 h-3 text-sky-400" />
                          <span className="text-[9px] text-sky-600 font-semibold">{Math.round(wx.tempHigh)}°</span>
                        </div>
                      );
                    })()}
                    <div className="mt-0.5 space-y-0.5">
                      {dayRoutes.slice(0, 2).map(r => (
                        <div key={r.id} className={`text-[10px] font-bold px-1 py-0.5 rounded truncate ${getRouteColor(r.status)}`}>
                          {r.title}
                        </div>
                      ))}
                      {dayRoutes.length > 2 && (
                        <div className="text-[10px] text-gray-400 font-bold">+{dayRoutes.length - 2} more</div>
                      )}
                    </div>
                    {conflicts.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-0.5">
                        <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <span className="text-[9px] font-bold text-amber-600">Conflict</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded bg-blue-100" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded bg-purple-100" />
                <span>Assigned</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded bg-orange-100" />
                <span>In Progress</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded bg-green-100" />
                <span>Completed</span>
              </div>
              {availability.days.length > 0 && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-4 h-3 rounded bg-red-50/60" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(239,68,68,0.08) 3px, rgba(239,68,68,0.08) 6px)' }} />
                    <span>Unavailable</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <span>Conflict</span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {selectedDay && (
            <Card className="p-6">
              <h3 className="font-bold text-gray-900 mb-3">
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              {(() => {
                const wx = weatherByDate.get(selectedDay);
                if (!wx) return null;
                const WxIcon = getWeatherIcon(wx.conditionMain);
                return (
                  <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 flex items-center gap-3 mb-3">
                    <WxIcon className="w-7 h-7 text-sky-500 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-gray-900">{Math.round(wx.tempHigh)}°F</span>
                      <span className="text-sm text-gray-500"> / {Math.round(wx.tempLow)}°F</span>
                      <span className="text-xs text-gray-500 capitalize ml-2">{wx.conditionDesc}</span>
                      {wx.precipChance > 0 && <span className="text-xs text-blue-600 ml-2">{wx.precipChance}% precip</span>}
                    </div>
                  </div>
                );
              })()}
              {selectedDayConflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <p className="text-sm font-bold text-amber-800 mb-2">
                    Schedule Conflict — {selectedDayConflicts.length} route{selectedDayConflicts.length > 1 ? 's' : ''} on an unavailable day
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleContactAdmin(selectedDay!, selectedDayConflicts[0].title)}
                      disabled={contactingAdmin}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {contactingAdmin ? 'Sending...' : 'Contact Admin'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAddDayToAvailability(selectedDay!)}
                      className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
                    >
                      Update Availability
                    </Button>
                    {selectedDayConflicts.map(r => (
                      <Button
                        key={r.id}
                        size="sm"
                        onClick={() => handleDeclineConflict(r.id, r.title, selectedDay!)}
                        disabled={decliningRouteId === r.id}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                      >
                        {decliningRouteId === r.id ? 'Declining...' : `Decline: ${r.title}`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <RouteTable
                routes={selectedDayRoutes}
                columns={{ pay: true, orders: true }}
                emptyMessage="No routes scheduled for this day."
                renderActions={(route) => (
                  <>
                    {route.status === 'assigned' && (
                      <>
                        <button type="button" onClick={() => handleStartRoute(route.id)} disabled={startingRouteId === route.id}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50">
                          {startingRouteId === route.id ? 'Starting...' : 'Start'}
                        </button>
                        <button type="button" onClick={() => handleDeclineRoute(route.id)} disabled={decliningRouteId === route.id}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50">
                          {decliningRouteId === route.id ? '...' : 'Decline'}
                        </button>
                      </>
                    )}
                    {(route.status === 'assigned' || route.status === 'in_progress') && (
                      <button type="button" onClick={() => handleCompleteRoute(route.id)} disabled={completingRouteId === route.id}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">
                        {completingRouteId === route.id ? 'Completing...' : 'Complete'}
                      </button>
                    )}
                    {(route.status === 'open' || route.status === 'bidding') && biddingRouteId !== route.id && (
                      <button type="button" onClick={() => openBidForm(route.id)}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                        Bid
                      </button>
                    )}
                  </>
                )}
                renderRowExtra={(route) => {
                  if (biddingRouteId !== route.id) return null;
                  if (myBids.has(route.id)) {
                    return (
                      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                        <p className="text-sm font-bold text-teal-800">You already bid ${Number(myBids.get(route.id)!.bidAmount).toFixed(2)}</p>
                        <Button variant="secondary" size="sm" onClick={() => handleScheduleWithdrawBid(route.id)} disabled={bidLoading} className="mt-2">
                          {bidLoading ? 'Withdrawing...' : 'Withdraw Bid'}
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {bidError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{bidError}</div>}
                      <div className="flex gap-2 items-end">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input type="number" title="Bid amount" step="0.01" min="0.01" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                        <Button size="sm" onClick={() => handleScheduleBid(route.id)} disabled={bidLoading || !bidAmount || parseFloat(bidAmount) <= 0} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                          {bidLoading ? '...' : 'Submit'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setBiddingRouteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  );
                }}
              />
            </Card>
          )}

          <div id="schedule-availability">
            <Card className="p-6 mt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Availability</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Available Days</label>
                  <div className="flex flex-wrap gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
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
                <div className="flex items-center gap-3">
                  <Button onClick={handleSaveAvailability} disabled={avSaveLoading} size="sm">
                    {avSaveLoading ? 'Saving...' : 'Save Availability'}
                  </Button>
                  {avSaveMsg && <span className="text-sm text-teal-600">{avSaveMsg}</span>}
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card className="p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { key: 'all', label: 'All' },
              { key: 'available', label: 'Available' },
              { key: 'assigned', label: 'Assigned' },
              { key: 'in_progress', label: 'In Progress' },
              { key: 'completed', label: 'Completed' },
            ].map(chip => (
              <button key={chip.key} type="button" onClick={() => setStatusFilter(chip.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${statusFilter === chip.key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {chip.label}
                <span className="ml-1 opacity-70">
                  ({chip.key === 'all' ? routes.length
                    : chip.key === 'available' ? routes.filter(r => r.status === 'open' || r.status === 'bidding').length
                    : routes.filter(r => r.status === chip.key).length})
                </span>
              </button>
            ))}
          </div>
          <RouteTable
            routes={allRoutesSorted}
            columns={{ pay: true, orders: true }}
            selectable
            selectedIds={selectedRouteIds}
            onSelectionChange={setSelectedRouteIds}
            emptyMessage="No routes match this filter."
            emptyIcon={<CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto" />}
            renderActions={(route) => (
              <>
                {route.status === 'assigned' && (
                  <>
                    <button type="button" onClick={() => handleStartRoute(route.id)} disabled={startingRouteId === route.id}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50">
                      {startingRouteId === route.id ? 'Starting...' : 'Start'}
                    </button>
                    <button type="button" onClick={() => handleDeclineRoute(route.id)} disabled={decliningRouteId === route.id}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50">
                      {decliningRouteId === route.id ? '...' : 'Decline'}
                    </button>
                  </>
                )}
                {(route.status === 'assigned' || route.status === 'in_progress') && (
                  <button type="button" onClick={() => handleCompleteRoute(route.id)} disabled={completingRouteId === route.id}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">
                    {completingRouteId === route.id ? 'Completing...' : 'Complete'}
                  </button>
                )}
                {(route.status === 'open' || route.status === 'bidding') && biddingRouteId !== route.id && (
                  <button type="button" onClick={() => openBidForm(route.id)}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                    Bid
                  </button>
                )}
              </>
            )}
            renderRowExtra={(route) => {
              if (biddingRouteId !== route.id) return null;
              if (myBids.has(route.id)) {
                return (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-teal-800">You already bid ${Number(myBids.get(route.id)!.bidAmount).toFixed(2)}</p>
                    <Button variant="secondary" size="sm" onClick={() => handleScheduleWithdrawBid(route.id)} disabled={bidLoading} className="mt-2">
                      {bidLoading ? 'Withdrawing...' : 'Withdraw Bid'}
                    </Button>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {bidError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{bidError}</div>}
                  <div className="flex gap-2 items-end">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input type="number" title="Bid amount" step="0.01" min="0.01" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <Button size="sm" onClick={() => handleScheduleBid(route.id)} disabled={bidLoading || !bidAmount || parseFloat(bidAmount) <= 0} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      {bidLoading ? '...' : 'Submit'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setBiddingRouteId(null)}>Cancel</Button>
                  </div>
                </div>
              );
            }}
          />
          {selectedRouteIds.size > 0 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 mt-4 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{selectedRouteIds.size} selected</span>
              <div className="flex gap-2">
                {(() => {
                  const selected = allRoutesSorted.filter(r => selectedRouteIds.has(r.id));
                  const assignedCount = selected.filter(r => r.status === 'assigned').length;
                  const inProgressCount = selected.filter(r => r.status === 'in_progress').length;
                  return (
                    <>
                      {assignedCount > 0 && (
                        <Button size="sm" disabled={bulkActionLoading} onClick={async () => {
                          const applicable = allRoutesSorted.filter(r => selectedRouteIds.has(r.id) && r.status === 'assigned');
                          if (!window.confirm(`Start ${applicable.length} route(s)?`)) return;
                          setBulkActionLoading(true);
                          await Promise.allSettled(applicable.map(r => fetch(`/api/team/routes/${r.id}/start`, { method: 'POST', credentials: 'include' })));
                          setSelectedRouteIds(new Set()); setBulkActionLoading(false); await fetchSchedule();
                        }} className="bg-teal-600 hover:bg-teal-700">Start ({assignedCount})</Button>
                      )}
                      {inProgressCount > 0 && (
                        <Button size="sm" disabled={bulkActionLoading} onClick={async () => {
                          const applicable = allRoutesSorted.filter(r => selectedRouteIds.has(r.id) && r.status === 'in_progress');
                          if (!window.confirm(`Complete ${applicable.length} route(s)?`)) return;
                          setBulkActionLoading(true);
                          await Promise.allSettled(applicable.map(r => fetch(`/api/team/routes/${r.id}/complete`, { method: 'POST', credentials: 'include' })));
                          setSelectedRouteIds(new Set()); setBulkActionLoading(false); await fetchSchedule();
                        }}>Complete ({inProgressCount})</Button>
                      )}
                      {assignedCount > 0 && (
                        <Button size="sm" disabled={bulkActionLoading} onClick={async () => {
                          const applicable = allRoutesSorted.filter(r => selectedRouteIds.has(r.id) && r.status === 'assigned');
                          if (!window.confirm(`Decline ${applicable.length} route(s)?`)) return;
                          setBulkActionLoading(true);
                          await Promise.allSettled(applicable.map(r => fetch(`/api/team/routes/${r.id}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'Bulk decline' }) })));
                          setSelectedRouteIds(new Set()); setBulkActionLoading(false); await fetchSchedule();
                        }} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200">Decline ({assignedCount})</Button>
                      )}
                    </>
                  );
                })()}
                <Button size="sm" variant="secondary" onClick={() => setSelectedRouteIds(new Set())}>Clear</Button>
              </div>
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

// ── My Contracts View ──────────────────────────────────────────────

interface DriverContract {
  id: string;
  zoneId: string;
  zoneName: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  status: string;
  perOrderRate: number | null;
  termsNotes: string | null;
  routeCount: number;
  orderCount: number;
  totalEarnings: number;
}

interface DriverOpportunity {
  id: string;
  zoneName: string;
  dayOfWeek: string;
  startDate: string;
  durationMonths: number;
  proposedPerOrderRate: number | null;
  requirements: Record<string, any>;
  applicationCount: number;
  myApplicationId: string | null;
  myApplicationStatus: string | null;
}

interface CoverageRequestData {
  id: string;
  contractId: string;
  coverageDate: string;
  reason: string;
  reasonNotes: string | null;
  status: string;
  dayOfWeek: string;
  zoneName: string;
  substituteDriverName: string | null;
  substitutePay: number | null;
  createdAt: string;
}

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
};

const COVERAGE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  filled: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
};

interface AssignedLocation {
  id: string;
  address: string;
  collectionDay: string;
  collectionFrequency: string;
  serviceType: string;
  serviceStatus: string;
  zoneName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  gateCode: string | null;
  driverNotes: string | null;
  requirements: string[] | null;
}

const DAY_ORDER: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
};

const MyLocations: React.FC = () => {
  const [locations, setLocations] = useState<AssignedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/team/my-assigned-locations', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => setLocations(data.locations || []))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>;

  // Group by collection day
  const byDay = locations.reduce<Record<string, AssignedLocation[]>>((acc, loc) => {
    const day = loc.collectionDay || 'Unknown';
    (acc[day] = acc[day] || []).push(loc);
    return acc;
  }, {});

  const sortedDays = Object.keys(byDay).sort((a, b) => (DAY_ORDER[a] ?? 99) - (DAY_ORDER[b] ?? 99));

  if (locations.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <MapPinIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg font-semibold">No assigned locations yet</p>
        <p className="text-sm mt-1">Locations in your active zones will appear here once approved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">{locations.length} location{locations.length !== 1 ? 's' : ''} across {sortedDays.length} collection day{sortedDays.length !== 1 ? 's' : ''}</p>
      {sortedDays.map(day => (
        <div key={day}>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{day} — {byDay[day].length} order{byDay[day].length !== 1 ? 's' : ''}</h3>
          <div className="space-y-3">
            {byDay[day].map(loc => (
              <Card key={loc.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3"
                  onClick={() => setExpanded(expanded === loc.id ? null : loc.id)}
                >
                  <MapPinIcon className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{loc.address}</p>
                    <p className="text-sm text-gray-500">{loc.zoneName} · {loc.collectionFrequency || 'Regular'} · {loc.serviceType}</p>
                  </div>
                  <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${expanded === loc.id ? 'rotate-90' : ''}`} />
                </button>
                {expanded === loc.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                    {loc.customerName && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Customer</p>
                        <p className="text-sm text-gray-900">{loc.customerName}</p>
                        {loc.customerPhone && <p className="text-sm text-gray-600">{loc.customerPhone}</p>}
                        {loc.customerEmail && <p className="text-sm text-gray-600">{loc.customerEmail}</p>}
                      </div>
                    )}
                    {loc.gateCode && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Gate Code</p>
                        <p className="text-sm font-mono bg-yellow-50 text-yellow-800 px-2 py-1 rounded inline-block">{loc.gateCode}</p>
                      </div>
                    )}
                    {loc.driverNotes && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Driver Notes</p>
                        <p className="text-sm text-gray-700 bg-blue-50 rounded p-2">{loc.driverNotes}</p>
                      </div>
                    )}
                    {loc.requirements && loc.requirements.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Requirements</p>
                        <div className="flex flex-wrap gap-1">
                          {loc.requirements.map(req => (
                            <span key={req} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">{req}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// ProviderDashboard — visible only to provider owners
// ============================================================

type ProviderTerritory = {
  id: string; name: string; zone_type: string; default_pickup_day: string | null;
  color: string | null; status: string; created_at: string;
};

type ProviderDriver = {
  id: string; name: string; email: string; status: string; rating: number | null;
  active_contracts: number; routes_30d: number; earnings_30d: number; active_zones: number;
};

const ProviderDashboard: React.FC<{ activeTab: ProviderTab; setActiveTab: (tab: ProviderTab) => void }> = ({ activeTab, setActiveTab }) => {
  const [providerName, setProviderName] = useState('');
  const [providerSlug, setProviderSlug] = useState('');
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);

  useEffect(() => {
    fetch('/api/team/my-provider/dashboard', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setStats(d.stats); setProviderName(d.providerName || ''); setProviderSlug(d.providerSlug || ''); } })
      .catch(() => {});
  }, []);

  const joinPageUrl = providerSlug ? `${window.location.origin}/join/${providerSlug}` : '';

  const TABS: { id: ProviderTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'team', label: 'Team' },
    { id: 'clients', label: 'Clients' },
    { id: 'fleet', label: 'Fleet' },
    { id: 'roles', label: 'Roles' },
    { id: 'dispatch', label: 'Dispatch' },
    { id: 'accounting', label: 'Accounting' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-gray-900">{providerName || 'My Company'}</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your company, team, fleet, and routes</p>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {joinPageUrl && (
            <Card className="p-5 border-teal-200 bg-teal-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-teal-800 mb-1">Your Join Page</p>
                  <p className="text-xs text-teal-700 font-mono break-all">{joinPageUrl}</p>
                  <p className="text-xs text-teal-600 mt-1">Share this link with customers to start service or with drivers to join your team.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(joinPageUrl).then(() => {
                      setJoinLinkCopied(true);
                      setTimeout(() => setJoinLinkCopied(false), 2000);
                    });
                  }}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-bold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors"
                >
                  {joinLinkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </Card>
          )}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Active Members', value: stats.active_member_count ?? stats.active_driver_count ?? 0 },
                { label: 'Vehicles', value: stats.vehicle_count ?? 0 },
                { label: 'Routes This Month', value: stats.routes_30d ?? 0 },
                { label: '30-Day Revenue', value: `$${Number(stats.total_earnings_30d || 0).toFixed(2)}` },
              ].map(s => (
                <Card key={s.label} className="p-5">
                  <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{s.value}</p>
                </Card>
              ))}
            </div>
          )}
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Getting Started</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                Add your vehicles in the <button type="button" onClick={() => setActiveTab('fleet')} className="text-teal-600 underline">Fleet</button> tab
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                Invite drivers in the <button type="button" onClick={() => setActiveTab('team')} className="text-teal-600 underline">Team</button> tab and set their OptimoRoute IDs
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                Import your existing clients in the <button type="button" onClick={() => setActiveTab('clients')} className="text-teal-600 underline">Clients</button> tab
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0">4</span>
                Dispatch assigned routes in the <button type="button" onClick={() => setActiveTab('dispatch')} className="text-teal-600 underline">Dispatch</button> tab
              </li>
            </ul>
          </Card>
        </div>
      )}

      {activeTab === 'team' && <ProviderTeamPanel />}
      {activeTab === 'clients' && <ProviderClientImport />}
      {activeTab === 'fleet' && <ProviderFleetPanel />}
      {activeTab === 'roles' && <ProviderRolesManager />}
      {activeTab === 'dispatch' && <ProviderRouteDispatch />}
      {activeTab === 'accounting' && <ProviderAccountingView />}
    </div>
  );
};

type ZoneExpansionProposal = {
  id: string;
  proposedZoneName: string;
  zoneType: string;
  daysOfWeek: string[];
  proposedRate: number | null;
  notes: string | null;
  status: 'pending' | 'converted' | 'rejected';
  adminNotes: string | null;
  createdAt: string;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ZoneExpansionProposalsPanel: React.FC = () => {
  const [proposals, setProposals] = useState<ZoneExpansionProposal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState<'circle' | 'polygon' | 'zip'>('circle');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('');
  const [zipCodes, setZipCodes] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  const load = () => {
    fetch('/api/team/zone-expansion-proposals', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { proposals: [] })
      .then(d => setProposals(d.proposals ?? []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const toggleDay = (d: string) =>
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    const body: Record<string, unknown> = { proposedZoneName: zoneName, zoneType, daysOfWeek: days, proposedRate: rate ? parseFloat(rate) : null, notes };
    if (zoneType === 'circle') { body.centerLat = parseFloat(centerLat); body.centerLng = parseFloat(centerLng); body.radiusMiles = parseFloat(radiusMiles); }
    if (zoneType === 'zip') { body.zipCodes = zipCodes.split(',').map(z => z.trim()).filter(Boolean); }
    try {
      const r = await fetch('/api/team/zone-expansion-proposals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        setMsg('Proposal submitted!');
        setShowForm(false);
        setZoneName(''); setCenterLat(''); setCenterLng(''); setRadiusMiles(''); setZipCodes(''); setDays([]); setRate(''); setNotes('');
        load();
      } else {
        const d = await r.json();
        setMsg(d.error || 'Failed to submit');
      }
    } catch { setMsg('Network error'); }
    setSubmitting(false);
  };

  const withdraw = async (id: string) => {
    if (!confirm('Withdraw this proposal?')) return;
    const r = await fetch(`/api/team/zone-expansion-proposals/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) load();
  };

  const statusBadge = (s: string) => {
    const cls = s === 'pending' ? 'bg-yellow-100 text-yellow-800' : s === 'converted' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
  };

  return (
    <Card className="p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Zone Expansion Proposals</h3>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setMsg(''); }} className="text-sm bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700">
            + Propose New Zone
          </button>
        )}
      </div>

      {msg && <p className={`text-sm mb-3 ${msg.includes('!') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 mb-6 border border-gray-200 rounded-lg p-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Zone Name *</label>
            <input required value={zoneName} onChange={e => setZoneName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. North Hillside" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Zone Type</label>
            <div className="flex gap-2">
              {(['circle', 'polygon', 'zip'] as const).map(t => (
                <button key={t} type="button" onClick={() => setZoneType(t)}
                  className={`px-3 py-1 text-sm rounded-full border ${zoneType === t ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-300 text-gray-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {zoneType === 'circle' && (
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Center Lat</label><input type="number" step="any" value={centerLat} onChange={e => setCenterLat(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="39.7" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Center Lng</label><input type="number" step="any" value={centerLng} onChange={e => setCenterLng(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="-104.9" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Radius (mi)</label><input type="number" step="any" value={radiusMiles} onChange={e => setRadiusMiles(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="5" /></div>
            </div>
          )}
          {zoneType === 'zip' && (
            <div><label className="block text-xs font-medium text-gray-700 mb-1">ZIP Codes (comma-separated)</label><input value={zipCodes} onChange={e => setZipCodes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="80202, 80203, 80204" /></div>
          )}
          {zoneType === 'polygon' && (
            <p className="text-xs text-gray-500">Polygon geometry will be defined by admin when converting this proposal to an opportunity.</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-2 py-1 text-xs rounded-full border ${days.includes(d) ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-300 text-gray-700'}`}>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Proposed Rate ($/order)</label><input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="12.00" /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Any additional context..." /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit Proposal'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {proposals.length === 0 && !showForm ? (
        <p className="text-sm text-gray-500">No proposals yet. Use the button above to propose a new service zone.</p>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-900">{p.proposedZoneName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.zoneType} zone{p.daysOfWeek?.length ? ` · ${p.daysOfWeek.join(', ')}` : ''}{p.proposedRate ? ` · $${p.proposedRate}/order` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(p.status)}
                  {p.status === 'pending' && (
                    <button onClick={() => withdraw(p.id)} className="text-xs text-red-600 hover:underline">Withdraw</button>
                  )}
                </div>
              </div>
              {p.status === 'rejected' && p.adminNotes && (
                <p className="mt-2 text-xs text-red-700 bg-red-50 rounded p-2">Admin note: {p.adminNotes}</p>
              )}
              {p.status === 'converted' && (
                <p className="mt-2 text-xs text-green-700 bg-green-50 rounded p-2">Converted to a contract opportunity — check the Opportunities tab.</p>
              )}
              {p.notes && <p className="mt-1 text-xs text-gray-500 italic">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const MyContracts: React.FC = () => {
  const [contracts, setContracts] = useState<DriverContract[]>([]);
  const [opportunities, setOpportunities] = useState<DriverOpportunity[]>([]);
  const [coverageRequests, setCoverageRequests] = useState<CoverageRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState<{ proposedRate: string; message: string }>({ proposedRate: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [coverageForm, setCoverageForm] = useState<{ contractId: string; date: string; reason: string; notes: string } | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<string | null>(null);
  const [contractRoutes, setContractRoutes] = useState<Record<string, Array<{ id: string; scheduledDate: string; status: string; orderCount: number; computedValue: number | null; payMode: string }>>>({});
  const [expandedValuation, setExpandedValuation] = useState<string | null>(null);
  const [valuationData, setValuationData] = useState<Record<string, any>>({});
  const [expandedForecast, setExpandedForecast] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<Record<string, { earnedSoFar: number; completedRoutes: number; remainingRoutes: number; avgRouteValue: number; projectedTotal: number }>>({});

  const fetchData = useCallback(async () => {
    try {
      const [cRes, oRes, crRes] = await Promise.all([
        fetch('/api/team/my-contracts', { credentials: 'include' }),
        fetch('/api/team/contract-opportunities', { credentials: 'include' }),
        fetch('/api/team/coverage-requests', { credentials: 'include' }),
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setContracts(cData.contracts || []);
      }
      if (oRes.ok) {
        const oData = await oRes.json();
        setOpportunities(oData.opportunities || []);
      }
      if (crRes.ok) {
        const crData = await crRes.json();
        setCoverageRequests(crData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async (oppId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {};
      if (applyForm.proposedRate) body.proposedRate = parseFloat(applyForm.proposedRate);
      if (applyForm.message) body.message = applyForm.message;
      const res = await fetch(`/api/team/contract-opportunities/${oppId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply');
      }
      setApplyingTo(null);
      setApplyForm({ proposedRate: '', message: '' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (oppId: string) => {
    try {
      const res = await fetch(`/api/team/contract-opportunities/${oppId}/apply`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to withdraw');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error withdrawing application');
    }
  };

  const handleCoverageSubmit = async () => {
    if (!coverageForm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/team/coverage-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          contractId: coverageForm.contractId,
          coverageDate: coverageForm.date,
          reason: coverageForm.reason,
          reasonNotes: coverageForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }
      setCoverageForm(null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting coverage request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCoverageWithdraw = async (id: string) => {
    try {
      const res = await fetch(`/api/team/coverage-requests/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to withdraw');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error withdrawing coverage request');
    }
  };

  const toggleForecast = async (contractId: string) => {
    if (expandedForecast === contractId) { setExpandedForecast(null); return; }
    setExpandedForecast(contractId);
    if (forecastData[contractId]) return;
    try {
      const res = await fetch(`/api/team/contracts/${contractId}/forecast`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setForecastData(prev => ({ ...prev, [contractId]: data }));
      }
    } catch { /* ignore */ }
  };

  const toggleValuation = async (routeId: string) => {
    if (expandedValuation === routeId) { setExpandedValuation(null); return; }
    setExpandedValuation(routeId);
    if (valuationData[routeId]) return;
    try {
      const res = await fetch(`/api/team/routes/${routeId}/valuation`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setValuationData(prev => ({ ...prev, [routeId]: data }));
      }
    } catch { /* ignore */ }
  };

  const toggleContractRoutes = async (contractId: string) => {
    if (expandedRoutes === contractId) { setExpandedRoutes(null); return; }
    setExpandedRoutes(contractId);
    if (contractRoutes[contractId]) return;
    try {
      const res = await fetch(`/api/team/contracts/${contractId}/routes`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContractRoutes(prev => ({ ...prev, [contractId]: data.routes || [] }));
      }
    } catch { /* ignore */ }
  };

  const daysUntilExpiry = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>;
  }

  const activeContracts = contracts.filter(c => c.status === 'active');
  const otherContracts = contracts.filter(c => c.status !== 'active');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">My Contracts</h2>
        <p className="text-sm text-gray-500 mt-1">Your route contracts showing zone assignments, compensation rates, and earnings.</p>
      </div>

      {/* Open Opportunities */}
      {opportunities.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Open Opportunities</h3>
          {opportunities.map(opp => (
            <Card key={opp.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{opp.zoneName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700 capitalize">{opp.dayOfWeek}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Open</span>
                      <span className="text-xs text-gray-500">{opp.applicationCount} applicant{opp.applicationCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span>Starts {formatDate(opp.startDate)}</span>
                      <span>{opp.durationMonths} month{opp.durationMonths !== 1 ? 's' : ''}</span>
                      {opp.proposedPerOrderRate != null && <span>${opp.proposedPerOrderRate.toFixed(2)}/order proposed</span>}
                      {opp.requirements?.minRating && <span>Min rating: {opp.requirements.minRating}</span>}
                      {opp.requirements?.equipmentTypes?.length > 0 && (
                        <span>Equipment: {opp.requirements.equipmentTypes.map((e: string) => e.replace(/_/g, ' ')).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="ml-3">
                    {opp.myApplicationId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Applied</span>
                        {opp.myApplicationStatus === 'pending' && (
                          <button onClick={() => handleWithdraw(opp.id)}
                            className="text-xs text-gray-500 hover:text-red-600 underline">
                            Withdraw
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setApplyingTo(applyingTo === opp.id ? null : opp.id); setApplyForm({ proposedRate: '', message: '' }); }}
                        className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                        Apply
                      </button>
                    )}
                  </div>
                </div>

                {applyingTo === opp.id && (
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Your proposed rate ($/order)</label>
                        <input type="number" step="0.01" min="0"
                          value={applyForm.proposedRate}
                          onChange={e => setApplyForm({ ...applyForm, proposedRate: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                          placeholder={opp.proposedPerOrderRate ? `Suggested: $${opp.proposedPerOrderRate.toFixed(2)}` : 'Optional'} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Message (optional)</label>
                        <input type="text"
                          value={applyForm.message}
                          onChange={e => setApplyForm({ ...applyForm, message: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                          placeholder="Why you're a good fit..." />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApply(opp.id)} disabled={submitting}
                        className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                        {submitting ? 'Submitting...' : 'Submit Application'}
                      </button>
                      <button onClick={() => setApplyingTo(null)}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {contracts.length === 0 && opportunities.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <ClipboardDocumentIcon className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-3 text-gray-500 text-sm">You don't have any route contracts yet. Check back for open opportunities.</p>
          </div>
        </Card>
      ) : contracts.length > 0 ? (
        <>
          {activeContracts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Active Contracts</h3>
              {activeContracts.map(c => {
                const expDays = daysUntilExpiry(c.endDate);
                return (
                  <Card key={c.id}>
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900">{c.zoneName}</span>
                            <span className="text-gray-400">|</span>
                            <span className="text-sm text-gray-700 capitalize">{c.dayOfWeek}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTRACT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                              {c.status}
                            </span>
                            {expDays <= 30 && expDays > 0 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                Expires in {expDays}d
                              </span>
                            )}
                            {expDays <= 0 && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                Past due
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-gray-500 flex gap-4 flex-wrap">
                            <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                            {c.perOrderRate != null && <span className="font-medium text-gray-700">${c.perOrderRate.toFixed(2)}/order</span>}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">Routes</p>
                          <p className="text-lg font-bold text-gray-900">{c.routeCount}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">Orders</p>
                          <p className="text-lg font-bold text-gray-900">{c.orderCount}</p>
                        </div>
                        <div className="bg-teal-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-teal-600">Earnings</p>
                          <p className="text-lg font-bold text-teal-700">${c.totalEarnings.toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => toggleContractRoutes(c.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${expandedRoutes === c.id ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                          {expandedRoutes === c.id ? 'Hide Routes' : 'View Routes'}
                        </button>
                        <button
                          onClick={() => toggleForecast(c.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${expandedForecast === c.id ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                          {expandedForecast === c.id ? 'Hide Forecast' : 'Forecast'}
                        </button>
                        <button
                          onClick={() => setCoverageForm(coverageForm?.contractId === c.id ? null : { contractId: c.id, date: '', reason: 'sick', notes: '' })}
                          className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200">
                          Request Coverage
                        </button>
                      </div>

                      {expandedRoutes === c.id && (
                        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                          {!contractRoutes[c.id] ? (
                            <div className="p-3 text-center text-xs text-gray-400">Loading routes...</div>
                          ) : contractRoutes[c.id].length === 0 ? (
                            <div className="p-3 text-center text-xs text-gray-400">No routes created for this contract yet.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Status</th>
                                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Orders</th>
                                  <th className="text-right px-3 py-2 text-gray-500 font-medium">Earnings</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {contractRoutes[c.id].map((r: any) => (
                                  <React.Fragment key={r.id}>
                                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleValuation(r.id)}>
                                      <td className="px-3 py-2 text-gray-700">
                                        <span className="text-gray-400 mr-1">{expandedValuation === r.id ? '\u25BC' : '\u25B6'}</span>
                                        {formatDate(r.scheduledDate)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                          r.status === 'completed' ? 'bg-green-100 text-green-700' :
                                          r.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                          r.status === 'assigned' ? 'bg-yellow-100 text-yellow-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>{r.status}</span>
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-700">{r.orderCount}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">
                                        {r.computedValue != null ? `$${Number(r.computedValue).toFixed(2)}` : '-'}
                                      </td>
                                    </tr>
                                    {expandedValuation === r.id && valuationData[r.id] && (
                                      <tr>
                                        <td colSpan={4} className="px-3 py-2 bg-gray-50">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1">
                                              <span>Pay Mode: <strong className="text-gray-700">{valuationData[r.id].payMode || 'dynamic'}</strong></span>
                                              {valuationData[r.id].payPremium > 0 && <span>Premium: <strong className="text-teal-600">+${valuationData[r.id].payPremium.toFixed(2)}</strong></span>}
                                            </div>
                                            {valuationData[r.id].orderBreakdowns?.map((sb: any, i: number) => (
                                              <div key={i} className="flex items-center justify-between text-[10px] bg-white rounded px-2 py-1">
                                                <span className="text-gray-600 truncate flex-1" title={sb.address}>{sb.address || `Order ${i + 1}`}</span>
                                                <span className="ml-2 text-gray-400">
                                                  {sb.breakdown?.source === 'custom_rate' ? 'Custom Rate' :
                                                   sb.breakdown?.source === 'contract_rate' ? 'Contract Rate' : 'Rules Engine'}
                                                </span>
                                                <span className="ml-2 font-medium text-gray-700">${Number(sb.compensation).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {expandedForecast === c.id && forecastData[c.id] && (() => {
                        const f = forecastData[c.id];
                        const pct = f.projectedTotal > 0 ? Math.min(100, Math.round((f.earnedSoFar / f.projectedTotal) * 100)) : 0;
                        return (
                          <div className="mt-3 bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="font-medium text-indigo-700">Earnings Forecast</span>
                              <span className="text-indigo-500">{pct}% complete</span>
                            </div>
                            <div className="w-full bg-indigo-100 rounded-full h-2 mb-2">
                              <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-500">Earned: </span>
                                <span className="font-bold text-gray-900">${f.earnedSoFar.toFixed(2)}</span>
                                <span className="text-gray-400"> of ${f.projectedTotal.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Routes: </span>
                                <span className="font-bold text-gray-900">{f.completedRoutes}</span>
                                <span className="text-gray-400"> done, {f.remainingRoutes} remaining</span>
                              </div>
                            </div>
                            {f.avgRouteValue > 0 && (
                              <div className="text-[10px] text-gray-400 mt-1">Avg ${f.avgRouteValue.toFixed(2)}/route</div>
                            )}
                          </div>
                        );
                      })()}

                      {coverageForm?.contractId === c.id && (
                        <div className="mt-3 bg-amber-50 rounded-lg p-3 space-y-2 border border-amber-200">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                              <input type="date" value={coverageForm.date}
                                onChange={e => setCoverageForm({ ...coverageForm, date: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                              <select value={coverageForm.reason}
                                onChange={e => setCoverageForm({ ...coverageForm, reason: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                                <option value="sick">Sick</option>
                                <option value="vacation">Vacation</option>
                                <option value="emergency">Emergency</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                            <input type="text" value={coverageForm.notes}
                              onChange={e => setCoverageForm({ ...coverageForm, notes: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                              placeholder="Additional details..." />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleCoverageSubmit} disabled={submitting || !coverageForm.date}
                              className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                              {submitting ? 'Submitting...' : 'Submit Request'}
                            </button>
                            <button onClick={() => setCoverageForm(null)}
                              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
                          </div>
                        </div>
                      )}

                      {c.termsNotes && (
                        <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                          <span className="font-medium text-gray-600">Notes:</span> {c.termsNotes}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {otherContracts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Past Contracts</h3>
              {otherContracts.map(c => (
                <Card key={c.id}>
                  <div className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{c.zoneName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700 capitalize">{c.dayOfWeek}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTRACT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex gap-4 flex-wrap">
                      <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                      {c.perOrderRate != null && <span>${c.perOrderRate.toFixed(2)}/order</span>}
                      <span>{c.routeCount} routes</span>
                      <span>{c.orderCount} orders</span>
                      <span className="font-medium text-gray-700">${c.totalEarnings.toFixed(2)} earned</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* Coverage Requests */}
      {coverageRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Coverage Requests</h3>
          {coverageRequests.map(cr => (
            <Card key={cr.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{cr.zoneName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700 capitalize">{cr.dayOfWeek}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COVERAGE_STATUS_COLORS[cr.status] || 'bg-gray-100 text-gray-600'}`}>
                        {cr.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span>Date: {formatDate(cr.coverageDate)}</span>
                      <span className="capitalize">Reason: {cr.reason}</span>
                      {cr.reasonNotes && <span>{cr.reasonNotes}</span>}
                      {cr.substituteDriverName && <span>Substitute: {cr.substituteDriverName}</span>}
                      {cr.substitutePay != null && <span>Pay: ${cr.substitutePay.toFixed(2)}</span>}
                    </div>
                  </div>
                  {cr.status === 'pending' && (
                    <button type="button" onClick={() => handleCoverageWithdraw(cr.id)}
                      className="text-xs text-gray-500 hover:text-red-600 underline ml-3">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const QualificationsCard: React.FC = () => {
  const [quals, setQuals] = useState<{ equipmentTypes: string[]; certifications: string[]; maxOrdersPerDay: number; verified: boolean; updatedAt: string | null } | null>(null);
  const [equipInput, setEquipInput] = useState('');
  const [certInput, setCertInput] = useState('');
  const [maxOrders, setMaxOrders] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/team/my-qualifications', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.qualifications) {
          setQuals(data.qualifications);
          setEquipInput(data.qualifications.equipmentTypes.join(', '));
          setCertInput(data.qualifications.certifications.join(', '));
          setMaxOrders(String(data.qualifications.maxOrdersPerDay ?? ''));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const equipmentTypes = equipInput.split(',').map(s => s.trim()).filter(Boolean);
      const certifications = certInput.split(',').map(s => s.trim()).filter(Boolean);
      const body: any = { equipmentTypes, certifications };
      const ms = parseInt(maxOrders);
      if (!isNaN(ms) && ms > 0) body.maxOrdersPerDay = ms;
      const res = await fetch('/api/team/profile/qualifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      const data = await res.json();
      setQuals(data.qualifications);
      setMsg('Saved — admin will verify your qualifications shortly.');
    } catch (err: any) {
      setMsg(err.message || 'Error saving qualifications');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Qualifications</h3>
          <p className="text-sm text-gray-500 mt-1">Declare your equipment and certifications so you're matched to the right orders.</p>
        </div>
        {quals && (
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${quals.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {quals.verified ? 'Verified' : 'Unverified'}
          </span>
        )}
      </div>
      {!quals?.verified && (
        <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 mb-4">Your qualifications are unverified. An admin will review and confirm them.</p>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Equipment Types</label>
          <input
            type="text"
            title="Equipment types (comma separated)"
            value={equipInput}
            onChange={e => setEquipInput(e.target.value)}
            placeholder="e.g. rear-loader, side-loader, recycling"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">Comma-separated list</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Certifications</label>
          <input
            type="text"
            title="Certifications (comma separated)"
            value={certInput}
            onChange={e => setCertInput(e.target.value)}
            placeholder="e.g. hazmat, CDL-B"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">Comma-separated list</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Max Orders Per Day</label>
          <input
            type="number"
            title="Max orders per day"
            value={maxOrders}
            onChange={e => setMaxOrders(e.target.value)}
            min={1}
            max={500}
            placeholder="e.g. 50"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {msg && (
          <p className={`text-xs rounded-lg px-3 py-2 ${msg.includes('Saved') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</p>
        )}
        <Button onClick={handleSave} disabled={saving} className="text-sm">
          {saving ? 'Saving…' : 'Save Qualifications'}
        </Button>
      </div>
    </Card>
  );
};

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
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
        body: JSON.stringify({ name: editName, phone: editPhone }),
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
                  <span className="text-sm text-gray-500">Routes Completed</span>
                  <span className="text-sm font-bold text-gray-900">{profile.total_jobs_completed || 0}</span>
                </div>
              </div>
            )}
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

          <QualificationsCard />

          {profile?.providerName && (
            <Card className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Provider</h3>
              <div className="flex items-center gap-3">
                <BuildingOfficeIcon className="w-8 h-8 text-teal-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">{profile.providerName}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${profile.isProviderOwner ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}>
                    {profile.isProviderOwner ? 'Owner' : 'Member'}
                  </span>
                </div>
              </div>
            </Card>
          )}

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
    <div className="flex gap-4 h-[calc(100vh-8rem)] sm:h-[calc(100vh-12rem)]">
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
                  <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${isDriver ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
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
  const [currentDriverView, setCurrentDriverViewRaw] = useState<DriverView>(() => getDriverViewFromPath(window.location.pathname));
  const [currentProviderTab, setCurrentProviderTabRaw] = useState<ProviderTab>(() => getProviderTabFromPath(window.location.pathname));
  const [portalContext, setPortalContext] = useState<TeamPortalContext | null>(() => getPortalContextFromPath(window.location.pathname));
  const [pendingDeepLink] = useState<DriverView | null>(() => {
    if (!isDriverPath(window.location.pathname)) return null;
    const view = getDriverViewFromPath(window.location.pathname);
    return view !== 'dashboard' ? view : null;
  });
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [isProviderOwner, setIsProviderOwner] = useState(false);
  const [ownerProvider, setOwnerProvider] = useState<any>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState('');
  const [msgUnreadCount, setMsgUnreadCount] = useState(0);

  // Detect portal context from pathname for pre-selection and join page
  const [joinSlug] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/join\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [providerInviteToken] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('provider-invite');
  });

  const [authMode, setAuthMode] = useState<TeamAuthMode>(() => getAuthModeFromPath(window.location.pathname));
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [googleSsoEnabled, setGoogleSsoEnabled] = useState<boolean | null>(null);

  // Toast notifications for action feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    fetch('/api/auth/sso-config')
      .then(r => r.json())
      .then(data => setGoogleSsoEnabled(data.googleEnabled))
      .catch(() => setGoogleSsoEnabled(false));
  }, []);

  const syncPortalStateFromPath = useCallback((pathname: string) => {
    setPortalContext(getPortalContextFromPath(pathname));
    setAuthMode(getAuthModeFromPath(pathname));

    if (isProviderPath(pathname)) {
      setCurrentProviderTabRaw(getProviderTabFromPath(pathname));
    } else if (isDriverPath(pathname)) {
      setCurrentDriverViewRaw(getDriverViewFromPath(pathname));
    }
  }, []);

  const syncAuthRoute = useCallback((mode: TeamAuthMode) => {
    const nextPortalContext = getPortalContextFromPath(window.location.pathname) ?? portalContext;
    const targetPath = getAuthPath(nextPortalContext, mode);

    setPortalContext(nextPortalContext);
    setAuthMode(mode);

    if (normalizeTeamPath(window.location.pathname) !== targetPath) {
      window.history.pushState({ authMode: mode }, '', targetPath);
    }
  }, [portalContext]);

  const setCurrentDriverView = useCallback((view: DriverView) => {
    setCurrentDriverViewRaw(view);
    const targetPath = DRIVER_VIEW_TO_PATH[view] || '/driver';
    if (normalizeTeamPath(window.location.pathname) !== targetPath) {
      window.history.pushState({ view }, '', targetPath);
    }
  }, []);

  const setCurrentProviderTab = useCallback((tab: ProviderTab) => {
    setCurrentProviderTabRaw(tab);
    const targetPath = PROVIDER_TAB_TO_PATH[tab] || '/provider';
    if (normalizeTeamPath(window.location.pathname) !== targetPath) {
      window.history.pushState({ tab }, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      syncPortalStateFromPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncPortalStateFromPath]);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/team/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const json = await res.json();
      const driverData = json.data || json.driver;
      setCurrentDriver(normalizeDriver(driverData));
      const isOwner = !!(json.isProviderOwner || driverData?.isProviderOwner);
      if (isOwner) setIsProviderOwner(true);
      if (json.provider) setOwnerProvider(json.provider);
      if (json.impersonating) {
        setImpersonating(true);
        setImpersonatedBy(json.impersonatedBy || 'Admin');
      }
      // Push URL to the correct portal root if currently on the wrong one, and sync state
      const p = window.location.pathname;
      if (isOwner && (isExplicitAuthPath(p) || !isProviderPath(p))) {
        const tab = getProviderTabFromPath(p);
        setPortalContext('provider');
        setCurrentProviderTabRaw(tab);
        window.history.replaceState({}, '', PROVIDER_TAB_TO_PATH[tab] || '/provider');
      } else if (!isOwner && (isExplicitAuthPath(p) || !isDriverPath(p))) {
        const view = getDriverViewFromPath(p);
        setPortalContext('driver');
        setCurrentDriverViewRaw(view);
        window.history.replaceState({}, '', DRIVER_VIEW_TO_PATH[view] || '/driver');
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
    const wasProviderOwner = isProviderOwner;
    setCurrentDriver(null);
    setOnboardingStatus(null);
    setIsProviderOwner(false);
    setOwnerProvider(null);
    setCurrentDriverViewRaw('dashboard');
    setCurrentProviderTabRaw('overview');
    setPortalContext(wasProviderOwner ? 'provider' : 'driver');
    setAuthMode(getAuthModeFromPath(wasProviderOwner ? '/provider' : '/driver'));
    window.history.replaceState({}, '', wasProviderOwner ? '/provider' : '/driver');
  };

  const handleStopImpersonation = async () => {
    try {
      await fetch('/api/admin/stop-impersonate-driver', { method: 'POST', credentials: 'include' });
      window.location.href = '/admin/';
    } catch {
      alert('Failed to exit driver view');
    }
  };

  // Public join page — shown before session check resolves (no auth needed)
  if (joinSlug && loading) {
    return (
      <React.Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
        </div>
      }>
        <ProviderJoinPage slug={joinSlug} />
      </React.Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // Public join page for logged-in users too (they can still sign in as driver)
  if (joinSlug && !currentDriver) {
    return (
      <React.Suspense fallback={null}>
        <ProviderJoinPage slug={joinSlug} />
      </React.Suspense>
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
                await checkSession();
                if (pendingDeepLink) setCurrentDriverViewRaw(pendingDeepLink);
              } catch (err: any) {
                setAuthError(err.message);
              } finally {
                setAuthLoading(false);
              }
            }}
            switchToRegister={() => {
              syncAuthRoute('register');
              setAuthError('');
            }}
            isLoading={authLoading}
            googleSsoEnabled={googleSsoEnabled ?? true}
            initialPortalContext={portalContext ?? undefined}
          />
        ) : (
          <TeamRegister
            initialPortalContext={portalContext ?? undefined}
            initialProviderInviteToken={providerInviteToken ?? undefined}
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
                    registrationType: data.registrationType,
                    companyName: data.companyName,
                    inviteToken: data.inviteToken,
                    providerInviteToken: data.providerInviteToken,
                  }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || json.message || 'Registration failed');
                // Use checkSession to uniformly handle both driver and provider responses
                await checkSession();
                if (pendingDeepLink) setCurrentDriverViewRaw(pendingDeepLink);
              } catch (err: any) {
                setAuthError(err.message);
              } finally {
                setAuthLoading(false);
              }
            }}
            switchToLogin={() => {
              syncAuthRoute('login');
              setAuthError('');
            }}
            isLoading={authLoading}
            googleSsoEnabled={googleSsoEnabled ?? true}
          />
        )}
      </TeamAuthLayout>
    );
  }

  // Provider owner gating — show appropriate screen based on approval status
  if (isProviderOwner && ownerProvider) {
    const status = ownerProvider.approval_status;

    if (status === 'draft' || status === 'pending_review') {
      if (status === 'pending_review') {
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Application Under Review</h2>
              <p className="text-gray-500 text-sm">
                Your company application has been submitted and is being reviewed by our team. We'll reach out to <strong>{currentDriver?.email}</strong> within 1–2 business days.
              </p>
              <p className="text-xs text-gray-400">Questions? Contact <a href="mailto:support@ruralwm.com" className="text-teal-600 underline">support@ruralwm.com</a></p>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Sign out
              </button>
            </div>
          </div>
        );
      }
      // draft — show onboarding wizard
      return <ProviderOnboardingFlow onComplete={checkSession} />;
    }

    if (status === 'rejected') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Application Not Approved</h2>
            <p className="text-gray-500 text-sm">
              Unfortunately, your company application was not approved at this time.
            </p>
            {ownerProvider.approval_notes && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-left">
                <p className="text-xs font-bold text-red-700 mb-1">Reason:</p>
                <p className="text-sm text-red-800">{ownerProvider.approval_notes}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">Contact <a href="mailto:support@ruralwm.com" className="text-teal-600 underline">support@ruralwm.com</a> if you believe this is an error or wish to reapply.</p>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }

    if (status === 'suspended') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Account Suspended</h2>
            <p className="text-gray-500 text-sm">
              Your company account has been temporarily suspended.
            </p>
            {ownerProvider.suspended_reason && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-left">
                <p className="text-xs font-bold text-orange-700 mb-1">Reason:</p>
                <p className="text-sm text-orange-800">{ownerProvider.suspended_reason}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">Contact <a href="mailto:support@ruralwm.com" className="text-teal-600 underline">support@ruralwm.com</a> to resolve this issue.</p>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
  }

  // Approved provider → full provider portal layout
  if (isProviderOwner && ownerProvider && ownerProvider.approval_status === 'approved') {
    const providerNavItems: { tab: ProviderTab; label: string; icon: React.ReactNode }[] = [
      { tab: 'overview',   label: 'Overview',    icon: <HomeIcon className="w-5 h-5" /> },
      { tab: 'team',       label: 'Team',         icon: <UserIcon className="w-5 h-5" /> },
      { tab: 'clients',    label: 'Clients',      icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
      { tab: 'fleet',      label: 'Fleet',        icon: <BriefcaseIcon className="w-5 h-5" /> },
      { tab: 'roles',      label: 'Roles',        icon: <CheckCircleIcon className="w-5 h-5" /> },
      { tab: 'dispatch',   label: 'Dispatch',     icon: <MapPinIcon className="w-5 h-5" /> },
      { tab: 'accounting', label: 'Accounting',   icon: <ArchiveBoxIcon className="w-5 h-5" /> },
    ];
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 flex">
          <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <img src="/favicon.svg" alt="" className="w-8 h-8" />
                <div>
                  <h1 className="text-lg font-black tracking-tight">Provider Portal</h1>
                  <p className="text-xs text-gray-400">Rural Waste Management</p>
                </div>
              </div>
            </div>
            <nav className="p-4 space-y-1">
              {providerNavItems.map(item => (
                <button
                  type="button"
                  key={item.tab}
                  onClick={() => { setCurrentProviderTab(item.tab); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    currentProviderTab === item.tab
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-black">
                  {currentDriver.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
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
                {providerNavItems.find(n => n.tab === currentProviderTab)?.label || 'Provider Portal'}
              </h2>
            </header>
            <div className="p-4 sm:p-6 lg:p-8">
              <ProviderDashboard activeTab={currentProviderTab} setActiveTab={setCurrentProviderTab} />
            </div>
          </main>
        </div>

        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-teal-600 text-white'
          }`}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">&times;</button>
          </div>
        )}
      </div>
    );
  }

  if (onboardingStatus && onboardingStatus.onboarding_status !== 'completed') {
    return <OnboardingFlow status={onboardingStatus} onRefresh={checkOnboarding} />;
  }

  const navItems: { view: DriverView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <HomeIcon className="w-5 h-5" /> },
    { view: 'routes', label: 'Available Routes', icon: <BriefcaseIcon className="w-5 h-5" /> },
    { view: 'schedule', label: 'My Schedule', icon: <CalendarDaysIcon className="w-5 h-5" /> },
    { view: 'pickups', label: 'On-Demand', icon: <ArchiveBoxIcon className="w-5 h-5" /> },
    { view: 'zones', label: 'Coverage', icon: <MapPinIcon className="w-5 h-5" /> },
    { view: 'contracts', label: 'My Contracts', icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
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
            <img src="/favicon.svg" alt="" className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-black tracking-tight">Driver Portal</h1>
              <p className="text-xs text-gray-400">Rural Waste Management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <button
              type="button"
              key={item.view}
              onClick={() => { setCurrentDriverView(item.view); setSidebarOpen(false); if (item.view === 'messages') setMsgUnreadCount(0); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                currentDriverView === item.view
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
            {navItems.find(n => n.view === currentDriverView)?.label || 'Driver Portal'}
          </h2>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {currentDriverView === 'dashboard' && <Dashboard driver={currentDriver} onNavigate={(view) => setCurrentDriverView(view as DriverView)} showToast={showToast} />}
          {currentDriverView === 'routes' && <RouteBoard onNavigate={(view) => setCurrentDriverView(view as DriverView)} showToast={showToast} />}
          {currentDriverView === 'schedule' && <Schedule onNavigate={(view) => setCurrentDriverView(view as DriverView)} showToast={showToast} />}
          {currentDriverView === 'pickups' && <OnDemandPickups />}
          {currentDriverView === 'zones' && (
            <>
              <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>}>
                <ZoneMapView />
              </React.Suspense>
              <ZoneExpansionProposalsPanel />
            </>
          )}
          {currentDriverView === 'contracts' && <MyContracts />}
          {currentDriverView === 'messages' && <DriverMessages />}
          {currentDriverView === 'profile' && <Profile />}
        </div>
      </main>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-teal-600 text-white'
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}
    </div>
  );
};

export default TeamApp;
