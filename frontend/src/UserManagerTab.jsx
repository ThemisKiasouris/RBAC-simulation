import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle } from 'lucide-react';

function CreateUserForm({ currentUser, onCreate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    primary_group: '',
    d_role: 'user',
    has_sudo: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/kpis/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user': currentUser,
        },
        body: JSON.stringify({
          ...formData,
          has_sudo: Boolean(formData.has_sudo),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to create user');
      }

      setFormData({
        username: '',
        primary_group: '',
        d_role: 'user',
        has_sudo: false,
      });
      setIsOpen(false);
      onCreate?.();
    } catch (err) {
      setError(err.message || 'Unable to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setError('');
          setIsOpen(true);
        }}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
      >
        <Plus size={16} /> Create User
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-slate-800">Create New User</h4>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
                <input
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-0"
                  placeholder="e.g. api_worker"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Primary Group</label>
                <input
                  name="primary_group"
                  value={formData.primary_group}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-0"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Dashboard Role</label>
                  <select
                    name="d_role"
                    value={formData.d_role}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-0"
                  >
                    <option value="user">Standard User</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="has_sudo"
                    checked={formData.has_sudo}
                    onChange={handleChange}
                  />
                  Grant sudo access
                </label>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function UserManagementTab({ currentUser }) {
  const [users, setUsers] = useState([]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/users', {
        headers: { 'x-user': currentUser },
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <h3 className="text-lg font-bold">System Users</h3>
        <CreateUserForm currentUser={currentUser} onCreate={fetchUsers} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Username</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Group</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Dashboard Role</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Sudo</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">OS Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const roleValue = user.d_role ?? user.dashboard_role ?? 'user';
              return (
                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-800">{user.username}</td>
                  <td className="px-6 py-4 text-slate-500">{user.primary_group}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${roleValue === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                      {roleValue}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{user.has_sudo ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-4">
                    {user.expected_state === 'present' ? (
                      <span className="flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle size={16} /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm font-medium text-rose-600"><XCircle size={16} /> Revoked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}