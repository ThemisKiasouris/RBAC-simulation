import React, { useState, useEffect } from 'react';
import { Activity, Users, AlertTriangle, Terminal, Shield, Clock, List, Plus, Search, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


export default function CronTasksTab({ currentUser }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/tasks', { headers: { 'x-user': currentUser } })
      .then(res => res.json())
      .then(data => setTasks(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [currentUser]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-bold text-lg">{currentUser === 'root_admin' ? 'All Scheduled Tasks' : 'My Assigned Tasks'}</h3>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus size={16} /> New Task Blueprint
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Task Name</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Cron Schedule</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Command</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Assigned Owner</th>
              <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.task_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-4 px-6 font-medium text-slate-800">{task.task_name}</td>
                <td className="py-4 px-6 font-mono text-sm text-blue-600 bg-blue-50/50 rounded">{task.cron_expression}</td>
                <td className="py-4 px-6 font-mono text-xs text-slate-500 max-w-xs truncate">{task.command_to_run}</td>
                <td className="py-4 px-6 text-slate-700 font-medium">{task.run_as_user}</td>
                <td className="py-4 px-6">
                  <button className="text-slate-400 hover:text-blue-600 text-sm font-medium transition-colors">Edit</button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr><td colSpan="5" className="py-8 text-center text-slate-400">No tasks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}