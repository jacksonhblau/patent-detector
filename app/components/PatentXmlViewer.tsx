'use client';
import { useState, useEffect, useRef } from 'react';

interface ParsedPatent {
  title: string;
  abstract: string;
  claims: { number: number; type: string; text: string }[];
  description: string;
  inventors: string[];
  assignee: string;
  filingDate: string;
  applicationNumber: string;
  patentNumber: string;
}

interface PatentXmlViewerProps {
  /** Pass one of these to load the patent */
  patentId?: string;     // UUID from patents table
  docId?: string;        // UUID from competitor_documents table
  appNumber?: string;    // Application number for live lookup
  patentNumber?: string; // Patent number for live lookup
  /** Display info */
  title?: string;
  onClose: () => void;
}

type Tab = 'overview' | 'claims' | 'description' | 'raw';

export default function PatentXmlViewer({
  patentId, docId, appNumber, patentNumber,
  title: propsTitle, onClose,
}: PatentXmlViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPatent | null>(null);
  const [rawXml, setRawXml] = useState('');
  const [xmlLength, setXmlLength] = useState(0);
  const [source, setSource] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchXml();
    // Trap focus inside modal
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, []);

  async function fetchXml() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (patentId) params.set('patentId', patentId);
      if (docId) params.set('docId', docId);
      if (appNumber) params.set('appNumber', appNumber);
      if (patentNumber) params.set('patentNumber', patentNumber);

      const res = await fetch(`/api/patent-xml?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error || 'No XML available');
        return;
      }

      setParsed(json.parsed);
      setRawXml(json.rawXml || '');
      setXmlLength(json.xmlLength || 0);
      setSource(json.source || '');
    } catch (err) {
      setError('Failed to load patent XML');
    } finally {
      setLoading(false);
    }
  }

  function openInNewTab() {
    if (!rawXml) return;
    // Create a standalone HTML page with the formatted patent
    const html = generateStandaloneHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function generateStandaloneHtml(): string {
    if (!parsed) return '<html><body>No data</body></html>';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${parsed.title || 'Patent Document'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 900px; margin: 0 auto; padding: 40px 24px; background: #fff; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 22px; border-bottom: 3px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 20px; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin: 32px 0 16px; color: #333; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; background: #f8f8f8; padding: 16px; border-radius: 4px; }
  .meta-item label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; display: block; }
  .meta-item span { font-size: 14px; font-weight: 600; }
  .abstract { font-style: italic; background: #f0f4ff; padding: 16px; border-left: 4px solid #3b82f6; margin: 16px 0; border-radius: 0 4px 4px 0; }
  .claim { margin: 12px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 4px; }
  .claim-num { font-weight: 700; color: #1e40af; }
  .claim-type { font-size: 11px; text-transform: uppercase; padding: 2px 6px; border-radius: 2px; margin-left: 8px; }
  .independent { background: #dbeafe; color: #1e40af; }
  .dependent { background: #f3f4f6; color: #6b7280; }
  .description { text-align: justify; }
  .description p { margin-bottom: 12px; text-indent: 24px; }
  @media print { body { max-width: 100%; } }
</style>
</head>
<body>
<h1>${escHtml(parsed.title)}</h1>
<div class="meta-grid">
  <div class="meta-item"><label>Patent Number</label><span>${escHtml(parsed.patentNumber || 'N/A')}</span></div>
  <div class="meta-item"><label>Application Number</label><span>${escHtml(parsed.applicationNumber || 'N/A')}</span></div>
  <div class="meta-item"><label>Assignee</label><span>${escHtml(parsed.assignee || 'N/A')}</span></div>
  <div class="meta-item"><label>Filing Date</label><span>${escHtml(parsed.filingDate || 'N/A')}</span></div>
  <div class="meta-item" style="grid-column:span 2"><label>Inventors</label><span>${escHtml(parsed.inventors.join('; ') || 'N/A')}</span></div>
</div>
<h2>Abstract</h2>
<div class="abstract">${escHtml(parsed.abstract)}</div>
<h2>Claims (${parsed.claims.length})</h2>
${parsed.claims.map(c => `
<div class="claim">
  <span class="claim-num">${c.number}.</span>
  <span class="claim-type ${c.type}">${c.type}</span>
  <p style="margin-top:8px">${escHtml(c.text)}</p>
</div>`).join('')}
<h2>Description</h2>
<div class="description">${parsed.description.split(/\n{2,}/).map(p => `<p>${escHtml(p)}</p>`).join('')}</div>
</body></html>`;
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlightText(text: string): string {
    if (!searchQuery) return escHtml(text);
    const escaped = escHtml(text);
    const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(`(${q})`, 'gi'), '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
  }

  const modalSizeClasses = isFullscreen
    ? 'fixed inset-0 rounded-none'
    : 'fixed inset-4 sm:inset-8 lg:inset-12 rounded-xl';

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'claims', label: 'Claims', count: parsed?.claims.length },
    { id: 'description', label: 'Description' },
    { id: 'raw', label: 'Raw XML' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${modalSizeClasses} bg-white shadow-2xl z-[61] flex flex-col overflow-hidden border border-gray-200`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {propsTitle || parsed?.title || 'Patent Document'}
            </h2>
            <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
              {parsed?.patentNumber && <span className="font-mono font-semibold text-blue-700">US{parsed.patentNumber}</span>}
              {parsed?.filingDate && <span>Filed: {parsed.filingDate}</span>}
              {xmlLength > 0 && <span>{(xmlLength / 1024).toFixed(0)} KB XML</span>}
              {source && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${source === 'database' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {source === 'database' ? 'Cached' : 'Live'}
              </span>}
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {/* Search */}
            <div className="relative hidden sm:block">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-40 pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            {/* Open in new tab */}
            <button onClick={openInNewTab} title="Open in new tab" className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </button>
            {/* Fullscreen toggle */}
            <button onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500">
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>
              )}
            </button>
            {/* Close */}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-red-100 text-gray-500 hover:text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        {!loading && !error && (
          <div className="flex border-b border-gray-200 bg-white px-6 shrink-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Loading patent XML...</p>
              <p className="text-xs text-gray-400">Checking database and USPTO...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3 p-8">
              <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
              <p className="text-sm font-medium text-gray-700">{error}</p>
              <p className="text-xs text-gray-400 text-center max-w-md">
                This patent may only have metadata from the USPTO search API.
                Full XML text requires the document to be in the USPTO Bulk Data system.
              </p>
            </div>
          )}

          {parsed && !loading && !error && (
            <div className="p-6 max-w-4xl mx-auto">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 rounded-lg p-5 border border-gray-100">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Patent Number</p>
                      <p className="text-sm font-mono font-bold text-gray-900 mt-0.5">{parsed.patentNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Application #</p>
                      <p className="text-sm font-mono text-gray-700 mt-0.5">{parsed.applicationNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Filing Date</p>
                      <p className="text-sm text-gray-700 mt-0.5">{parsed.filingDate || '—'}</p>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Assignee</p>
                      <p className="text-sm text-gray-700 mt-0.5 font-medium">{parsed.assignee || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Inventors</p>
                      <p className="text-sm text-gray-700 mt-0.5">{parsed.inventors.join('; ') || '—'}</p>
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Title</h3>
                    <p className="text-base font-serif font-semibold text-gray-900 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: highlightText(parsed.title) }} />
                  </div>

                  {/* Abstract */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Abstract</h3>
                    <div className="bg-blue-50/50 border-l-4 border-blue-500 pl-4 pr-4 py-3 rounded-r-md">
                      <p className="text-sm text-gray-700 leading-relaxed italic font-serif"
                         dangerouslySetInnerHTML={{ __html: highlightText(parsed.abstract) }} />
                    </div>
                  </div>

                  {/* Claims preview */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      Claims Summary ({parsed.claims.length} total)
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-2xl font-bold text-blue-700">
                          {parsed.claims.filter(c => c.type === 'independent').length}
                        </p>
                        <p className="text-xs text-gray-500">Independent Claims</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-2xl font-bold text-gray-500">
                          {parsed.claims.filter(c => c.type === 'dependent').length}
                        </p>
                        <p className="text-xs text-gray-500">Dependent Claims</p>
                      </div>
                    </div>
                    {parsed.claims.filter(c => c.type === 'independent').slice(0, 2).map(claim => (
                      <div key={claim.number} className="mt-3 p-3 border border-gray-200 rounded-lg bg-white">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-bold text-blue-700">Claim {claim.number}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Independent</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3"
                           dangerouslySetInnerHTML={{ __html: highlightText(claim.text.substring(0, 500)) }} />
                      </div>
                    ))}
                    <button onClick={() => setActiveTab('claims')} className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                      View all {parsed.claims.length} claims →
                    </button>
                  </div>

                  {/* Description preview */}
                  {parsed.description && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Description (preview)</h3>
                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-6 font-serif"
                         dangerouslySetInnerHTML={{ __html: highlightText(parsed.description.substring(0, 800)) }} />
                      <button onClick={() => setActiveTab('description')} className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                        Read full description →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Claims Tab */}
              {activeTab === 'claims' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Patent Claims</h3>
                    <span className="text-sm text-gray-500">{parsed.claims.length} claims</span>
                  </div>
                  {parsed.claims.map(claim => (
                    <div key={claim.number} className={`p-4 border rounded-lg ${claim.type === 'independent' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`text-sm font-bold ${claim.type === 'independent' ? 'text-blue-700' : 'text-gray-600'}`}>
                          Claim {claim.number}
                        </span>
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                          claim.type === 'independent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{claim.type}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed font-serif"
                         dangerouslySetInnerHTML={{ __html: highlightText(claim.text) }} />
                    </div>
                  ))}
                  {parsed.claims.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-8">No claims could be extracted from the XML.</p>
                  )}
                </div>
              )}

              {/* Description Tab */}
              {activeTab === 'description' && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Specification / Description</h3>
                  {parsed.description ? (
                    <div className="prose prose-sm max-w-none font-serif">
                      {parsed.description.split(/\n{2,}/).map((para, i) => (
                        <p key={i} className="mb-3 text-sm text-gray-700 leading-relaxed text-justify"
                           style={{ textIndent: '24px' }}
                           dangerouslySetInnerHTML={{ __html: highlightText(para) }} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">No description available in the XML.</p>
                  )}
                </div>
              )}

              {/* Raw XML Tab */}
              {activeTab === 'raw' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-900">Raw XML</h3>
                    <button
                      onClick={() => { navigator.clipboard.writeText(rawXml); }}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition-colors"
                    >
                      Copy XML
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-[60vh] font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {rawXml.substring(0, 100000)}
                    {rawXml.length > 100000 && '\n\n... (truncated)'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
