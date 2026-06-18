'use client';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

const PremiumViewer = dynamic(() => import('@/components/premium/premium-3d-viewer'), { ssr: false });

export default function PremiumShowcasePage() {
  const router = useRouter();
  return (
    <div style={{ minHeight: '100vh', background: '#02030a', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ padding: '40px 48px 0', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'linear-gradient(90deg,#d97706,#f59e0b)', borderRadius: '20px', padding: '4px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#02030a', marginBottom: 16 }}>⭐ ULTRA PREMIUM · ₹2 CRORE+</div>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f5f0eb, #f59e0b, #c8a951)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 12px' }}>The Ultimate Glass House</h1>
        <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: 600, margin: '0 auto 32px' }}>Floor-to-ceiling structural glazing. Exposed architectural steel. Infinity pool. German kitchens. The most beautiful home possible on your plot.</p>
      </div>

      {/* 3D Viewer */}
      <div style={{ height: '70vh', margin: '0 24px', borderRadius: 16, overflow: 'hidden', border: '1px solid #1e293b', boxShadow: '0 0 80px #f59e0b15' }}>
        <Suspense fallback={<div style={{ height: '100%', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>Rendering glass house...</div>}>
          <PremiumViewer />
        </Suspense>
      </div>

      {/* Specs */}
      <div style={{ padding: '48px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', marginBottom: 24 }}>Premium Specification Sheet</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { cat: 'Structure', spec: 'RCC + Structural Steel Hybrid Frame, M30 Grade Concrete, Fe-500D TMT' },
            { cat: 'Facade', spec: 'Schüco Curtain Wall System, Triple-Glazed Low-E Glass, Argon-filled' },
            { cat: 'Flooring', spec: 'Calacatta Oro Italian Marble (Living), Belgian Engineered Oak (Bedrooms)' },
            { cat: 'Kitchen', spec: 'Häcker German Modular, Miele Appliances, Silestone Quartz Countertop' },
            { cat: 'Bathrooms', spec: 'Kohler Sunstruck Rain Shower, Villeroy & Boch Sanitaryware, Heated Floors' },
            { cat: 'Smart Home', spec: 'Lutron Caseta Lighting, KNX Climate Control, Hikvision Security' },
            { cat: 'Outdoor', spec: 'Infinity Pool, Landscaped Gardens, Water Feature, EV Charging' },
            { cat: 'Roof', spec: 'Rooftop Deck with Glass Railing, Solar Panel Integration, Green Sedum' },
          ].map(({ cat, spec }) => (
            <div key={cat} style={{ background: '#0f1117', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{cat}</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>{spec}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 48, paddingBottom: 48 }}>
          <button
            onClick={() => router.push('/studio')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#02030a', border: 'none', borderRadius: 12, padding: '16px 48px', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 32px #f59e0b30' }}
          >
            Generate My Premium Glass House <ArrowRight className="h-5 w-5" />
          </button>
          <p style={{ color: '#334155', fontSize: '0.72rem', marginTop: 12 }}>Specify your plot dimensions · AI generates in under 60 seconds</p>
        </div>
      </div>
    </div>
  );
}
