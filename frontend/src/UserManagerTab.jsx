import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle, Terminal, Shield, Clock, List, Plus, Search, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


export default function UserManagementTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/users', { headers: { 'x-user': currentUser } })
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [currentUser]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-bold text-lg">System Users</h3>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus size={16} /> Create User
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Username</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Group</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Dashboard Role</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Sudo</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">OS Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-4 px-6 font-medium text-slate-800">{user.username}</td>
                <td className="py-4 px-6 text-slate-500">{user.primary_group}</td>
                <td className="py-4 px-6">
                  <span className={`px-2 py-1 text-xs font-bold rounded-md ${user.dashboard_role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                    {user.dashboard_role}
                  </span>
                </td>
                <td className="py-4 px-6 text-slate-500">{user.has_sudo ? 'Yes' : 'No'}</td>
                <td className="py-4 px-6">
                  {user.expected_state === 'present' ? 
                    <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium"><CheckCircle size={16}/> Active</span> : 
                    <span className="flex items-center gap-1 text-rose-600 text-sm font-medium"><XCircle size={16}/> Revoked</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}