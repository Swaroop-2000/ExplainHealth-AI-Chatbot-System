import React, { useState } from "react";
import { useTheme } from "../context/ThemeContext";

const DoctorHistoryHeader = ({ searchTerm, setSearchTerm }) => {
    const { isDarkMode } = useTheme();
    const [isFocused, setIsFocused] = useState(false);

    return (
        <div className={`flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6`}>
            <div>
                <h1 className={`text-4xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Scan History Log</h1>
                <p className={`text-sm font-bold uppercase tracking-widest mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                    Review and manage finalized eye disease predictions
                </p>
            </div>

            <div className="flex items-center gap-4">
                {/* Search - PREMIUM Upgrade */}
                <div className={`relative group flex items-center transition-all duration-300 rounded-2xl border ${
                    isFocused 
                        ? (isDarkMode ? "bg-[#111a22] border-blue-500 ring-4 ring-blue-500/10 shadow-[0_0_30px_rgba(37,99,235,0.15)]" : "bg-white border-blue-500 ring-4 ring-blue-500/5 shadow-lg")
                        : (isDarkMode ? "bg-[#16202a]/80 border-white/5" : "bg-white border-gray-100 shadow-sm")
                } px-4 py-2.5 w-96`}>
                    <span className={`material-symbols-outlined transition-colors duration-300 ${isFocused ? 'text-blue-500' : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>search</span>
                    <input
                        type="text"
                        placeholder="Patient Name or ID..."
                        className={`bg-transparent border-none outline-none text-xs font-bold uppercase tracking-wider ml-3 w-full ${isDarkMode ? 'text-white placeholder:text-gray-500/60' : 'text-gray-900 placeholder:text-gray-400'}`}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm("")}
                            className="ml-2 text-gray-400 hover:text-blue-500 transition-colors flex items-center"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    )}
                </div>

                <button className={`flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 shadow-blue-600/20 hover:shadow-blue-600/40`}>
                    <span className="material-symbols-outlined text-[18px]">ios_share</span>
                    Export CSV
                </button>
            </div>
        </div>
    );
};

export default DoctorHistoryHeader;
