'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ProcessingDashboard from './ProcessingDashboard';

interface CompetitorEntry {
  id: string;
  name: string;
  aliases: string;
  website: string;
  productDocs: string;
}

interface FormData {
  companyName: string;
  companyAliases: string;
  competitors: CompetitorEntry[];
}

function createEmptyCompetitor(): CompetitorEntry {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    name: '',
    aliases: '',
    website: '',
    productDocs: '',
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [user, setUser] = useState<any>(null);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    companyAliases: '',
    competitors: [createEmptyCompetitor()],
  });

  // Auto-expand first competitor on mount
  useEffect(() => {
    if (formData.competitors.length > 0 && !expandedCompetitor) {
      setExpandedCompetitor(formData.competitors[0].id);
    }
  }, []);

  // Check if user is already signed in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const email = session.user.email || '';
        const domain = email.split('@')[1];
        const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
        if (domain && !personalDomains.includes(domain)) {
          const companyFromDomain = domain.split('.')[0];
          const companyName = companyFromDomain.charAt(0).toUpperCase() + companyFromDomain.slice(1);
          setFormData(prev => ({ ...prev, companyName }));
        }
        setStep(1);
      }
    };
    checkAuth();
  }, []);

  const handleSignInWithGoogle = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  /* ─── Competitor list helpers ─── */
  function updateCompetitor(id: string, field: keyof CompetitorEntry, value: string) {
    setFormData(prev => ({
      ...prev,
      competitors: prev.competitors.map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  }

  function addCompetitor() {
    const newEntry = createEmptyCompetitor();
    setFormData(prev => ({ ...prev, competitors: [...prev.competitors, newEntry] }));
    setExpandedCompetitor(newEntry.id);
  }

  function removeCompetitor(id: string) {
    setFormData(prev => {
      const updated = prev.competitors.filter(c => c.id !== id);
      return { ...prev, competitors: updated };
    });
    if (expandedCompetitor === id) {
      setExpandedCompetitor(formData.competitors.find(c => c.id !== id)?.id || null);
    }
  }

  /* ─── Navigation ─── */
  const handleNext = async () => {
    if (step === 1 && !formData.companyName) {
      setError('Company name is required');
      return;
    }
    setError('');

    if (step === 1) {
      setProgress('Processing your company patents in the background...');
      fetch('/api/onboarding/process-company', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: formData.companyName,
          companyAliases: formData.companyAliases.split(',').map(a => a.trim()).filter(Boolean),
        }),
      }).catch(err => console.error('Background processing error:', err));
      setTimeout(() => setProgress(''), 2000);
    }

    setStep(step + 1);
  };

  const handleBack = () => { setError(''); setStep(step - 1); };

  const handleSubmit = async () => {
    const validCompetitors = formData.competitors.filter(c => c.name.trim());
    if (validCompetitors.length === 0) {
      setError('Please enter at least one competitor name');
      return;
    }

    setError('');

    // Fire-and-forget: kick off processing in the background
    fetch('/api/onboarding/process-competitor', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: formData.companyName,
        competitors: validCompetitors.map(c => ({
          competitorName: c.name.trim(),
          competitorAliases: c.aliases.split(',').map(a => a.trim()).filter(Boolean),
          competitorWebsite: c.website || undefined,
          productDocs: c.productDocs.split('\n').map(url => url.trim()).filter(Boolean),
        })),
        competitorName: validCompetitors[0].name.trim(),
        competitorAliases: validCompetitors[0].aliases.split(',').map(a => a.trim()).filter(Boolean),
        competitorWebsite: validCompetitors[0].website || undefined,
        productDocs: validCompetitors[0].productDocs.split('\n').map(url => url.trim()).filter(Boolean),
      }),
    }).catch(err => console.error('Background competitor processing error:', err));

    // Immediately go to Processing page — dashboard will poll Supabase for real progress
    setStep(3);
  };

  const handleProcessingComplete = () => { router.push('/analysis'); };

  const filledCount = formData.competitors.filter(c => c.name.trim()).length;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logos/inveniam-blue-tagline.svg" alt="Inveniam" className="h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Patent Infringement Agent</h1>
          <p className="text-gray-600">Let&apos;s get started by learning about your company</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className={`text-sm font-medium ${step >= 0 ? 'text-[#0066FF]' : 'text-gray-400'}`}>Sign In</span>
            <span className={`text-sm font-medium ${step >= 1 ? 'text-[#0066FF]' : 'text-gray-400'}`}>Company Info</span>
            <span className={`text-sm font-medium ${step >= 2 ? 'text-[#0066FF]' : 'text-gray-400'}`}>Competitors</span>
            <span className={`text-sm font-medium ${step >= 3 ? 'text-[#0066FF]' : 'text-gray-400'}`}>Processing</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-[#0066FF] h-2 rounded-full transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
          )}

          {loading && progress && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-800 mr-3"></div>
                {progress}
              </div>
            </div>
          )}

          {/* ───────── Step 0: Sign In ───────── */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Sign in with your business email</h2>
                <p className="text-sm text-gray-600 mb-8">We&apos;ll automatically detect your company from your email domain</p>
              </div>
              <div className="space-y-4">
                <button onClick={handleSignInWithGoogle} disabled={loading} className="w-full flex items-center justify-center space-x-3 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-gray-700 font-medium">Continue with Google</span>
                </button>
              </div>
              <div className="mt-8 text-center">
                <p className="text-xs text-gray-500">By signing in, you agree to our Terms of Service and Privacy Policy</p>
              </div>
            </div>
          )}

          {/* ───────── Step 1: Company Info ───────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Tell us about your company</h2>
                <p className="text-sm text-gray-600 mb-6">We&apos;ll automatically search the USPTO database for all your patents</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                <input type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent" placeholder="e.g., Acme Corporation" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Alternative Names (Optional)</label>
                <input type="text" value={formData.companyAliases} onChange={(e) => setFormData({ ...formData, companyAliases: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent" placeholder="e.g., Acme Corp, Acme Inc (comma separated)" disabled={loading} />
                <p className="mt-1 text-sm text-gray-500">Add any other names your company uses on patents</p>
              </div>
            </div>
          )}

          {/* ───────── Step 2: Competitors (multiple) ───────── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Add your competitors</h2>
                <p className="text-sm text-gray-600">
                  Add at least one competitor to analyze for potential patent infringement. You can always add more later.
                </p>
              </div>

              {/* Competitor cards */}
              <div className="space-y-3">
                {formData.competitors.map((comp, idx) => {
                  const isExpanded = expandedCompetitor === comp.id;
                  const hasName = comp.name.trim().length > 0;
                  const hasDetails = comp.aliases.trim() || comp.website.trim() || comp.productDocs.trim();

                  return (
                    <div
                      key={comp.id}
                      className={`border rounded-lg transition-all ${
                        isExpanded ? 'border-[#0066FF] shadow-sm' : hasName ? 'border-gray-200' : 'border-gray-200'
                      }`}
                    >
                      {/* Collapsed header */}
                      <div
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer rounded-t-lg transition-colors ${
                          isExpanded ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setExpandedCompetitor(isExpanded ? null : comp.id)}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            hasName ? 'bg-[#0066FF] text-white' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {hasName ? '✓' : idx + 1}
                          </div>
                          <span className={`text-sm font-medium truncate ${hasName ? 'text-gray-900' : 'text-gray-400'}`}>
                            {hasName ? comp.name : `Competitor ${idx + 1}`}
                          </span>
                          {idx === 0 && (
                            <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Required</span>
                          )}
                          {hasName && !isExpanded && hasDetails && (
                            <span className="text-xs text-gray-400 hidden sm:inline">
                              {[comp.website, comp.aliases].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeCompetitor(comp.id); }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Remove competitor"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded form fields */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Competitor Name {idx === 0 && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => updateCompetitor(comp.id, 'name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent text-sm"
                              placeholder="e.g., Rival Tech Inc"
                              disabled={loading}
                              autoFocus={!hasName}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Alternative Names <span className="text-gray-400 font-normal">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              value={comp.aliases}
                              onChange={(e) => updateCompetitor(comp.id, 'aliases', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent text-sm"
                              placeholder="e.g., Rival Corp, Rival Technologies (comma separated)"
                              disabled={loading}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Website <span className="text-gray-400 font-normal">(Optional)</span>
                            </label>
                            <input
                              type="url"
                              value={comp.website}
                              onChange={(e) => updateCompetitor(comp.id, 'website', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent text-sm"
                              placeholder="https://competitor.com"
                              disabled={loading}
                            />
                            <p className="mt-1 text-xs text-gray-500">We&apos;ll analyze their products and documentation</p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Product Documentation URLs <span className="text-gray-400 font-normal">(Optional)</span>
                            </label>
                            <textarea
                              value={comp.productDocs}
                              onChange={(e) => updateCompetitor(comp.id, 'productDocs', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-transparent text-sm"
                              placeholder={"https://competitor.com/product-specs\nhttps://competitor.com/whitepaper.pdf"}
                              rows={3}
                              disabled={loading}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Links to product specs, documentation, or whitepapers that may infringe on your patents (one per line)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add another competitor button */}
              <button
                type="button"
                onClick={addCompetitor}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-[#0066FF] hover:text-[#0066FF] hover:bg-blue-50/30 transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Another Competitor</span>
              </button>

              {filledCount > 1 && (
                <p className="text-sm text-gray-500 text-center">
                  {filledCount} competitor{filledCount !== 1 ? 's' : ''} will be analyzed
                </p>
              )}
            </div>
          )}

          {/* ───────── Step 3: Processing Dashboard ───────── */}
          {step === 3 && (
            <ProcessingDashboard
              companyName={formData.companyName}
              competitorNames={formData.competitors.filter(c => c.name.trim()).map(c => c.name.trim())}
              onComplete={handleProcessingComplete}
            />
          )}

          {/* Navigation Buttons */}
          {step !== 3 && (
            <div className="mt-8 flex justify-between">
              {step > 1 && !loading && (
                <button onClick={handleBack} className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  Back
                </button>
              )}

              {step === 1 && (
                <button onClick={handleNext} className="ml-auto px-6 py-2 text-white bg-[#0066FF] hover:bg-[#0052CC] rounded-lg transition-colors">
                  Next
                </button>
              )}

              {step === 2 && (
                <button
                  onClick={handleSubmit}
                  disabled={loading || filledCount === 0}
                  className="ml-auto px-6 py-2 text-white bg-[#0066FF] hover:bg-[#0052CC] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : filledCount === 1 ? 'Analyze Competitor' : `Analyze ${filledCount} Competitors`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-6">
          This process may take a few minutes depending on how many patents and competitors you have
        </p>
      </div>
    </div>
  );
}
