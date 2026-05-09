"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [display, setDisplay] = useState("0");
  const [showPinPad, setShowPinPad] = useState(false);
  const [pin, setPin] = useState("");
  const [errorShake, setErrorShake] = useState(false);
  const [holdingProgress, setHoldingProgress] = useState(0);
  
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const handlePointerDown = () => {
    let progress = 0;
    progressInterval.current = setInterval(() => {
      progress += 2; // 50 updates per second -> 2% per 100ms -> 100% in 5000ms
      setHoldingProgress(progress);
      if (progress >= 100) {
        clearInterval(progressInterval.current!);
        setShowPinPad(true);
        setHoldingProgress(100);
      }
    }, 100);
  };

  const handlePointerUp = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    setHoldingProgress(0);
  };

  const handleCalcClick = (val: string) => {
    if (display === "0" && val !== ".") {
      setDisplay(val);
    } else {
      setDisplay(display + val);
    }
  };

  const handleCalculate = () => {
    try {
      // eslint-disable-next-line no-new-func
      const res = new Function("return " + display.replace(/X/g, '*'))();
      setDisplay(String(res));
    } catch {
      setDisplay("Error");
    }
  };

  const handleClear = () => {
    setDisplay("0");
  };

  const handlePinClick = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === "1234") {
          router.push("/hub");
        } else {
          setErrorShake(true);
          setTimeout(() => {
            setErrorShake(false);
            setPin("");
          }, 500);
        }
      }
    }
  };

  return (
    <main className="flex flex-col items-center justify-end bg-black text-white p-4 pb-8 max-w-md mx-auto relative h-full w-full overflow-hidden">
      
      {/* Secret Trigger Area */}
      <div 
        className="absolute top-10 left-0 right-0 flex flex-col items-center justify-center select-none cursor-pointer p-6"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="text-zinc-800 text-sm font-bold tracking-[0.4em] uppercase transition-colors duration-500 z-10 relative">
          SCIENTIA
        </span>
        
        {/* Subtle progress indicator */}
        <div className="absolute inset-x-0 bottom-4 flex justify-center opacity-20">
          <div className="h-[2px] bg-zinc-800 w-16 rounded-full overflow-hidden">
             <div 
               className="h-full bg-zinc-500 transition-all duration-100 ease-linear" 
               style={{ width: `${holdingProgress}%` }}
             />
          </div>
        </div>
      </div>

      <div className="w-full text-right mb-6 px-4">
        <div className="text-[5rem] font-light tracking-tight truncate overflow-hidden leading-none mb-4">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full">
        <CalcBtn onClick={handleClear} className="bg-zinc-300 text-black font-medium text-2xl">AC</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('-')} className="bg-zinc-300 text-black font-medium text-2xl">+/-</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('/100')} className="bg-zinc-300 text-black font-medium text-2xl">%</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('/')} className="bg-orange-500 hover:bg-orange-400 text-white font-medium text-3xl">÷</CalcBtn>

        <CalcBtn onClick={() => handleCalcClick('7')} className="bg-zinc-800">7</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('8')} className="bg-zinc-800">8</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('9')} className="bg-zinc-800">9</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('*')} className="bg-orange-500 hover:bg-orange-400 text-white font-medium text-2xl">×</CalcBtn>

        <CalcBtn onClick={() => handleCalcClick('4')} className="bg-zinc-800">4</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('5')} className="bg-zinc-800">5</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('6')} className="bg-zinc-800">6</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('-')} className="bg-orange-500 hover:bg-orange-400 text-white font-medium text-4xl leading-none -mt-2">-</CalcBtn>

        <CalcBtn onClick={() => handleCalcClick('1')} className="bg-zinc-800">1</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('2')} className="bg-zinc-800">2</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('3')} className="bg-zinc-800">3</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('+')} className="bg-orange-500 hover:bg-orange-400 text-white font-medium text-3xl">+</CalcBtn>

        <CalcBtn onClick={() => handleCalcClick('0')} className="bg-zinc-800 col-span-2 aspect-auto h-full rounded-full flex justify-start items-center pl-8">0</CalcBtn>
        <CalcBtn onClick={() => handleCalcClick('.')} className="bg-zinc-800 text-3xl font-bold">.</CalcBtn>
        <CalcBtn onClick={handleCalculate} className="bg-orange-500 hover:bg-orange-400 text-white font-medium text-3xl">=</CalcBtn>
      </div>

      <AnimatePresence>
        {showPinPad && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-2xl"
          >
            <div className="text-xl mb-12 flex flex-col items-center">
              <span className="text-zinc-400 mb-8 text-sm uppercase tracking-widest font-medium">Authentication</span>
              
              <motion.div 
                className="flex gap-6"
                animate={errorShake ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <motion.div 
                    key={i} 
                    animate={pin.length > i ? { scale: 1.2, backgroundColor: "#ffffff", borderColor: "#ffffff" } : { scale: 1, backgroundColor: "transparent", borderColor: "#52525b" }}
                    className="w-3.5 h-3.5 rounded-full border border-zinc-600 transition-colors"
                  />
                ))}
              </motion.div>
            </div>
            
            <div className="grid grid-cols-3 gap-x-8 gap-y-6 w-full max-w-[280px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <PinBtn key={n} onClick={() => handlePinClick(n)}>{n}</PinBtn>
              ))}
              <div />
              <PinBtn onClick={() => handlePinClick('0')}>0</PinBtn>
              <div className="flex items-center justify-center cursor-pointer active:opacity-50" onClick={() => setPin(p => p.slice(0, -1))}>
                <span className="text-white font-medium text-lg tracking-wide uppercase">Del</span>
              </div>
            </div>
            
            <button 
              onClick={() => { setShowPinPad(false); setPin(""); setHoldingProgress(0); }}
              className="absolute bottom-12 text-zinc-600 font-medium hover:text-white transition-colors uppercase tracking-widest text-sm"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function CalcBtn({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "aspect-square rounded-full flex items-center justify-center text-[2rem] font-normal transition-colors active:opacity-70 active:scale-95 touch-manipulation origin-center w-full",
        className
      )}
    >
      {children}
    </button>
  );
}

function PinBtn({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="aspect-square w-[72px] h-[72px] mx-auto rounded-full bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 active:scale-95 flex items-center justify-center text-3xl font-light text-white transition-all shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-zinc-700/50"
    >
      {children}
    </button>
  );
}
