import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle, Terminal, Shield, Clock, List, Plus, Search, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


export default function AuditLogsTab({ currentUser }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/logs?limit=100', { headers: { 'x-user': currentUser } })
      .then(res => res.json())
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [currentUser]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-bold text-lg">Full Audit Trail</h3>
        <p className="text-sm text-slate-500">History of daemon actions matching your permissions.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Timestamp</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Action</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Target Entity</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Status</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-4 px-6 text-sm text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                <td className="py-4 px-6 font-medium text-slate-800">{log.action_type}</td>
                <td className="py-4 px-6 font-mono text-xs text-slate-600">{log.target_entity}</td>
                <td className="py-4 px-6">
                  <span className={`px-2 py-1 text-xs font-bold rounded-md ${log.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {log.status}
                  </span>
                </td>
                <td className="py-4 px-6 text-sm text-slate-500 max-w-md truncate">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}