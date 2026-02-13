'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function LitigationPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Navigation */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #e0e4ea', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/dashboard">
            <Image src="/logos/inveniam-blue.svg" alt="Inveniam" width={130} height={34} priority />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14 }}>
            <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none' }}>Dashboard</Link>
            <Link href="/portfolio" style={{ color: '#64748b', textDecoration: 'none' }}>Portfolio</Link>
            <Link href="/analysis" style={{ color: '#64748b', textDecoration: 'none' }}>Analysis</Link>
            <Link href="/litigation" style={{ color: '#002E6E', fontWeight: 600, textDecoration: 'none', borderBottom: '2px solid #002E6E', paddingBottom: 2 }}>Litigation Finance</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(135deg, #001535 0%, #002E6E 55%, #00408F 100%)',
        padding: '72px 24px 64px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle geometric accents */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.06)',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, left: -60,
          width: 400, height: 400, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.04)',
        }} />

        <div style={{ maxWidth: 1060, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <Image
              src="/logos/inveniam-capital.png"
              alt="Inveniam Capital"
              width={220}
              height={56}
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <h1 style={{
            color: '#fff', fontSize: 40, fontWeight: 700,
            lineHeight: 1.2, marginBottom: 16, maxWidth: 640,
            letterSpacing: '-0.02em',
          }}>
            Tokenized Litigation Financing
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.75)', fontSize: 18,
            lineHeight: 1.6, maxWidth: 560, marginBottom: 32,
          }}>
            Access institutional-quality litigation financing with built-in liquidity through tokenization — powered by Inveniam Capital&apos;s patented decentralized data infrastructure.
          </p>
          <a
            href="https://inveniam.capital"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', background: '#fff', color: '#002E6E',
              padding: '14px 32px', borderRadius: 8, fontSize: 15,
              fontWeight: 600, textDecoration: 'none',
            }}
          >
            Visit Inveniam Capital →
          </a>
        </div>
      </section>

      {/* Content Sections */}
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Three Column Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, marginBottom: 56 }}>

          {/* Card 1: What is Litigation Financing */}
          <div style={{
            background: '#fff', borderRadius: 12, padding: '36px 32px',
            border: '1px solid #e8ebf0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'linear-gradient(135deg, #EBF0FF, #D6E2FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, fontSize: 22,
            }}>
              ⚖️
            </div>
            <h2 style={{ color: '#0f172a', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              What is Litigation Financing?
            </h2>
            <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              Litigation financing allows third-party investors to fund legal claims in exchange for a share of any future settlement or judgment. It provides patent holders and plaintiffs with the capital needed to pursue meritorious claims without bearing the full cost of legal proceedings. For investors, it represents a non-correlated alternative asset class with the potential for outsized returns tied to case outcomes rather than broader market conditions.
            </p>
          </div>

          {/* Card 2: Why Tokenized is Better */}
          <div style={{
            background: '#fff', borderRadius: 12, padding: '36px 32px',
            border: '1px solid #e8ebf0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'linear-gradient(135deg, #EBF0FF, #D6E2FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, fontSize: 22,
            }}>
              🔗
            </div>
            <h2 style={{ color: '#0f172a', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Why Tokenized Litigation Finance?
            </h2>
            <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              Traditional litigation finance locks capital for years with no liquidity options. Tokenization changes this fundamentally. When litigation financing interests are represented as digital tokens on-chain, lenders gain <strong style={{ color: '#002E6E' }}>liquidity optionality</strong> — they can borrow against their tokenized position, sell on regulated secondary markets, or hold to maturity. This transforms an illiquid asset class into one with continuous price discovery, fractional ownership, and transparent performance data powered by Inveniam&apos;s Smart Provenance™ architecture.
            </p>
          </div>

          {/* Card 3: Get Started */}
          <div style={{
            background: '#fff', borderRadius: 12, padding: '36px 32px',
            border: '1px solid #e8ebf0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'linear-gradient(135deg, #EBF0FF, #D6E2FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, fontSize: 22,
            }}>
              🚀
            </div>
            <h2 style={{ color: '#0f172a', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Get Started with Inveniam Capital
            </h2>
            <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
              Inveniam Capital combines a $700B+ investment pedigree with patented decentralized data infrastructure to bring institutional-quality transparency, pricing, and liquidity to tokenized real-world assets — including litigation finance. Backed by Abu Dhabi Catalyst Partners and G42, Inveniam Capital bridges traditional capital markets with digital infrastructure.
            </p>
            <a
              href="https://inveniam.capital"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', background: '#002E6E', color: '#fff',
                padding: '12px 24px', borderRadius: 8, fontSize: 14,
                fontWeight: 600, textDecoration: 'none',
              }}
            >
              Visit inveniam.capital →
            </a>
          </div>
        </div>

        {/* Key Advantages Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #001535, #002E6E)',
          borderRadius: 14, padding: '44px 40px',
          color: '#fff',
        }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 28, letterSpacing: '-0.01em' }}>
            Key Advantages of Tokenized Litigation Finance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
            {[
              { label: 'Secondary Market Liquidity', desc: 'Sell or trade positions on regulated digital markets before case resolution.' },
              { label: 'Borrow Against Positions', desc: 'Use tokenized litigation interests as collateral for additional financing.' },
              { label: 'Transparent Data', desc: "Inveniam's Smart Provenance™ delivers real-time, auditable case performance data." },
              { label: 'Fractional Access', desc: 'Lower minimum thresholds allow broader participation in litigation investments.' },
            ].map((item, i) => (
              <div key={i}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#5b9aff', marginBottom: 12,
                }} />
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{item.label}</p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Back to Dashboard */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link href="/dashboard" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
