import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle, Terminal } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function App() {
  const [kpis, setKpis] = useState({ managed_users: 0, active_tasks: 0, recent_errors: 0 });
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data from the Python FastAPI backend
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [kpiRes, logsRes, chartRes] = await Promise.all([
          fetch('http://127.0.0.1:8000/api/kpis'),
          fetch('http://127.0.0.1:8000/api/logs'),
          fetch('http://127.0.0.1:8000/api/chart-data') // Note: Using the endpoint name from your Python file
        ]);

        if (kpiRes.ok) setKpis(await kpiRes.json());
        if (logsRes.ok) setLogs(await logsRes.json());
        if (chartRes.ok) setChartData(await chartRes.json());
        
      } catch (error) {
        console.error("Failed to fetch from API. Is the Python server running?", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    
    // Optional: Refresh the dashboard every 30 seconds to show live daemon updates
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <div className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 text-emerald-400">
          <Terminal size={28} />
          <h2 className="text-xl font-bold tracking-wider">INFRA-CTRL</h2>
        </div>
        <ul className="space-y-4 text-slate-300">
          <li className="p-3 bg-slate-800 rounded-lg text-white font-medium cursor-pointer">System Dashboard</li>
          <li className="p-3 hover:bg-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer">User Management</li>
          <li className="p-3 hover:bg-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer">Cron Tasks</li>
          <li className="p-3 hover:bg-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer">Audit Logs</li>
        </ul>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">System Overview</h1>
          <p className="text-slate-500 mt-1">Live metrics from the Infrastructure Daemon</p>
        </header>
        
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
             <div className="flex items-center gap-2 text-slate-500 mb-4">
                <Users size={20} className="text-blue-500" />
                <h3 className="font-semibold uppercase tracking-wider text-xs">Managed Users</h3>
             </div>
             <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.managed_users}</p>
           </div>
           
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
             <div className="flex items-center gap-2 text-slate-500 mb-4">
                <Activity size={20} className="text-emerald-500" />
                <h3 className="font-semibold uppercase tracking-wider text-xs">Active Tasks</h3>
             </div>
             <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.active_tasks}</p>
           </div>
           
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
             <div className="flex items-center gap-2 text-slate-500 mb-4">
                <AlertTriangle size={20} className="text-rose-500" />
                <h3 className="font-semibold uppercase tracking-wider text-xs">Errors (24h)</h3>
             </div>
             <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.recent_errors}</p>
           </div>
        </div>

        {/* Charts & Feed Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart Component */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-2 h-[400px] flex flex-col">
            <h3 className="font-bold text-lg mb-6">Activity History (Last 7 Days)</h3>
            <div className="flex-1 w-full min-h-0">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400">Loading chart data...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="success" name="Successful Actions" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="error" name="Failed Actions" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          
          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[400px] flex flex-col">
            <h3 className="font-bold text-lg mb-6">Live Audit Feed</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {loading ? (
                <p className="text-slate-400 text-center mt-10">Loading logs...</p>
              ) : logs.length === 0 ? (
                <p className="text-slate-400 text-center mt-10">No recent activity.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="border-b border-slate-50 pb-3 last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-sm text-slate-700">{log.action_type}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        log.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 font-mono text-xs mt-1 truncate">
                      Target: {log.target_entity}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{log.timestamp}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}