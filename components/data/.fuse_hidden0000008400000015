"use client";

import { useState } from "react";

interface BodyRegion {
  name: string;
  fat: number;
  lean: number;
  bone: number;
  total: number;
}

const bodyData: BodyRegion[] = [
  { name: "Head", fat: 2.1, lean: 4.8, bone: 1.2, total: 8.1 },
  { name: "Trunk", fat: 14.8, lean: 42.3, bone: 1.6, total: 58.7 },
  { name: "Arms", fat: 3.2, lean: 8.4, bone: 0.6, total: 12.2 },
  { name: "Legs", fat: 8.6, lean: 24.2, bone: 1.8, total: 34.6 },
];

function BodySilhouette({ view }: { view: "composition" | "skeletal" }) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  if (view === "skeletal") {
    return (
      <svg viewBox="0 0 200 500" className="w-full h-full max-h-[500px]">
        <defs>
          <filter id="skeletalGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="boneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0e0e0" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c0c0c0" />
          </linearGradient>
        </defs>
        
        {/* Background glow */}
        <ellipse cx="100" cy="250" rx="70" ry="200" fill="rgba(0, 212, 255, 0.03)" />
        
        {/* Skull */}
        <ellipse cx="100" cy="40" rx="28" ry="35" fill="none" stroke="url(#boneGradient)" strokeWidth="2" filter="url(#skeletalGlow)" />
        <ellipse cx="100" cy="45" rx="20" ry="25" fill="none" stroke="url(#boneGradient)" strokeWidth="1" opacity="0.5" />
        {/* Eye sockets */}
        <ellipse cx="88" cy="38" rx="8" ry="6" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" />
        <ellipse cx="112" cy="38" rx="8" ry="6" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" />
        {/* Nasal */}
        <path d="M100 45 L96 58 L104 58 Z" fill="none" stroke="url(#boneGradient)" strokeWidth="1" />
        {/* Jaw */}
        <path d="M72 50 Q72 75 100 80 Q128 75 128 50" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" />
        
        {/* Cervical spine */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={`cervical-${i}`} x="96" y={85 + i * 8} width="8" height="6" rx="2" fill="url(#boneGradient)" opacity="0.9" filter="url(#skeletalGlow)" />
        ))}
        
        {/* Clavicles */}
        <path d="M68 140 Q84 135 100 140 Q116 135 132 140" fill="none" stroke="url(#boneGradient)" strokeWidth="3" strokeLinecap="round" filter="url(#skeletalGlow)" />
        
        {/* Scapulae */}
        <path d="M55 145 L55 190 L75 180 L75 150 Z" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" opacity="0.6" />
        <path d="M145 145 L145 190 L125 180 L125 150 Z" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" opacity="0.6" />
        
        {/* Ribcage */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
          <path
            key={`rib-${i}`}
            d={`M${88 - i * 0.5} ${150 + i * 10} Q${65 - i * 2} ${155 + i * 10} ${60 - i * 1.5} ${165 + i * 9} M${112 + i * 0.5} ${150 + i * 10} Q${135 + i * 2} ${155 + i * 10} ${140 + i * 1.5} ${165 + i * 9}`}
            fill="none"
            stroke="url(#boneGradient)"
            strokeWidth="1.5"
            opacity={0.7 - i * 0.03}
            filter="url(#skeletalGlow)"
          />
        ))}
        
        {/* Sternum */}
        <rect x="97" y="145" width="6" height="80" rx="2" fill="url(#boneGradient)" opacity="0.8" filter="url(#skeletalGlow)" />
        
        {/* Thoracic & Lumbar spine */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i) => (
          <rect key={`spine-${i}`} x="95" y={145 + i * 12} width="10" height="10" rx="2" fill="url(#boneGradient)" opacity="0.85" filter="url(#skeletalGlow)" />
        ))}
        
        {/* Pelvis */}
        <path d="M60 350 Q60 380 100 390 Q140 380 140 350 L130 340 Q100 355 70 340 Z" fill="none" stroke="url(#boneGradient)" strokeWidth="2.5" filter="url(#skeletalGlow)" />
        <ellipse cx="78" cy="365" rx="12" ry="15" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" />
        <ellipse cx="122" cy="365" rx="12" ry="15" fill="none" stroke="url(#boneGradient)" strokeWidth="1.5" />
        {/* Sacrum */}
        <path d="M90 345 L100 390 L110 345" fill="none" stroke="url(#boneGradient)" strokeWidth="2" />
        
        {/* Left Arm */}
        {/* Humerus */}
        <rect x="42" y="145" width="10" height="70" rx="4" fill="url(#boneGradient)" opacity="0.9" transform="rotate(-5 47 180)" filter="url(#skeletalGlow)" />
        {/* Radius & Ulna */}
        <rect x="38" y="220" width="5" height="75" rx="2" fill="url(#boneGradient)" opacity="0.85" transform="rotate(-3 40 257)" filter="url(#skeletalGlow)" />
        <rect x="46" y="220" width="5" height="75" rx="2" fill="url(#boneGradient)" opacity="0.85" transform="rotate(-3 48 257)" filter="url(#skeletalGlow)" />
        {/* Hand */}
        <rect x="35" y="298" width="20" height="15" rx="3" fill="url(#boneGradient)" opacity="0.8" filter="url(#skeletalGlow)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={`lf-${i}`} x={36 + i * 4} y="315" width="3" height={20 - Math.abs(i - 2) * 3} rx="1" fill="url(#boneGradient)" opacity="0.75" />
        ))}
        
        {/* Right Arm */}
        {/* Humerus */}
        <rect x="148" y="145" width="10" height="70" rx="4" fill="url(#boneGradient)" opacity="0.9" transform="rotate(5 153 180)" filter="url(#skeletalGlow)" />
        {/* Radius & Ulna */}
        <rect x="149" y="220" width="5" height="75" rx="2" fill="url(#boneGradient)" opacity="0.85" transform="rotate(3 151 257)" filter="url(#skeletalGlow)" />
        <rect x="157" y="220" width="5" height="75" rx="2" fill="url(#boneGradient)" opacity="0.85" transform="rotate(3 159 257)" filter="url(#skeletalGlow)" />
        {/* Hand */}
        <rect x="145" y="298" width="20" height="15" rx="3" fill="url(#boneGradient)" opacity="0.8" filter="url(#skeletalGlow)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={`rf-${i}`} x={146 + i * 4} y="315" width="3" height={20 - Math.abs(i - 2) * 3} rx="1" fill="url(#boneGradient)" opacity="0.75" />
        ))}
        
        {/* Left Leg */}
        {/* Femur */}
        <rect x="70" y="390" width="14" height="100" rx="5" fill="url(#boneGradient)" opacity="0.9" transform="rotate(3 77 440)" filter="url(#skeletalGlow)" />
        {/* Patella */}
        <ellipse cx="75" cy="490" rx="8" ry="10" fill="url(#boneGradient)" opacity="0.8" />
        {/* Tibia & Fibula */}
        <rect x="68" y="500" width="8" height="90" rx="3" fill="url(#boneGradient)" opacity="0.85" transform="rotate(1 72 545)" filter="url(#skeletalGlow)" />
        <rect x="78" y="502" width="5" height="85" rx="2" fill="url(#boneGradient)" opacity="0.8" transform="rotate(1 80 545)" />
        {/* Foot */}
        <path d="M60 592 L85 592 L88 600 L55 600 Z" fill="url(#boneGradient)" opacity="0.8" />
        
        {/* Right Leg */}
        {/* Femur */}
        <rect x="116" y="390" width="14" height="100" rx="5" fill="url(#boneGradient)" opacity="0.9" transform="rotate(-3 123 440)" filter="url(#skeletalGlow)" />
        {/* Patella */}
        <ellipse cx="125" cy="490" rx="8" ry="10" fill="url(#boneGradient)" opacity="0.8" />
        {/* Tibia & Fibula */}
        <rect x="117" y="500" width="5" height="85" rx="2" fill="url(#boneGradient)" opacity="0.8" transform="rotate(-1 119 545)" />
        <rect x="124" y="500" width="8" height="90" rx="3" fill="url(#boneGradient)" opacity="0.85" transform="rotate(-1 128 545)" filter="url(#skeletalGlow)" />
        {/* Foot */}
        <path d="M115 592 L140 592 L145 600 L112 600 Z" fill="url(#boneGradient)" opacity="0.8" />
      </svg>
    );
  }

  // Composition view with heat map
  return (
    <svg viewBox="0 0 200 500" className="w-full h-full max-h-[500px]">
      <defs>
        <linearGradient id="fatGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff4444" />
          <stop offset="50%" stopColor="#ffaa00" />
          <stop offset="100%" stopColor="#ff6600" />
        </linearGradient>
        <linearGradient id="leanGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0066ff" />
          <stop offset="50%" stopColor="#0088ff" />
          <stop offset="100%" stopColor="#00aaff" />
        </linearGradient>
        <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b35" />
          <stop offset="20%" stopColor="#f7c59f" />
          <stop offset="40%" stopColor="#00b4d8" />
          <stop offset="60%" stopColor="#0077b6" />
          <stop offset="80%" stopColor="#f7c59f" />
          <stop offset="100%" stopColor="#ff6b35" />
        </linearGradient>
        <filter id="bodyGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="bodyClip">
          <path d="M100 10 
            Q130 10 130 45 Q130 70 115 85 
            L115 90 L130 95 Q155 100 160 140 L160 145 
            Q175 150 175 200 L175 300 Q175 320 160 325 
            L140 325 Q135 325 135 340 L135 345 
            Q145 350 145 365 L145 380 
            Q145 395 130 395 L120 395 
            Q125 400 130 440 Q135 490 125 500 
            L75 500 Q65 490 70 440 Q75 400 80 395 
            L70 395 Q55 395 55 380 L55 365 
            Q55 350 65 345 L65 340 Q65 325 60 325 
            L40 325 Q25 320 25 300 L25 200 
            Q25 150 40 145 L40 140 Q45 100 70 95 
            L85 90 L85 85 Q70 70 70 45 Q70 10 100 10 Z" />
        </clipPath>
      </defs>
      
      {/* Body outline */}
      <g filter="url(#bodyGlow)">
        {/* Head */}
        <ellipse 
          cx="100" cy="45" rx="30" ry="38" 
          fill="url(#leanGradient)" 
          opacity={hoveredRegion === "Head" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Head")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        
        {/* Neck */}
        <rect x="88" y="80" width="24" height="25" fill="url(#leanGradient)" opacity="0.8" />
        
        {/* Torso - Main trunk with composition colors */}
        <path 
          d="M65 105 Q50 110 45 150 L40 250 Q38 300 55 330 L65 340 Q70 345 75 340 L80 330 
             L80 340 L120 340 L120 330 L125 340 Q130 345 135 340 L145 330 Q162 300 160 250 
             L155 150 Q150 110 135 105 Z"
          fill="url(#bodyGradient)"
          opacity={hoveredRegion === "Trunk" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Trunk")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        
        {/* Left Arm */}
        <path 
          d="M45 110 Q25 115 20 150 L15 250 Q12 280 20 290 L35 295 Q42 292 45 280 L50 200 L55 150 Q58 120 50 110 Z"
          fill="url(#leanGradient)"
          opacity={hoveredRegion === "Arms" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Arms")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        {/* Left Hand */}
        <ellipse cx="27" cy="305" rx="12" ry="18" fill="url(#leanGradient)" opacity="0.8" />
        
        {/* Right Arm */}
        <path 
          d="M155 110 Q175 115 180 150 L185 250 Q188 280 180 290 L165 295 Q158 292 155 280 L150 200 L145 150 Q142 120 150 110 Z"
          fill="url(#leanGradient)"
          opacity={hoveredRegion === "Arms" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Arms")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        {/* Right Hand */}
        <ellipse cx="173" cy="305" rx="12" ry="18" fill="url(#leanGradient)" opacity="0.8" />
        
        {/* Left Leg */}
        <path 
          d="M80 340 L75 400 Q70 450 68 480 L65 550 Q63 580 70 590 L90 595 Q98 592 95 580 L90 500 L95 420 L100 340 Z"
          fill="url(#bodyGradient)"
          opacity={hoveredRegion === "Legs" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Legs")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        {/* Left Foot */}
        <ellipse cx="78" cy="600" rx="15" ry="8" fill="url(#leanGradient)" opacity="0.8" />
        
        {/* Right Leg */}
        <path 
          d="M120 340 L100 340 L105 420 L110 500 L105 580 Q102 592 110 595 L130 590 Q137 580 135 550 L132 480 Q130 450 125 400 L120 340 Z"
          fill="url(#bodyGradient)"
          opacity={hoveredRegion === "Legs" ? 1 : 0.85}
          onMouseEnter={() => setHoveredRegion("Legs")}
          onMouseLeave={() => setHoveredRegion(null)}
          className="cursor-pointer transition-opacity"
        />
        {/* Right Foot */}
        <ellipse cx="122" cy="600" rx="15" ry="8" fill="url(#leanGradient)" opacity="0.8" />
      </g>
      
      {/* Hover info */}
      {hoveredRegion && (
        <g>
          <rect x="5" y="5" width="90" height="60" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00d4ff" strokeWidth="1" />
          <text x="10" y="22" fill="#00d4ff" fontSize="10" fontFamily="monospace">{hoveredRegion.toUpperCase()}</text>
          <text x="10" y="38" fill="#ffffff" fontSize="9" fontFamily="monospace">
            Fat: {bodyData.find(b => b.name === hoveredRegion)?.fat} lb
          </text>
          <text x="10" y="52" fill="#ffffff" fontSize="9" fontFamily="monospace">
            Lean: {bodyData.find(b => b.name === hoveredRegion)?.lean} lb
          </text>
        </g>
      )}
    </svg>
  );
}

function CompositionBar({ optimal, inRange, outOfRange }: { optimal: number; inRange: number; outOfRange: number }) {
  const total = optimal + inRange + outOfRange;
  return (
    <div className="flex h-2 rounded-full overflow-hidden">
      <div 
        className="bg-emerald-500" 
        style={{ width: `${(optimal / total) * 100}%` }}
      />
      <div 
        className="bg-yellow-500" 
        style={{ width: `${(inRange / total) * 100}%` }}
      />
      <div 
        className="bg-pink-500" 
        style={{ width: `${(outOfRange / total) * 100}%` }}
      />
    </div>
  );
}

function BMIScale({ bmi }: { bmi: number }) {
  const position = Math.min(Math.max(((bmi - 15) / 25) * 100, 0), 100);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Underweight</span>
        <span>Normal</span>
        <span>Overweight</span>
        <span>Obese</span>
      </div>
      <div className="relative">
        <div className="flex h-3 rounded-full overflow-hidden">
          <div className="bg-cyan-500 w-[18%]" />
          <div className="bg-emerald-500 w-[22%]" />
          <div className="bg-yellow-500 w-[20%]" />
          <div className="bg-orange-500 w-[20%]" />
          <div className="bg-red-500 w-[20%]" />
        </div>
        <div 
          className="absolute top-0 w-0.5 h-5 bg-white shadow-lg shadow-white/50"
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>15</span>
        <span>18.5</span>
        <span>25</span>
        <span>30</span>
        <span>40</span>
      </div>
    </div>
  );
}

function BodyFatChart() {
  const dataPoints = [
    { age: 20, fat: 18 },
    { age: 25, fat: 19 },
    { age: 28, fat: 18.5 },
    { age: 30, fat: 20 },
    { age: 35, fat: 22 },
    { age: 40, fat: 24 },
  ];
  
  const currentAge = 28;
  const currentFat = 18.5;
  
  return (
    <div className="space-y-2">
      <span className="text-xs font-mono text-cyan-400">BODY FAT % TREND</span>
      <svg viewBox="0 0 300 120" className="w-full h-24">
        <defs>
          <linearGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0088ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0088ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="30" y1={20 + i * 20} x2="290" y2={20 + i * 20} stroke="#1e3a5f" strokeWidth="0.5" />
        ))}
        
        {/* Y-axis labels */}
        <text x="5" y="25" fill="#64748b" fontSize="8" fontFamily="monospace">40%</text>
        <text x="5" y="65" fill="#64748b" fontSize="8" fontFamily="monospace">20%</text>
        <text x="5" y="105" fill="#64748b" fontSize="8" fontFamily="monospace">0%</text>
        
        {/* Area fill */}
        <path
          d={`M30 ${100 - dataPoints[0].fat * 2} ${dataPoints.map((p, i) => `L ${30 + i * 52} ${100 - p.fat * 2}`).join(' ')} L 290 100 L 30 100 Z`}
          fill="url(#chartFill)"
        />
        
        {/* Line */}
        <path
          d={`M30 ${100 - dataPoints[0].fat * 2} ${dataPoints.map((p, i) => `L ${30 + i * 52} ${100 - p.fat * 2}`).join(' ')}`}
          fill="none"
          stroke="#0088ff"
          strokeWidth="2"
        />
        
        {/* Current point */}
        <circle cx={30 + 2 * 52} cy={100 - currentFat * 2} r="6" fill="#00d4ff" />
        <circle cx={30 + 2 * 52} cy={100 - currentFat * 2} r="10" fill="none" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
        
        {/* X-axis labels */}
        {dataPoints.map((p, i) => (
          <text key={i} x={30 + i * 52} y="115" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">
            {p.age}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function BodyComposition() {
  const [view, setView] = useState<"composition" | "skeletal">("composition");
  
  const totalWeight = 171.8;
  const fatMass = 28.7;
  const leanMass = 139.7;
  const boneMass = 3.4;
  const bodyFatPercent = (fatMass / totalWeight * 100).toFixed(1);
  const bmi = 24.7;
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-mono text-cyan-400 block">DEXA BODY COMPOSITION</span>
          <span className="text-xs text-muted-foreground">Last scan: Jan 15, 2026</span>
        </div>
        <div className="flex gap-1 p-1 bg-cyan-950/30 rounded-lg border border-cyan-500/20">
          <button
            onClick={() => setView("composition")}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
              view === "composition" 
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Composition
          </button>
          <button
            onClick={() => setView("skeletal")}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
              view === "skeletal" 
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Skeletal
          </button>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Left - Stats */}
        <div className="space-y-4">
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <span className="text-xs font-mono text-cyan-400 block mb-3">TOTAL MASS</span>
            <div className="text-3xl font-bold text-foreground">{totalWeight}<span className="text-lg text-muted-foreground ml-1">lb</span></div>
          </div>
          
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <span className="text-xs font-mono text-cyan-400 block mb-3">COMPOSITION</span>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 to-orange-500" />
                  <span className="text-xs text-muted-foreground">Fat</span>
                </div>
                <span className="text-sm font-bold text-foreground">{fatMass} lb</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
                  <span className="text-xs text-muted-foreground">Lean</span>
                </div>
                <span className="text-sm font-bold text-foreground">{leanMass} lb</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-gray-300 to-white" />
                  <span className="text-xs text-muted-foreground">Bone</span>
                </div>
                <span className="text-sm font-bold text-foreground">{boneMass} lb</span>
              </div>
            </div>
          </div>
          
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <span className="text-xs font-mono text-cyan-400 block mb-3">BODY FAT</span>
            <div className="text-3xl font-bold text-foreground">{bodyFatPercent}<span className="text-lg text-muted-foreground ml-1">%</span></div>
            <div className="mt-2 text-xs text-emerald-400">Athletic range</div>
          </div>
        </div>
        
        {/* Center - Body Visualization */}
        <div className="flex items-center justify-center">
          <BodySilhouette view={view} />
        </div>
        
        {/* Right - Charts & BMI */}
        <div className="space-y-4">
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <span className="text-xs font-mono text-cyan-400 block mb-3">BMI CLASSIFICATION</span>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-foreground">{bmi}</span>
              <span className="text-sm text-emerald-400">Normal</span>
            </div>
            <BMIScale bmi={bmi} />
          </div>
          
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <BodyFatChart />
          </div>
          
          <div className="glass rounded-xl p-4 border border-cyan-500/20">
            <span className="text-xs font-mono text-cyan-400 block mb-3">REGIONAL ANALYSIS</span>
            <CompositionBar optimal={56} inRange={12} outOfRange={4} />
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-emerald-400">78% Optimal</span>
              <span className="text-yellow-400">17% In Range</span>
              <span className="text-pink-400">5% Out</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Region breakdown table */}
      <div className="mt-4 glass rounded-xl p-4 border border-cyan-500/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground font-mono">
              <th className="text-left pb-2">REGION</th>
              <th className="text-right pb-2">FAT (lb)</th>
              <th className="text-right pb-2">LEAN (lb)</th>
              <th className="text-right pb-2">BONE (lb)</th>
              <th className="text-right pb-2">TOTAL (lb)</th>
              <th className="text-right pb-2">FAT %</th>
            </tr>
          </thead>
          <tbody>
            {bodyData.map((region) => (
              <tr key={region.name} className="border-t border-cyan-500/10">
                <td className="py-2 text-foreground">{region.name}</td>
                <td className="py-2 text-right text-orange-400">{region.fat}</td>
                <td className="py-2 text-right text-cyan-400">{region.lean}</td>
                <td className="py-2 text-right text-gray-300">{region.bone}</td>
                <td className="py-2 text-right text-foreground">{region.total}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {((region.fat / region.total) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
