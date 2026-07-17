import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DashboardTab({ currentUser }) {
  const [kpis, setKpis] = useState({ managed_users: 0, active_tasks: 0, latest_errors: 0 });
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
        
        if (kpiRes.ok) {
           const data = await kpiRes.json();
           // Provide safe defaults if the API returns missing fields
           setKpis({
             managed_users: data?.managed_users || 0,
             active_tasks: data?.active_tasks || 0,
             latest_errors: data?.latest_errors || 0
           });
        }
        
        if (logsRes.ok) {
            const data = await logsRes.json();
            setLogs(Array.isArray(data) ? data : []);
        }
        
        if (chartRes.ok) {
            const data = await chartRes.json();
            setChartData(Array.isArray(data) ? data : []);
        }
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
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Users size={20} className="text-blue-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">Managed Entities</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.managed_users}</p>
        </div>
        <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Activity size={20} className="text-emerald-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">My Active Tasks</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.active_tasks}</p>
        </div>
        <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <AlertTriangle size={20} className="text-rose-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">Errors (24h)</h3>
          </div>
          <p className="text-4xl font-bold text-slate-800">{loading ? '-' : kpis.latest_errors}</p>
        </div>
      </div>

      {/* Charts & Feed Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex h-[400px] flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-6 text-lg font-bold">Activity History (Last 7 Days)</h3>
          <div className="min-h-0 w-full flex-1">
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
        
        <div className="flex h-[400px] flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-bold">Recent Activity</h3>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {loading ? <p className="text-sm text-slate-400">Loading logs...</p> : logs.slice(0, 5).map((log) => (
              <div key={log.id || Math.random()} className="border-b border-slate-50 pb-3 last:border-0">
                <div className="mb-1 flex items-start justify-between">
                  <span className="text-sm font-semibold text-slate-700">{log.action_type || 'Unknown Action'}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                    log.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{log.status || 'UNKNOWN'}</span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-sm text-slate-500">Target: {log.target_entity || 'N/A'}</p>
              </div>
            ))}
            {(!loading && logs.length === 0) && <p className="text-sm text-slate-400">No recent activity found.</p>}
          </div>
        </div>
      </div>
    </>
  );
}