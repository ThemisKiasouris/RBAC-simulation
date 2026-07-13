// App Layout

import {useState, useEffect} from 'react';
import { Activity, Users, AlertTriangle } from 'lucide-react';


export default function App() {
    const [Logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const mockData = [
                    { id: 1, action: 'USER_CREATE', target: 'dev_admin', status: 'SUCCESS', time: '10:42 AM' },
                    { id: 2, action: 'TASK_DELETE', target: 'old_backup', status: 'SUCCESS', time: '10:15 AM' },
                    { id: 3, action: 'USER_CREATE', target: 'temp_intern', status: 'ERROR', time: '09:00 AM' }
                ];
                setLogs(mockData);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching logs:', error);
                setLoading(false);
            }
        };
        fetchLogs();

    }, []);

    return (
    <div className="dashboard-layout" style={{ display: 'flex', height: '100vh', backgroundColor: '#f4f6f8' }}>
      
      {/* SIDEBAR PLACEHOLDER */}
      <div style={{ width: '250px', backgroundColor: '#1e293b', color: 'white', padding: '20px' }}>
        <h2>Infra-Controller</h2>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '30px' }}>
          <li style={{ padding: '10px 0', cursor: 'pointer' }}>Dashboard</li>
          <li style={{ padding: '10px 0', cursor: 'pointer' }}>Manage Users</li>
          <li style={{ padding: '10px 0', cursor: 'pointer' }}>Cron Jobs</li>
        </ul>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
        <h1 style={{ marginBottom: '20px' }}>System Overview</h1>
        
        {/* KPI GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
           {/* You will replace these with <KpiCard /> components */}
           <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
             <h3 style={{ color: '#64748b' }}><Users size={18}/> Managed Users</h3>
             <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '10px 0 0 0' }}>12</p>
           </div>
           <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
             <h3 style={{ color: '#64748b' }}><Activity size={18}/> Active Tasks</h3>
             <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '10px 0 0 0' }}>8</p>
           </div>
           <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
             <h3 style={{ color: '#ef4444' }}><AlertTriangle size={18}/> Recent Errors</h3>
             <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '10px 0 0 0' }}>1</p>
           </div>
        </div>

        {/* BOTTOM HALF: Chart and Feed */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', height: '400px' }}>
            <h3>Activity History</h3>
            <p>Chart component goes here...</p>
          </div>
          
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', height: '400px', overflowY: 'auto' }}>
            <h3>Live Audit Feed</h3>
            {loading ? <p>Loading logs...</p> : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {logs.map(log => (
                  <li key={log.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <strong>{log.action}</strong> on <code>{log.target}</code>
                    <span style={{ float: 'right', color: log.status === 'ERROR' ? 'red' : 'green' }}>{log.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );

}