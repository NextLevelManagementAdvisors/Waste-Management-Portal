import React, { useState, useEffect } from 'react';

interface ProviderInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  approval_status: string;
}

interface ProviderJoinPageProps {
  slug: string;
}

const ProviderJoinPage: React.FC<ProviderJoinPageProps> = ({ slug }) => {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/public/provider/${encodeURIComponent(slug)}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(data => { if (data) setProvider(data.provider); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (notFound || !provider) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Provider Not Found</h2>
          <p className="text-gray-500 text-sm">This join link may be invalid or the provider is no longer active.</p>
          <a href="/" className="inline-block text-sm text-teal-600 hover:underline">Return to home</a>
        </div>
      </div>
    );
  }

  const appUrl = window.location.origin;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {provider.logo_url ? (
            <img src={provider.logo_url} alt={provider.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          <div>
            <p className="font-bold text-gray-900">{provider.name}</p>
            <p className="text-xs text-gray-500">Powered by Rural Waste Management</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-black text-gray-900 mb-2">{provider.name}</h1>
            {provider.description ? (
              <p className="text-gray-600">{provider.description}</p>
            ) : (
              <p className="text-gray-600">Reliable waste collection service in your area.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer CTA */}
            <div className="bg-white rounded-2xl border-2 border-teal-200 p-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Start Waste Service</h2>
                <p className="text-sm text-gray-500 mt-1">Set up pickup service at your address with {provider.name}.</p>
              </div>
              <a
                href={`/?provider=${encodeURIComponent(provider.slug)}&ref=join`}
                className="block w-full text-center px-4 py-2.5 bg-teal-600 text-white rounded-lg font-bold text-sm hover:bg-teal-700 transition-colors"
              >
                Sign Up for Service
              </a>
              <a
                href={`/?provider=${encodeURIComponent(provider.slug)}&action=redeem`}
                className="block w-full text-center px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Already a customer? Sign in
              </a>
            </div>

            {/* Driver CTA */}
            <div className="bg-white rounded-2xl border-2 border-blue-200 p-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Join Our Team</h2>
                <p className="text-sm text-gray-500 mt-1">Drive for {provider.name}. Bring your truck and your routes.</p>
              </div>
              <a
                href={`/driver/?join-provider=${encodeURIComponent(provider.slug)}`}
                className="block w-full text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
              >
                Apply to Drive
              </a>
              <a
                href={`/driver/?action=login&join-provider=${encodeURIComponent(provider.slug)}`}
                className="block w-full text-center px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Already a driver? Sign in
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 text-center">
        <p className="text-xs text-gray-400">
          Powered by <a href={appUrl} className="text-teal-600 hover:underline">Rural Waste Management</a>
        </p>
      </div>
    </div>
  );
};

export default ProviderJoinPage;
