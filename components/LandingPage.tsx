import React from 'react';
import { HomeIcon, TruckIcon } from './Icons.tsx';
import { Button } from './Button.tsx';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="Rural Waste Management" className="h-8" />
            <span className="text-base font-black text-gray-900 tracking-tight hidden sm:block">Rural Waste Management</span>
          </a>
          <a
            href="/login"
            className="text-sm font-bold text-teal-700 hover:text-teal-900 transition-colors"
          >
            Sign In →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
              Waste collection,<br />simplified.
            </h1>
            <p className="text-lg text-gray-300 mb-10">
              Reliable pickup service for rural homes and businesses — schedule online, pay online, track everything.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <a
                href="/register"
                className="px-7 py-3.5 bg-teal-500 hover:bg-teal-400 text-white font-bold rounded-xl transition-colors text-base"
              >
                Start Service →
              </a>
              <a
                href="/login"
                className="text-sm text-gray-400 hover:text-white transition-colors font-medium"
              >
                Already a customer? Sign in
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Audience cards */}
      <section className="flex-1 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight text-center mb-10">
            Who are you?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

            {/* Customer */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mb-5">
                <HomeIcon className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Customer</h3>
              <p className="text-gray-500 text-sm leading-relaxed flex-1 mb-6">
                Schedule pickups, manage your subscription, pay bills, and track your service history — all online.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="/login"
                  className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors text-sm text-center"
                >
                  Sign In
                </a>
                <a
                  href="/register"
                  className="text-sm text-teal-700 hover:text-teal-900 font-bold transition-colors text-center"
                >
                  Create account →
                </a>
              </div>
            </div>

            {/* Driver */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mb-5">
                <TruckIcon className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Driver</h3>
              <p className="text-gray-500 text-sm leading-relaxed flex-1 mb-6">
                Find available routes, manage your schedule, submit bids, and track your earnings.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="/driver"
                  className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors text-sm text-center"
                >
                  Sign In
                </a>
                <a
                  href="/driver"
                  className="text-sm text-teal-700 hover:text-teal-900 font-bold transition-colors text-center"
                >
                  Join as a driver →
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Provider CTA */}
      <section className="bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                <TruckIcon className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Own a hauling or waste collection company?</h3>
                <p className="text-gray-400 text-sm mt-1">Join the Rural Waste Management provider network. Bring your trucks, your routes, and your team.</p>
              </div>
            </div>
            <a
              href="/provider/"
              className="flex-shrink-0 px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white font-bold rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              Become a Provider Partner →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Rural Waste Management. All rights reserved.</p>
        <p className="mt-2 flex items-center justify-center gap-3 flex-wrap">
          <a href="/privacy.html" className="hover:text-gray-600 transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="/terms.html" className="hover:text-gray-600 transition-colors">Terms of Service</a>
          <span>·</span>
          <a href="/admin" className="hover:text-gray-600 transition-colors">Admin</a>
        </p>
      </footer>

    </div>
  );
};

export default LandingPage;
