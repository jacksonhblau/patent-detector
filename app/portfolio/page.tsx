'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { authFetch } from '@/lib/auth-fetch';
import { supabase } from '@/lib/supabase';

// Lazy load PatentXmlViewer only when needed (reduces initial bundle size)
const PatentXmlViewer = dynamic(() => import('@/app/components/PatentXmlViewer'), {
  ssr: false,
});

interface Patent {
  id: string; patent_number: string; title: string; abstract: string; assignee: string;
  inventors: string; filing_date: string; grant_date: string; application_number: string;
  status: string; category: string; potential_infringers: string[];
  strength: 'High' | 'Medium' | 'Low'; years_remaining: number | null;
  claims_count: number; has_full_text: boolean;
}
interface PortfolioSummary {
  total_patents: number; xml_available: number; metadata_only: number;
  categories: Record<string, number>; earliest_filing: string | null;
  latest_grant: string | null; company: { id: string; name: string } | null;
}
interface PortfolioData { success: boolean; summary: PortfolioSummary; patents: Patent[]; }
type BtnState = 'idle' | 'adding' | 'success' | 'exists' | 'error';
interface AddResult { name?: string; website?: string; documentsFound?: number; patentsFound?: number; message?: string; settlementProbability?: number; companyRisk?: string; overallInfringement?: number; }

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'grant_date'|'filing_date'|'title'|'strength'>('grant_date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [expandedPatent, setExpandedPatent] = useState<string|null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table'|'grid'>('table');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File|null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string|null>(null);
  const [addingState, setAddingState] = useState<Record<string, BtnState>>({});
  const [addResults, setAddResults] = useState<Record<string, AddResult>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [xmlViewerPatentId, setXmlViewerPatentId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userInitials, setUserInitials] = useState<string>('U');

  useEffect(() => {
    fetchPortfolio();
    fetchUserInfo();
  }, []);

  async function fetchUserInfo() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const name = user.user_metadata?.name || user.user_metadata?.full_name || 'User';
      const email = user.email || '';
      setUserName(name);
      setUserEmail(email);

      // Generate initials from name or email
      if (name !== 'User') {
        const nameParts = name.split(' ');
        const initials = nameParts.length > 1
          ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
          : name.substring(0, 2).toUpperCase();
        setUserInitials(initials);
      } else if (email) {
        setUserInitials(email.substring(0, 2).toUpperCase());
      }
    }
  }

  async function handleDeletePatent(patentId: string, title: string) {
    if (!confirm(`Delete patent "${title}"?\n\nThis will also remove any associated claims and analyses. This cannot be undone.`)) return;
    setDeletingId(patentId);
    try {
      const res = await authFetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'patent', id: patentId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchPortfolio();
        if (expandedPatent === patentId) setExpandedPatent(null);
      }
    } catch (err) { console.error('Delete error:', err); }
    finally { setDeletingId(null); }
  }

  async function fetchPortfolio() {
    try {
      setLoading(true);
      const res = await authFetch('/api/portfolio');
      const json = await res.json();
      if (json.success) setData(json); else setError(json.error || 'Failed to load portfolio');
    } catch { setError('Network error loading portfolio'); } finally { setLoading(false); }
  }

  async function handleUpload() {
    if (!uploadFile) return; setUploading(true); setUploadError(null); setUploadResult(null);
    try {
      const formData = new FormData(); formData.append('patent', uploadFile);
      const res = await authFetch('/api/patents/upload', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.success) { setUploadResult(json); setTimeout(() => { fetchPortfolio(); setShowUploadModal(false); setUploadFile(null); setUploadResult(null); }, 3000);
      } else { setUploadError(json.error || 'Upload failed'); }
    } catch { setUploadError('Network error during upload'); } finally { setUploading(false); }
  }

  async function handleAddCompetitor(name: string, patentId: string, category: string) {
    setAddingState(p => ({ ...p, [name]: 'adding' }));
    try {
      const res = await authFetch('/api/competitors/add-from-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: name, patentCategory: category, sourcePatentId: patentId }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.alreadyExists) {
          setAddingState(p => ({ ...p, [name]: 'exists' }));
          setAddResults(p => ({ ...p, [name]: { message: json.message, name: json.competitor.name } }));
        } else {
          setAddingState(p => ({ ...p, [name]: 'success' }));
          setAddResults(p => ({ ...p, [name]: { name: json.competitor.name, website: json.competitor.website, documentsFound: json.competitor.documentsFound, patentsFound: json.competitor.patentsFound, settlementProbability: json.competitor.analysis?.settlementProbability, companyRisk: json.competitor.analysis?.companyRisk, overallInfringement: json.competitor.analysis?.overallInfringement } }));
        }
      } else {
        setAddingState(p => ({ ...p, [name]: 'error' }));
        setAddResults(p => ({ ...p, [name]: { message: json.error } }));
      }
    } catch {
      setAddingState(p => ({ ...p, [name]: 'error' }));
      setAddResults(p => ({ ...p, [name]: { message: 'Network error' } }));
    }
  }

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

  const filteredPatents = useMemo(() => {
    if (!data) return [];
    let patents = [...data.patents];
    if (selectedCategory !== 'All') patents = patents.filter(p => p.category === selectedCategory);
    if (searchQuery) { const q = searchQuery.toLowerCase(); patents = patents.filter(p =>
      p.title?.toLowerCase().includes(q) || p.patent_number?.toLowerCase().includes(q) ||
      p.abstract?.toLowerCase().includes(q) || p.inventors?.toLowerCase().includes(q) ||
      p.potential_infringers?.some(i => i.toLowerCase().includes(q)));
    }
    patents.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'grant_date') cmp = (a.grant_date||'').localeCompare(b.grant_date||'');
      else if (sortBy === 'filing_date') cmp = (a.filing_date||'').localeCompare(b.filing_date||'');
      else if (sortBy === 'title') cmp = (a.title||'').localeCompare(b.title||'');
      else { const so: any = {High:3,Medium:2,Low:1}; cmp = (so[a.strength]||0) - (so[b.strength]||0); }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return patents;
  }, [data, searchQuery, selectedCategory, sortBy, sortDir]);

  const categories = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.summary.categories).sort((a,b) => b[1]-a[1]).map(([name,count]) => ({name,count}));
  }, [data]);

  function formatDate(d: string|null) { if (!d) return '\u2014'; return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }
  function handleSort(col: typeof sortBy) { if (sortBy===col) setSortDir(d => d==='asc'?'desc':'asc'); else { setSortBy(col); setSortDir('desc'); } }

  const sC: any = { High:{bg:'bg-emerald-50',text:'text-emerald-700',border:'border-emerald-200',dot:'bg-emerald-500'}, Medium:{bg:'bg-amber-50',text:'text-amber-700',border:'border-amber-200',dot:'bg-amber-500'}, Low:{bg:'bg-red-50',text:'text-red-700',border:'border-red-200',dot:'bg-red-500'} };
  const catC: Record<string,string> = { 'Blockchain & DLT':'bg-blue-100 text-blue-800','AI & Machine Learning':'bg-purple-100 text-purple-800','Cryptographic Methods':'bg-orange-100 text-orange-800','Data Structures & Verification':'bg-teal-100 text-teal-800','Financial Technology':'bg-green-100 text-green-800','IoT & Device Management':'bg-pink-100 text-pink-800','Document Verification':'bg-indigo-100 text-indigo-800','Distributed Computing':'bg-cyan-100 text-cyan-800','Other':'bg-gray-100 text-gray-800' };

  function renderBtn(inf: string, pid: string, cat: string) {
    const st = addingState[inf] || 'idle'; const r = addResults[inf];
    if (st === 'adding') return (<div className="flex items-center space-x-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200"><svg className="w-4 h-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><div><span className="text-xs text-blue-700 font-medium">AI Researching &amp; Analyzing...</span><p className="text-xs text-blue-500">Finding docs, patents, running infringement analysis</p></div></div>);
    if (st === 'success') return (<div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200"><div className="flex items-center space-x-1 mb-1"><span className="text-emerald-600 text-sm">&#10003;</span><span className="text-xs text-emerald-700 font-semibold">Added &amp; Analyzed</span>{r?.companyRisk && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-1 ${r.companyRisk==='High'?'bg-red-100 text-red-700':r.companyRisk==='Medium'?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{r.companyRisk} Risk</span>}</div>{r && <div className="text-xs text-emerald-600 space-y-0.5">{r.website && <p>🌐 {r.website}</p>}{(r.documentsFound??0)>0 && <p>📄 {r.documentsFound} product docs</p>}{(r.patentsFound??0)>0 && <p>📋 {r.patentsFound} patents found</p>}{r.overallInfringement != null && <p>⚖️ Infringement: {r.overallInfringement}%</p>}{r.settlementProbability != null && <p>🤝 Settlement: {r.settlementProbability}%</p>}</div>}</div>);
    if (st === 'exists') return (<div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-200"><span className="text-xs text-amber-700 font-medium">⚡ Already tracked</span>{r?.message && <p className="text-xs text-amber-600">{r.message}</p>}</div>);
    if (st === 'error') return (<div className="bg-red-50 rounded-lg px-3 py-2 border border-red-200"><span className="text-xs text-red-700 font-medium">Failed</span><button onClick={() => handleAddCompetitor(inf,pid,cat)} className="text-xs text-red-600 underline ml-2">Retry</button></div>);
    return (<button onClick={(e) => {e.stopPropagation(); handleAddCompetitor(inf,pid,cat);}} className="flex items-center space-x-1.5 bg-white hover:bg-red-50 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-all text-xs font-medium text-red-700 group"><svg className="w-3.5 h-3.5 text-red-400 group-hover:text-red-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg><span>Add as Competitor</span></button>);
  }

  if (loading) return (<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="text-gray-600 text-lg">Loading patent portfolio...</p><p className="text-gray-400 text-sm mt-2">Analyzing patents and identifying potential infringers</p></div></div>);
  if (error) return (<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="bg-white rounded-lg shadow p-8 max-w-md text-center"><div className="text-4xl mb-4">⚠️</div><h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Portfolio</h2><p className="text-gray-600 mb-4">{error}</p><button onClick={fetchPortfolio} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Try Again</button></div></div>);
  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <a href="https://www.inveniam.io" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity"><img src="/logos/inveniam-blue-tagline.svg" alt="Inveniam" className="h-10" /></a>
            <div className="border-l border-gray-300 h-10"></div>
            <div><h1 className="text-xl font-semibold text-gray-900">Patent Infringement Agent</h1><p className="text-xs text-gray-500">AI-Powered Enterprise Patent Portfolio Surveillance</p></div>
          </div>
          <div className="hidden md:flex items-center space-x-1">
            <Link href="/dashboard" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Dashboard</Link>
            <Link href="/portfolio" className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg">Portfolio</Link>
            <Link href="/analysis" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Infringements</Link>
            <Link href="/litigation" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">Litigation</Link>
          </div>
          <div className="relative">
            <button onClick={() => setAccountMenuOpen(!accountMenuOpen)} className="flex items-center space-x-3 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-2 transition-colors border border-gray-200">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">{userInitials}</div>
              <div className="text-left hidden sm:block"><p className="text-sm font-medium text-gray-900">{userName}</p><p className="text-xs text-gray-500">{userEmail}</p></div>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {accountMenuOpen && (<div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-10 border border-gray-200"><a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Settings</a><a href="/billing" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Billing</a><hr className="my-2"/><button onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign Out</button></div>)}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title Row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{data.summary.company?.name || 'Your'} Patent Portfolio</h2>
            <p className="text-gray-500 mt-1">{data.summary.total_patents} patents analyzed &bull; Click &ldquo;Add as Competitor&rdquo; to research potential infringers with AI</p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowUploadModal(true)} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg><span>Upload Patent</span>
            </button>
            <Link href="/analysis" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium">View Infringement Dashboard →</Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-3xl font-bold text-gray-900">{data.summary.total_patents}</p><p className="text-sm text-gray-500 mt-1">Total Patents</p></div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-3xl font-bold text-emerald-600">{data.summary.xml_available}</p><p className="text-sm text-gray-500 mt-1">Full Text Available</p></div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-3xl font-bold text-amber-600">{data.summary.metadata_only}</p><p className="text-sm text-gray-500 mt-1">Metadata Only</p></div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-3xl font-bold text-blue-600">{Object.keys(data.summary.categories).length}</p><p className="text-sm text-gray-500 mt-1">Tech Categories</p></div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-lg font-bold text-gray-900">{formatDate(data.summary.earliest_filing)}</p><p className="text-sm text-gray-500 mt-1">Earliest Filing</p></div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"><p className="text-lg font-bold text-gray-900">{formatDate(data.summary.latest_grant)}</p><p className="text-sm text-gray-500 mt-1">Latest Grant</p></div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Technology Categories</h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setSelectedCategory('All')} className={`px-4 py-2 rounded-full text-sm font-medium transition ${selectedCategory==='All'?'bg-gray-900 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>All ({data.summary.total_patents})</button>
            {categories.map(cat => (<button key={cat.name} onClick={() => setSelectedCategory(cat.name)} className={`px-4 py-2 rounded-full text-sm font-medium transition ${selectedCategory===cat.name?'bg-gray-900 text-white':`${catC[cat.name]||'bg-gray-100 text-gray-800'} hover:opacity-80`}`}>{cat.name} ({cat.count})</button>))}
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-96">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" placeholder="Search patents, numbers, inventors, or potential infringers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-500">{filteredPatents.length} patents</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-sm transition ${viewMode==='table'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>☰</button>
              <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-md text-sm transition ${viewMode==='grid'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>⊞</button>
            </div>
          </div>
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28"><button onClick={() => handleSort('grant_date')} className="flex items-center space-x-1 hover:text-gray-900"><span>Patent #</span>{sortBy==='grant_date' && <span>{sortDir==='desc'?'↓':'↑'}</span>}</button></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"><button onClick={() => handleSort('title')} className="flex items-center space-x-1 hover:text-gray-900"><span>Title</span>{sortBy==='title' && <span>{sortDir==='desc'?'↓':'↑'}</span>}</button></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24"><button onClick={() => handleSort('strength')} className="flex items-center space-x-1 hover:text-gray-900"><span>Strength</span>{sortBy==='strength' && <span>{sortDir==='desc'?'↓':'↑'}</span>}</button></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24"><button onClick={() => handleSort('filing_date')} className="flex items-center space-x-1 hover:text-gray-900"><span>Filed</span>{sortBy==='filing_date' && <span>{sortDir==='desc'?'↓':'↑'}</span>}</button></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Years Left</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Potential Infringers</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatents.map(patent => (
                    <Fragment key={patent.id}>
                      <tr className="hover:bg-blue-50/30 cursor-pointer transition-colors" onClick={() => setExpandedPatent(expandedPatent===patent.id ? null : patent.id)}>
                        <td className="px-4 py-3"><a href={`https://patents.google.com/patent/US${patent.patent_number}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-mono text-sm font-medium" onClick={e => e.stopPropagation()}>{patent.patent_number}</a></td>
                        <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900 line-clamp-1">{patent.title}</p><p className="text-xs text-gray-400 mt-0.5">{patent.assignee}</p></td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${catC[patent.category]||'bg-gray-100 text-gray-800'}`}>{patent.category}</span></td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sC[patent.strength].bg} ${sC[patent.strength].text} border ${sC[patent.strength].border}`}><span className={`w-1.5 h-1.5 rounded-full ${sC[patent.strength].dot}`}></span><span>{patent.strength}</span></span></td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(patent.filing_date)}</td>
                        <td className="px-4 py-3">{patent.years_remaining !== null && (<div className="flex items-center space-x-2"><div className="w-16 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${patent.years_remaining>10?'bg-emerald-500':patent.years_remaining>5?'bg-amber-500':'bg-red-500'}`} style={{width:`${Math.min(100,(patent.years_remaining/20)*100)}%`}}></div></div><span className="text-xs text-gray-500">{patent.years_remaining}y</span></div>)}</td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{patent.potential_infringers.slice(0,2).map((inf,i) => (<span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-red-50 text-red-700 border border-red-100">{inf.length>25?inf.substring(0,25)+'…':inf}</span>))}{patent.potential_infringers.length>2 && (<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600">+{patent.potential_infringers.length-2} more</span>)}</div></td>
                        <td className="px-4 py-3"><svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedPatent===patent.id?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg></td>
                      </tr>
                      {expandedPatent === patent.id && (
                        <tr><td colSpan={8} className="px-4 py-6 bg-gray-50/50">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
                            <div className="lg:col-span-2">
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Abstract</h4>
                              <p className="text-sm text-gray-600 leading-relaxed">{patent.abstract || 'No abstract available'}</p>
                              <div className="mt-4 grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-gray-400 uppercase tracking-wider">Inventors</p><p className="text-sm text-gray-700 mt-1">{patent.inventors||'—'}</p></div>
                                <div><p className="text-xs text-gray-400 uppercase tracking-wider">Application #</p><p className="text-sm text-gray-700 mt-1 font-mono">{patent.application_number||'—'}</p></div>
                                <div><p className="text-xs text-gray-400 uppercase tracking-wider">Grant Date</p><p className="text-sm text-gray-700 mt-1">{formatDate(patent.grant_date)}</p></div>
                                <div>
                                  <p className="text-xs text-gray-400 uppercase tracking-wider">Data Status</p>
                                  {patent.has_full_text ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setXmlViewerPatentId(patent.id); }}
                                      className="text-sm text-blue-600 hover:text-blue-800 mt-1 font-medium underline decoration-dotted underline-offset-2 flex items-center space-x-1"
                                    >
                                      <span>✅ Full XML text available</span>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                    </button>
                                  ) : (
                                    <p className="text-sm text-gray-700 mt-1">⚠️ Metadata only</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">Potential Infringers</h4>
                              <div className="space-y-2">{patent.potential_infringers.map((inf,i) => (<div key={i} className="space-y-1"><span className="text-sm text-gray-700 font-medium block">{inf}</span>{renderBtn(inf, patent.id, patent.category)}</div>))}</div>
                              <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                                <Link href="/competitors/add" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Custom Competitor →</Link>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeletePatent(patent.id, patent.title); }}
                                  disabled={deletingId === patent.id}
                                  className="inline-flex items-center space-x-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition disabled:opacity-50"
                                >
                                  {deletingId === patent.id ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  )}
                                  <span>Delete Patent</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatents.map(patent => (
              <div key={patent.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <a href={`https://patents.google.com/patent/US${patent.patent_number}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-mono text-sm font-semibold">US{patent.patent_number}</a>
                  <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${sC[patent.strength].bg} ${sC[patent.strength].text}`}><span className={`w-1.5 h-1.5 rounded-full ${sC[patent.strength].dot}`}></span><span>{patent.strength}</span></span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">{patent.title}</h3>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catC[patent.category]}`}>{patent.category}</span>
                <p className="text-xs text-gray-500 mt-3 line-clamp-3">{patent.abstract||'No abstract'}</p>
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Potential Infringers:</p>
                  <div className="space-y-1.5">{patent.potential_infringers.slice(0,3).map((inf,i) => (<div key={i}>{renderBtn(inf, patent.id, patent.category)}</div>))}</div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>Filed: {formatDate(patent.filing_date)}</span>
                  <div className="flex items-center space-x-2">
                    {patent.years_remaining !== null && <span>{patent.years_remaining}y remaining</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePatent(patent.id, patent.title); }}
                      disabled={deletingId === patent.id}
                      className="text-red-400 hover:text-red-600 transition p-0.5 disabled:opacity-50"
                      title="Delete patent"
                    >
                      {deletingId === patent.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredPatents.length === 0 && (<div className="bg-white rounded-xl shadow-sm p-12 text-center"><p className="text-gray-500 text-lg">No patents match your filters</p><button onClick={() => {setSearchQuery('');setSelectedCategory('All');}} className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium">Clear Filters</button></div>)}
      </main>

      {/* Upload Patent Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Upload Additional Patent</h3>
              <button onClick={() => {setShowUploadModal(false);setUploadFile(null);setUploadError(null);setUploadResult(null);}} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            {!uploadResult ? (<>
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${uploadFile?'border-blue-400 bg-blue-50':'border-gray-300 hover:border-gray-400'}`}>
                {uploadFile ? (<div><div className="text-3xl mb-2">📄</div><p className="text-sm font-medium text-gray-900">{uploadFile.name}</p><p className="text-xs text-gray-500 mt-1">{(uploadFile.size/1024/1024).toFixed(2)} MB</p><button onClick={() => setUploadFile(null)} className="mt-2 text-xs text-red-500 hover:text-red-700">Remove</button></div>)
                : (<label className="cursor-pointer"><div className="text-3xl mb-2">📤</div><p className="text-sm font-medium text-gray-700">Click to select or drag a patent PDF</p><p className="text-xs text-gray-400 mt-1">PDF files only</p><input type="file" accept=".pdf" className="hidden" onChange={e => setUploadFile(e.target.files?.[0]||null)}/></label>)}
              </div>
              {uploadError && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-sm text-red-700">{uploadError}</p></div>}
              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={() => {setShowUploadModal(false);setUploadFile(null);}} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleUpload} disabled={!uploadFile||uploading} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${!uploadFile||uploading?'bg-gray-200 text-gray-400 cursor-not-allowed':'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {uploading ? (<span className="flex items-center space-x-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span>Analyzing...</span></span>) : 'Upload & Analyze'}
                </button>
              </div>
              <div className="mt-4 bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">The patent PDF will be extracted with AWS Textract, analyzed by Claude AI for claims and elements, then added to your portfolio.</p></div>
            </>) : (<div className="text-center py-4"><div className="text-4xl mb-3">✅</div><h4 className="text-lg font-semibold text-gray-900 mb-2">Patent Added!</h4><div className="text-sm text-gray-600 space-y-1"><p>Patent: {uploadResult.patent?.patent_number}</p><p>Title: {uploadResult.patent?.title}</p><p>Claims Found: {uploadResult.patent?.claims_count}</p></div><p className="text-xs text-gray-400 mt-4">Refreshing portfolio...</p></div>)}
          </div>
        </div>
      )}

      {/* Patent XML Viewer Modal */}
      {xmlViewerPatentId && (
        <PatentXmlViewer
          patentId={xmlViewerPatentId}
          title={data?.patents.find(p => p.id === xmlViewerPatentId)?.title}
          onClose={() => setXmlViewerPatentId(null)}
        />
      )}
    </div>
  );
}
