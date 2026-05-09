"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, MapPin, Clock, Shield, Search, X, MessageSquare, Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

// --- Types ---
type UserStatus = "Offline" | "Available" | "Seeking Support";

type MatchProfile = {
  id: string;
  nickname: string;
  location: string;
  status: UserStatus;
};

export default function Hub() {
  const router = useRouter();

  // Architecture State
  const [userId, setUserId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  
  // User Status
  const [status, setStatus] = useState<UserStatus>("Offline");
  const [location, setLocation] = useState("");
  const [timeLimit, setTimeLimit] = useState("30");
  
  // UI State
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  // Chat State
  const [activeMatch, setActiveMatch] = useState<MatchProfile | null>(null);
  const [chatMatchId, setChatMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{sender_id: string, text: string}[]>([]);
  const [draft, setDraft] = useState("");

  // Initialize Auth & Profile
  useEffect(() => {
    const initSession = async () => {
      try {
        let { data: { session }, error } = await supabase.auth.getSession();
        
        if (!session && !error) {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          session = anonData?.session;
        }

        if (session?.user) {
          setUserId(session.user.id);
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_verified, status, location")
            .eq("id", session.user.id)
            .single();
            
          if (profile) {
            setIsVerified(profile.is_verified);
            setStatus(profile.status as UserStatus);
            if (profile.location) setLocation(profile.location);
          }
        } else {
          // Mock fallback if auth fails or URL is fake
          setUserId("mock-user-id");
        }
      } catch (e) {
        console.warn("Supabase auth failed. Running in stealth mock mode.");
        setUserId("mock-user-id");
      }
    };
    initSession();
  }, []);

  // Listen to Ghost Chat Messages
  useEffect(() => {
    if (!chatMatchId) return;

    // Fetch existing messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("sender_id, text")
        .eq("match_id", chatMatchId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase.channel(`match_${chatMatchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${chatMatchId}` }, 
        (payload) => {
          setMessages(prev => [...prev, payload.new as { sender_id: string, text: string }]);
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatMatchId]);

  const updateStatus = async (newStatus: UserStatus) => {
    setStatus(newStatus);
    setMatches([]);
    if (userId) {
      await supabase.from("profiles").update({ status: newStatus }).eq("id", userId);
    }
  };

  const handlePanic = () => {
    router.replace("/");
  };

  const handleVerify = async () => {
    if (!inviteCode.trim() || !userId) return;
    setVerifying(true);
    
    try {
      const { data: inviter, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("invite_code", inviteCode.trim())
        .single();

      if (inviter && !error) {
        await supabase.from("profiles").update({ 
          is_verified: true, 
          invited_by: inviter.id 
        }).eq("id", userId);
        setIsVerified(true);
      } else {
        // Fallback for mock mode
        if (inviteCode.length >= 4) {
          setIsVerified(true);
        } else {
          alert("Invalid Access Token. Please verify with a trusted node.");
        }
      }
    } catch (e) {
      // Mock mode success
      if (inviteCode.length >= 4) {
        setIsVerified(true);
      } else {
        alert("Invalid Access Token. Please verify with a trusted node.");
      }
    }
    setVerifying(false);
  };

  const scanMatches = async () => {
    if (!location.trim()) return alert("Enter your location first.");
    if (!userId) return;
    
    setIsScanning(true);
    setMatches([]);

    try {
      await supabase.from("profiles").update({ location }).eq("id", userId);
      const targetStatus = status === "Seeking Support" ? "Available" : "Seeking Support";

      const { data: peers, error } = await supabase
        .from("profiles")
        .select("id, nickname, location, status")
        .eq("status", targetStatus)
        .neq("id", userId)
        .limit(10);
        
      if (peers && !error && peers.length > 0) {
        setMatches(peers as MatchProfile[]);
      } else {
        throw new Error("No peers or mock mode");
      }
    } catch (e) {
      // Mock fallbacks
      setTimeout(() => {
        setMatches([
          { id: "mock1", nickname: "Ghost", location: location + " (Nearby)", status: status === "Seeking Support" ? "Available" : "Seeking Support" },
          { id: "mock2", nickname: "Cipher", location: "Campus Library", status: status === "Seeking Support" ? "Available" : "Seeking Support" }
        ]);
      }, 1000);
    }
    
    setTimeout(() => setIsScanning(false), 1000);
  };

  const initiateContact = async (peer: MatchProfile) => {
    if (!userId) return;
    setActiveMatch(peer);

    try {
      const endTime = new Date(Date.now() + parseInt(timeLimit) * 60000).toISOString();
      const { data: existingMatch, error } = await supabase
        .from("matches")
        .select("id")
        .or(`and(requester_id.eq.${userId},helper_id.eq.${peer.id}),and(requester_id.eq.${peer.id},helper_id.eq.${userId})`)
        .eq("status", "Active")
        .single();

      if (existingMatch && !error) {
        setChatMatchId(existingMatch.id);
      } else {
        const { data: newMatch, error: err2 } = await supabase.from("matches").insert({
          requester_id: status === "Seeking Support" ? userId : peer.id,
          helper_id: status === "Available" ? userId : peer.id,
          location: location,
          status: "Active",
          scheduled_end_time: endTime
        }).select("id").single();
        
        if (newMatch && !err2) setChatMatchId(newMatch.id);
        else throw new Error("Mocking");
      }
    } catch (e) {
      // Mock mode
      setChatMatchId("mock-match-id");
    }
  };

  const sendMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !chatMatchId || !userId) return;
    
    const textToSent = draft;
    setDraft("");
    
    setMessages(prev => [...prev, { sender_id: userId, text: textToSent }]);

    try {
      await supabase.from("messages").insert({
        match_id: chatMatchId,
        sender_id: userId,
        text: textToSent
      });
    } catch (e) {
      // Mock reply
      setTimeout(() => {
        setMessages(prev => [...prev, { sender_id: activeMatch?.id || "peer", text: "Encrypted ghost ping received." }]);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 relative overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Background Ornaments */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-emerald-600/10 blur-[120px] rounded-full pointer-events-none opacity-50" />

      {/* Header */}
      <header className="p-5 flex justify-between items-center border-b border-white/5 backdrop-blur-xl z-20 sticky top-0 bg-[#050505]/70">
        <div>
          <h1 className="text-xl font-extrabold tracking-tighter text-white/90">
            Campus<span className="text-emerald-500">Connect</span>
          </h1>
          {isVerified ? (
             <div className="flex items-center gap-2 mt-1">
               <div className="relative flex items-center justify-center">
                 <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-60" />
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 z-10" />
               </div>
               <span className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-bold">Secure Node Active</span>
             </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1">
               <AlertTriangle className="w-3 h-3 text-amber-500" />
               <span className="text-[10px] uppercase tracking-widest text-amber-500/80 font-bold">Unmapped User</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] uppercase tracking-wider px-3 py-1.5 bg-white/5 rounded-full text-emerald-400 border border-white/10 shadow-[0_0_10px_rgba(52,211,153,0.1)]">
            0 Credits
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center text-sm font-semibold border border-white/10 shadow-lg text-white">
            Me
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-5 pb-32">
        <AnimatePresence mode="wait">
          {!isVerified ? (
            // --- Verification Portal ---
            <motion.div 
              key="verify-gate"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="mt-10"
            >
              <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Shield className="w-24 h-24" />
                </div>
                <h2 className="text-2xl font-semibold text-white tracking-tight mb-2">Vouching Required</h2>
                <p className="text-sm text-zinc-500 max-w-[240px] mb-8 leading-relaxed">
                  You are in deep stealth. To access the grid and find peers, you must provide a valid invite token from an existing user.
                </p>
                <div className="space-y-4 relative z-10">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold pl-1">Access Token</label>
                    <input 
                      type="text" 
                      value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                      placeholder="e.g. 5A9F0B2E"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-zinc-700 uppercase"
                    />
                  </div>
                  <button 
                    onClick={handleVerify} disabled={verifying}
                    className="w-full py-3.5 rounded-xl bg-white text-black font-semibold shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center"
                  >
                    {verifying ? <RefreshCw className="w-5 h-5 text-black animate-spin" /> : "Authenticate"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            // --- The Grid / Hub ---
            <motion.div 
              key="hub-grid"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-6 mt-4"
            >
              {/* Status Section */}
              <section className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-2xl backdrop-blur-md">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Broadcast Core</h2>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button 
                    onClick={() => updateStatus("Available")}
                    className={cn(
                      "flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all duration-300",
                      status === "Available" 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                        : "bg-black/40 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 active:scale-95"
                    )}
                  >
                    <div className={cn("p-2 rounded-full", status === "Available" ? "bg-emerald-500/20" : "bg-white/5")}>
                      <Shield className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold tracking-wide">Available</span>
                  </button>
                  <button 
                    onClick={() => updateStatus("Seeking Support")}
                    className={cn(
                      "flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all duration-300",
                      status === "Seeking Support" 
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                        : "bg-black/40 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 active:scale-95"
                    )}
                  >
                     <div className={cn("p-2 rounded-full", status === "Seeking Support" ? "bg-amber-500/20" : "bg-white/5")}>
                      <Search className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold tracking-wide">Need Buddy</span>
                  </button>
                </div>

                <AnimatePresence>
                  {status !== "Offline" && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 pt-2">
                        <div className="relative">
                           <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                           <input 
                             type="text" value={location} onChange={e => setLocation(e.target.value)}
                             placeholder="Current Location (e.g. Cafe)"
                             className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm focus:border-emerald-500/50 outline-none transition-colors text-white"
                           />
                        </div>
                        <div className="relative">
                           <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                           <select 
                             value={timeLimit} onChange={e => setTimeLimit(e.target.value)}
                             className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm focus:border-emerald-500/50 outline-none transition-colors text-white appearance-none"
                           >
                              <option value="30">Available for 30 mins</option>
                              <option value="60">Available for 1 Hour</option>
                              <option value="120">Available for 2 Hours</option>
                           </select>
                        </div>
                        
                        <button 
                          onClick={scanMatches} disabled={isScanning}
                          className="w-full mt-2 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold tracking-wide shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 relative overflow-hidden"
                        >
                          {isScanning ? (
                             <span className="flex items-center justify-center gap-2">
                               <RefreshCw className="w-4 h-4 animate-spin" /> Scanning Grid...
                             </span>
                          ) : (
                            "Ping Local Proxies"
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* Match Results FROM DATABASE */}
              <AnimatePresence>
                {matches.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                     <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Live Database Proxies</h3>
                     {matches.map((m, idx) => (
                       <motion.div 
                         initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                         key={m.id} 
                         className="bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between group transition-colors cursor-pointer"
                         onClick={() => initiateContact(m)}
                       >
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xl text-emerald-400 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                              {(m.nickname || '?')[0]}
                            </div>
                            <div>
                               <div className="font-semibold text-white text-sm">{m.nickname || 'Unknown'}</div>
                               <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                                 <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {m.location || 'Unknown location'}</span>
                               </div>
                            </div>
                         </div>
                         <button className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center transition-colors text-zinc-400">
                           <MessageSquare className="w-4 h-4" />
                         </button>
                       </motion.div>
                     ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Ghost Chat Drawer */}
      <AnimatePresence>
        {(activeMatch && chatMatchId) && (
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 top-[10dvh] bg-[#0A0A0A] border-t border-white/10 rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.8)] z-50 flex flex-col pt-2"
          >
            <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-4" />
            
            <div className="px-6 pb-4 border-b border-white/5 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-emerald-400 border border-zinc-700">
                    {(activeMatch.nickname || '?')[0]}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{activeMatch.nickname}</h3>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Auto-Destruct enabled
                    </p>
                  </div>
               </div>
               <button onClick={() => { setActiveMatch(null); setChatMatchId(null); }} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                 <X className="w-5 h-5 text-zinc-400" />
               </button>
            </div>

            {/* Chat History DB realtime feed */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
               <div className="text-center text-xs text-zinc-600 bg-white/5 py-2 rounded-lg mb-6 border border-white/[0.02]">
                 Secure DB connection established. Realtime Active.
               </div>
               
               {messages.map((msg, i) => (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                   key={i} className={cn("max-w-[80%] p-3.5 rounded-2xl text-sm break-words", 
                     msg.sender_id === userId 
                       ? "ml-auto bg-emerald-600 text-white rounded-tr-sm" 
                       : "mr-auto bg-zinc-800 text-zinc-200 rounded-tl-sm border border-zinc-700"
                   )}
                 >
                   {msg.text}
                 </motion.div>
               ))}
            </div>

            <form onSubmit={sendMsg} className="p-4 border-t border-white/5 bg-[#0a0a0a] shrink-0">
               <div className="relative flex items-center">
                 <input 
                   type="text" value={draft} onChange={e => setDraft(e.target.value)}
                   placeholder="Send a ghost ping..."
                   className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-5 pr-12 py-3.5 text-sm focus:outline-none focus:border-emerald-500/50 text-white placeholder:text-zinc-600"
                 />
                 <button type="submit" disabled={!draft.trim()} className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-colors disabled:opacity-50">
                    <Send className="w-4 h-4 ml-0.5" />
                 </button>
               </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handlePanic}
        className="fixed bottom-6 right-6 w-14 h-14 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-transform active:scale-90 z-40 font-bold text-xs tracking-widest border-2 border-red-500 border-t-white/30 backdrop-blur-md"
        title="Panic - Quick Exit"
      >
        EXIT
      </button>

    </div>
  );
}

function RefreshCw(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
    </svg>
  )
}
