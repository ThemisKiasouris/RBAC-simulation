import React, { useState, useEffect } from 'react';
import { Activity, Users, Terminal, Shield, Clock, List } from 'lucide-react';
import DashboardTab from './DashboardTab';
import UserManagementTab from './UserManagerTab';
import CronTasksTab from './CronTasks';
import AuditLogsTab from './AuditLogs';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState('root_admin');

  // Security check: If a standard user tries to view the users tab, kick them back to dashboard
  useEffect(() => {
    if (currentUser === 'backend_dev' && activeTab === 'users') {
      setActiveTab('dashboard');
    }
  }, [currentUser, activeTab]);

  const navItems = [
    { id: 'dashboard', label: 'System Dashboard', icon: Activity },
    { id: 'users', label: 'User Management', icon: Users, managerOnly: true },
    { id: 'tasks', label: 'Cron Tasks', icon: Clock },
    { id: 'logs', label: 'Audit Logs', icon: List },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <div className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 text-emerald-400">
          <Terminal size={28} />
          <h2 className="text-xl font-bold tracking-wider">INFRA-CTRL</h2>
        </div>
        <ul className="space-y-2 flex-1">
          {navItems.map((item) => {
            // Hide manager-only tabs from standard users
            if (item.managerOnly && currentUser !== 'root_admin') return null;
            
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <li 
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-blue-600 text-white font-medium shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* Dynamic Header & Role Switcher */}
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>
            <p className="text-slate-500 mt-1">Infrastructure Control Plane</p>
          </div>
          
          {/* SIMULATED AUTHENTICATION TOGGLE */}
          <div className="flex items-center gap-4 bg-white p-2 pr-4 rounded-xl shadow-sm border border-slate-200">
            <div className={`p-2 rounded-lg ${currentUser === 'root_admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              <Shield size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulate Login</span>
              <select 
                className="text-sm font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
                value={currentUser}
                onChange={(e) => setCurrentUser(e.target.value)}
              >
                <option value="root_admin">root_admin (Manager)</option>
                <option value="backend_dev">backend_dev (Standard User)</option>
              </select>
            </div>
          </div>
        </header>
        
        {/* Render the Active Page Component */}
        {activeTab === 'dashboard' && <DashboardTab currentUser={currentUser} />}
        {activeTab === 'users' && currentUser === 'root_admin' && <UserManagementTab currentUser={currentUser} />}
        {activeTab === 'tasks' && <CronTasksTab currentUser={currentUser} />}
        {activeTab === 'logs' && <AuditLogsTab currentUser={currentUser} />}

      </main>
    </div>
  );
}