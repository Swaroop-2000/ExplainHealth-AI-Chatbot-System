import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const DoctorHistorySidebar = () => {
    const { isDarkMode } = useTheme();
    const [doctor, setDoctor] = useState({ name: "Doctor", role: "Ophthalmologist" });

    useEffect(() => {
        const fetchDoctor = async () => {
            const user = auth.currentUser;
            if (user) {
                // Try to get doctor details. Assuming 'doctors' collection or just use auth display name
                // For now, mockup or basic auth data
                setDoctor({
                    name: user.displayName || "Dr. Sarah Chen",
                    role: "Ophthalmologist" // Hardcoded for matching design
                });
            }
        };
        fetchDoctor();
    }, []);

    const menuItems = [
        { icon: "dashboard", label: "Dashboard", path: "/doctor-dashboard" },
        { icon: "add_circle", label: "New Scan", path: "/doctor-dashboard?action=new" }, // Mockup link
        { icon: "history", label: "History Log", path: "/history" },
        { icon: "group", label: "Patient Database", path: "/patients" },
    ];

    return (
        <aside className={`flex h-screen w-64 flex-col justify-between p-6 sticky top-0 border-r transition-colors duration-300
      ${isDarkMode ? 'bg-[#0b1219] border-[#1e293b]' : 'bg-white border-gray-200'}`}>

            {/* TOP SECTION */}
            <div>
                {/* LOGO */}
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </div>
                    <h1 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>EyeAIPro</h1>
                </div>

                {/* NAVIGATION */}
                <nav className="flex flex-col gap-2">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.label}
                            to={item.path}
                            className={({ isActive }) =>
                                `flex items-center gap-4 px-4 py-3 rounded-lg transition-all group
                  ${isActive
                                    ? "bg-[#1c2a38] text-blue-500 border-l-4 border-blue-500" // Active state matching reference
                                    : "text-gray-500 hover:text-gray-300 hover:bg-[#1c2a38]/50"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <span className={`material-symbols-outlined text-[20px] ${isActive ? "text-blue-500" : "text-gray-500 group-hover:text-gray-300"}`}>
                                        {item.icon}
                                    </span>
                                    <span className={`text-sm font-medium ${isActive ? "text-blue-500" : ""}`}>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {/* BOTTOM SECTION - PROFILE */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'bg-[#16202a] border-[#2c3f50]' : 'bg-gray-50 border-gray-200'}`}>
                <div
                    className="w-10 h-10 rounded-lg bg-center bg-cover border border-blue-500/30"
                    style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCAzjlGx546I7YQEsVMliYfF0GrSochevCeArKaZ8rAH4E2-vfvP7u1NSyokS0hFenMUTzf1XzVrNdX0s7owmcobeOO95BqSiZVLKX2Ywu3aYATznE7HHBYTNCLGRVUFP09Q8o55fphr8fo1EaG4lPaL0JFF0JcowWuCWQQS7LWdMjY2imIoiqapL_0urCNXuVXb3tUdKjHfEvhLqwz9sHxwLQInp73JfKVk9PXSv3W_wlDih19zQ9F6_-0cEdgVQ-jdCwYoxIaKhE")' }}
                />
                <div>
                    <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{doctor.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{doctor.role}</p>
                </div>
                <span className="material-symbols-outlined text-gray-500 ml-auto cursor-pointer hover:text-white text-[18px]">logout</span>
            </div>

        </aside>
    );
};

export default DoctorHistorySidebar;
