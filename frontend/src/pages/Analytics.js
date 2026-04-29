import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, getDocs, query, where } from "firebase/firestore";
import { db, analytics, auth } from "../firebase";
import { logEvent } from "firebase/analytics";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useTheme } from "../context/ThemeContext";

// Premium Curved Chart Component
const Chart = ({ data, isDarkMode }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const maxTotal = Math.max(...data.map((d) => d.total), 1) * 1.1;
  const width = 1000;
  const height = 300;

  // Generate smooth curve points using path commands
  const getCurvePath = (key) => {
    if (data.length < 2) return "";
    let path = `M 0,${height - (data[0][key] / maxTotal) * height}`;

    for (let i = 0; i < data.length - 1; i++) {
      const x1 = (i / (data.length - 1)) * width;
      const y1 = height - (data[i][key] / maxTotal) * height;
      const x2 = ((i + 1) / (data.length - 1)) * width;
      const y2 = height - (data[i + 1][key] / maxTotal) * height;

      // Control points for smooth bezier
      const cp1x = x1 + (x2 - x1) / 2;
      const cp1y = y1;
      const cp2x = x1 + (x2 - x1) / 2;
      const cp2y = y2;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
    }
    return path;
  };

  const getAreaPath = (key) => {
    const curve = getCurvePath(key);
    if (!curve) return "";
    return `${curve} L ${width},${height} L 0,${height} Z`;
  };

  const currentHovered = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="relative h-64 w-full mt-8 group" onMouseLeave={() => setHoveredIndex(null)}>
      <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDarkMode ? "white" : "#cbd5e1"} stopOpacity="0.1" />
            <stop offset="100%" stopColor={isDarkMode ? "white" : "#cbd5e1"} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="detectedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ccff00" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ccff00" stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line key={i} x1="0" y1={height * ratio} x2={width} y2={height * ratio} className={isDarkMode ? "stroke-white/5" : "stroke-gray-100"} strokeWidth="1" />
        ))}

        {/* Total Area & Path */}
        <path d={getAreaPath("total")} fill="url(#totalGradient)" />
        <path d={getCurvePath("total")} fill="none" className={isDarkMode ? "stroke-white/10" : "stroke-gray-300"} strokeWidth="2" strokeDasharray="4 4" />

        {/* Detected Area & Path */}
        <path d={getAreaPath("detected")} fill="url(#detectedGradient)" />
        <path d={getCurvePath("detected")} fill="none" stroke="#ccff00" strokeWidth="4" strokeLinecap="round" style={{ filter: 'url(#glow)' }} />

        {/* Interaction Bubbles */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * width;
          const yTotal = height - (d.total / maxTotal) * height;
          const yDet = height - (d.detected / maxTotal) * height;
          return (
            <g key={i} onMouseEnter={(e) => { setHoveredIndex(i); setMousePos({ x: e.clientX, y: e.clientY }); }}>
              <rect x={x - 20} y="0" width="40" height={height} fill="transparent" className="cursor-pointer" />
              {hoveredIndex === i && (
                <>
                  <circle cx={x} cy={yTotal} r="6" fill={isDarkMode ? "#1e293b" : "white"} stroke={isDarkMode ? "rgba(255,255,255,0.3)" : "#ccc"} strokeWidth="2" />
                  <circle cx={x} cy={yDet} r="6" fill="#ccff00" stroke={isDarkMode ? "#0f172a" : "white"} strokeWidth="2" className="animate-pulse" />
                  <line x1={x} y1="0" x2={x} y2={height} stroke="#ccff00" strokeWidth="1" strokeDasharray="4" opacity="0.3" />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Chart Tooltip */}
      {hoveredIndex !== null && (
        <div
          className={`fixed z-50 pointer-events-none px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transform -translate-x-1/2 -translate-y-[120%] transition-opacity duration-150 ${isDarkMode ? 'bg-[#0f172a]/95 border-[#1e293b]' : 'bg-white/95 border-gray-200'}`}
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className="flex flex-col gap-2 min-w-[140px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scan Activity: {data[hoveredIndex].month}</span>
            <div className="flex justify-between items-center text-sm">
              <span className={isDarkMode ? "text-gray-400" : "text-gray-500"}>Total Scans</span>
              <span className={`font-bold ${isDarkMode ? "text-white" : "text-black"}`}>{data[hoveredIndex].total}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#ccff00] font-bold">Detections</span>
              <span className="text-[#ccff00] font-black">{data[hoveredIndex].detected}</span>
            </div>
            <div className="mt-1 pt-1 border-t border-white/5 flex justify-between items-center text-[10px]">
              <span className="text-slate-500 uppercase font-bold">Infection Rate</span>
              <span className="text-rose-500 font-bold">{((data[hoveredIndex].detected / (data[hoveredIndex].total || 1)) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Distribution Card Component
const DistributionCard = ({ title, counts, isDarkMode }) => {
  const [activeBand, setActiveBand] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const totalDiseases = counts.healthy + counts.glaucoma + counts.cataracts + counts.other || 1;
  const pHealthy = (counts.healthy / totalDiseases) * 100;
  const pGlaucoma = (counts.glaucoma / totalDiseases) * 100;
  const pCataracts = (counts.cataracts / totalDiseases) * 100;
  const pOther = (counts.other / totalDiseases) * 100;

  const offsetGlaucoma = -pHealthy;
  const offsetCataracts = offsetGlaucoma - pGlaucoma;
  const offsetOther = offsetCataracts - pCataracts;

  const handleMouseEnter = (e, band) => {
    setActiveBand(band);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setActiveBand(null);
  };

  return (
    <div className={`p-6 rounded-2xl border relative ${isDarkMode ? "bg-[#141414] border-[#ccff00]/15" : "bg-white border-gray-200 shadow-sm"}`}>
      <h3 className={`text-lg font-bold mb-6 ${isDarkMode ? "text-white" : "text-gray-900"}`}>{title}</h3>
      <div className="flex items-center gap-8">
        <div className="relative size-40 shrink-0">
          <svg className="size-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" fill="none" r="15.915" className={`stroke-3 ${isDarkMode ? "stroke-white/5" : "stroke-gray-100"}`} strokeWidth={"3"}></circle>

            {pHealthy > 0 && <circle onMouseEnter={(e) => handleMouseEnter(e, 'healthy')} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} cx="18" cy="18" fill="none" r="15.915" stroke="#22c55e" strokeDasharray={`${pHealthy} ${100 - pHealthy}`} strokeDashoffset="0" strokeWidth="3" className="cursor-pointer hover:stroke-[#4ade80] transition-colors"></circle>}

            {pGlaucoma > 0 && <circle onMouseEnter={(e) => handleMouseEnter(e, 'glaucoma')} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} cx="18" cy="18" fill="none" r="15.915" stroke="#06b6d4" strokeDasharray={`${pGlaucoma} ${100 - pGlaucoma}`} strokeDashoffset={offsetGlaucoma} strokeWidth="3" className="cursor-pointer hover:stroke-[#22d3ee] transition-colors"></circle>}

            {pCataracts > 0 && <circle onMouseEnter={(e) => handleMouseEnter(e, 'cataracts')} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} cx="18" cy="18" fill="none" r="15.915" stroke="#f59e0b" strokeDasharray={`${pCataracts} ${100 - pCataracts}`} strokeDashoffset={offsetCataracts} strokeWidth="3" className="cursor-pointer hover:stroke-[#fbbf24] transition-colors"></circle>}

            {pOther > 0 && <circle onMouseEnter={(e) => handleMouseEnter(e, 'other')} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} cx="18" cy="18" fill="none" r="15.915" className="stroke-slate-700 cursor-pointer hover:stroke-slate-500 transition-colors" strokeDasharray={`${pOther} ${100 - pOther}`} strokeDashoffset={offsetOther} strokeWidth="3"></circle>}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{Math.max(pHealthy, pGlaucoma, pCataracts, pOther).toFixed(0)}%</span>
            <span className={`text-[10px] uppercase tracking-widest font-bold ${pHealthy >= Math.max(pGlaucoma, pCataracts, pOther) ? "text-[#22c55e]" :
              pGlaucoma >= Math.max(pHealthy, pCataracts, pOther) ? "text-[#06b6d4]" :
                pCataracts >= Math.max(pHealthy, pGlaucoma, pOther) ? "text-[#f59e0b]" : "text-slate-400"
              }`}>
              {pHealthy >= Math.max(pGlaucoma, pCataracts, pOther) ? "Healthy" :
                pGlaucoma >= Math.max(pHealthy, pCataracts, pOther) ? "Glaucoma" :
                  pCataracts >= Math.max(pHealthy, pGlaucoma, pOther) ? "Cataracts" : "Other"}
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {[
            { id: 'healthy', label: "Healthy", count: counts.healthy, bg: "bg-[#22c55e]" },
            { id: 'glaucoma', label: "Glaucoma", count: counts.glaucoma, bg: "bg-[#06b6d4]" },
            { id: 'cataracts', label: "Cataracts", count: counts.cataracts, bg: "bg-[#f59e0b]" },
            { id: 'other', label: "Other", count: counts.other, bg: "bg-slate-500" }
          ].map((d, i) => (
            <div key={i} onMouseEnter={(e) => handleMouseEnter(e, d.id)} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${activeBand === d.id ? (isDarkMode ? 'bg-white/10' : 'bg-gray-100') : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${d.bg}`}></span>
                <span className={`text-sm ${activeBand === d.id ? (isDarkMode ? 'text-white font-bold' : 'text-gray-900 font-bold') : (isDarkMode ? "text-slate-400" : "text-gray-500")}`}>{d.label}</span>
              </div>
              <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{((d.count / totalDiseases) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* FLOATING HOVER TOOLTIP */}
      {activeBand && (
        <div
          className={`fixed z-50 pointer-events-none px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transform -translate-x-1/2 -translate-y-[120%] transition-opacity duration-150 ${isDarkMode ? 'bg-[#0f172a]/95 border-[#1e293b]' : 'bg-white/95 border-gray-200 shadow-xl'}`}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex flex-col gap-1 min-w-[150px]">
            <span className={`font-bold uppercase tracking-wider text-[10px] ${activeBand === 'healthy' ? 'text-[#22c55e]' : activeBand === 'glaucoma' ? 'text-[#06b6d4]' : activeBand === 'cataracts' ? 'text-[#f59e0b]' : 'text-slate-400'}`}>
              {activeBand === 'other' ? "Other Breakdown" : `${activeBand} Details`}
            </span>

            {activeBand !== 'other' ? (
              <div className="flex justify-between items-center text-sm gap-6 mt-1">
                <span className={`capitalize ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{activeBand}</span>
                <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>
                  {((counts[activeBand] / totalDiseases) * 100).toFixed(1)}% <span className="text-xs font-normal opacity-70">({counts[activeBand]})</span>
                </span>
              </div>
            ) : (
              <div className="mt-1 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {counts.otherDetails && Object.entries(counts.otherDetails).length > 0 ? (
                  Object.entries(counts.otherDetails).sort((a, b) => b[1] - a[1]).map(([diseaseName, cnt]) => (
                    <div key={diseaseName} className="flex justify-between items-center text-xs gap-6">
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{diseaseName}</span>
                      <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>
                        {((cnt / totalDiseases) * 100).toFixed(1)}% <span className="font-normal opacity-70">({cnt})</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <span className={`text-xs italic ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No specific diseases recorded.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
// New Premium Component: Case Complexity & Diagnostic Difficulty
const CaseComplexityMatrix = ({ data, isDarkMode }) => {
  const levels = ["Decisive", "Strong", "Uncertain", "Highly Complex"];
  const counts = data || { Decisive: 0, Strong: 0, Uncertain: 0, "Highly Complex": 0 };
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className={`p-8 rounded-2xl border transition-all ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className={`text-lg font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>Case Complexity Hub</h3>
          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">Diagnostic intensity based on AI prediction variance</p>
        </div>
        <div className="flex -space-x-1">
          {[1, 2, 3].map(i => <div key={i} className="size-4 rounded-full border border-black bg-[#ccff00]/20 animate-pulse"></div>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {levels.map((lvl, i) => (
          <div key={lvl} className={`p-4 rounded-xl border relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 ${isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"}`}>
            <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${lvl === "Decisive" ? "from-emerald-400 to-emerald-600" :
              lvl === "Strong" ? "from-cyan-400 to-cyan-600" :
                lvl === "Uncertain" ? "from-amber-400 to-amber-600" : "from-rose-500 to-rose-700"
              }`}></div>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>{lvl}</p>
            <div className="flex items-end justify-between leading-none mt-2">
              <span className={`text-2xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>{counts[lvl] || 0}</span>
              <span className={`text-[10px] font-bold ${isDarkMode ? "text-slate-600" : "text-gray-400"}`}>{((counts[lvl] / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-8 p-4 rounded-xl flex items-center gap-3 border ${isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"}`}>
        <span className="material-symbols-outlined text-[#ccff00] animate-bounce">priority_high</span>
        <p className={`text-[11px] font-bold ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
          <span className="text-white font-black underline">Attention:</span> {counts["Highly Complex"] || 0} cases identified with conflicting AI signals. Specialist review prioritized.
        </p>
      </div>
    </div>
  );
};

// New Premium Component: Specialist Approved vs Automated Distribution
const SpecialistPerformanceMap = ({ data, isDarkMode }) => {
  const specialists = Object.keys(data).length > 0 ? Object.keys(data) : ["Pending Specialist"];

  return (
    <div className={`p-8 rounded-2xl border ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className={`text-lg font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>Specialist Intake Efficiency</h3>
        <span className="text-[10px] font-black uppercase text-cyan-400">Real-time Load</span>
      </div>

      <div className="space-y-6">
        {specialists.map(name => (
          <div key={name} className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full bg-slate-800 border border-white/10 overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?u=${name}`} alt="dr" />
                </div>
                <span className={`text-xs font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>{name}</span>
              </div>
              <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full border ${isDarkMode ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/20" : "bg-cyan-50 text-cyan-700 border-cyan-100"}`}>
                {data[name] || 0} Pathologies
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min((data[name] || 0) * 10, 100)}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


export default function Analytics() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentDoctor, setCurrentDoctor] = useState(null);
  const [patients, setPatients] = useState([]);
  const [scans, setScans] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoveredDemographic, setHoveredDemographic] = useState(null);

  /* 🔥 Load doctor details */
  useEffect(() => {
    const loadDoctor = async () => {
      const email = auth?.currentUser?.email;
      if (!email) return;
      const q = query(collection(db, "doctors"), where("email", "==", email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setCurrentDoctor({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    };
    loadDoctor();
  }, []);

  useEffect(() => {
    // Log page view
    logEvent(analytics, "page_view", {
      page_title: "Doctor Analytics Dashboard",
      page_path: "/analytics",
    });

    const fetchData = () => {
      try {
        const unsubscribePatients = onSnapshot(collection(db, "patients"), (snapshot) => {
          const pData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setPatients(pData);

          const allScans = [];
          pData.forEach((p) => {
            if (p.reports && Array.isArray(p.reports)) {
              p.reports.forEach((report) => {
                const key = report.id || report.imageUrl || Math.random().toString();
                allScans.push({
                  ...report,
                  patientIdOrig: p.patientId,
                  patientName: p.name || p.patientName,
                  patientAge: p.age,
                  patientGender: p.gender,
                  doctorName: p.doctorName,
                  id: key
                });
              });
            }
          });
          setScans(allScans);
        });

        const unsubscribeAppointments = onSnapshot(collection(db, "appointments"), (snapshot) => {
          const aData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setAppointments(aData);
          setLoading(false);
        });

        return () => {
          unsubscribePatients();
          unsubscribeAppointments();
        };
      } catch (err) {
        console.error("Error fetching analytics data:", err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const metrics = useMemo(() => {
    const totalScans = scans.length;
    let detections = 0;
    let totalConfidence = 0;
    let cnnConfCount = 0;

    // Appointment Stats
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const newPatients = patients.filter(p => {
      let created = p.createdAt;
      if (created?.seconds) created = new Date(created.seconds * 1000);
      else if (created) created = new Date(created);
      return created && created > thirtyDaysAgo;
    }).length;

    // Age distribution for Donut
    const ageOverview = { child: 0, teen: 0, adult: 0, older: 0, unknown: 0 };
    patients.forEach(p => {
      const age = parseInt(p.age, 10);
      if (!isNaN(age)) {
        if (age <= 12) ageOverview.child++;
        else if (age <= 19) ageOverview.teen++;
        else if (age <= 59) ageOverview.adult++;
        else ageOverview.older++;
      } else {
        ageOverview.unknown++;
      }
    });

    // Daily Appointment Stats (Mon-Sun)
    // Dynamic Weekly Clinical Schedule (Monday to Sunday)
    const todayRef = new Date();
    const currentDayIdx = todayRef.getDay(); // 0(Sun)-6(Sat)
    
    // Normalize to Monday start
    const diffToMon = todayRef.getDate() - (currentDayIdx === 0 ? 6 : currentDayIdx - 1);
    const mondayRef = new Date(todayRef.setDate(diffToMon));
    mondayRef.setHours(0, 0, 0, 0);

    const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dailyAppts = weekLabels.map((day, idx) => {
      const d = new Date(mondayRef);
      d.setDate(mondayRef.getDate() + idx);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return { 
        day, 
        date: dateStr, 
        total: 0, 
        online: 0, 
        clinic: 0, 
        key: d.toDateString() // mapping key
      };
    });

    appointments.forEach(a => {
      // Robust Privacy Filter: Normalize names and IDs for maximum matching stability
      const docIdMatch = a.doctorEmployeeId && currentDoctor && (a.doctorEmployeeId === currentDoctor.id || a.doctorEmployeeId === currentDoctor.employeeId);
      const cleanNameA = (a.doctor || "").replace(/^Dr\.\s*/i, "").trim().toLowerCase();
      const cleanNameB = (currentDoctor?.name || "").replace(/^Dr\.\s*/i, "").trim().toLowerCase();
      const nameMatch = cleanNameA === cleanNameB && cleanNameB !== "";
      
      const isTargetDoctor = docIdMatch || nameMatch;
      if (!isTargetDoctor) return;

      let t = a.scheduledAt || a.bookedAt || a.createdAt;
      let d;
      if (t?.seconds) d = new Date(t.seconds * 1000);
      else if (typeof t === "number") d = new Date(t);
      else d = new Date(t);

      if (d && !isNaN(d.getTime())) {
        const docDateStr = d.toDateString();
        const foundDay = dailyAppts.find(wk => wk.key === docDateStr);
        if (foundDay) {
          foundDay.online++;
          foundDay.total++;
        }
      }
    });
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let newCasesMonth = 0;

    let diseaseCountsCnn = { healthy: 0, glaucoma: 0, cataracts: 0, other: 0, otherDetails: {} };
    let diseaseCountsSvm = { healthy: 0, glaucoma: 0, cataracts: 0, other: 0, otherDetails: {} };

    const highRiskAlerts = [];
    const complexityCounts = { Decisive: 0, Strong: 0, Uncertain: 0, "Highly Complex": 0 };
    const specialistStats = {};

    scans.forEach((scan) => {
      // Ground truth for risk is based on the final prediction if provided, else cnn result
      const finalLabel = (scan.prediction || "");
      const finalLabelLower = finalLabel.toLowerCase();
      const isHealthy = finalLabelLower.includes("normal") || finalLabelLower.includes("healthy") || finalLabelLower === "";

      let conf = 0;
      if (scan.cnn_top5 && scan.cnn_top5.length > 0) {
        conf = scan.cnn_top5[0].confidence;
      } else if (scan.confidence) {
        conf = scan.confidence;
      }

      // Robust confidence parsing
      let parsedConf = 0.9;
      if (conf !== undefined && conf !== null) {
        if (typeof conf === "string") {
          let cleanStr = conf.replace("%", "").trim();
          parsedConf = parseFloat(cleanStr);
          if (conf.includes("%") || parsedConf > 1) {
            parsedConf = parsedConf / 100;
          }
        } else if (typeof conf === "number") {
          parsedConf = conf > 1 ? conf / 100 : conf;
        }
      }
      if (isNaN(parsedConf)) parsedConf = 0.9;
      conf = parsedConf;

      // bestLabel removal fix - isHealthy already handled above

      if (!isHealthy) detections++;

      if (conf > 0) {
        totalConfidence += conf;
        cnnConfCount++;
      }

      // Check date robustly
      let rDate = new Date();
      if (scan.createdAt?.seconds) rDate = new Date(scan.createdAt.seconds * 1000);
      else if (scan.timestamp?.toDate) rDate = scan.timestamp.toDate();
      else if (scan.timestamp?.seconds) rDate = new Date(scan.timestamp.seconds * 1000);
      else {
        let raw = scan.createdAt || scan.timestamp;
        if (raw) {
          if (typeof raw === "string" && /^\d+$/.test(raw)) raw = parseInt(raw, 10);
          const d = new Date(raw);
          if (!isNaN(d.getTime())) rDate = d;
        }
      }

      if (rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear) {
        newCasesMonth++;
      }

      const processLabel = (label, counterObj) => {
        if (!label) label = "Unknown";
        const lower = label.toLowerCase();
        let cat = "other";

        if (lower.includes("normal") || lower.includes("healthy")) cat = "healthy";
        else if (lower.includes("glaucoma")) cat = "glaucoma";
        else if (lower.includes("cataract")) cat = "cataracts";

        counterObj[cat]++;

        if (cat === "other") {
          const cleanName = label.charAt(0).toUpperCase() + label.slice(1);
          counterObj.otherDetails[cleanName] = (counterObj.otherDetails[cleanName] || 0) + 1;
        }
      };

      // Explicitly sync CNN graph directly with the formally approved prediction 
      // ensuring full lockstep with DoctorHistory's single-prediction constraint logic.
      const cLabel = scan.prediction || "Unknown";
      processLabel(cLabel, diseaseCountsCnn);

      // Same logic for SVM, matching exact UI predictions cleanly:
      const sLabel = scan.prediction || "Unknown";
      processLabel(sLabel, diseaseCountsSvm);

      // Process Complexity: High disparity between top AI prediction and secondary means "Decisive"
      // If Top 2 predictions are very close, it's "Highly Complex"
      if (scan.cnn_top5 && scan.cnn_top5.length >= 2) {
        const gap = scan.cnn_top5[0].confidence - scan.cnn_top5[1].confidence;
        if (gap > 0.5) complexityCounts["Decisive"]++;
        else if (gap > 0.2) complexityCounts["Strong"]++;
        else if (gap > 0.1) complexityCounts["Uncertain"]++;
        else complexityCounts["Highly Complex"]++;
      } else {
        complexityCounts["Strong"]++; // Fallback
      }

      // Process Specialist distribution (only approved pathologies)
      if (!isHealthy && scan.doctorName) {
        specialistStats[scan.doctorName] = (specialistStats[scan.doctorName] || 0) + 1;
      }

      // High Risk alerts (if pathology present)
      if (!isHealthy) {
        highRiskAlerts.push({
          patientId: scan.patientIdOrig || scan.patientId || "Unknown",
          patientName: scan.patientName || "Unknown Patient",
          patientAge: scan.patientAge || "--",
          patientGender: scan.patientGender ? (scan.patientGender.toLowerCase().startsWith('m') ? "M" : "F") : "-",
          imgUrl: scan.imageUrl,
          tag: scan.prediction || "Unknown",
          doctor: scan.doctorName || "Pending Assignment",
          confidence: Math.round(conf * 100),
          status: conf >= 0.95 ? "Critical" : conf >= 0.85 ? "Urgent Review" : "Elevated Risk",
          id: scan.id || Math.random().toString(),
          date: rDate
        });
      }
    });

    const detectionRate = totalScans > 0 ? ((detections / totalScans) * 100).toFixed(1) : 0;
    const avgAccuracy = cnnConfCount > 0 ? ((totalConfidence / cnnConfCount) * 100).toFixed(1) : 0;


    // Monthly data for chart (Last 6 months)
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = d.toLocaleString('en-US', { month: 'short' });
      monthData.push({ month: mStr, monthInt: d.getMonth(), year: d.getFullYear(), total: 0, detected: 0 });
    }

    scans.forEach((scan) => {
      // For approved scans, the 'prediction' field is the ground truth
      const finalLabel = (scan.prediction || "").toLowerCase();
      const isHealthy = finalLabel.includes("normal") || finalLabel.includes("healthy") || finalLabel === "";

      let rDate = new Date();
      if (scan.createdAt?.seconds) rDate = new Date(scan.createdAt.seconds * 1000);
      else if (scan.timestamp?.toDate) rDate = scan.timestamp.toDate();
      else if (scan.timestamp?.seconds) rDate = new Date(scan.timestamp.seconds * 1000);
      else {
        let raw = scan.createdAt || scan.timestamp;
        if (raw) {
          if (typeof raw === "string" && /^\d+$/.test(raw)) raw = parseInt(raw, 10);
          const d = new Date(raw);
          if (!isNaN(d.getTime())) rDate = d;
        }
      }

      const mItem = monthData.find(m => m.monthInt === rDate.getMonth() && m.year === rDate.getFullYear());
      if (mItem) {
        mItem.total++;
        if (!isHealthy) mItem.detected++;
      }
    });

    return {
      totalScans,
      detectionRate,
      avgAccuracy,
      newCasesMonth,
      monthData,
      diseaseCountsCnn,
      diseaseCountsSvm,
      complexityCounts,
      specialistStats,
      totalPatients: patients.length,
      newPatients,
      oldPatients: patients.length - newPatients,
      totalAppointments: appointments.length,
      ageOverview,
      dailyAppts,
      highRiskAlerts: highRiskAlerts.sort((a, b) => b.date - a.date).slice(0, showAllAlerts ? undefined : 5)
    };
  }, [scans, appointments, patients, showAllAlerts, currentDoctor]);

  // Demographics mapping
  const demographics = useMemo(() => {
    let topAge = "N/A";
    let topRegion = "N/A";

    const ageCounts = { "0-18": 0, "19-35": 0, "36-50": 0, "51-64": 0, "65-80": 0, "80+": 0 };
    const regionCounts = {};

    patients.forEach(p => {
      const age = parseInt(p.age, 10);
      if (!isNaN(age)) {
        if (age <= 18) ageCounts["0-18"]++;
        else if (age <= 35) ageCounts["19-35"]++;
        else if (age <= 50) ageCounts["36-50"]++;
        else if (age <= 64) ageCounts["51-64"]++;
        else if (age <= 80) ageCounts["65-80"]++;
        else ageCounts["80+"]++;
      }

      if (p.address && typeof p.address === 'string') {
        const region = p.address.split(',')[0].trim();
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      }
    });

    const maxAgeGroup = Object.keys(ageCounts).reduce((a, b) => ageCounts[a] > ageCounts[b] ? a : b, "");
    if (maxAgeGroup && ageCounts[maxAgeGroup] > 0) topAge = maxAgeGroup + " yrs";

    const maxRegion = Object.keys(regionCounts).reduce((a, b) => regionCounts[a] > regionCounts[b] ? a : b, "");
    if (maxRegion && regionCounts[maxRegion] > 0) topRegion = maxRegion;

    return { topAge, topRegion };
  }, [patients]);

  if (loading) {
    return (
      <div className={`flex min-h-screen ${isDarkMode ? "bg-[#0f172a] text-white" : "bg-gray-50 text-gray-900"} items-center justify-center`}>
        Loading Analytics...
      </div>
    );
  }



  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDarkMode ? "bg-[#0f172a] text-white" : "bg-gray-50 text-gray-900"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          doctorId={currentDoctor?.employeeId || currentDoctor?.id || null}
        />

        <main className="p-8 space-y-8 max-w-[1400px] mx-auto w-full">

          {/* Scan & Diagnostic Stats Row (Restored) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`p-6 rounded-2xl flex flex-col gap-3 relative overflow-hidden border backdrop-blur-sm transition-all hover:scale-[1.02] ${isDarkMode ? "bg-[#141414]/80 border-white/5 shadow-2xl shadow-black/50" : "bg-white border-gray-200 shadow-xl shadow-gray-200/50"}`}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#ccff00]/5 rounded-full -mr-8 -mt-8 animate-pulse"></div>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[#ccff00]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#ccff00] text-xl">visibility</span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Total Scans</span>
              </div>
              <div className="flex items-end justify-between mt-1">
                <span className={`text-4xl font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>{metrics.totalScans}</span>
                <div className="px-2 py-1 rounded-full bg-[#ccff00]/10 flex items-center gap-1">
                  <div className="size-1.5 rounded-full bg-[#ccff00] animate-pulse"></div>
                  <span className="text-[#ccff00] text-[10px] font-black uppercase tracking-tighter">Live</span>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl flex flex-col gap-3 relative overflow-hidden border backdrop-blur-sm transition-all hover:scale-[1.02] ${isDarkMode ? "bg-[#141414]/80 border-white/5 shadow-2xl shadow-black/50" : "bg-white border-gray-200 shadow-xl shadow-gray-200/50"}`}>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-cyan-500 text-xl">biotech</span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Detection Rate</span>
              </div>
              <div className="flex items-end justify-between mt-1">
                <span className={`text-4xl font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>{metrics.detectionRate}%</span>
                <span className={`text-[10px] font-bold ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>Overall Avg</span>
              </div>
            </div>

            <div className={`p-6 rounded-2xl flex flex-col gap-3 relative overflow-hidden border backdrop-blur-sm transition-all hover:scale-[1.02] ${isDarkMode ? "bg-[#141414]/80 border-white/5 shadow-2xl shadow-black/50" : "bg-white border-gray-200 shadow-xl shadow-gray-200/50"}`}>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[#ccff00]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#ccff00] text-xl">analytics</span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>AI Confidence</span>
              </div>
              <div className="flex items-end justify-between mt-1">
                <span className={`text-4xl font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>{metrics.avgAccuracy}%</span>
                <div className="flex items-center gap-1 text-[#ccff00]">
                  <span className="material-symbols-outlined text-sm">verified</span>
                  <span className="text-[10px] font-black uppercase tracking-tighter">High</span>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl flex flex-col gap-3 relative overflow-hidden border backdrop-blur-sm transition-all hover:scale-[1.02] ${isDarkMode ? "bg-[#141414]/80 border-white/5 shadow-2xl shadow-black/50" : "bg-white border-gray-200 shadow-xl shadow-gray-200/50"}`}>
              <div className="absolute -right-4 -bottom-4 size-20 bg-rose-500/5 rounded-full blur-2xl"></div>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-500 text-xl">event_upcoming</span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Monthly Intake</span>
              </div>
              <div className="flex items-end justify-between mt-1">
                <span className={`text-4xl font-black tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>{metrics.newCasesMonth}</span>
                <span className="text-rose-500 text-[10px] font-black uppercase tracking-tighter">Current</span>
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left Column: Daily Stats & Appointment Line Chart */}
            <div className="xl:col-span-2 space-y-8">
              <div className={`p-8 rounded-3xl border ${isDarkMode ? "bg-[#141414] border-[#ccff00]/15" : "bg-white border-gray-100 shadow-sm"}`}>
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Daily Appointment Stats</h3>
                    <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>Weekly Online Breakdown</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 cursor-pointer">more_horiz</span>
                </div>

                <div className="h-64 flex items-end justify-between gap-4 px-2 relative">
                  {metrics.dailyAppts.map((stats) => {
                    const max = Math.max(...metrics.dailyAppts.map(s => s.total), 5);
                    const hOnline = (stats.online / max) * 100;

                    return (
                      <div
                        key={stats.key}
                        className="flex-1 flex flex-col items-center gap-4 group cursor-pointer relative"
                        onMouseEnter={() => setHoveredDay(stats.day)}
                        onMouseLeave={() => setHoveredDay(null)}
                      >
                        {/* Interactive Tooltip */}
                        {hoveredDay === stats.day && (
                          <div className={`absolute -top-16 left-1/2 -translate-x-1/2 p-2 rounded-lg border z-50 whitespace-nowrap animate-in fade-in zoom-in duration-200 ${isDarkMode ? "bg-black border-white/20" : "bg-white border-gray-200 shadow-xl"}`}>
                            <p className="text-[10px] font-black uppercase text-slate-500 mb-1">{stats.day}, {stats.date}</p>
                            <div className="flex flex-col items-center px-2">
                              <span className="text-emerald-500 text-sm font-black">{stats.online}</span>
                              <span className="text-[8px] uppercase tracking-widest opacity-50 font-bold">Online Consults</span>
                            </div>
                          </div>
                        )}

                        <div className="w-full flex flex-col items-center justify-end rounded-xl bg-slate-800/10 relative overflow-hidden h-48 group-hover:bg-emerald-500/5 transition-all">
                          {/* Online Stat (Single stack) */}
                          <div className="w-[60%] bg-emerald-500 rounded-xl transition-all duration-700 ease-out relative z-10" style={{ height: `${hOnline}%` }}></div>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 mt-2">
                          <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${hoveredDay === stats.day ? "text-emerald-400" : isDarkMode ? "text-slate-400" : "text-gray-900"}`}>{stats.day}</span>
                          <span className={`text-[8px] font-bold uppercase tracking-widest opacity-40 ${isDarkMode ? "text-white" : "text-black"}`}>{stats.date}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`p-8 rounded-3xl border ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-gray-200"}`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Scans vs Detections</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#ccff00]"></span><span className="text-[10px] text-slate-500 uppercase font-black">Accuracy Trend</span></div>
                  </div>
                </div>
                <Chart data={metrics.monthData} isDarkMode={isDarkMode} />
              </div>
            </div>

            {/* Right Column: Donut Breakdown */}
            <div className="space-y-8">
              <div className={`p-8 rounded-3xl border flex flex-col items-center ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-gray-100"}`}>
                <div className="w-full flex justify-between items-center mb-10">
                  <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Patient Overview</h3>
                  <span className="material-symbols-outlined text-slate-500">more_horiz</span>
                </div>

                <div className="relative size-64 flex items-center justify-center p-4">
                  {/* Premium Donut Chart with Interactivity */}
                  <svg className="size-full -rotate-90 filter drop-shadow-[0_0_20px_rgba(0,0,0,0.3)]" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke={isDarkMode ? "#1e293b" : "#f1f5f9"} strokeWidth="4.5" />
                    {/* Segments */}
                    {[
                      { val: metrics.ageOverview.teen, color: "#ec4899", label: "Teen" },
                      { val: metrics.ageOverview.child, color: "#fbbf24", label: "Child" },
                      { val: metrics.ageOverview.adult, color: "#3b82f6", label: "Adult" },
                      { val: metrics.ageOverview.older, color: "#10b981", label: "Older" },
                      { val: metrics.ageOverview.unknown, color: "#94a3b8", label: "Unknown" }
                    ].map((seg, i, arr) => {
                      const total = metrics.totalPatients || 1;
                      const p = (seg.val / total) * 100;
                      const prevSum = arr.slice(0, i).reduce((acc, s) => acc + (s.val / total) * 100, 0);
                      if (p === 0) return null;
                      const isHovered = hoveredDemographic?.label === seg.label;

                      return (
                        <circle
                          key={i}
                          cx="18" cy="18" r="15.915"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={isHovered ? "5.5" : "4.5"}
                          strokeDasharray={`${p} ${100 - p}`}
                          strokeDashoffset={-prevSum}
                          strokeLinecap="round"
                          className="transition-all duration-500 cursor-pointer"
                          onMouseEnter={() => setHoveredDemographic({ ...seg, percentage: Math.round(p) })}
                          onMouseLeave={() => setHoveredDemographic(null)}
                          style={{
                            filter: isHovered ? `drop-shadow(0 0 8px ${seg.color})` : 'none',
                            opacity: hoveredDemographic && !isHovered ? 0.3 : 1
                          }}
                        />
                      );
                    })}
                  </svg>

                  {/* Dynamic Glassmorphic Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-all">
                    {hoveredDemographic ? (
                      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <span className={`text-4xl font-black mb-1`} style={{ color: hoveredDemographic.color }}>
                          {hoveredDemographic.percentage}%
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-80">
                          {hoveredDemographic.label}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center transition-opacity duration-300">
                        <span className={`text-5xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                          {metrics.totalPatients}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Patients
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-4 mt-12">
                  {[
                    { label: "Child", val: metrics.ageOverview.child, color: "bg-[#fbbf24]" },
                    { label: "Teen", val: metrics.ageOverview.teen, color: "bg-[#ec4899]" },
                    { label: "Adult", val: metrics.ageOverview.adult, color: "bg-[#3b82f6]" },
                    { label: "Older", val: metrics.ageOverview.older, color: "bg-[#10b981]" }
                  ].map(item => (
                    <div key={item.label} className="flex flex-col items-center p-3 rounded-2xl bg-white/5 border border-white/5">
                      <div className="flex items-center gap-1.5 leading-none">
                        <span className={`size-2 rounded-full ${item.color}`}></span>
                        <span className="text-lg font-black">{item.val}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-500 mt-1">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`p-8 rounded-3xl border ${isDarkMode ? "bg-cyan-500/10 border-cyan-400/20" : "bg-cyan-50 border-cyan-100"}`}>
                <h3 className={`text-lg font-black mb-4 ${isDarkMode ? "text-cyan-400" : "text-cyan-900"}`}>Upcoming Appointments</h3>
                <div className="space-y-4">
                  {(() => {
                    const todayLimit = new Date();
                    todayLimit.setHours(0, 0, 0, 0);

                    const upcoming = appointments
                      .filter(a => {
                        const apptDate = a.scheduledAt || a.bookedAt || a.createdAt;
                        if (!apptDate) return false;
                        const d = apptDate.seconds ? new Date(apptDate.seconds * 1000) : (typeof apptDate === 'number' ? new Date(apptDate) : new Date(apptDate));

                        // Robust Privacy Filter: Normalize names and IDs for maximum matching stability
                        const docIdMatch = a.doctorEmployeeId && currentDoctor && (a.doctorEmployeeId === currentDoctor.id || a.doctorEmployeeId === currentDoctor.employeeId);

                        const cleanNameA = (a.doctor || "").replace(/^Dr\.\s*/i, "").trim().toLowerCase();
                        const cleanNameB = (currentDoctor?.name || "").replace(/^Dr\.\s*/i, "").trim().toLowerCase();
                        const nameMatch = cleanNameA === cleanNameB && cleanNameB !== "";

                        const isTargetDoctor = docIdMatch || nameMatch;

                        // Strict Future Filter: only show engagements scheduled after the current precise millisecond
                        // Inclusive of 'rescheduled', 'accepted', and 'upcoming' states.
                        return isTargetDoctor && !isNaN(d.getTime()) && d.getTime() > Date.now() && (a.status !== "rejected" && a.status !== "cancelled");
                      })
                      .sort((a, b) => {
                        const tA = a.scheduledAt || a.bookedAt || a.createdAt;
                        const tB = b.scheduledAt || b.bookedAt || b.createdAt;
                        const timeA = tA?.seconds ? tA.seconds * 1000 : (typeof tA === 'number' ? tA : new Date(tA).getTime());
                        const timeB = tB?.seconds ? tB.seconds * 1000 : (typeof tB === 'number' ? tB : new Date(tB).getTime());
                        return timeA - timeB;
                      })
                      .slice(0, 5);

                    if (upcoming.length === 0) {
                      return (
                        <div className="flex flex-col items-center py-10 opacity-60">
                          <span className="material-symbols-outlined text-4xl text-slate-700 mb-3">event_busy</span>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">No Active Cases</p>
                        </div>
                      );
                    }

                      return upcoming.map(a => {
                        const apptDate = a.scheduledAt || a.bookedAt || a.createdAt;
                      let dateLabel = "Upcoming";
                      if (apptDate) {
                        const d = apptDate.seconds ? new Date(apptDate.seconds * 1000) : (typeof apptDate === 'number' ? new Date(apptDate) : new Date(apptDate));
                        dateLabel = d.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      }

                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 group cursor-pointer transition-colors hover:bg-white/5 p-1 rounded-xl"
                          onClick={() => navigate(`/doctor-dashboard?appointmentId=${a.id}`)}
                        >
                          <div className="size-10 rounded-xl bg-cyan-400/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl text-cyan-400">person</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate">{a.patientName || "Unknown"}</p>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1.5 mt-0.5">
                              <span className={`size-1 rounded-full ${a.status === 'accepted' ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                              {a.status || "Pending"} • {dateLabel}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-slate-400 text-sm opacity-0 group-hover:opacity-100">chevron_right</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Disease Distribution Section (Restored) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <DistributionCard title="Disease Distribution (CNN)" counts={metrics.diseaseCountsCnn} isDarkMode={isDarkMode} />
            <DistributionCard title="Disease Distribution (CNN + SVM)" counts={metrics.diseaseCountsSvm} isDarkMode={isDarkMode} />
          </div>

          {/* Advanced Analytics: Clinical Complexity & Specialist Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <CaseComplexityMatrix data={metrics.complexityCounts} isDarkMode={isDarkMode} />
            </div>
            <SpecialistPerformanceMap data={metrics.specialistStats} isDarkMode={isDarkMode} />
          </div>


          {/* High Risk Alerts */}
          <div className={`rounded-2xl overflow-hidden border ${isDarkMode ? "bg-[#141414] border-[#ccff00]/15" : "bg-white border-gray-200 shadow-sm"}`}>
            <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? "border-white/5" : "border-gray-100"}`}>
              <div>
                <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>High-Risk Alerts</h3>
                <p className={`text-sm ${isDarkMode ? "text-slate-500" : "text-gray-500"}`}>Recent scans requiring immediate specialist review</p>
              </div>
              <button
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                className="px-6 py-3 rounded-xl bg-[#222818] border border-[#ccff00]/10 text-[#ccff00] text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] hover:bg-[#2b331f] hover:border-[#ccff00]/30 shadow-2xl transition-all active:scale-95"
              >
                {showAllAlerts ? "Show Less" : "View All Alerts"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={isDarkMode ? "bg-white/5" : "bg-gray-50"}>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider rounded-tl-xl">Patient Profile</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Diagnosis Tag & Date (SVM)</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Confidence</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Review Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Doctor</th>
                    <th className="px-4 py-4 rounded-tr-xl"></th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? "divide-white/5" : "divide-gray-100"}`}>
                  {metrics.highRiskAlerts.length > 0 ? metrics.highRiskAlerts.map((alert, idx) => (
                    <tr key={idx} className={`transition-colors border-b last:border-0 cursor-pointer group ${isDarkMode ? "border-white/5 hover:bg-[#1a2333]" : "border-gray-200 hover:bg-gray-50"}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`size-11 shrink-0 rounded-lg overflow-hidden border ${isDarkMode ? "border-white/10" : "border-gray-200 shadow-sm"}`}>
                            {alert.imgUrl ? (
                              <img src={alert.imgUrl} className="size-full object-cover group-hover:scale-110 transition-transform duration-500" alt="scan" />
                            ) : (
                              <div className="size-full bg-slate-800 flex items-center justify-center text-slate-500">
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col mt-1">
                            <p className={`font-bold leading-none ${isDarkMode ? "text-white" : "text-gray-900"}`}>{alert.patientName}</p>
                            <p className={`text-[11px] font-semibold tracking-wide uppercase mt-1.5 ${isDarkMode ? "text-slate-500" : "text-gray-500"}`}>ID: {alert.patientId} • {alert.patientAge}yrs, {alert.patientGender}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide border uppercase ${alert.tag.toLowerCase().includes('glaucoma') ? (isDarkMode ? "bg-[#0ea5e9]/10 text-[#0ea5e9] border-[#0ea5e9]/20" : "bg-cyan-50 text-cyan-600 border-cyan-200") :
                            alert.tag.toLowerCase().includes('cataract') ? (isDarkMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200") :
                              (isDarkMode ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200")
                            }`}>
                            {alert.tag}
                          </span>
                          <span className={`text-[10px] font-bold tracking-wider ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                            Scanned: {alert.date ? alert.date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : "Recent"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold w-10 ${alert.confidence >= 95 ? (isDarkMode ? "text-rose-400" : "text-rose-600") : isDarkMode ? "text-white" : "text-gray-700"}`}>
                            {alert.confidence}%
                          </span>
                          <div className={`w-24 h-1.5 rounded-full overflow-hidden ${isDarkMode ? "bg-slate-800" : "bg-gray-200"}`}>
                            <div className={`h-full rounded-full transition-all duration-1000 ${alert.confidence >= 95 ? "bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_10px_rgba(225,29,72,0.5)]" :
                              alert.confidence >= 85 ? "bg-gradient-to-r from-orange-400 to-rose-500" :
                                "bg-[#ccff00]"
                              }`} style={{ width: `${alert.confidence}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            {alert.status === "Critical" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${alert.status === "Critical" ? "bg-rose-500" : alert.status === "Urgent Review" ? "bg-orange-500" : "bg-amber-400"}`}></span>
                          </span>
                          <span className={`text-xs uppercase font-bold tracking-wider ${alert.status === "Critical" ? (isDarkMode ? "text-rose-400" : "text-rose-600") :
                            alert.status === "Urgent Review" ? (isDarkMode ? "text-orange-400" : "text-orange-600") :
                              (isDarkMode ? "text-amber-400" : "text-amber-600")
                            }`}>
                            {alert.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{alert.doctor}</span>
                          <span className={`text-[10px] font-bold tracking-widest uppercase mt-0.5 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>Specialist</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => navigate("/prediction-results", {
                            state: {
                              patientId: alert.patientId,
                              imageUrl: alert.imgUrl
                            }
                          })}
                          className={`p-2 rounded-full transition-colors ${isDarkMode ? "hover:bg-white/10 text-slate-500 hover:text-[#ccff00]" : "hover:bg-gray-100 text-gray-400 hover:text-blue-600"}`}
                        >
                          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" className={`px-6 py-4 text-center text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>No high-risk alerts found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
