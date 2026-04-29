// src/components/Sidebar.js
import React from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const Sidebar = () => {
  const { isDarkMode } = useTheme();

  const menuItems = [
    { icon: "dashboard", label: "Dashboard", path: "/doctor-dashboard" },
    { icon: "history", label: "History Log", path: "/history" },
    { icon: "group", label: "Patients", path: "/patients" },
    { icon: "analytics", label: "Analytics", path: "/analytics" },
    { icon: "settings", label: "Settings", path: "/settings" },
  ];

  return (
    <aside className={`flex h-screen w-64 flex-col p-4 sticky top-0 border-r z-[100001] transition-colors duration-300
      ${isDarkMode ? 'bg-[#111a22] border-[#233648]' : 'bg-white border-gray-200'}`}>

      <div className="flex h-full flex-col justify-between">
        <div className="flex flex-col gap-4">
          {/* Doctor Profile */}
          <div className="flex items-center gap-3 p-2 relative z-[100001]">
            <div
              className={`bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border ${isDarkMode ? 'border-primary/30' : 'border-blue-200'}`}
              style={{
                backgroundImage:
                  'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCAzjlGx546I7YQEsVMliYfF0GrSochevCeArKaZ8rAH4E2-vfvP7u1NSyokS0hFenMUTzf1XzVrNdX0s7owmcobeOO95BqSiZVLKX2Ywu3aYATznE7HHBYTNCLGRVUFP09Q8o55fphr8fo1EaG4lPaL0JFF0JcowWuCWQQS7LWdMjY2imIoiqapL_0urCNXuVXb3tUdKjHfEvhLqwz9sHxwLQInp73JfKVk9PXSv3W_wlDih19zQ9F6_-0cEdgVQ-jdCwYoxIaKhE")',
              }}
            />
            <div>
              <h1 className={`text-base font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dr. Sarah Chen</h1>
              <p className={`text-sm ${isDarkMode ? 'text-muted-dark' : 'text-gray-500'}`}>Ophthalmologist</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex flex-col gap-2 pt-4">
            {menuItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                  ${isActive
                    ? isDarkMode ? "bg-[#233648] text-white" : "bg-blue-50 text-blue-600"
                    : isDarkMode ? "text-muted-dark hover:bg-[#233648]/60 hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[24px]">
                  {item.icon}
                </span>
                <p className="text-sm font-medium">{item.label}</p>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
