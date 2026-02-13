'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product {
  id: string; name: string; url: string; description: string; type: string;
  infringementProbability: number | null; relevantPatents: string[]; reasoning: string;
}
interface CompetitorPatent {
  id: string; name: string; url: string; applicationNumber: string; overlapAreas: string[];
}
interface SettlementFactor { factor: string; impact: 'positive' | 'negative' | 'neutral'; detail: string; }
interface Competitor {
  id: string; name: string; website: string | null; description: string; aliases: string[];
  totalDocuments: number; productDocuments: number; patentDocuments: number;
  products: Product[]; competitorPatents: CompetitorPatent[];
  settlementProbability: number | null; settlementFactors: SettlementFactor[];
  companyRisk: 'High' | 'Medium' | 'Low' | null; overallInfringementScore: number | null;
  analysisStatus: 'complete' | 'pending';
}
interface AnalysisData { success: boolean; totalCompetitors: number; results: Competitor[]; }

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200">Pending</span>;
  const c: any = { High: 'bg-red-100 text-red-800 border-red-200', Medium: 'bg-amber-100 text-amber-800 border-amber-200', Low: 'bg-green-100 text-green-800 border-green-200' };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${c[risk] || c.Medium}`}>{risk} Risk</span>;
}

function ProbBar({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  if (value === null) return <span className="text-xs text-gray-400 italic">Pending</span>;
  const color = value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className="flex items-center space-x-2">
      <div className={`flex-1 bg-gray-200 rounded-full ${h}`}>
        <div className={`${h} rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className={`font-bold ${size === 'sm' ? 'text-xs' : 'text-sm'} ${value >= 70 ? 'text-red-600' : value >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>{value}%</span>
    </div>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  if (impact === 'positive') return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="Increases settlement likelihood"></span>;
  if (impact === 'negative') return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Decreases settlement likelihood"></span>;
  return <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" title="Neutral"></span>;
}

export default function AnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedPatents, setExpandedPatents] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Add competitor form
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);

  // Analyze existing pending competitor
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(type: 'competitor' | 'competitor_document' | 'patent', id: string, label: string, parentCompId?: string) {
    const messages: Record<string, string> = {
      competitor: `Delete competitor "${label}" and ALL their products, patents, and analysis? This cannot be undone.`,
      competitor_document: `Delete "${label}"? This cannot be undone.`,
      patent: `Delete patent "${label}"? This cannot be undone.`,
    };
    if (!confirm(messages[type])) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      });
      const json = await res.json();
      if (json.success) {
        if (type === 'competitor') {
          setExpandedCompany(null);
          setExpandedPatents(null);
        }
        fetchAnalysis();
      }
    } catch (err) { console.error('Delete error:', err); }
    finally { setDeletingId(null); }
  }

  useEffect(() => { fetchAnalysis(); }, []);

  async function fetchAnalysis() {
    try {
      setLoading(true);
      const res = await fetch('/api/analysis');
      const json = await res.json();
      if (json.success) { setData(json); setError(null); }
      else setError(json.error || 'Failed to load analysis');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  async function handleAddCompetitor(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || adding) return;
    setAdding(true);
    setAddResult(null);
    try {
      const res = await fetch('/api/competitors/add-from-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: addName.trim(), patentCategory: 'Blockchain & Distributed Ledger Technology', sourcePatentId: 'analysis-page' }),
      });
      const json = await res.json();
      if (json.success) {
        setAddResult({ success: true, message: json.alreadyExists ? `${json.competitor.name} already tracked` : `${json.competitor.name} added & analyzed!` });
        setAddName('');
        fetchAnalysis(); // Refresh the list
      } else {
        setAddResult({ success: false, message: json.error || 'Failed to add competitor' });
      }
    } catch { setAddResult({ success: false, message: 'Network error' }); }
    finally { setAdding(false); }
  }

  async function analyzeExisting(competitorId: string, competitorName: string) {
    setAnalyzingId(competitorId);
    try {
      const res = await fetch('/api/competitors/add-from-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: competitorName,
          patentCategory: 'Blockchain & Distributed Ledger Technology',
          sourcePatentId: 'analysis-page',
          existingCompetitorId: competitorId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchAnalysis(); // Refresh the list with new analysis
      }
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setAnalyzingId(null);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600 text-lg">Loading Infringement Analysis...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Analysis Error</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchAnalysis} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Retry</button>
      </div>
    </div>
  );

  if (!data) return null;
  const analyzed = data.results.filter(c => c.analysisStatus === 'complete');
  const topProducts = analyzed.flatMap(c => c.products.map(p => ({ ...p, companyName: c.name, companyId: c.id }))).filter(p => p.infringementProbability !== null).sort((a, b) => (b.infringementProbability ?? 0) - (a.infringementProbability ?? 0)).slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <a href="https://www.inveniam.io" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity"><img src="/logos/inveniam-blue-tagline.svg" alt="Inveniam" className="h-10" /></a>
            <div className="border-l border-gray-300 h-10"></div>
            <div><h1 className="text-xl font-semibold text-gray-900">Patent Infringement Agent</h1><p className="text-xs text-gray-500">AI-Powered Enterprise Patent Portfolio Surveillance</p></div>
          </div>
          <div className="hidden md:flex items-center space-x-1">
            <Link href="/dashboard" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Dashboard</Link>
            <Link href="/portfolio" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Portfolio</Link>
            <Link href="/analysis" className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg">Infringements</Link>
            <Link href="/litigation" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Litigation</Link>
          </div>
          <div className="relative">
            <button onClick={() => setAccountMenuOpen(!accountMenuOpen)} className="flex items-center space-x-3 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-2 transition-colors border border-gray-200">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">JB</div>
              <div className="text-left hidden sm:block"><p className="text-sm font-medium text-gray-900">Jackson Blau</p><p className="text-xs text-gray-500">jacksonhblau@gmail.com</p></div>
            </button>
            {accountMenuOpen && (<div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-10 border border-gray-200"><a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Settings</a><hr className="my-2"/><a href="/logout" className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign Out</a></div>)}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Infringement Analysis Dashboard</h2>
            <p className="text-gray-500 mt-1">{data.totalCompetitors} competitors tracked &bull; {analyzed.length} analyzed &bull; Scores computed when competitors are added</p>
          </div>
          <Link href="/portfolio" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium">+ Add from Portfolio</Link>
        </div>

        {/* Add Competitor Form */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-8 border border-gray-100">
          <form onSubmit={handleAddCompetitor} className="flex items-center space-x-3">
            <div className="flex-1">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Enter a competitor name to research & analyze (e.g., Provenance Blockchain)"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={adding}
              />
            </div>
            <button
              type="submit"
              disabled={!addName.trim() || adding}
              className="flex-shrink-0 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {adding ? (
                <span className="flex items-center space-x-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <span>Researching &amp; Analyzing...</span>
                </span>
              ) : '+ Add &amp; Analyze Competitor'}
            </button>
          </form>
          {addResult && (
            <div className={`mt-3 px-4 py-2 rounded-lg text-sm ${addResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {addResult.success ? '✅' : '❌'} {addResult.message}
            </div>
          )}
          {adding && (
            <div className="mt-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <span>Searching the web for products &amp; docs, verifying URLs, searching USPTO patents, running AI infringement analysis... This takes 30-60 seconds.</span>
              </div>
            </div>
          )}
        </div>

        {/* Top Infringing Products Alert */}
        {topProducts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <span>Highest Infringement Risk Products</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {topProducts.map((p, i) => (
                <div key={p.id} className="bg-white rounded-lg p-4 border border-red-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 font-medium">#{i + 1}</span>
                    <span className={`text-lg font-bold ${(p.infringementProbability ?? 0) >= 70 ? 'text-red-600' : (p.infringementProbability ?? 0) >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>{p.infringementProbability}%</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.companyName}</p>
                  <div className="mt-2"><ProbBar value={p.infringementProbability} size="sm" /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-3xl font-bold text-gray-900">{data.totalCompetitors}</p>
            <p className="text-sm text-gray-500 mt-1">Competitors Tracked</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-3xl font-bold text-red-600">{analyzed.filter(c => c.companyRisk === 'High').length}</p>
            <p className="text-sm text-gray-500 mt-1">High Risk</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-3xl font-bold text-amber-600">{analyzed.reduce((s, c) => s + c.products.filter(p => (p.infringementProbability ?? 0) >= 50).length, 0)}</p>
            <p className="text-sm text-gray-500 mt-1">Products &ge;50% Infringement</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <p className="text-3xl font-bold text-blue-600">{analyzed.reduce((s, c) => s + c.productDocuments, 0)}</p>
            <p className="text-sm text-gray-500 mt-1">Products Tracked</p>
          </div>
        </div>

        {/* Competitor Cards */}
        <div className="space-y-6">
          {data.results.map(comp => (
            <div key={comp.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${comp.analysisStatus === 'pending' && analyzingId !== comp.id ? 'border-gray-200 opacity-70' : 'border-gray-100'}`}>
              {/* Company Header */}
              <div className="p-6 cursor-pointer hover:bg-gray-50/50 transition" onClick={() => setExpandedCompany(expandedCompany === comp.id ? null : comp.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{comp.name}</h3>
                      <RiskBadge risk={comp.companyRisk} />
                      {comp.analysisStatus === 'pending' && analyzingId === comp.id && <span className="flex items-center text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"><svg className="w-3 h-3 animate-spin mr-1" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analyzing...</span>}
                      {comp.analysisStatus === 'pending' && analyzingId !== comp.id && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ Needs analysis — click to expand</span>}
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{comp.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-400">
                      {comp.website && <a href={comp.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition" onClick={e => e.stopPropagation()}>🌐 {comp.website}</a>}
                      <span>📄 {comp.productDocuments} products</span>
                      <span>📋 {comp.patentDocuments} patents</span>
                    </div>
                  </div>

                  {/* Score Cards */}
                  <div className="flex items-center space-x-6 ml-6">
                    <div className="text-center min-w-[120px]">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Infringement</p>
                      {comp.overallInfringementScore !== null ? (
                        <p className={`text-3xl font-bold ${comp.overallInfringementScore >= 60 ? 'text-red-600' : comp.overallInfringementScore >= 35 ? 'text-amber-600' : 'text-emerald-600'}`}>{comp.overallInfringementScore}%</p>
                      ) : <p className="text-2xl font-bold text-gray-300">—</p>}
                      <p className="text-xs text-gray-400">avg across products</p>
                    </div>
                    <div className="text-center min-w-[120px]">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Settlement</p>
                      {comp.settlementProbability !== null ? (
                        <p className={`text-3xl font-bold ${comp.settlementProbability >= 60 ? 'text-blue-600' : comp.settlementProbability >= 35 ? 'text-indigo-600' : 'text-gray-600'}`}>{comp.settlementProbability}%</p>
                      ) : <p className="text-2xl font-bold text-gray-300">—</p>}
                      <p className="text-xs text-gray-400">likelihood to settle</p>
                    </div>
                    <svg className={`w-6 h-6 text-gray-400 transition-transform ${expandedCompany === comp.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete('competitor', comp.id, comp.name); }}
                      disabled={deletingId === comp.id}
                      className="ml-2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Delete competitor"
                    >
                      {deletingId === comp.id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Product Mini Preview (collapsed) */}
                {expandedCompany !== comp.id && comp.products.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {comp.products.slice(0, 6).map(p => (
                      <div key={p.id} className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                        <span className="text-xs font-medium text-gray-700">{p.name}</span>
                        {p.infringementProbability !== null && (
                          <span className={`text-xs font-bold ${p.infringementProbability >= 60 ? 'text-red-600' : p.infringementProbability >= 35 ? 'text-amber-600' : 'text-emerald-600'}`}>{p.infringementProbability}%</span>
                        )}
                      </div>
                    ))}
                    {comp.products.length > 6 && <span className="text-xs text-gray-400 self-center">+{comp.products.length - 6} more</span>}
                  </div>
                )}
              </div>

              {/* Expanded Detail */}
              {expandedCompany === comp.id && comp.analysisStatus === 'complete' && (
                <div className="border-t border-gray-100">
                  {/* Settlement Factors */}
                  {comp.settlementFactors.length > 0 && (
                    <div className="p-6 bg-gray-50/30 border-b border-gray-100">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Settlement Probability Factors</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {comp.settlementFactors.map((f, i) => (
                          <div key={i} className="bg-white rounded-lg p-3 border border-gray-100 flex items-start space-x-2">
                            <ImpactDot impact={f.impact} />
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{f.factor}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{f.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Products Table */}
                  <div className="p-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">Product Infringement Analysis</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Product / Service</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase w-48">Infringement Prob.</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Overlapping Patent Areas</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">AI Reasoning</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Docs</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {comp.products
                            .sort((a, b) => (b.infringementProbability ?? 0) - (a.infringementProbability ?? 0))
                            .map(product => (
                            <tr key={product.id} className="hover:bg-blue-50/20 transition">
                              <td className="px-4 py-3">
                                <p className="text-sm font-semibold text-gray-900">{product.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{product.description}</p>
                              </td>
                              <td className="px-4 py-3"><ProbBar value={product.infringementProbability} /></td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {product.relevantPatents.map((rp, i) => (
                                    <span key={i} className="inline-flex px-2 py-0.5 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-100">{rp}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3"><p className="text-xs text-gray-600 line-clamp-3">{product.reasoning}</p></td>
                              <td className="px-4 py-3">
                                {product.url && <a href={product.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={e => e.stopPropagation()}>View →</a>}
                              </td>
                              <td className="px-4 py-3">
                                {product.id && !product.id.startsWith('analysis-') && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete('competitor_document', product.id, product.name); }}
                                    disabled={deletingId === product.id}
                                    className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition disabled:opacity-50"
                                    title="Delete product"
                                  >
                                    {deletingId === product.id ? (
                                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Competitor Patents Section */}
                  {comp.competitorPatents && comp.competitorPatents.length > 0 && (
                    <div className="p-6 border-t border-gray-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedPatents(expandedPatents === comp.id ? null : comp.id); }}
                        className="flex items-center justify-between w-full group"
                      >
                        <div className="flex items-center space-x-3">
                          <h4 className="text-sm font-semibold text-gray-900">Competitor Patents</h4>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">{comp.competitorPatents.length} patents</span>
                          {comp.competitorPatents.filter(p => p.overlapAreas.length > 0).length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-100">
                              ⚠ {comp.competitorPatents.filter(p => p.overlapAreas.length > 0).length} with potential overlap
                            </span>
                          )}
                        </div>
                        <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedPatents === comp.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>

                      {expandedPatents === comp.id && (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Patent Name</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase w-32">App. Number</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase w-48">Potential Overlap</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Link</th>
                                <th className="w-10"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {comp.competitorPatents
                                .sort((a, b) => b.overlapAreas.length - a.overlapAreas.length)
                                .map(patent => (
                                <tr key={patent.id} className={`hover:bg-blue-50/20 transition ${patent.overlapAreas.length > 0 ? 'bg-red-50/30' : ''}`}>
                                  <td className="px-4 py-3">
                                    <p className="text-sm font-medium text-gray-900">{patent.name}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs font-mono text-gray-600">{patent.applicationNumber || '—'}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                      {patent.overlapAreas.length > 0 ? patent.overlapAreas.map((area, i) => (
                                        <span key={i} className="inline-flex px-2 py-0.5 rounded-md text-xs bg-red-50 text-red-700 border border-red-100">{area}</span>
                                      )) : (
                                        <span className="text-xs text-gray-400 italic">No detected overlap</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {patent.url && <a href={patent.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={e => e.stopPropagation()}>View →</a>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete('competitor_document', patent.id, patent.name); }}
                                      disabled={deletingId === patent.id}
                                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition disabled:opacity-50"
                                      title="Delete patent"
                                    >
                                      {deletingId === patent.id ? (
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                      ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                      )}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {expandedCompany === comp.id && comp.analysisStatus === 'pending' && (
                <div className="border-t border-gray-100 p-8 text-center">
                  {analyzingId === comp.id ? (
                    <div>
                      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-blue-700 font-medium mb-1">Analyzing {comp.name}...</p>
                      <p className="text-gray-500 text-sm">Searching the web for products, verifying URLs, searching USPTO patents, running AI infringement analysis. This takes 30-60 seconds.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-500 mb-3">This competitor was added but hasn&apos;t been analyzed yet.</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); analyzeExisting(comp.id, comp.name); }}
                        className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                      >🔍 Run Analysis Now</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {data.results.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Competitors Yet</h3>
            <p className="text-gray-500 mb-4">Use the form above to add a competitor — we&apos;ll search the web, find their products, search USPTO, and run a full infringement analysis.</p>
          </div>
        )}
      </main>
    </div>
  );
}
