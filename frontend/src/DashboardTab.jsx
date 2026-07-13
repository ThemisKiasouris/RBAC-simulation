import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle, Terminal, Shield, Clock, List, Plus, Search, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


export default function DashboardTab({ currentUser }) {
  const [kpis, setKpis] = useState({ managed_users: 0, active_tasks: 0, recent_errors: 0 });
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const headers = { 'x-user': currentUser };
      try {
        const [kpiRes, logsRes, chartRes] = await Promise.all([
          fetch('http://127.0.0.1:8000/api/kpis', { headers }),
          fetch('http://127.0.0.1:8000/api/logs', { headers }),
          fetch('http://127.0.0.1:8000/api/chart-data', { headers })
        ]);
        if (kpiRes.ok) setKpis(await kpiRes.json());
        if (logsRes.ok) setLogs(await logsRes.json());
        if (chartRes.ok) setChartData(await chartRes.json());
      } catch (error) {
        console.error("API Error", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  return (
    <>
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Managed Entities */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-2 text-slate-500 mb-4">
            <Users size={20} className="text-blue-500" />
            <h3 className="font-semibold uppercase tracking-wider text-xs">Managed Entities</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.managed_users}</p>
        </div>
        {/*Active Tasks*/}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-2 text-slate-500 mb-4">
            <Activity size={20} className="text-emerald-500" />
            <h3 className="font-semibold uppercase tracking-wider text-xs">Active Tasks</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.active_tasks}</p>
        </div>
        {/*Errors*/}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-2 text-slate-500 mb-4">
            <AlertTriangle size={20} className="text-rose-500" />
            <h3 className="font-semibold uppercase tracking-wider text-xs">Errors (24h)</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.latest_errors}</p>
        </div>
      </div>

      {/* Charts & Feed Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-2 h-[400px] flex flex-col">
          <h3 className="font-bold text-lg mb-6">Activity History (Last 7 Days)</h3>
          <div className="flex-1 w-full min-h-0">
            {loading ? <p className="text-slate-400">Loading chart...</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} />
                  <Legend iconType="circle" />
                  <Bar dataKey="success" name="Successful Actions" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="error" name="Failed Actions" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[400px] flex flex-col">
          <h3 className="font-bold text-lg mb-6">Recent Activity</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {loading ? <p className="text-slate-400 text-sm">Loading logs...</p> : logs.slice(0, 5).map((log) => (
              <div key={log.id} className="border-b border-slate-50 pb-3 last:border-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm text-slate-700">{log.action_type}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    log.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{log.status}</span>
                </div>
                <p className="text-sm text-slate-500 font-mono text-xs mt-1 truncate">Target: {log.target_entity}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}