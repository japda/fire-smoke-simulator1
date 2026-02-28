/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, DoorOpen, Wind, User, UserCheck, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export default function App() {
  const [intensity, setIntensity] = useState<number>(1);
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [smokeHeight, setSmokeHeight] = useState(0);
  const [doorOpen, setDoorOpen] = useState(false);
  const [leftVentOn, setLeftVentOn] = useState(false);
  const [rightVentOn, setRightVentOn] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [personCrouch, setPersonCrouch] = useState(false);
  const [fireX, setFireX] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const houseRef = useRef<HTMLDivElement>(null);
  const fireIntensityRef = useRef(1);
  const smokeParticlesRef = useRef<SmokeParticle[]>([]);
  const smokeLayerRef = useRef<number[]>([]);
  const ventSoundRef = useRef<HTMLAudioElement | null>(null);

  const pxPerCm = 1 / 5;
  const personHeight = personCrouch ? 100 : 180;

  // Initialize smoke layer and fire position
  useEffect(() => {
    const init = () => {
      if (houseRef.current) {
        const width = houseRef.current.clientWidth;
        if (width > 0) {
          smokeLayerRef.current = new Array(Math.ceil(width)).fill(0);
          setFireX(width * 0.15);
        }
      }
    };
    init();
    window.addEventListener('resize', init);
    return () => window.removeEventListener('resize', init);
  }, []);

  const drawFire = useCallback((ctx: CanvasRenderingContext2D, canvasHeight: number, x: number) => {
    fireIntensityRef.current += 0.01 * simSpeed;
    const numFlames = Math.floor(15 * Math.min(fireIntensityRef.current, 10));
    for (let i = 0; i < numFlames; i++) {
      const flameX = x + Math.random() * 10 - 5;
      const flameY = canvasHeight - 40 - Math.random() * 30;
      const gradient = ctx.createRadialGradient(flameX, flameY, 2, flameX, flameY, 15);
      gradient.addColorStop(0, 'yellow');
      gradient.addColorStop(0.5, 'orange');
      gradient.addColorStop(1, 'red');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(flameX, canvasHeight - 40);
      ctx.lineTo(flameX - 5, flameY);
      ctx.lineTo(flameX + 5, flameY);
      ctx.closePath();
      ctx.fill();
    }
  }, [simSpeed]);

  const createSmokeParticles = useCallback((currentIntensity: number, x: number, canvasHeight: number) => {
    // Scale particle count by intensity and simulation speed
    const num = Math.floor(2 * currentIntensity * Math.min(fireIntensityRef.current, 5) * simSpeed);
    for (let i = 0; i < num; i++) {
      smokeParticlesRef.current.push({
        x: x + Math.random() * 20 - 10,
        y: canvasHeight - 40,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - currentIntensity * 1.2,
        size: 5 + Math.random() * 8,
        alpha: 0.7
      });
    }
  }, [simSpeed]);

  const updateSmoke = useCallback((canvasWidth: number, canvasHeight: number, isDoorOpen: boolean, isLeftVentOn: boolean, isRightVentOn: boolean) => {
    const particles = smokeParticlesRef.current;
    const doorTop = canvasHeight - 40 - 90;
    const wallX = canvasWidth / 2;

    // Ensure smoke layer is initialized
    if (smokeLayerRef.current.length === 0 && canvasWidth > 0) {
      smokeLayerRef.current = new Array(Math.ceil(canvasWidth)).fill(0);
    }

    // Physics constants
    const driftStrength = 0.05;
    const gravityEffect = 0.02;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Natural Drift / Turbulence
      p.vx += (Math.random() - 0.5) * driftStrength;
      p.vy += (Math.random() - 0.5) * driftStrength;

      // Wall and Door collision (Enhanced blocking)
      if (p.x > wallX - 8 && p.x < wallX + 8) {
        if (p.y < doorTop) {
          p.vx *= -0.5;
          p.x = p.x < wallX ? wallX - 9 : wallX + 9;
        } else if (!isDoorOpen && p.y >= doorTop) {
          p.vx *= -0.5;
          p.x = p.x < wallX ? wallX - 9 : wallX + 9;
        }
      }

      // Independent Vent suction
      if (isRightVentOn && p.x > canvasWidth - 80) {
        p.vx += (canvasWidth - p.x) * 0.01;
        p.vy += (50 - p.y) * 0.01;
        p.alpha -= 0.04;
      }
      if (isLeftVentOn && p.x < 80) {
        p.vx += (0 - p.x) * 0.01;
        p.vy += (50 - p.y) * 0.01;
        p.alpha -= 0.04;
      }

      p.x += p.vx * simSpeed;
      p.y += p.vy * simSpeed;

      // Ceiling accumulation (Faster rate as requested)
      const topPx = 20;
      if (p.y < topPx) {
        const ix = Math.floor(p.x);
        if (ix >= 0 && ix < smokeLayerRef.current.length) {
          // Base accumulation increased from 1.2 to 2.5 for "Faster" feel
          smokeLayerRef.current[ix] += 2.5; 
        }
        particles.splice(i, 1);
        continue;
      }

      p.alpha -= 0.003 * simSpeed;
      if (p.y < 0 || p.alpha <= 0 || p.x < 0 || p.x > canvasWidth) {
        particles.splice(i, 1);
      }
    }

    // Smoke Layer Diffusion and Vent Reduction
    const layer = smokeLayerRef.current;
    if (layer.length === 0) return;
    
    const nextLayer = [...layer];
    // Increased diffusion for smoother "drift" look
    const diffusionRate = 0.3 * simSpeed;
    
    for (let x = 0; x < layer.length; x++) {
      // Natural Drift of the layer itself (Subtle horizontal movement)
      const layerDrift = Math.sin(time * 0.1 + x * 0.05) * 0.1;
      nextLayer[x] += layerDrift;

      // Diffusion (spreading horizontally)
      if (x > 0 && x < layer.length - 1) {
        const isWall = x > wallX - 5 && x < wallX + 5;
        const canDiffuse = isDoorOpen || !isWall;
        
        if (canDiffuse) {
          const diff = (layer[x-1] + layer[x+1] - 2 * layer[x]) * diffusionRate;
          nextLayer[x] += diff;
        } else {
          if (x === Math.floor(wallX) - 5) {
             nextLayer[x] += (layer[x-1] - layer[x]) * diffusionRate;
          } else if (x === Math.floor(wallX) + 5) {
             nextLayer[x] += (layer[x+1] - layer[x]) * diffusionRate;
          }
        }
      }

      // Vent reduction (Stronger suction effect)
      if (isLeftVentOn && x < 150) {
        nextLayer[x] -= 1.5 * simSpeed;
      }
      if (isRightVentOn && x > layer.length - 150) {
        nextLayer[x] -= 1.5 * simSpeed;
      }
      
      // Natural settling/cooling (smoke eventually thins out)
      nextLayer[x] -= 0.02 * simSpeed;
      if (nextLayer[x] < 0) nextLayer[x] = 0;
    }
    smokeLayerRef.current = nextLayer;
  }, [simSpeed, time]);

  const drawSimulation = useCallback((currentFireX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFire(ctx, canvas.height, currentFireX);

    const layer = smokeLayerRef.current;
    if (layer.length === 0) return;

    const maxVal = layer.reduce((a, b) => Math.max(a, b), 0);
    
    const smokeGradient = ctx.createLinearGradient(0, 20, 0, 20 + Math.max(maxVal, 10));
    smokeGradient.addColorStop(0, 'rgba(15, 15, 15, 0.98)');
    smokeGradient.addColorStop(1, 'rgba(40, 40, 40, 0.6)');
    ctx.fillStyle = smokeGradient;
    
    ctx.beginPath();
    ctx.moveTo(0, 20);
    for (let x = 0; x < layer.length; x++) {
      // Add a bit of visual "noise" to the bottom of the smoke layer
      const noise = Math.sin(time * 0.2 + x * 0.1) * 2;
      ctx.lineTo(x, 20 + layer[x] + noise);
    }
    ctx.lineTo(layer.length, 20);
    ctx.lineTo(0, 20);
    ctx.closePath();
    ctx.fill();

    smokeParticlesRef.current.forEach(p => {
      ctx.fillStyle = `rgba(50, 50, 50, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
      ctx.fill();
    });

    setSmokeHeight(Math.floor(maxVal / pxPerCm));
  }, [drawFire, pxPerCm, time]);

  // Main simulation loop
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTime(prev => prev + simSpeed);
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      createSmokeParticles(intensity, fireX, canvasHeight);
      updateSmoke(canvasWidth, canvasHeight, doorOpen, leftVentOn, rightVentOn);
      drawSimulation(fireX);
    }, 50);

    return () => clearInterval(interval);
  }, [isRunning, intensity, fireX, doorOpen, leftVentOn, rightVentOn, simSpeed, createSmokeParticles, updateSmoke, drawSimulation]);

  // Handle canvas sizing separately to avoid flickering on state changes
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (canvas && houseRef.current) {
        canvas.width = houseRef.current.clientWidth;
        canvas.height = houseRef.current.clientHeight;
        // Redraw once after resize if running
        if (isRunning) drawSimulation(fireX);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [isRunning, fireX, drawSimulation]);

  const startSimulation = () => {
    setIsRunning(true);
  };

  const toggleSimSpeed = () => {
    setSimSpeed(prev => {
      if (prev === 1) return 2;
      if (prev === 2) return 4;
      return 1;
    });
  };

  const resetSimulation = () => {
    setIsRunning(false);
    setTime(0);
    setSmokeHeight(0);
    setSimSpeed(1);
    fireIntensityRef.current = 1;
    smokeParticlesRef.current = [];
    if (houseRef.current) {
      smokeLayerRef.current = new Array(Math.ceil(houseRef.current.clientWidth)).fill(0);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (ventSoundRef.current) {
      ventSoundRef.current.pause();
      ventSoundRef.current.currentTime = 0;
    }
    setLeftVentOn(false);
    setRightVentOn(false);
    setDoorOpen(false);
    setPersonCrouch(false);
  };

  const toggleLeftVent = () => {
    const newState = !leftVentOn;
    setLeftVentOn(newState);
    updateVentSound(newState || rightVentOn);
  };

  const toggleRightVent = () => {
    const newState = !rightVentOn;
    setRightVentOn(newState);
    updateVentSound(newState || leftVentOn);
  };

  const updateVentSound = (anyVentOn: boolean) => {
    if (anyVentOn) {
      ventSoundRef.current?.play().catch(() => {});
    } else {
      ventSoundRef.current?.pause();
      if (ventSoundRef.current) ventSoundRef.current.currentTime = 0;
    }
  };

  const handleHouseClick = (e: React.MouseEvent) => {
    if (!houseRef.current) return;
    const rect = houseRef.current.getBoundingClientRect();
    setFireX(e.clientX - rect.left);
  };

  // Update simulation when door or vent state changes while running
  const isDanger = smokeHeight > personHeight;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-slate-800 flex items-center justify-center gap-3"
          >
            <Flame className="text-orange-600 w-8 h-8 md:w-10 md:h-10" />
            室內火災煙流互動模擬 Pro
          </motion.h1>
          <p className="text-slate-500 mt-2">點擊模擬空間可移動起火點</p>
        </header>

        <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-slate-200">
          <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <span className="px-3 text-sm font-semibold text-slate-600">火災強度</span>
              <select 
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="bg-white border-none rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              >
                <option value={1}>低 (初期)</option>
                <option value={2}>中 (成長期)</option>
                <option value={3}>高 (盛燃期)</option>
              </select>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <button 
                onClick={startSimulation}
                disabled={isRunning}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold transition-all ${
                  isRunning 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95 shadow-lg shadow-orange-200'
                }`}
              >
                <Play size={18} fill="currentColor" /> 開始模擬
              </button>
              
              <button 
                onClick={toggleSimSpeed}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 active:scale-95 transition-all shadow-lg"
              >
                <Play size={18} className={simSpeed > 1 ? 'animate-pulse' : ''} /> 速度: {simSpeed}x
              </button>

              <button 
                onClick={resetSimulation}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 active:scale-95 transition-all"
              >
                <RotateCcw size={18} /> 重置
              </button>

              <button 
                onClick={() => setDoorOpen(!doorOpen)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold transition-all ${
                  doorOpen 
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                <DoorOpen size={18} /> 門 {doorOpen ? '開啟' : '關閉'}
              </button>

              <button 
                onClick={toggleLeftVent}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold transition-all ${
                  leftVentOn 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Wind size={18} /> 左排煙 {leftVentOn ? '開' : '關'}
              </button>

              <button 
                onClick={toggleRightVent}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold transition-all ${
                  rightVentOn 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Wind size={18} /> 右排煙 {rightVentOn ? '開' : '關'}
              </button>

              <button 
                onClick={() => setPersonCrouch(!personCrouch)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold transition-all ${
                  personCrouch 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {personCrouch ? <UserCheck size={18} /> : <User size={18} />}
                {personCrouch ? '低姿勢 (100cm)' : '站立 (180cm)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
              <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">模擬時間</p>
              <p className="text-2xl font-mono font-bold text-slate-700">{time} <span className="text-sm font-normal">秒</span></p>
            </div>
            <div className={`rounded-2xl p-4 text-center border transition-colors ${isDanger ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${isDanger ? 'text-red-400' : 'text-slate-400'}`}>有效煙層厚度</p>
              <p className={`text-2xl font-mono font-bold ${isDanger ? 'text-red-600' : 'text-slate-700'}`}>{smokeHeight} <span className="text-sm font-normal">cm</span></p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
              <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">人物呼吸高度</p>
              <p className="text-2xl font-mono font-bold text-slate-700">{personHeight} <span className="text-sm font-normal">cm</span></p>
            </div>
          </div>

          <div 
            ref={houseRef}
            onClick={handleHouseClick}
            className="relative w-full h-[420px] bg-slate-50 border-4 border-slate-800 rounded-lg overflow-hidden cursor-crosshair"
          >
            <canvas 
              ref={canvasRef}
              className="absolute inset-0 z-10 pointer-events-none"
            />
            
            {/* Fire Origin Marker */}
            <motion.div 
              animate={{ x: fireX - 40 }}
              className="absolute bottom-12 z-20 flex flex-col items-center pointer-events-none"
            >
              <div className="bg-orange-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold mb-1 shadow-md">
                起火點
              </div>
              <div className="w-0.5 h-4 bg-orange-600/50" />
            </motion.div>

            {/* Wall */}
            <div className="absolute left-1/2 top-0 w-2.5 h-[350px] bg-slate-600 -translate-x-1/2 z-0" />
            
            {/* Stair Area */}
            <div className="absolute right-0 top-0 w-20 h-full bg-slate-200/50 z-0" />
            
            {/* Door */}
            <motion.div 
              animate={{ 
                backgroundColor: doorOpen ? '#10b981' : '#92400e',
              }}
              className="absolute left-1/2 bottom-0 w-2.5 h-[90px] z-20 -translate-x-1/2 rounded-t-sm"
              style={{ display: doorOpen ? 'none' : 'block' }}
            />
            {doorOpen && (
               <div className="absolute left-1/2 bottom-0 w-2.5 h-[90px] border-l-2 border-emerald-500 z-20 -translate-x-1/2" />
            )}
            
            {/* Escape Line (Reference) */}
            <div className="absolute left-0 bottom-[180px] w-full h-px bg-red-400/30 border-t border-dashed border-red-400 z-0" />
            
            {/* Person */}
            <motion.div 
              animate={{ 
                height: personCrouch ? '30px' : '40px',
                bottom: 0
              }}
              className="absolute left-[10%] w-4 z-40 flex flex-col items-center"
            >
              <div className="w-4 h-4 bg-[#ffcc99] rounded-full shadow-sm" />
              <motion.div 
                animate={{ 
                  height: personCrouch ? '15px' : '25px',
                  backgroundColor: isDanger ? '#f97316' : (personCrouch ? '#3730a3' : '#2563eb')
                }}
                className="w-4 rounded-t-md mt-[-2px]"
              />
            </motion.div>
            
            {/* Vents */}
            <div className={`absolute right-4 top-12 w-8 h-8 rounded-full z-50 flex flex-col items-center justify-center transition-all ${rightVentOn ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-400'}`}>
              <Wind size={16} className={rightVentOn ? 'text-white animate-spin' : 'text-slate-200'} />
              <span className="absolute -top-6 text-[9px] font-bold text-slate-500 uppercase">右排煙口</span>
            </div>
            <div className={`absolute left-4 top-12 w-8 h-8 rounded-full z-50 flex flex-col items-center justify-center transition-all ${leftVentOn ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-400'}`}>
              <Wind size={16} className={leftVentOn ? 'text-white animate-spin' : 'text-slate-200'} />
              <span className="absolute -top-6 text-[9px] font-bold text-slate-500 uppercase">左排煙口</span>
            </div>

            {/* Danger Overlay */}
            <AnimatePresence>
              {isDanger && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-red-500/10 z-50 pointer-events-none flex items-center justify-center"
                >
                  <div className="bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-xl animate-bounce">
                    ⚠️ 煙層已降至呼吸帶！請立即採取低姿勢
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Wind size={20} className="text-blue-500" /> 物理性質與模擬原理
            </h3>
            <div className="space-y-4 text-sm text-slate-600">
              <div>
                <p className="font-bold text-slate-700">1. 煙的浮力 (Buoyancy)</p>
                <p>火災產生的煙氣溫度極高，密度較空氣低，因此會迅速上升至天花板。模擬中煙粒子向上運動即代表此物理現象。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700">2. 煙層分層 (Stratification)</p>
                <p>煙氣在天花板受阻後會橫向擴散，形成明顯的煙層。隨著火災持續，煙層會像「倒水」一樣由上而下蓄積。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700">3. 排煙效應 (Smoke Control)</p>
                <p>機械排煙設備能產生負壓，將高溫煙氣抽離。模擬中開啟排煙後，煙層厚度數字會下降，代表有效排煙空間的維持。</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserCheck size={20} className="text-emerald-500" /> 法令規範與設備標準
            </h3>
            <div className="space-y-4 text-sm text-slate-600">
              <div>
                <p className="font-bold text-slate-700">1. 設置標準</p>
                <p>依據《各類場所消防安全設備設置標準》第188條，特定場所應設置排煙設備，以確保人員逃生路徑之能見度。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700">2. 防煙區劃</p>
                <p>建築物應以不燃材料裝修之垂壁或樑，劃分防煙區劃，限制煙氣橫向擴散範圍，增加逃生時間。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700">3. 避難高度</p>
                <p>消防實務上，建議煙層應維持在離地1.8公尺以上。若煙層下降，人員必須採取低姿勢（離地約1公尺以下）以避開濃煙。</p>
              </div>
            </div>
          </section>
        </div>

        <footer className="bg-slate-800 text-slate-300 p-6 rounded-3xl text-sm leading-relaxed">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Flame size={16} className="text-orange-400" /> 消防安全小知識
          </h3>
          <ul className="list-disc list-inside space-y-1 opacity-80">
            <li>火災發生時，煙霧會先向上升並在天花板累積，隨後逐漸向下蓄積。</li>
            <li><strong>低姿勢爬行</strong>：煙霧中含有劇毒，且上方溫度極高，保持低姿勢可呼吸到較清新的空氣。</li>
            <li><strong>關門避難</strong>：若無法逃生，關上房門可有效阻擋煙霧進入，爭取救援時間。</li>
            <li>排煙設備能有效延緩煙層下降速度，增加逃生機會。</li>
          </ul>
        </footer>
      </div>

      <audio ref={ventSoundRef} src="https://www.soundjay.com/mechanical/fan-01.mp3" loop />
    </div>
  );
}
