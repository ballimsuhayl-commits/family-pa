import React from 'react';

const HappyBot = ({ state, onClick }) => (
  <div onClick={onClick} className="relative cursor-pointer active:scale-95 transition-transform">
    {state === 'listening' && <div className="absolute inset-0 bg-sky-200 rounded-full animate-pulse opacity-40 scale-150"></div>}
    {state === 'thinking' && <div className="absolute inset-0 bg-indigo-200 rounded-full animate-pulse opacity-40 scale-125"></div>}
    <div className={`w-32 h-32 ${state === 'listening' ? 'scale-110' : 'animate-float'}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl">
        <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#f8fafc"/><stop offset="100%" stopColor="#cbd5e1"/></linearGradient></defs>
        <g className={state === 'listening' ? "animate-wiggle" : ""}><path d="M50,25 Q50,15 60,10" fill="none" stroke="#94a3b8" strokeWidth="2"/><circle cx="60" cy="10" r="4" fill={state === 'listening' ? "#ef4444" : "#fbbf24"}/></g>
        <rect x="22" y="25" width="56" height="50" rx="20" fill="url(#g)" stroke="#94a3b8" strokeWidth="1"/>
        <rect x="28" y="34" width="44" height="28" rx="10" fill="#1e293b"/>
        <g className="animate-blink"><ellipse cx="40" cy="48" rx="4" ry="6" fill="#38bdf8"/><ellipse cx="60" cy="48" rx="4" ry="6" fill="#38bdf8"/></g>
        {state === 'thinking' ? (
          <path d="M46,56 Q50,53 54,56" fill="none" stroke="#fbbf24" strokeWidth="2">
            <animate attributeName="d" values="M46,56 Q50,53 54,56; M46,56 Q50,59 54,56; M46,56 Q50,53 54,56" dur="0.4s" repeatCount="indefinite"/>
          </path>
        ) : (
          <path d="M45,55 Q50,58 55,55" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
        )}
      </svg>
    </div>
  </div>
);

export default HappyBot;