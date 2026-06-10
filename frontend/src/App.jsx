import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { fetchCalls, fetchCall, analyzeCallStream, saveNotes, reanalyzeCall, deleteCall, updateCall } from "./api.js";

// ─── Theme ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#F0F1F7',
  s1:       '#FFFFFF',
  s2:       '#F8F8FC',
  s3:       '#EEF0F7',
  border:   '#E4E6EF',
  borderL:  '#D1D5E8',
  accent:   '#7C3AED',
  accentBg: 'rgba(124,58,237,0.08)',
  accentGl: 'rgba(124,58,237,0.16)',
  red:      '#EF4444',
  redBg:    'rgba(239,68,68,0.08)',
  amber:    '#F59E0B',
  amberBg:  'rgba(245,158,11,0.08)',
  t1:       '#111827',
  t2:       '#6B7280',
  t3:       '#9CA3AF',
  nav:      '#1E1B4B',   // dark indigo sidebar/nav
  navText:  '#C4B5FD',
};

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  body { font-family: 'Inter', sans-serif; }
  input, select, textarea {
    background: #FFFFFF; border: 1.5px solid #E4E6EF; color: #111827;
    padding: 10px 14px; border-radius: 10px;
    font-family: 'Inter', sans-serif; font-size: 14px; outline: none; width: 100%;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: #7C3AED;
    box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
  }
  input::placeholder { color: #9CA3AF; }
  select option { background: #FFFFFF; color: #111827; }
  button { font-family: 'Inter', sans-serif; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .fade-up { animation: fadeUp 0.3s ease forwards; }
  .fade-in { animation: fadeIn 0.25s ease forwards; }
  .card-hover:hover {
    box-shadow: 0 8px 28px rgba(124,58,237,0.13), 0 2px 8px rgba(0,0,0,0.05) !important;
    border-color: rgba(124,58,237,0.2) !important;
    transform: translateY(-2px);
  }
  .row-hover:hover { background: rgba(124,58,237,0.03) !important; }
  .sidebar-item { transition: all 0.18s cubic-bezier(.4,0,.2,1); }
  .sidebar-item:hover {
    background: rgba(124,58,237,0.18) !important;
    color: #E0D7FF !important;
    padding-left: 18px !important;
  }
  .sidebar-item:hover svg { opacity: 1 !important; }
`;

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icon = ({ name, size=18, color='currentColor' }) => {
  const paths = {
    home:       'M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z M9 21V12h6v9',
    upload:     'M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2',
    user:       'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    chart:      'M18 20V10M12 20V4M6 20v-6',
    settings:   'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    mic:        'M12 1a3 3 0 013 3v8a3 3 0 01-6 0V4a3 3 0 013-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
    check:      'M20 6L9 17l-5-5',
    arrow:      'M9 18l6-6-6-6',
    copy:       'M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-2M8 4a2 2 0 012-2h4a2 2 0 012 2v0a2 2 0 01-2 2h-4a2 2 0 01-2-2zM16 12H8M12 8v8',
    pain:       'M13 10V3L4 14h7v7l9-11h-7z',
    shield:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    chat:       'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    info:       'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    mail:       'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
    notepad:    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01',
    trend:      'M23 6l-9.5 9.5-5-5L1 18',
    phone:      'M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 013.09 4.18 2 2 0 015.07 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z',
    clients:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    search:     'M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z',
    plus:       'M12 5v14M5 12h14',
    refresh:    'M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.9-3.36M20 15a9 9 0 01-14.9 3.36',
    close:      'M18 6L6 18M6 6l12 12',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(paths[name] || '').split('M').filter(Boolean).map((d, i) => (
        <path key={i} d={'M' + d} />
      ))}
    </svg>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const SIDEBAR_W = 220;

function Sidebar({ view, setView, avgScore }) {
  const navItems = [
    { id: 'dashboard', label: 'Home',         icon: 'home'      },
    { id: 'upload',    label: 'Neuer Call',   icon: 'plus'      },
    { id: 'clients',   label: 'Clients',      icon: 'clients'   },
    { id: 'scoreboard',label: 'Scoreboard',   icon: 'chart'     },
    { id: 'account',   label: 'Account',      icon: 'user'      },
    { id: 'settings',  label: 'Einstellungen',icon: 'settings'  },
  ];

  return (
    <div style={{
      position: 'fixed', top: 12, left: 12, bottom: 12,
      width: SIDEBAR_W,
      background: 'rgba(26,22,64,0.82)',
      backdropFilter: 'blur(24px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
      borderRadius: 18,
      border: '1px solid rgba(124,58,237,0.18)',
      display: 'flex', flexDirection: 'column',
      zIndex: 200,
      boxShadow: '0 8px 40px rgba(30,27,75,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding:'22px 20px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:34, height:34, borderRadius:10, background: C.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 12px rgba(124,58,237,0.4)',
          }}>
            <Icon name="phone" size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#FFFFFF', letterSpacing:'-0.02em' }}>
              Close<span style={{ color: C.accent }}>IQ</span>
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>Sales Intelligence</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {navItems.map(item => {
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => setView(item.id)}
              className={active ? '' : 'sidebar-item'}
              style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'10px 14px', borderRadius:10, border:'none', cursor:'pointer',
                background: active ? 'rgba(124,58,237,0.3)' : 'transparent',
                color: active ? '#C4B5FD' : 'rgba(255,255,255,0.45)',
                fontWeight: active ? 600 : 500, fontSize:13,
                textAlign:'left', width:'100%',
                borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent',
                boxShadow: active ? 'inset 0 0 0 1px rgba(124,58,237,0.2)' : 'none',
              }}>
              <Icon name={item.icon} size={17} color={active ? '#C4B5FD' : 'rgba(255,255,255,0.45)'} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Avg score at bottom */}
      {avgScore && (() => { const g = getGrade(avgScore); return (
        <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:g.bg, border:`1.5px solid ${g.color}44`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:800, color:g.color }}>{g.grade}</span>
          </div>
          <div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Ø Score</div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.7)' }}>{avgScore}/100</div>
          </div>
        </div>
      ); })()}
    </div>
  );
}

// ─── Grade System ─────────────────────────────────────────────────────────────
function getGrade(score) {
  if (score == null) return { grade:'—', color:C.t3, bg:'rgba(156,163,175,0.1)' };
  if (score >= 90) return { grade:'S+', color:'#7C3AED', bg:'rgba(124,58,237,0.12)' };
  if (score >= 80) return { grade:'A',  color:'#059669', bg:'rgba(5,150,105,0.10)' };
  if (score >= 65) return { grade:'B',  color:'#D97706', bg:'rgba(217,119,6,0.10)'  };
  if (score >= 50) return { grade:'C',  color:'#EA580C', bg:'rgba(234,88,12,0.10)'  };
  return                   { grade:'D',  color:'#DC2626', bg:'rgba(220,38,38,0.10)'  };
}

function GradeBadge({ score, size = 32 }) {
  const { grade, color, bg } = getGrade(score);
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.28,
      background:bg, border:`1.5px solid ${color}33`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Space Mono',monospace", fontWeight:700,
      fontSize:size*0.36, color, flexShrink:0,
    }}>{grade}</div>
  );
}

// ─── Shared UI Atoms ─────────────────────────────────────────────────────────
function ScoreRing({ score, size = 72 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (score||0) / 100);
  const { grade, color } = getGrade(score);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s ease', filter:`drop-shadow(0 0 4px ${color}66)` }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize: size * 0.28, fontWeight:800, color, lineHeight:1 }}>{grade}</span>
        <span style={{ fontSize: 8, color: C.t3, marginTop: 2, letterSpacing:'0.06em' }}>{score}</span>
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }) {
  const m = {
    'kb-scheduled':      { label:'KB Scheduled',       bg: 'rgba(16,185,129,0.1)',  color: '#059669', border:'rgba(16,185,129,0.3)' },
    'not-interested':    { label:'Not Interested Yet', bg: C.redBg,                 color: '#DC2626', border:'rgba(239,68,68,0.3)'  },
    // Legacy values
    closed:              { label:'Closed ✓',            bg: 'rgba(16,185,129,0.1)',  color: '#059669', border:'rgba(16,185,129,0.3)' },
    'follow-up':         { label:'Follow-up',           bg: C.amberBg,               color: '#D97706', border:'rgba(245,158,11,0.3)' },
    lost:                { label:'Lost',                bg: C.redBg,                 color: '#DC2626', border:'rgba(239,68,68,0.3)'  },
  };
  const s = m[outcome] || { label: outcome, bg: C.s3, color: C.t2, border: C.border };
  return (
    <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color, border:`1.5px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, ...style }}>
      {children}
    </div>
  );
}

function Card({ children, style, onClick, onMouseEnter, onMouseLeave }) {
  return (
    <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(228,230,239,0.8)',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease',
        ...style,
      }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0' }}>
      <div style={{
        width:32, height:32, borderRadius:'50%',
        border:`3px solid ${C.border}`, borderTopColor: C.accent,
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Chip({ children, color, bg, border }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'3px 10px',
      borderRadius:20, fontSize:11, fontWeight:600,
      background: bg || C.accentBg, color: color || C.accent,
      border: `1.5px solid ${border || C.accentGl}`,
    }}>{children}</span>
  );
}

// ─── Custom Select ────────────────────────────────────────────────────────────
function CustomSelect({ value, onChange, options, disabled }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value) || options[0];
  return (
    <div style={{ position:'relative', userSelect:'none' }}>
      <div onClick={() => !disabled && setOpen(v => !v)} style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', borderRadius:10, cursor: disabled ? 'default' : 'pointer',
        background:'#FFFFFF', border:`1.5px solid ${open ? C.accent : C.border}`,
        fontSize:14, color: C.t1, transition:'border-color 0.15s',
        boxShadow: open ? `0 0 0 3px rgba(124,58,237,0.12)` : 'none',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: current.color || C.accent }} />
          {current.label}
        </div>
        <Icon name="arrow" size={14} color={C.t3} />
      </div>
      {open && (
        <div className="fade-in" style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:50,
          background:'#FFFFFF', borderRadius:12, border:`1.5px solid ${C.border}`,
          boxShadow:'0 8px 32px rgba(0,0,0,0.12)', overflow:'hidden',
        }}
          onMouseLeave={() => setOpen(false)}>
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'11px 14px', cursor:'pointer', fontSize:14,
                background: opt.value === value ? C.accentBg : 'transparent',
                color: opt.value === value ? C.accent : C.t1,
                transition:'background 0.1s',
              }}
              onMouseEnter={e => { if(opt.value !== value) e.currentTarget.style.background = C.s3; }}
              onMouseLeave={e => { if(opt.value !== value) e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: opt.color || C.accent }} />
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView({ calls, onSelectCall, loading, kanbanBoard = {} }) {
  const [search, setSearch] = useState('');
  const [compMetric, setCompMetric] = useState('score');
  if (loading) return <Spinner />;
  const filtered = search.trim()
    ? calls.filter(c =>
        c.prospect?.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase())
      )
    : calls;

  const scored = calls.filter(c => c.score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : 0;
  // Kanban board passed from parent (always up-to-date)
  const kbCount = (kanbanBoard.kb || []).length;
  const kbRate = calls.length ? Math.round((kbCount / calls.length) * 100) : 0;
  // Close Rate = calls in "Abgeschlossene AT" column
  const atCount = (kanbanBoard.at || []).length;
  const closeRate = calls.length ? Math.round((atCount / calls.length) * 100) : 0;

  // Monthly improvement rate
  const now = new Date();
  const thisMonth = scored.filter(c => { const d = new Date(c.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const lastMonth = scored.filter(c => { const d = new Date(c.created_at); const lm = new Date(now.getFullYear(), now.getMonth()-1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); });
  const thisAvg = thisMonth.length ? Math.round(thisMonth.reduce((s,c)=>s+c.score,0)/thisMonth.length) : null;
  const lastAvg = lastMonth.length ? Math.round(lastMonth.reduce((s,c)=>s+c.score,0)/lastMonth.length) : null;
  const monthlyImprovement = (thisAvg && lastAvg) ? Math.round(((thisAvg-lastAvg)/lastAvg)*100) : null;

  const historyData = [...calls]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-8)
    .map(c => ({
      l: c.date?.split(',')[0] || '—',
      s: c.score,
    }));

  // ── Comparison chart data ───────────────────────────────────────────────────
  const compMetrics = [
    { id:'score',   label:'Score',       fn: c => c.score },
    { id:'talk',    label:'Talk %',      fn: c => c.analysis?.talk?.rep },
    { id:'trust',   label:'Vertrauen',   fn: c => c.analysis?.trustScore },
    { id:'fillers', label:'Filler Words',fn: c => c.analysis?.fillers },
  ];

  const compBarData = calls.length >= 2 ? (() => {
    const metric = compMetrics.find(m => m.id === compMetric);
    const allVals = calls.map(c => metric.fn(c)).filter(v => typeof v === 'number' && v > 0);
    const avg = allVals.length ? Math.round(allVals.reduce((s,v)=>s+v,0)/allVals.length) : 0;
    return [
      { name:'Letzter',    value: metric.fn(calls[0]) || 0, colorIdx: 0 },
      { name:'Vorletzter', value: metric.fn(calls[1]) || 0, colorIdx: 1 },
      { name:'Ø',          value: avg,                       colorIdx: 2 },
    ];
  })() : null;

  return (
    <div style={{ display:'flex', gap:20, alignItems:'flex-start', paddingBottom:40 }}>

      {/* ── Left main column ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:14, minWidth:0 }}>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        {/* Ø Call Score — grade + number */}
        {(() => { const g = getGrade(avgScore||0); return (
          <Card className="card-hover" style={{ borderTop:`3px solid ${g.color}` }}>
            <SectionLabel>Ø Call Score</SectionLabel>
            <div style={{ fontFamily:"'Inter',sans-serif", fontSize:48, fontWeight:800, color:g.color, lineHeight:1, letterSpacing:'-0.04em', fontVariantNumeric:'tabular-nums' }}>
              {avgScore ? g.grade : '—'}
            </div>
          </Card>
        ); })()}

        {/* Close Rate + KB Rate in same card */}
        <Card className="card-hover" style={{ borderTop:`3px solid #9333EA` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
            <SectionLabel style={{ marginBottom:0 }}>Close Rate</SectionLabel>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:9, color:C.t3, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>KB Rate</div>
              <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:C.accent, letterSpacing:'-0.01em' }}>{calls.length?`${kbRate}%`:'—'}</div>
            </div>
          </div>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:28, fontWeight:700, color: closeRate > 0 ? '#059669' : C.t3, lineHeight:1, letterSpacing:'-0.03em' }}>
            {calls.length ? `${closeRate}%` : '—'}
          </div>
        </Card>

        {/* Analysierte Calls */}
        <Card className="card-hover" style={{ borderTop:`3px solid #C4B5FD` }}>
          <SectionLabel>Analysierte Calls</SectionLabel>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:28, fontWeight:700, color:C.t1, lineHeight:1, letterSpacing:'-0.03em' }}>{calls.length}</div>
        </Card>

        {/* Monthly Improvement */}
        <Card className="card-hover" style={{ borderTop:`3px solid ${monthlyImprovement && monthlyImprovement > 0 ? '#059669' : monthlyImprovement !== null ? '#DC2626' : C.t3}` }}>
          <SectionLabel>Monthly Improvement</SectionLabel>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:28, fontWeight:700, lineHeight:1, letterSpacing:'-0.03em',
            color: monthlyImprovement === null ? C.t3 : monthlyImprovement > 0 ? '#059669' : '#DC2626' }}>
            {monthlyImprovement === null ? '—' : `${monthlyImprovement > 0 ? '+' : ''}${monthlyImprovement}%`}
          </div>
          {monthlyImprovement === null && <div style={{ color:C.t3, fontSize:10, marginTop:4 }}>Noch kein Vormonat</div>}
        </Card>
      </div>

      {/* Score trend */}
      {historyData.length > 1 && (
        <Card style={{ boxShadow:'0 0 0 1px rgba(124,58,237,0.08), 0 4px 24px rgba(124,58,237,0.10), 0 0 40px rgba(124,58,237,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <div style={{ width:28, height:28, borderRadius:8, background: C.accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon name="trend" size={14} color={C.accent} />
            </div>
            <SectionLabel style={{ marginBottom:0 }}>Score Verlauf</SectionLabel>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={historyData} margin={{ top:4, right:4, bottom:0, left:-30 }}>
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.accent} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="l" tick={{ fill: C.t3, fontSize:10, fontFamily:'Space Mono' }} axisLine={false} tickLine={false} />
              <YAxis domain={[40,100]} tick={{ fill: C.t3, fontSize:10, fontFamily:'Space Mono' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.s2, border:`1px solid ${C.border}`, borderRadius:8, color: C.t1, fontSize:12, fontFamily:'Space Mono' }} cursor={{ stroke: C.accent, strokeWidth:1, strokeDasharray:'4 4' }} />
              <Area type="monotone" dataKey="s" stroke={C.accent} strokeWidth={2} fill="url(#sg)" dot={{ fill: C.accent, strokeWidth:0, r:3 }} activeDot={{ r:5, fill: C.accent }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Call list */}
      <Card style={{ padding:0 }}>
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12 }}>
          <SectionLabel style={{ marginBottom:0, flex:1 }}>Letzte Calls</SectionLabel>
          <div style={{ position:'relative', maxWidth:200, width:'100%' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
              <Icon name="search" size={14} color={C.t3} />
            </span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Suche nach Kunde..."
              style={{ paddingLeft:32, fontSize:12, padding:'7px 10px 7px 32px', height:34 }} />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color: C.t3, fontSize:14 }}>
            {search ? 'Keine Treffer.' : 'Noch keine Calls. Lade deinen ersten Call hoch →'}
          </div>
        ) : filtered.map((call, i) => {
          const g = getGrade(call.score);
          return (
            <div key={call.id} onClick={() => onSelectCall(call)} className="row-hover"
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'13px 20px', borderBottom: i < filtered.length-1 ? `1px solid ${C.border}` : 'none',
                cursor:'pointer', transition:'background 0.15s', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:g.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="phone" size={15} color={g.color} />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ color: C.t1, fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                    {call.prospect}
                    {i === 0 && !search && <span style={{ fontSize:9, padding:'2px 8px', background: C.accentBg, color: C.accent, borderRadius:10, fontWeight:700 }}>NEU</span>}
                  </div>
                  <div style={{ color: C.t3, fontSize:12, marginTop:1 }}>{call.company} · {call.date}</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <OutcomeBadge outcome={call.outcome} />
                <GradeBadge score={call.score} size={34} />
                <Icon name="arrow" size={14} color={C.t3} />
              </div>
            </div>
          );
        })}
      </Card>

      </div>{/* end left column */}

      {/* ── Right column — vertical bar comparison ── */}
      {compBarData && (
        <div style={{ width:340, flexShrink:0 }}>
          <Card style={{
            position:'sticky', top:24, padding:'20px 18px',
            boxShadow:'0 0 0 1px rgba(124,58,237,0.08), 0 4px 24px rgba(124,58,237,0.12), 0 0 40px rgba(124,58,237,0.06)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:26, height:26, borderRadius:8, background:C.accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="chart" size={13} color={C.accent} />
              </div>
              <SectionLabel style={{ marginBottom:0 }}>Call Vergleich</SectionLabel>
            </div>

            {/* Metric switcher */}
            <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
              {compMetrics.map(m => (
                <button key={m.id} onClick={() => setCompMetric(m.id)} style={{
                  padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer',
                  fontSize:11, fontWeight:600, transition:'all 0.15s',
                  background: compMetric === m.id ? C.accent : C.s3,
                  color: compMetric === m.id ? '#fff' : C.t3,
                  boxShadow: compMetric === m.id ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                }}>{m.label}</button>
              ))}
            </div>

            {/* Vertical bar chart — last 5 calls */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={compBarData}
                margin={{ top:8, right:4, bottom:20, left:-20 }}
                barCategoryGap="35%">
                <defs>
                  <linearGradient id="bar0" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={1} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity={1} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="bar2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C4B5FD" stopOpacity={1} />
                    <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fill: C.t2, fontSize:12, fontWeight:600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.t3, fontSize:10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:10, fontSize:11, boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}
                  cursor={{ fill:'rgba(124,58,237,0.05)' }}
                  formatter={(val) => [val, compMetrics.find(m=>m.id===compMetric)?.label]}
                />
                <Bar dataKey="value" radius={[8,8,0,0]} isAnimationActive={true} maxBarSize={80}>
                  {compBarData.map((_, i) => (
                    <Cell key={i} fill={`url(#bar${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ textAlign:'center', color:C.t3, fontSize:10, marginTop:4 }}>Letzte 5 Calls · Neuester links</div>
          </Card>
        </div>
      )}

    </div>
  );
}

// ─── Metric Detail Panel ──────────────────────────────────────────────────────
function MetricDetail({ metric, analysis, onClose }) {
  const a = analysis;
  return (
    <div style={{
        position:'fixed', inset:0, zIndex:999,
        background:'rgba(241,242,248,0.55)',
        backdropFilter:'blur(18px) saturate(1.6)',
        WebkitBackdropFilter:'blur(18px) saturate(1.6)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      }}
      onClick={onClose}>
      <div className="fade-in" style={{
        background:'rgba(255,255,255,0.96)',
        border:'1.5px solid rgba(255,255,255,0.9)',
        borderRadius:20, padding:28,
        maxWidth:460, width:'100%', maxHeight:'82vh', overflowY:'auto',
        boxShadow:'0 8px 40px rgba(124,58,237,0.12), 0 2px 12px rgba(0,0,0,0.08)',
      }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ color: C.t1, fontSize:16, fontWeight:800 }}>{metric.label}</div>
          <button onClick={onClose} style={{ background:C.s3, border:'none', color: C.t3, cursor:'pointer', borderRadius:8, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="close" size={14} color={C.t2} />
          </button>
        </div>

        {metric.id === 'fillers' && (
          <>
            <div style={{ color: C.t2, fontSize:13, marginBottom:14 }}>Welche Füllwörter wie oft:</div>
            {(a.fillerBreakdown || []).sort((x,y) => y.count - x.count).map((f,i) => {
              const max = Math.max(...(a.fillerBreakdown || []).map(x => x.count), 1);
              return (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ color: C.t1, fontSize:13, fontFamily:"'Space Mono',monospace" }}>„{f.word}"</span>
                    <span style={{ color: C.red, fontSize:13, fontWeight:700 }}>×{f.count}</span>
                  </div>
                  <div style={{ height:6, background: C.s3, borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(f.count/max)*100}%`, background: C.red, borderRadius:3 }} />
                  </div>
                </div>
              );
            })}
            {(!a.fillerBreakdown || a.fillerBreakdown.length === 0) && <div style={{ color: C.t3, fontSize:13 }}>Keine Daten verfügbar</div>}
          </>
        )}

        {metric.id === 'prospectQ' && (
          <>
            <div style={{ color: C.t2, fontSize:13, marginBottom:14 }}>Fragen vom Prospect — Kaufsignale:</div>
            {(a.prospectQuestions || []).map((q,i) => (
              <div key={i} style={{ padding:'10px 12px', background: C.s3, border:`1px solid ${C.borderL}`, borderRadius:8, marginBottom:8, color: C.t1, fontSize:13, lineHeight:1.5 }}>
                <span style={{ color: C.accent, marginRight:8 }}>?</span>{q}
              </div>
            ))}
            {(!a.prospectQuestions || a.prospectQuestions.length === 0) && <div style={{ color: C.t3, fontSize:13 }}>Keine Fragen erkannt</div>}
          </>
        )}

        {metric.id === 'monologue' && (
          <>
            <div style={{ display:'flex', gap:24, marginBottom:14 }}>
              <div>
                <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Maximum</div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: (a.monologue||0) <= 3 ? C.accent : C.red }}>{a.monologue || 0}m</div>
              </div>
              <div>
                <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Durchschnitt</div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: (a.avgMonologue||0) <= 2 ? C.accent : C.amber }}>{a.avgMonologue || 0}m</div>
              </div>
            </div>
            <div style={{ color: C.t3, fontSize:12, lineHeight:1.7 }}>
              Monologe über 3 Min signalisieren mangelndes Interesse an der Situation des Prospects.<br/>
              Gong-Benchmark: max. 2–3 Min, Ø unter 1.5 Min.
            </div>
          </>
        )}

        {metric.id === 'questions' && (
          <div style={{ color: C.t3, fontSize:13, lineHeight:1.7 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: (a.questions||0) >= 9 ? C.accent : C.red, marginBottom:8 }}>{a.questions || 0}</div>
            Fragen zeigen echtes Interesse und helfen, den Prospect zu qualifizieren.<br/>
            Gong-Benchmark: mind. 11–14 Fragen pro Call.
          </div>
        )}

        {metric.id === 'priceTiming' && (
          <div style={{ color: C.t3, fontSize:13, lineHeight:1.7 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: (a.priceTiming||0) >= 60 ? C.accent : C.red, marginBottom:8 }}>{a.priceTiming || 0}%</div>
            Preis sollte erst nach der Hälfte des Calls erwähnt werden — erst Value aufbauen, dann Preis nennen.<br/>
            Wurde bei {a.priceTiming || 0}% der Calldauer erwähnt.
          </div>
        )}

        {metric.id === 'nextStep' && (
          <div style={{ color: C.t3, fontSize:13, lineHeight:1.7 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: a.nextStep ? C.accent : C.red, marginBottom:8 }}>{a.nextStep ? 'Ja ✓' : 'Nein ✗'}</div>
            {a.nextStep
              ? `Nächster Schritt vereinbart: ${a.followUpDate || 'Datum nicht erkannt'}`
              : 'Kein konkreter nächster Schritt vereinbart — kritisch für Deal-Fortschritt.'}
          </div>
        )}

        {metric.id === 'jaCount' && (
          <>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: C.accent, marginBottom:14 }}>{a.jaCount || 0}</div>
            <div style={{ color: C.t2, fontSize:13, marginBottom:12 }}>Explizite Zusagen & Commitments:</div>
            {(a.commitments || []).map((c,i) => (
              <div key={i} style={{ padding:'9px 12px', background: C.s3, borderRadius:8, marginBottom:8, color: C.t1, fontSize:13, display:'flex', gap:8 }}>
                <span style={{ color: C.accent }}>✓</span>{c}
              </div>
            ))}
            {(!a.commitments || a.commitments.length === 0) && <div style={{ color: C.t3, fontSize:13 }}>Keine expliziten Zusagen erkannt</div>}
          </>
        )}

        {metric.id === 'trustScore' && (
          <div style={{ color: C.t3, fontSize:13, lineHeight:1.8 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: (a.trustScore||0) >= 70 ? C.accent : (a.trustScore||0) >= 50 ? C.amber : C.red, marginBottom:12 }}>{a.trustScore || 0}/100</div>
            <div style={{ height:8, background: C.s3, borderRadius:4, overflow:'hidden', marginBottom:12 }}>
              <div style={{ height:'100%', width:`${a.trustScore||0}%`, background: (a.trustScore||0) >= 70 ? C.accent : (a.trustScore||0) >= 50 ? C.amber : C.red, borderRadius:4 }} />
            </div>
            Basiert auf Offenheit des Kunden, Anzahl seiner Fragen, Zustimmung und Engagement im Gespräch.
          </div>
        )}

        {metric.id === 'emotionalSelling' && (
          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:10 }}>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color: C.accent }}>{a.emotionalSelling || 0}%</div>
              <div style={{ color: C.t3, fontSize:11 }}>emotional · {100-(a.emotionalSelling||0)}% rational</div>
            </div>
            <div style={{ display:'flex', height:10, borderRadius:6, overflow:'hidden', marginBottom:8 }}>
              <div style={{ flex: a.emotionalSelling||0, background: C.accent }} />
              <div style={{ flex: 100-(a.emotionalSelling||0), background: C.s3 }} />
            </div>
            <div style={{ color: C.t3, fontSize:11, marginBottom:16 }}>Ideal: 60–70% emotional + 30–40% rational</div>
            {(a.emotionalMoments || []).length > 0 && (
              <>
                <div style={{ color: C.t2, fontSize:12, fontWeight:700, marginBottom:10 }}>Erkannte emotionale Momente:</div>
                {a.emotionalMoments.map((m, i) => {
                  const typeEmoji = { dream:'🌅', fear:'⚠️', security:'🛡', family:'👨‍👩‍👧', urgency:'⏰' };
                  return (
                    <div key={i} style={{ marginBottom:12, background: C.s3, borderRadius:8, padding:12 }}>
                      <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                        <span>{typeEmoji[m.type] || '💬'}</span>
                        <span style={{ color: C.t1, fontSize:12, lineHeight:1.5 }}>„{m.moment}"</span>
                      </div>
                      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8, marginTop:4 }}>
                        <span style={{ color: C.accent, fontSize:10, fontWeight:700 }}>💡 HÄTTE NOCH: </span>
                        <span style={{ color: C.t2, fontSize:12 }}>{m.missed}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {(!a.emotionalMoments || a.emotionalMoments.length === 0) && (
              <div style={{ color: C.t3, fontSize:13 }}>Keine emotionalen Momente erkannt — Call war sehr sachlich.</div>
            )}
          </div>
        )}

        {metric.id === 'unanswered' && (
          <>
            <div style={{ color: C.t2, fontSize:13, marginBottom:14 }}>
              Fragen des Reps die der Prospect nicht (oder kaum) beantwortet hat:
            </div>
            {(a.unansweredQuestions || []).length === 0
              ? <div style={{ color: C.accent, fontSize:13 }}>✓ Alle Fragen wurden beantwortet</div>
              : (a.unansweredQuestions || []).map((q,i) => (
                <div key={i} style={{ padding:'10px 12px', background: C.redBg, border:`1px solid ${C.red}22`, borderRadius:8, marginBottom:8, color: C.t1, fontSize:13, lineHeight:1.5, display:'flex', gap:8 }}>
                  <span style={{ color: C.red, flexShrink:0 }}>✗</span>{q}
                </div>
              ))
            }
            <div style={{ color: C.t3, fontSize:11, marginTop:12, lineHeight:1.6 }}>
              Tipp: Offene Fragen die nicht beantwortet werden signalisieren mangelnde Rapport oder zu direkte Formulierung.
            </div>
          </>
        )}

        {metric.id === 'questionsAnswered' && (
          <div style={{ color: C.t3, fontSize:13, lineHeight:1.8 }}>
            <div style={{ display:'flex', gap:24, marginBottom:14 }}>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: C.accent }}>{a.questionsAnswered || 0}</div>
                <div style={{ fontSize:11 }}>beantwortet</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: C.t2 }}>{a.questions || 0}</div>
                <div style={{ fontSize:11 }}>gestellt</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: a.questions ? (((a.questionsAnswered||0)/(a.questions||1)*100) >= 70 ? C.accent : C.amber) : C.t3 }}>
                  {a.questions ? Math.round(((a.questionsAnswered||0)/(a.questions||1))*100) : 0}%
                </div>
                <div style={{ fontSize:11 }}>Antwortrate</div>
              </div>
            </div>
            Zeigt wie gut der Rep echtes Interesse weckt. Unter 70% → Fragen zu geschlossen oder zu abstrakt.
          </div>
        )}

        {metric.id === 'objection' && metric.data && (
          <div>
            <div style={{ background: C.redBg, border:`1px solid ${C.red}22`, borderRadius:8, padding:12, marginBottom:14 }}>
              <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Einwand des Kunden</div>
              <div style={{ color: C.t1, fontSize:13 }}>„{metric.data.label}"</div>
            </div>
            <div style={{ background: C.s3, border:`1px solid ${C.borderL}`, borderRadius:8, padding:12, marginBottom:14 }}>
              <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Reaktion des Reps</div>
              <div style={{ color: C.t2, fontSize:13, lineHeight:1.6 }}>{metric.data.repResponse || '—'}</div>
            </div>
            <div style={{ background: C.accentBg, border:`1px solid ${C.accent}22`, borderRadius:8, padding:12 }}>
              <div style={{ color: C.accent, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>💡 Bessere Alternative</div>
              <div style={{ color: C.t1, fontSize:13, lineHeight:1.6 }}>{metric.data.suggestion || '—'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function DetailView({ callId, onBack }) {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [copied, setCopied] = useState(false);
  const [emailLang, setEmailLang] = useState('de');
  const [activeMetric, setActiveMetric] = useState(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const notesTimer = useRef(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [improvement, setImprovement] = useState(null);
  const [loadingImprovement, setLoadingImprovement] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    fetchCall(callId)
      .then(data => { setCall(data); setNotes(data.notes || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [callId]);

  const handleReanalyze = () => {
    setReanalyzing(true);
    reanalyzeCall(callId, () => {})
      .then(updated => { setCall(updated); setReanalyzing(false); })
      .catch(() => setReanalyzing(false));
  };

  const handleImprovement = async () => {
    setLoadingImprovement(true);
    setImprovement(null);
    try {
      const res = await fetch(`/api/calls/${callId}/improve`, { method:'POST' });
      const data = await res.json();
      setImprovement(data.suggestions);
    } catch {
      setImprovement(['Fehler beim Laden der Analyse.']);
    }
    setLoadingImprovement(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`"${call.prospect}" wirklich löschen?`)) return;
    await deleteCall(callId);
    onBack();
  };

  const handleEditSave = async () => {
    const updated = await updateCall(callId, {
      prospect: editData.prospect,
      company: editData.company,
      role: editData.role,
      outcome: editData.outcome,
      // Also update painPoints/email in analysis if changed
      analysis: editData.analysis ? { ...call.analysis, ...editData.analysis } : call.analysis,
    });
    setCall(updated);
    setEditing(false);
    setMenuOpen(false);
  };

  const handlePrint = () => {
    if (!call) return;
    const a = call.analysis || {};
    const kd = typeof a.keyData === 'object' && !Array.isArray(a.keyData) ? a.keyData : {};
    const kdRows = [
      ['Berufsstatus', kd.berufsstatus], ['Studium noch', kd.studiendauer],
      ['Investment-Erfahrung', kd.investingErfahrung], ['Versicherungsinteresse', kd.versicherungsInteresse],
      ['Cashflow', kd.cashflow], ['Einkommen', kd.einkommen],
      ['Ausgaben', kd.ausgaben], ['AV-Bedarf', kd.avBedarf], ['Dream Pension', kd.dreamPension],
    ].filter(([,v]) => v);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CloseIQ — ${call.prospect}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 40px 32px; color: #111; line-height: 1.6; }
      .header { border-bottom: 3px solid #7C3AED; padding-bottom: 16px; margin-bottom: 24px; }
      h1 { font-size: 26px; font-weight: 800; color: #111; }
      .meta { color: #666; font-size: 13px; margin-top: 4px; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #f3eeff; color: #7C3AED; margin-left: 8px; }
      h2 { font-size: 11px; color: #7C3AED; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 10px; }
      .item { padding: 7px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #333; display: flex; gap: 8px; }
      .dot { color: #7C3AED; font-weight: 700; flex-shrink: 0; }
      .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
      .row-label { color: #666; }
      .row-val { font-weight: 600; color: #111; text-align: right; max-width: 60%; }
      .footer { color: #aaa; font-size: 10px; margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; }
    </style></head><body>
    <div class="header">
      <h1>${call.prospect}</h1>
      <div class="meta">${call.role||''} · ${call.company||''} · ${call.date||''} · ${call.duration} Min<span class="badge">${call.outcome}</span></div>
    </div>
    <h2>Pain Points</h2>
    ${(a.painPoints||[]).map(p=>`<div class="item"><span class="dot">▸</span>${p}</div>`).join('')}
    <h2>Einwände</h2>
    ${(a.objections||[]).map(o=>`<div class="item"><span class="dot">•</span>${o.label}${o.count>1?` ×${o.count}`:''}</div>`).join('')}
    ${kdRows.length ? `<h2>Wichtige Infos</h2>${kdRows.map(([l,v])=>`<div class="row"><span class="row-label">${l}</span><span class="row-val">${v}</span></div>`).join('')}` : ''}
    <div class="footer">Generiert mit CloseIQ · ${new Date().toLocaleDateString('de-DE')}</div>
    </body></html>`;

    // Direct download as HTML (opens in browser → print to PDF)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CloseIQ_${call.prospect?.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleNotesChange = (val) => {
    setNotes(val);
    setNotesSaved(false);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      saveNotes(callId, val).then(() => setNotesSaved(true)).catch(() => {});
    }, 800);
  };

  if (loading) return <Spinner />;
  if (!call) return (
    <div style={{ textAlign:'center', padding:'60px 0' }}>
      <div style={{ color: C.t2, fontSize:14, marginBottom:20 }}>Call nicht gefunden.</div>
      <button onClick={onBack} style={{ padding:'10px 20px', background: C.s2, border:`1px solid ${C.border}`, color: C.t1, borderRadius:8, cursor:'pointer', fontSize:14 }}>← Zurück</button>
    </div>
  );

  const a = call.analysis || {};

  const currentEmail = emailLang === 'de' ? (a.emailDE || a.email || '') : (a.emailEN || a.email || '');

  const copy = () => {
    try { navigator.clipboard.writeText(currentEmail); } catch(e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <button onClick={onBack} style={{
        background: C.s1, border:`1.5px solid ${C.border}`, color: C.t2,
        cursor:'pointer', fontSize:12, fontWeight:600, padding:'6px 14px',
        borderRadius:8, display:'inline-flex', alignItems:'center', gap:6,
        marginBottom:18, boxShadow:'0 1px 2px rgba(0,0,0,0.05)',
      }}>
        ← Dashboard
      </button>

      <Card style={{ marginBottom:14, position:'relative' }}>
        {/* 3-dot menu — top right corner */}
        <div style={{ position:'absolute', top:16, right:16 }}>
          <button onClick={() => setMenuOpen(v => !v)} style={{
            width:28, height:28, borderRadius:7, border:`1px solid ${C.border}`,
            background: menuOpen ? C.accentBg : 'transparent', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:2.5,
          }}>
            {[0,1,2].map(i => <div key={i} style={{ width:3, height:3, borderRadius:'50%', background: menuOpen ? C.accent : C.t3 }} />)}
          </button>
          {menuOpen && (
            <div className="fade-in" style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100,
              background:'#fff', border:`1.5px solid ${C.border}`, borderRadius:12,
              boxShadow:'0 8px 24px rgba(0,0,0,0.1)', overflow:'hidden', minWidth:140,
            }} onMouseLeave={() => setMenuOpen(false)}>
              <div onClick={() => { setEditData({ prospect: call.prospect, company: call.company, role: call.role, outcome: call.outcome }); setEditing(true); setMenuOpen(false); }}
                style={{ padding:'11px 16px', cursor:'pointer', fontSize:13, color: C.t1, display:'flex', alignItems:'center', gap:8 }}
                onMouseEnter={e => e.currentTarget.style.background = C.s3}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Icon name="notepad" size={14} color={C.t2} /> Bearbeiten
              </div>
              <div onClick={handleDelete}
                style={{ padding:'11px 16px', cursor:'pointer', fontSize:13, color: C.red, display:'flex', alignItems:'center', gap:8, borderTop:`1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = C.redBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Icon name="close" size={14} color={C.red} /> Löschen
              </div>
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:16, paddingRight:40 }}>
          <ScoreRing score={call.score} size={72} />
          <div>
            <div style={{ color: C.t1, fontSize:18, fontWeight:800 }}>{call.prospect}</div>
            <div style={{ color: C.t2, fontSize:13, marginTop:2 }}>{call.role} · {call.company}</div>
            <div style={{ color: C.t3, fontSize:12, marginTop:3 }}>{call.date} · {call.duration} Min</div>
          </div>
        </div>
        <div style={{ marginTop:12 }}>
        {/* Status badge from kanban or outcome */}
        {(() => {
          const board = (() => { try { return JSON.parse(localStorage.getItem('ciq-kanban')||'{}'); } catch { return {}; } })();
          const col = KANBAN_COLS.find(c => (board[c.id]||[]).includes(call.id));
          return (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {col ? (
                <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:`${col.color}15`, color:col.color, border:`1.5px solid ${col.color}33` }}>
                  {col.label}
                </span>
              ) : (
                <OutcomeBadge outcome={call.outcome} />
              )}
              {a.nextStep && a.followUpDate && (
                <span style={{ padding:'3px 11px', borderRadius:20, fontSize:11, fontWeight:600, background: C.accentBg, color: C.accent }}>
                  📅 {a.followUpDate}
                </span>
              )}
              <button onClick={handlePrint} style={{
                padding:'4px 12px', borderRadius:8, border:`1px solid ${C.borderL}`,
                background: C.s3, color: C.t2, fontSize:11, fontWeight:600,
                cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              }}>
                <Icon name="upload" size={12} color={C.t2} /> PDF
              </button>
            </div>
          );
        })()}
        </div>{/* end marginTop:12 */}

        {/* Edit modal */}
        {editing && (
          <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(241,242,248,0.6)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
            onClick={() => setEditing(false)}>
            <div className="fade-in" style={{ background:'#fff', borderRadius:18, padding:28, maxWidth:500, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700, color:C.t1 }}>Call bearbeiten</div>
                <button onClick={() => setEditing(false)} style={{ background:C.s3, border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="close" size={14} color={C.t2} />
                </button>
              </div>
              {[
                { label:'Prospect Name', key:'prospect', placeholder:'Name' },
                { label:'Status / Unternehmen', key:'company', placeholder:'z.B. Student...' },
                { label:'Rolle', key:'role', placeholder:'z.B. Head of Operations' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:C.t3, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{f.label}</div>
                  <input value={editData[f.key] || ''} onChange={e => setEditData(d => ({...d, [f.key]: e.target.value}))} placeholder={f.placeholder} />
                </div>
              ))}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, color:C.t3, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Call Ergebnis</div>
                <CustomSelect value={editData.outcome || 'kb-scheduled'} onChange={v => setEditData(d => ({...d, outcome:v}))}
                  options={[
                    { value:'kb-scheduled',   label:'KB Scheduled',        color:'#059669' },
                    { value:'not-interested', label:'Not Interested (yet)', color:'#DC2626' },
                  ]} />
              </div>
              <button onClick={handleEditSave} style={{
                width:'100%', padding:'12px', borderRadius:10, border:'none',
                background: C.accent, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer',
                boxShadow:'0 4px 12px rgba(124,58,237,0.3)',
              }}>Speichern</button>
            </div>
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:16, background: C.s1, border:`1.5px solid ${C.border}`, borderRadius:12, padding:4, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        {[['overview','Zusammenfassung'],['metrics','Metriken'],['email','Follow-up Mail'],['notes','Notizen']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, padding:'8px 6px', border:'none', borderRadius:9, cursor:'pointer',
            fontSize:12, fontWeight:600, transition:'all 0.15s',
            background: tab === id ? C.accent : 'transparent',
            color: tab === id ? '#FFFFFF' : C.t2,
            boxShadow: tab === id ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Card className="card-hover">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="pain" size={14} color="#DC2626" />
              </div>
              <SectionLabel style={{ marginBottom:0 }}>Pain Points</SectionLabel>
            </div>
            {(a.painPoints || []).map((p,i) => (
              <div key={i} style={{ padding:'8px 0', borderBottom: i < (a.painPoints.length-1) ? `1px solid ${C.border}` : 'none', color: C.t1, fontSize:13, lineHeight:1.6, display:'flex', gap:10 }}>
                <span style={{ color: C.red, flexShrink:0 }}>▸</span>{p}
              </div>
            ))}
          </Card>
          <Card className="card-hover">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:28, height:28, borderRadius:8, background: C.accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="shield" size={14} color={C.accent} />
              </div>
              <SectionLabel style={{ marginBottom:0 }}>Einwände</SectionLabel>
              <span style={{ color: C.t3, fontSize:10, marginLeft:2 }}>— klicken für Details</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {(a.objections || []).map((o,i) => {
                const oC = { price: C.red, timing: C.amber, internal: C.accent, competition: C.t2, need: C.t2 };
                const oBg = { price: C.redBg, timing: C.amberBg, internal: C.accentBg, competition: C.s3, need: C.s3 };
                return (
                  <span key={i} onClick={() => setActiveMetric({ id:'objection', label: o.label, data: o })}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600,
                      background: oBg[o.type]||C.s3, color: oC[o.type]||C.t2, border:`1px solid ${(oC[o.type]||C.t2)}33`,
                      cursor:'pointer', transition:'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
                    onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    {o.label}{o.count > 1 && <span style={{ opacity:0.6 }}>×{o.count}</span>} <span style={{ opacity:0.5, fontSize:10 }}>›</span>
                  </span>
                );
              })}
              {(!a.objections || a.objections.length === 0) && <span style={{ color: C.t3, fontSize:13 }}>Keine Einwände erkannt</span>}
            </div>
          </Card>
          <Card className="card-hover">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="chat" size={14} color="#D97706" />
              </div>
              <SectionLabel style={{ marginBottom:0 }}>Besprochene Themen</SectionLabel>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {(a.topics || []).map((t,i) => (
                <span key={i} style={{ padding:'4px 12px', background: C.s3, border:`1px solid ${C.borderL}`, color: C.t2, borderRadius:20, fontSize:12 }}>{t}</span>
              ))}
            </div>
          </Card>
          {a.keyData && typeof a.keyData === 'object' && !Array.isArray(a.keyData) && (
            <Card>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:28, height:28, borderRadius:8, background: C.accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="info" size={14} color={C.accent} />
              </div>
              <SectionLabel style={{ marginBottom:0 }}>Wichtige Infos</SectionLabel>
            </div>
              {[
                { emoji:'💼', label:'Berufsstatus',         value: a.keyData.berufsstatus },
                { emoji:'🎓', label:'Studium noch',         value: a.keyData.studiendauer },
                { emoji:'📈', label:'Investment-Erfahrung', value: a.keyData.investingErfahrung },
                { emoji:'🛡', label:'Versicherungsinteresse',value: a.keyData.versicherungsInteresse },
                { emoji:'💵', label:'Cashflow',             value: a.keyData.cashflow },
                { emoji:'💰', label:'Einkommen',            value: a.keyData.einkommen },
                { emoji:'📤', label:'Ausgaben',             value: a.keyData.ausgaben },
                { emoji:'🏦', label:'AV-Bedarf',            value: a.keyData.avBedarf },
                { emoji:'🌅', label:'Dream Pension',        value: a.keyData.dreamPension },
              ].map((row, i, arr) => (
                <div key={i} style={{
                  padding:'10px 0', borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: row.value ? 4 : 0 }}>
                    <span style={{ fontSize:13, lineHeight:1 }}>{row.emoji}</span>
                    <span style={{ color: C.t3, fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{row.label}</span>
                  </div>
                  <div style={{ color: row.value ? C.t1 : C.t3, fontSize:13, lineHeight:1.6, paddingLeft:20 }}>
                    {row.value || '—'}
                  </div>
                </div>
              ))}
              {a.keyData.versicherungen?.length > 0 && (
                <div style={{ marginTop:10, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                  <div style={{ color: C.t3, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Vorhandene Versicherungen</div>
                  {a.keyData.versicherungen.map((v,i) => (
                    <div key={i} style={{ padding:'8px 0', borderBottom: i < a.keyData.versicherungen.length-1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ color: C.t2, fontSize:12, fontWeight:500, marginBottom:2 }}>{v.typ}{v.anbieter ? ` · ${v.anbieter}` : ''}</div>
                      {v.beitrag && <div style={{ color: C.t1, fontSize:13 }}>{v.beitrag}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          {/* Fallback for old array-style keyData */}
          {Array.isArray(a.keyData) && a.keyData.length > 0 && (
            <Card>
              <SectionLabel>📊 Wichtige Infos & Termine</SectionLabel>
              {a.keyData.map((d,i) => (
                <div key={i} style={{ color: C.t1, fontSize:13, padding:'7px 0', borderBottom: i < a.keyData.length-1 ? `1px solid ${C.border}` : 'none', lineHeight:1.5 }}>{d}</div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Card>
            <SectionLabel>Talk / Listen Ratio</SectionLabel>
            {[
              { label:'Du (Rep)', val: a.talk?.rep || 0, color: (a.talk?.rep || 0) <= 50 ? C.accent : C.red },
              { label:'Prospect', val: a.talk?.prospect || 0, color: C.accent },
            ].map((row,i) => (
              <div key={i} style={{ marginBottom: i === 0 ? 12 : 0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color: C.t2, fontSize:12 }}>{row.label}</span>
                  <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color: row.color }}>{row.val}%</span>
                </div>
                <div style={{ height:7, background: C.s3, borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${row.val}%`, background: row.color, borderRadius:4, transition:'width 0.8s ease' }} />
                </div>
              </div>
            ))}
            <div style={{ color: C.t3, fontSize:11, marginTop:10 }}>Gong Benchmark: Rep 43% · Prospect 57%</div>
            {a.interruptions !== undefined && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between' }}>
                <span style={{ color: C.t3, fontSize:11 }}>⚡ Unterbrechungen (Rep)</span>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, color: (a.interruptions||0) <= 3 ? C.accent : (a.interruptions||0) <= 8 ? C.amber : C.red }}>{a.interruptions}</span>
              </div>
            )}
            {a.avgProspectResponseLength !== undefined && (
              <div style={{ marginTop:6, display:'flex', justifyContent:'space-between' }}>
                <span style={{ color: C.t3, fontSize:11 }}>💬 Ø Prospect Antwort</span>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, color: (a.avgProspectResponseLength||0) >= 15 ? C.accent : C.amber }}>{a.avgProspectResponseLength} Wörter</span>
              </div>
            )}
          </Card>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { id:'monologue',  label:'Max Monolog',      value:`${a.monologue || 0}m`,        good: (a.monologue || 0) <= 3,     hint:`Ø ${a.avgMonologue||0}m pro Block` },
              { id:'fillers',    label:'Filler Words',    value: a.fillers ?? '—',               good: (a.fillers || 99) <= 10,     hint:'Klicken für Details' },
              { id:'questions',  label:'Fragen gestellt', value: a.questions ?? '—',             good: (a.questions || 0) >= 9,     hint:'Ideal > 9' },
              { id:'prospectQ',  label:'Prospect Fragen', value: a.prospectQ ?? '—',             good: (a.prospectQ || 0) >= 5,     hint:'Klicken für Details' },
              { id:'nextStep',        label:'Next Step',       value: a.nextStep ? 'Ja ✓' : 'Nein',  good: !!a.nextStep,                                                  hint:'Kritisch für Deal-Progress' },
              { id:'emotionalSelling',label:'Emotional Selling',value:`${a.emotionalSelling??'—'}%`,    good:(a.emotionalSelling||0)>=50&&(a.emotionalSelling||0)<=75,       hint:'Ideal 60–70%' },
            ].map((m,i) => (
              <Card key={i} style={{ cursor:'pointer', transition:'border-color 0.15s' }}
                onClick={() => setActiveMetric(m)}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderL}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{m.label}</div>
                  <span style={{ color: C.t3, fontSize:11 }}>›</span>
                </div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color: m.good ? '#059669' : '#DC2626', marginBottom:4, letterSpacing:'-0.02em' }}>{m.value}</div>
                <div style={{ color: C.t3, fontSize:11 }}>{m.hint}</div>
              </Card>
            ))}
          </div>
          {/* New metric cards row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { id:'jaCount',           label:'Geholte Ja\'s',         value: a.jaCount ?? '—',                                good: (a.jaCount||0) >= 5,  hint:'Klicken für Zusagen' },
              { id:'questionsAnswered', label:'Fragen beantwortet',   value: `${a.questionsAnswered??'—'}/${a.questions??'—'}`, good: (a.questionsAnswered||0)/(a.questions||1) >= 0.7, hint:'Antwortrate' },
              { id:'unanswered',        label:'Unbeantwortete Fragen', value: (a.unansweredQuestions?.length ?? '—'),           good: (a.unansweredQuestions?.length||0) === 0, hint:'Klicken für Details' },
              { id:'trustScore',        label:'Vertrauens-Score',      value: `${a.trustScore ?? '—'}/100`,                    good: (a.trustScore||0) >= 70, hint:'Klicken für Details' },
            ].map((m,i) => (
              <Card key={i} style={{ cursor:'pointer', transition:'border-color 0.15s' }}
                onClick={() => setActiveMetric(m)}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderL}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ color: C.t3, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{m.label}</div>
                  <span style={{ color: C.t3, fontSize:11 }}>›</span>
                </div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color: m.good ? '#059669' : '#DC2626', marginBottom:4 }}>{m.value}</div>
                <div style={{ color: C.t3, fontSize:11 }}>{m.hint}</div>
              </Card>
            ))}
          </div>

          {/* Verbesserungs Analyse button */}
          <button onClick={handleImprovement} disabled={loadingImprovement} style={{
            width:'100%', padding:'13px', borderRadius:12, border:'none',
            background: loadingImprovement ? C.accentBg : `linear-gradient(135deg, #7C3AED, #9333EA)`,
            color: loadingImprovement ? C.accent : '#fff',
            fontSize:14, fontWeight:700, cursor: loadingImprovement ? 'not-allowed' : 'pointer',
            transition:'all 0.2s', marginTop:4,
            boxShadow: loadingImprovement ? 'none' : '0 4px 14px rgba(124,58,237,0.3)',
          }}>
            {loadingImprovement ? '⟳ Analyse läuft…' : '✦ Verbesserungs Analyse'}
          </button>

          {improvement && (
            <div className="fade-up">
              <Card style={{ border:`1.5px solid rgba(124,58,237,0.2)`, background:'rgba(124,58,237,0.02)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:C.accentBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Icon name="trend" size={14} color={C.accent} />
                  </div>
                  <SectionLabel style={{ marginBottom:0, color:C.accent }}>Was du nächstes Mal besser machen kannst</SectionLabel>
                </div>
                {(Array.isArray(improvement) ? improvement : [improvement]).map((s, i) => (
                  <div key={i} style={{ padding:'11px 14px', background:'#fff', borderRadius:10, marginBottom:8, border:`1px solid ${C.border}`, display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:22, height:22, borderRadius:6, background:C.accentBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:800, color:C.accent }}>{i+1}</div>
                    <div style={{ color:C.t1, fontSize:13, lineHeight:1.6 }}>{s}</div>
                  </div>
                ))}
              </Card>
            </div>
          )}

        </div>
      )}

      {tab === 'notes' && (
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <SectionLabel>Notizen zum Kunden</SectionLabel>
            {notesSaved && <span style={{ color: C.accent, fontSize:11, fontWeight:600 }}>✓ Gespeichert</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Notizen zum Kunden, Eindrücke, wichtige Details die im Gespräch aufgefallen sind..."
            style={{ minHeight:220, resize:'vertical', lineHeight:1.7, fontSize:13 }}
          />
          <div style={{ color: C.t3, fontSize:11, marginTop:8 }}>Wird automatisch gespeichert</div>
        </Card>
      )}

      {/* MetricDetail overlay — rendered outside tabs so it works from ANY tab */}
      {activeMetric && <MetricDetail metric={activeMetric} analysis={a} onClose={() => setActiveMetric(null)} />}

      {tab === 'email' && (
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
            <SectionLabel>Follow-up Mail</SectionLabel>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {/* Language toggle */}
              <div style={{ display:'flex', background: C.s3, border:`1px solid ${C.border}`, borderRadius:8, padding:2 }}>
                {[['de','🇩🇪 DE'],['en','🇬🇧 EN']].map(([lang, label]) => (
                  <button key={lang} onClick={() => setEmailLang(lang)} style={{
                    padding:'5px 12px', border:'none', borderRadius:6, cursor:'pointer',
                    fontSize:11, fontWeight:700, transition:'all 0.15s',
                    background: emailLang === lang ? C.accent : 'transparent',
                    color: emailLang === lang ? C.bg : C.t2,
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={copy} style={{
                padding:'7px 16px', background: copied ? C.accentBg : C.s3,
                border:`1px solid ${copied ? C.accent : C.borderL}`,
                color: copied ? C.accent : C.t1, borderRadius:8, cursor:'pointer',
                fontSize:12, fontWeight:700, transition:'all 0.15s',
              }}>{copied ? '✓ Kopiert!' : 'Kopieren'}</button>
            </div>
          </div>
          <pre style={{ color: C.t1, fontSize:13, lineHeight:1.8, whiteSpace:'pre-wrap', fontFamily:"'Syne',sans-serif", background: C.s2, border:`1px solid ${C.border}`, borderRadius:8, padding:16 }}>
            {currentEmail || 'Keine E-Mail generiert.'}
          </pre>
        </Card>
      )}
    </div>
  );
}

// ─── Clients Kanban ───────────────────────────────────────────────────────────
const KANBAN_COLS = [
  { id:'gb',   label:'Abgeschlossene GB',   color:'#7C3AED', bg:'rgba(124,58,237,0.06)'  },
  { id:'kb',   label:'Abgeschlossene KB',   color:'#059669', bg:'rgba(5,150,105,0.06)'   },
  { id:'at',   label:'Abgeschlossene AT',   color:'#D97706', bg:'rgba(217,119,6,0.06)'   },
  { id:'niy',  label:'Not Interested Yet',  color:'#DC2626', bg:'rgba(220,38,38,0.06)'   },
];

function ClientsView({ calls, onSelectCall, board: boardProp, onBoardChange }) {
  const [draggingId, setDraggingId] = useState(null);
  const [showFloating, setShowFloating] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [overCol, setOverCol] = useState(null);
  const draggingIdRef = useRef(null);
  const overColRef = useRef(null);
  const boardRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });   // offset of click within the card
  const dragStartPos = useRef({ x: 0, y: 0 });  // initial mousedown position
  const didDrag = useRef(false);                 // true once mouse moved > 4px

  const getBoard = () => {
    const b = { ...boardProp };
    KANBAN_COLS.forEach(c => { if (!b[c.id]) b[c.id] = []; });
    const allAssigned = Object.values(b).flat();
    calls.forEach(call => { if (!allAssigned.includes(call.id)) b.gb = [...(b.gb || []), call.id]; });
    return b;
  };

  const b = getBoard();
  boardRef.current = b;
  const callMap = Object.fromEntries(calls.map(c => [c.id, c]));
  const dragCall = draggingId ? callMap[draggingId] : null;

  // Global mouse listeners
  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingIdRef.current) return;
      // Check if moved enough to count as drag
      if (!didDrag.current) {
        const dx = Math.abs(e.clientX - dragStartPos.current.x);
        const dy = Math.abs(e.clientY - dragStartPos.current.y);
        if (dx > 4 || dy > 4) {
          didDrag.current = true;
          setShowFloating(true);
        }
        return; // don't move card until drag confirmed
      }
      // Card top-left = cursor - offset (cursor stays at grab point)
      setDragPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };

    const handleUp = () => {
      if (!draggingIdRef.current) return;
      const id = draggingIdRef.current;
      const col = overColRef.current;
      if (col && didDrag.current) {
        const cur = boardRef.current;
        const newB = {};
        KANBAN_COLS.forEach(c => { newB[c.id] = (cur[c.id] || []).filter(i => i !== id); });
        newB[col] = [id, ...(newB[col] || [])];
        onBoardChange(newB);
      }
      draggingIdRef.current = null;
      overColRef.current = null;
      setDraggingId(null);
      setShowFloating(false);
      setOverCol(null);
      // Reset didDrag slightly after so onClick can check it
      setTimeout(() => { didDrag.current = false; }, 50);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [onBoardChange]);

  const startDrag = (e, id) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    draggingIdRef.current = id;
    setDraggingId(id);
    // Initial position so card doesn't jump when drag is confirmed
    setDragPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  };

  return (
    <div className="fade-up" style={{ paddingBottom:40, userSelect:'none' }}>

      {/* Floating dragged card — portal to body so position:fixed is always viewport-relative */}
      {showFloating && dragCall && createPortal(
        <div style={{
          position:'fixed', left: dragPos.x, top: dragPos.y, zIndex:9999,
          width:200, pointerEvents:'none',
          background:'#FFFFFF', borderRadius:12, padding:'12px 14px',
          border:`2px solid ${C.accent}`,
          boxShadow:'0 12px 40px rgba(124,58,237,0.25)',
          transform:'rotate(2deg)',
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div style={{ fontWeight:600, fontSize:13, color:C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
              {dragCall.prospect}
            </div>
            <GradeBadge score={dragCall.score} size={26} />
          </div>
          <div style={{ fontSize:11, color:C.t3 }}>{dragCall.company || '—'}</div>
        </div>,
        document.body
      )}

      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.03em', marginBottom:4 }}>Clients</h1>
        <p style={{ color:C.t2, fontSize:13 }}>Ziehe Kunden per Drag & Drop zwischen den Phasen</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {KANBAN_COLS.map(col => (
          <div key={col.id}
            onMouseEnter={() => { if (draggingIdRef.current) { overColRef.current = col.id; setOverCol(col.id); } }}
            style={{
              background: overCol === col.id && draggingId ? `${col.color}12` : col.bg,
              borderRadius:14, padding:14, minHeight:400,
              border:`1.5px solid ${overCol === col.id && draggingId ? col.color : col.color + '22'}`,
              transition:'all 0.15s',
              cursor: draggingId ? 'copy' : 'default',
            }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:col.color, flexShrink:0 }} />
              <div style={{ fontSize:11, fontWeight:700, color:col.color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{col.label}</div>
              <div style={{ marginLeft:'auto', fontFamily:"'Space Mono',monospace", fontSize:11, color:col.color, fontWeight:700 }}>
                {b[col.id]?.length || 0}
              </div>
            </div>

            {(b[col.id] || []).map(id => {
              const call = callMap[id];
              if (!call) return null;
              const isBeingDragged = draggingId === id;
              return (
                <div key={id}
                  onMouseDown={(e) => startDrag(e, id)}
                  onClick={() => { if (!didDrag.current) onSelectCall && onSelectCall(call); }}
                  style={{
                    background:'#FFFFFF', borderRadius:12, padding:'12px 14px',
                    marginBottom:10,
                    cursor: draggingId ? 'grabbing' : 'grab',
                    border:`1px solid ${C.border}`,
                    boxShadow: isBeingDragged ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
                    opacity: isBeingDragged ? 0 : 1,  // hide original while dragging
                    transition:'opacity 0.1s',
                    userSelect:'none',
                  }}
                  onMouseEnter={e => { if (!draggingId) e.currentTarget.style.boxShadow='0 4px 16px rgba(124,58,237,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:C.t1, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {call.prospect}
                    </div>
                    <GradeBadge score={call.score} size={28} />
                  </div>
                  <div style={{ fontSize:11, color:C.t3 }}>{call.company || '—'} · {call.date?.split(',')[0] || '—'}</div>
                  <div style={{ marginTop:8 }}>
                    <OutcomeBadge outcome={call.outcome} />
                  </div>
                </div>
              );
            })}

            {(b[col.id] || []).length === 0 && (
              <div style={{ textAlign:'center', padding:'30px 10px', color:col.color, opacity: overCol === col.id && draggingId ? 0.8 : 0.4, fontSize:12, fontWeight:600, transition:'opacity 0.15s' }}>
                {overCol === col.id && draggingId ? '⊕ Hier ablegen' : 'Hierher ziehen'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Upload View ──────────────────────────────────────────────────────────────
function UploadView({ onAnalyzed }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [loadLabel, setLoadLabel] = useState('');
  const [error, setError] = useState(null);
  const [prospect, setProspect] = useState('');
  const [company, setCompany] = useState('');
  const [outcome, setOutcome] = useState('kb-scheduled');

  const steps = ['Datei hochladen…', 'Audio transkribieren…', 'Muster erkennen…', 'Einwände klassifizieren…', 'Zusammenfassung erstellen…'];

  const handleAnalyze = async () => {
    if (loading || !file) return;
    setLoading(true);
    setLoadStep(0);
    setLoadLabel(steps[0]);
    setError(null);
    try {
      const call = await analyzeCallStream(
        { file, prospect, company, outcome },
        ({ step, label }) => { setLoadStep(step); setLoadLabel(label); },
      );
      onAnalyzed(call);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth:540, margin:'0 auto', paddingBottom:40 }}>
      <div style={{ color: C.t1, fontSize:24, fontWeight:800, letterSpacing:'-0.02em', marginBottom:6 }}>Neuen Call analysieren</div>
      <div style={{ color: C.t2, fontSize:14, marginBottom:28 }}>Lade deine Teams-Aufnahme hoch und erhalte sofort deine Analyse.</div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if(f) setFile(f); }}
        onClick={() => !loading && document.getElementById('fileInput').click()}
        style={{
          border:`2px dashed ${dragging ? C.accent : file ? C.accentGl : C.border}`,
          borderRadius:12, padding:'36px 20px', textAlign:'center',
          background: dragging ? C.accentBg : file ? 'rgba(0,212,122,0.04)' : C.s1,
          cursor: loading ? 'default' : 'pointer', transition:'all 0.2s', marginBottom:18,
        }}
      >
        <input id="fileInput" type="file" accept="video/*,audio/*,.mp4,.mp3,.m4a,.mov" style={{ display:'none' }}
          onChange={e => { if(e.target.files[0]) setFile(e.target.files[0]); }} />
        {file ? (
          <>
            <div style={{ width:48, height:48, borderRadius:14, background:'rgba(5,150,105,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
              <Icon name="check" size={22} color="#059669" />
            </div>
            <div style={{ color: '#059669', fontWeight:700, fontSize:14 }}>{file.name}</div>
            <div style={{ color: C.t3, fontSize:12, marginTop:4 }}>{(file.size/1024/1024).toFixed(1)} MB · Bereit zur Analyse</div>
          </>
        ) : (
          <>
            <div style={{ width:52, height:52, borderRadius:16, background:C.accentBg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <Icon name="mic" size={24} color={C.accent} />
            </div>
            <div style={{ color: C.t1, fontSize:15, fontWeight:700, marginBottom:4 }}>Teams-Aufnahme hochladen</div>
            <div style={{ color: C.t3, fontSize:13 }}>Drag & Drop oder klicken · MP4, MOV, MP3, M4A</div>
          </>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <div style={{ color: C.t3, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6, textTransform:'uppercase' }}>Prospect Name</div>
            <input value={prospect} onChange={e => setProspect(e.target.value)} placeholder="Jonas Weber" disabled={loading} />
          </div>
          <div>
            <div style={{ color: C.t3, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6, textTransform:'uppercase' }}>Status</div>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="z.B. Student, Angestellt..." disabled={loading} />
          </div>
        </div>
        <div>
          <div style={{ color: C.t3, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6, textTransform:'uppercase' }}>Call Ergebnis</div>
          <CustomSelect
            value={outcome}
            onChange={setOutcome}
            disabled={loading}
            options={[
              { value:'kb-scheduled',   label:'KB Scheduled',       color:'#059669' },
              { value:'not-interested', label:'Not Interested (yet)', color:'#DC2626' },
            ]}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, border:`1px solid ${C.red}33`, borderRadius:8, padding:'12px 16px', color: C.red, fontSize:13, marginBottom:14 }}>
          ⚠ {error}
        </div>
      )}

      <button onClick={handleAnalyze} disabled={loading || !file} style={{
        width:'100%', padding:'15px', borderRadius:12, border:'none',
        cursor: (loading || !file) ? 'not-allowed' : 'pointer',
        background: loading ? C.accentBg : !file ? C.s3 : C.accent,
        color: loading ? C.accent : !file ? C.t3 : '#FFFFFF',
        fontSize:15, fontWeight:700, letterSpacing:'0.01em', transition:'all 0.2s',
        boxShadow: (!loading && file) ? '0 4px 14px rgba(124,58,237,0.35)' : 'none',
      }}>
        {loading ? loadLabel : '🚀  Call analysieren'}
      </button>

      {loading && (
        <div style={{ marginTop:16 }}>
          <div style={{ height:3, background: C.s3, borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:2, background: C.accent, width:`${((loadStep+1)/steps.length)*100}%`, transition:'width 0.5s ease' }} />
          </div>
          <div style={{ color: C.t3, fontSize:12, textAlign:'center', marginTop:8 }}>Schritt {loadStep+1} von {steps.length}</div>
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function CloseIQ() {
  const [view, setView] = useState('dashboard');
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  // Lift kanban board state here so Dashboard always reflects current Clients state
  const [kanbanBoard, setKanbanBoard] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ciq-kanban') || '{}'); } catch { return {}; }
  });

  const updateKanban = (newBoard) => {
    setKanbanBoard(newBoard);
    localStorage.setItem('ciq-kanban', JSON.stringify(newBoard));
  };

  const loadCalls = () => {
    setLoadingCalls(true);
    fetchCalls()
      .then(data => { setCalls(data); setLoadingCalls(false); })
      .catch(() => setLoadingCalls(false));
  };

  useEffect(() => { loadCalls(); }, []);

  const goToCall = (call) => { setSelectedCallId(call.id); setView('detail'); };

  const afterAnalyze = (call) => {
    loadCalls();
    setSelectedCallId(call.id);
    setView('detail');
  };

  const avgScore = calls.length
    ? Math.round(calls.filter(c => c.score).reduce((s, c) => s + c.score, 0) / calls.filter(c => c.score).length)
    : null;

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(145deg, #F0F1F7 0%, #ECEDF5 50%, #F2F0FA 100%)', fontFamily:"'Inter',sans-serif", color: C.t1, display:'flex' }}>
      <style>{FONTS}</style>

      {/* Sidebar */}
      <Sidebar view={view} setView={setView} avgScore={avgScore} />

      {/* Main content area — centered */}
      <div style={{ marginLeft: SIDEBAR_W + 24, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '32px 28px 40px', width: '100%' }}>
        {view === 'dashboard' && (
          <div className="fade-up">
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.03em', marginBottom:4, color: C.t1 }}>Dashboard</h1>
              <p style={{ color: C.t2, fontSize:13 }}>{calls.length} Calls analysiert · Letzte Aktivität {calls[0]?.date?.split(',')[0] || '—'}</p>
            </div>
            <DashboardView calls={calls} onSelectCall={goToCall} loading={loadingCalls} kanbanBoard={kanbanBoard} />
          </div>
        )}
        {view === 'detail' && selectedCallId && (
          <div className="fade-up" style={{ maxWidth:760, margin:'0 auto' }}>
            <DetailView callId={selectedCallId} onBack={() => setView('dashboard')} />
          </div>
        )}
        {view === 'upload' && (
          <div className="fade-up">
            <UploadView onAnalyzed={afterAnalyze} />
          </div>
        )}
        {view === 'clients' && (
          <ClientsView calls={calls} onSelectCall={goToCall} board={kanbanBoard} onBoardChange={updateKanban} />
        )}
        {(view === 'account' || view === 'scoreboard' || view === 'settings') && (
          <div className="fade-up" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:16, background:C.accentBg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Icon name={view === 'account' ? 'user' : view === 'scoreboard' ? 'chart' : 'settings'} size={24} color={C.accent} />
              </div>
              <div style={{ fontWeight:700, fontSize:18, color:C.t1, marginBottom:6 }}>
                {view === 'account' ? 'Account' : view === 'scoreboard' ? 'Scoreboard' : 'Einstellungen'}
              </div>
              <div style={{ color:C.t3, fontSize:13 }}>Demnächst verfügbar</div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
