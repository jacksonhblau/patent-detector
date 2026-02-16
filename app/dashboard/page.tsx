'use client';

import { useState } from 'react';
import Link from 'next/link';

interface TimelineStep {
  id: number;
  title: string;
  description: string;
  href: string;
  status: 'complete' | 'current' | 'upcoming';
  icon: string;
}

export default function DashboardPage() {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  async function handleSignOut() {
    try {
      // Clear all localStorage data
      localStorage.clear();

      // Clear all sessionStorage data
      sessionStorage.clear();

      // Call logout API to clear server-side session and cookies
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // Always redirect to onboarding (full page reload clears remaining client state)
      window.location.href = '/onboarding';
    }
  }

  const steps: TimelineStep[] = [
    {
      id: 1,
      title: 'Review Patent Portfolio',
      description: 'View your analyzed patents, technology categories, and AI-identified potential infringers. Upload additional patents here.',
      href: '/portfolio',
      status: 'complete',
      icon: '📊',
    },
    {
      id: 2,
      title: 'Competitor Infringement Analysis',
      description: 'View AI-powered infringement scores, add new competitors, and explore settlement probabilities — all in one place',
      href: '/analysis',
      status: 'current',
      icon: '⚖️',
    },
    {
      id: 3,
      title: 'Explore Settlement & Litigation Options',
      description: 'Calculate damages, settlement ranges, and litigation funding opportunities',
      href: '/litigation',
      status: 'current',
      icon: '💰',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <a href="https://www.inveniam.io" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
              <img src="/logos/inveniam-blue-tagline.svg" alt="Inveniam" className="h-10" />
            </a>
            <div className="border-l border-gray-300 h-10"></div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Patent Infringement Agent</h1>
              <p className="text-xs text-gray-500">AI-Powered Enterprise Patent Portfolio Surveillance</p>
            </div>
          </div>

          {/* Account Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center space-x-3 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-2 transition-colors border border-gray-200"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">JB</div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-900">Jackson Blau</p>
                <p className="text-xs text-gray-500">jacksonhblau@gmail.com</p>
              </div>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-10 border border-gray-200">
                <a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Settings</a>
                <a href="/billing" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Billing</a>
                <hr className="my-2" />
                <button onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome back, Jackson!</h2>
          <p className="text-gray-600">Your patent portfolio and competitor research are complete. View AI-powered infringement analysis below.</p>
        </div>

        {/* Quick Action Banner */}
        <Link href="/analysis" className="block mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Infringement Analysis Ready</h3>
                <p className="text-blue-100 text-sm">AI has analyzed competitor products against your 97 patents — view infringement scores and settlement probabilities</p>
              </div>
              <div className="text-3xl">→</div>
            </div>
          </div>
        </Link>

        {/* Timeline Checklist */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Your Workflow</h3>
          <div className="space-y-8">
            {steps.map((step, stepIdx) => (
              <div key={step.id} className="relative">
                {stepIdx !== steps.length - 1 && (
                  <div className={`absolute left-6 top-12 w-0.5 h-16 ${step.status === 'complete' ? 'bg-green-500' : 'bg-gray-200'}`} aria-hidden="true" />
                )}
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                      step.status === 'complete' ? 'bg-green-100 border-2 border-green-500'
                        : step.status === 'current' ? 'bg-blue-50 border-2 border-[#0066FF] animate-pulse'
                        : 'bg-gray-100 border-2 border-gray-300'
                    }`}>
                      {step.status === 'complete' ? '✅' : step.icon}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-900">{step.title}</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        step.status === 'complete' ? 'bg-green-100 text-green-800'
                          : step.status === 'current' ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {step.status === 'complete' ? 'Complete' : step.status === 'current' ? 'Ready' : 'Upcoming'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{step.description}</p>
                    <div className="mt-3">
                      <Link href={step.href} className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        step.status === 'current'
                          ? 'text-white bg-[#0066FF] hover:bg-[#0052CC]'
                          : 'text-green-700 bg-green-50 hover:bg-green-100'
                      }`}>
                        {step.id === 3 ? 'Learn More' : step.status === 'current' ? 'Get Started →' : 'View →'}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
