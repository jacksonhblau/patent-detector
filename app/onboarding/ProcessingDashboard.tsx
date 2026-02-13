'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface CompetitorProgress {
  name: string;
  id: string | null;
  status: 'waiting' | 'created' | 'researching' | 'analyzing' | 'complete' | 'error';
  docsFound: number;
  productsFound: number;
  patentsFound: number;
  analysisComplete: boolean;
  infringementScore: number | null;
}

interface Props {
  companyName: string;
  competitorNames: string[];
  onComplete: () => void;
}

const POLL_INTERVAL = 4000;

export default function ProcessingDashboard({ companyName, competitorNames, onComplete }: Props) {
  // Use ref to avoid re-creating the polling callback when props change reference
  const namesRef = useRef(competitorNames);
  namesRef.current = competitorNames;

  const [portfolioPatents, setPortfolioPatents] = useState(0);
  const [competitors, setCompetitors] = useState<CompetitorProgress[]>(
    competitorNames.map(name => ({
      name,
      id: null,
      status: 'waiting',
      docsFound: 0,
      productsFound: 0,
      patentsFound: 0,
      analysisComplete: false,
      infringementScore: null,
    }))
  );
  const [allDone, setAllDone] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const allDoneRef = useRef(false);

  // Elapsed timer
  useEffect(() => {
    if (allDone) return;
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [allDone]);

  // Single stable polling function — uses refs, no dependencies that change
  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active || allDoneRef.current) return;

      try {
        const names = namesRef.current;

        // 1. Portfolio patent count
        const { count: patentCount } = await supabase
          .from('patents')
          .select('*', { count: 'exact', head: true });
        if (patentCount !== null && active) setPortfolioPatents(patentCount);

        // 2. All competitors in DB
        const { data: dbCompetitors } = await supabase
          .from('competitors')
          .select('id, name');

        if (!dbCompetitors || !active) return;

        // 3. Per-competitor progress
        const updated: CompetitorProgress[] = await Promise.all(
          names.map(async (name) => {
            const nameLower = name.toLowerCase().trim();
            const match = dbCompetitors.find(c => {
              const dbName = c.name.toLowerCase().trim();
              return dbName === nameLower
                || dbName.includes(nameLower)
                || nameLower.includes(dbName);
            });

            if (!match) {
              return {
                name, id: null, status: 'waiting' as const,
                docsFound: 0, productsFound: 0, patentsFound: 0,
                analysisComplete: false, infringementScore: null,
              };
            }

            // Docs by type
            const { data: docs } = await supabase
              .from('competitor_documents')
              .select('id, type, document_type')
              .eq('competitor_id', match.id);

            const docsFound = docs?.length || 0;
            const productsFound = docs?.filter(
              d => d.type === 'product_service' || d.document_type === 'product_service'
            ).length || 0;
            const patentsFound = docs?.filter(
              d => d.type === 'patent' || d.document_type === 'patent'
            ).length || 0;

            // Analysis
            const { data: analysis } = await supabase
              .from('analyses')
              .select('id, infringement_score')
              .eq('competitor_id', match.id)
              .limit(1);

            const hasAnalysis = analysis && analysis.length > 0;
            const score = hasAnalysis ? analysis[0].infringement_score : null;

            let status: CompetitorProgress['status'] = 'created';
            if (hasAnalysis) status = 'complete';
            else if (docsFound > 0) status = 'analyzing';
            else status = 'researching';

            return {
              name, id: match.id, status, docsFound, productsFound, patentsFound,
              analysisComplete: !!hasAnalysis, infringementScore: score,
            };
          })
        );

        if (!active) return;
        setCompetitors(updated);

        // Check completion
        const allComplete = updated.every(c => c.status === 'complete' || c.status === 'error');
        if (allComplete && updated.some(c => c.status === 'complete')) {
          console.log('✅ All competitors done, stopping poll');
          allDoneRef.current = true;
          setAllDone(true);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }

    // Initial poll + interval
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []); // Empty deps — runs once, uses refs for everything

  // Totals
  const totalDocs = competitors.reduce((sum, c) => sum + c.docsFound, 0);
  const totalProducts = competitors.reduce((sum, c) => sum + c.productsFound, 0);
  const totalPatents = competitors.reduce((sum, c) => sum + c.patentsFound, 0);
  const completedCount = competitors.filter(c => c.status === 'complete').length;

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const statusIcon = (status: CompetitorProgress['status']) => {
    switch (status) {
      case 'waiting': return '⏳';
      case 'created': return '📋';
      case 'researching': return '🔍';
      case 'analyzing': return '🤖';
      case 'complete': return '✅';
      case 'error': return '❌';
    }
  };

  const statusText = (status: CompetitorProgress['status']) => {
    switch (status) {
      case 'waiting': return 'Queued';
      case 'created': return 'Created';
      case 'researching': return 'Searching web & USPTO...';
      case 'analyzing': return 'Running AI analysis...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
    }
  };

  const statusColor = (status: CompetitorProgress['status']) => {
    switch (status) {
      case 'waiting': return 'text-gray-400';
      case 'created':
      case 'researching':
      case 'analyzing': return 'text-blue-600';
      case 'complete': return 'text-green-600';
      case 'error': return 'text-red-600';
    }
  };

  // Show proceed button if all done OR if it's been running > 5 minutes (fallback)
  const showProceedButton = allDone || elapsedSeconds > 300;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {allDone ? 'Analysis Complete!' : 'Analyzing Competitors...'}
        </h2>
        <p className="text-sm text-gray-500">
          {allDone
            ? `Finished in ${formatTime(elapsedSeconds)}`
            : `Elapsed: ${formatTime(elapsedSeconds)} — This typically takes 2-3 minutes per competitor`
          }
        </p>
      </div>

      {/* Overall Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{completedCount} of {competitors.length} competitors analyzed</span>
          <span>{Math.round((completedCount / Math.max(competitors.length, 1)) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ${allDone ? 'bg-green-500' : 'bg-[#0066FF]'}`}
            style={{ width: `${(completedCount / Math.max(competitors.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{portfolioPatents}</div>
          <div className="text-xs text-gray-500 mt-0.5">Your Patents</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
          <div className="text-xs text-gray-500 mt-0.5">Products Found</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalPatents}</div>
          <div className="text-xs text-gray-500 mt-0.5">Their Patents</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalDocs}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Docs</div>
        </div>
      </div>

      {/* Per-Competitor Progress */}
      <div className="space-y-3">
        {competitors.map((comp, idx) => {
          const isActive = comp.status !== 'waiting' && comp.status !== 'complete' && comp.status !== 'error';

          return (
            <div
              key={idx}
              className={`border rounded-lg p-4 transition-all ${
                comp.status === 'complete'
                  ? 'border-green-200 bg-green-50/30'
                  : isActive
                  ? 'border-blue-200 bg-blue-50/20'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{statusIcon(comp.status)}</span>
                  <span className="font-medium text-gray-900">{comp.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {isActive && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  )}
                  <span className={`text-sm font-medium ${statusColor(comp.status)}`}>
                    {statusText(comp.status)}
                  </span>
                </div>
              </div>

              {/* Detail row */}
              {comp.id && (
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                  {comp.productsFound > 0 && (
                    <span>🌐 {comp.productsFound} product{comp.productsFound !== 1 ? 's' : ''}</span>
                  )}
                  {comp.patentsFound > 0 && (
                    <span>📄 {comp.patentsFound} patent{comp.patentsFound !== 1 ? 's' : ''}</span>
                  )}
                  {comp.docsFound > 0 && comp.productsFound === 0 && comp.patentsFound === 0 && (
                    <span>📁 {comp.docsFound} document{comp.docsFound !== 1 ? 's' : ''}</span>
                  )}
                  {comp.infringementScore !== null && (
                    <span className={`font-semibold ${
                      comp.infringementScore >= 70 ? 'text-red-600' :
                      comp.infringementScore >= 40 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      ⚖️ Risk: {comp.infringementScore}%
                    </span>
                  )}
                </div>
              )}

              {/* Step indicators for active competitor */}
              {isActive && (
                <div className="flex items-center space-x-1 mt-2">
                  {['Created', 'Web Search', 'USPTO', 'AI Analysis'].map((label, i) => {
                    const stepDone =
                      (i === 0 && comp.id) ||
                      (i === 1 && comp.productsFound > 0) ||
                      (i === 2 && comp.patentsFound > 0) ||
                      (i === 3 && comp.analysisComplete);
                    const stepActive =
                      (i === 0 && comp.status === 'created') ||
                      (i === 1 && comp.status === 'researching' && comp.productsFound === 0) ||
                      (i === 2 && comp.status === 'researching' && comp.productsFound > 0) ||
                      (i === 3 && comp.status === 'analyzing');

                    return (
                      <div key={i} className="flex items-center">
                        <div className={`h-1.5 w-8 rounded-full ${
                          stepDone ? 'bg-green-400' : stepActive ? 'bg-blue-400 animate-pulse' : 'bg-gray-200'
                        }`} />
                        {i < 3 && <div className="w-0.5" />}
                      </div>
                    );
                  })}
                  <span className="text-[10px] text-gray-400 ml-1">
                    {comp.status === 'researching' ? 'Searching...' : 'Analyzing...'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Button — shows when done OR after 5 min fallback */}
      {showProceedButton && (
        <div className="pt-2">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 text-white bg-[#0066FF] hover:bg-[#0052CC] rounded-lg transition-colors font-medium"
          >
            {allDone ? 'View Analysis Dashboard →' : 'Continue to Dashboard →'}
          </button>
          {!allDone && (
            <p className="text-center text-xs text-gray-400 mt-2">
              Processing will continue in the background
            </p>
          )}
        </div>
      )}

      {/* Processing tips */}
      {!showProceedButton && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-sm text-blue-700">
            <strong>What&apos;s happening:</strong> For each competitor, we search the web for their products and services,
            verify URLs are live, search USPTO for their patents, then run an AI analysis comparing everything against
            your {portfolioPatents} patent{portfolioPatents !== 1 ? 's' : ''}.
          </p>
        </div>
      )}
    </div>
  );
}
