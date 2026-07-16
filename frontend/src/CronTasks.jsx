import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

// ---  MODAL FOR CREATE & EDIT ---
function TaskModal({ currentUser, isOpen, onClose, onRefresh, taskToEdit }) {
  const [formData, setFormData] = useState({
    task_name: '',
    cron_expression: '',
    command_to_run: '',
    run_as_user: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Populate the form if we are editing an existing task
  useEffect(() => {
    if (taskToEdit) {
      setFormData({
        task_name: taskToEdit.task_name,
        cron_expression: taskToEdit.cron_expression,
        command_to_run: taskToEdit.command_to_run,
        run_as_user: taskToEdit.run_as_user,
      });
    } else {
      setFormData({ task_name: '', cron_expression: '', command_to_run: '', run_as_user: '' });
    }
  }, [taskToEdit, isOpen]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    const isEditing = Boolean(taskToEdit);
    const url = isEditing 
      ? `http://127.0.0.1:8000/api/tasks/${taskToEdit.task_id}` 
      : 'http://127.0.0.1:8000/api/tasks';

    try {
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user': currentUser,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Unable to ${isEditing ? 'update' : 'create'} task`);
      
      onClose();
      onRefresh(); // Refresh the table
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-slate-800">
            {taskToEdit ? 'Edit Task Blueprint' : 'Create New Task Blueprint'}
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Task Name</label>
            <input
              name="task_name"
              value={formData.task_name}
              onChange={handleChange}
              required
              disabled={!!taskToEdit} // Don't allow renaming the task (daemon relies on the name!)
              className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 ${taskToEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
              placeholder="e.g. Nightly Database Backup"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cron Schedule</label>
              <input
                name="cron_expression"
                value={formData.cron_expression}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
                placeholder="e.g. 0 2 * * *"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Run As User</label>
              <input
                name="run_as_user"
                value={formData.run_as_user}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="e.g. root"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Command to Run</label>
            <input
              name="command_to_run"
              value={formData.command_to_run}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
              placeholder="/opt/scripts/backup.sh"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {isSubmitting ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- MAIN TAB COMPONENT ---
export default function CronTasksTab({ currentUser }) {
  const [tasks, setTasks] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  
  // Track which row the user is confirming deletion for
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const isManager = currentUser === 'root_admin';

  const fetchTasks = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/tasks', {
        headers: { 'x-user': currentUser },
      });
      const data = await response.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [currentUser]);

  // Handle Edit Click
  const handleEditClick = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  // Handle Create Click
  const handleCreateClick = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  // Handle Delete Confirmation
  const handleDelete = async (taskId) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'x-user': currentUser }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data.detail || 'Failed to delete task';
        setDeleteError(message);
        return;
      }

      setConfirmDeleteId(null);
      fetchTasks();
    } catch (err) {
      console.error('Failed to delete task', err);
      setDeleteError('Network or server error while deleting task.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-bold text-lg">{currentUser === 'root_admin' ? 'All Scheduled Tasks' : 'My Assigned Tasks'}</h3>
        <button
          onClick={handleCreateClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
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
              {isManager && <th className="py-4 px-6 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.task_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-4 px-6 font-medium text-slate-800">{task.task_name}</td>
                <td className="py-4 px-6 font-mono text-sm text-blue-600 bg-blue-50/50 rounded">{task.cron_expression}</td>
                <td className="py-4 px-6 font-mono text-xs text-slate-500 max-w-xs truncate">{task.command_to_run}</td>
                <td className="py-4 px-6 text-slate-700 font-medium">{task.run_as_user}</td>
                {isManager ? (
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => handleEditClick(task)}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Edit Task"
                      >
                        <Edit2 size={16} />
                      </button>

                      {/* Inline Delete Confirmation */}
                      {confirmDeleteId === task.task_id ? (
                        <button 
                          onClick={() => handleDelete(task.task_id)} 
                          className="text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 px-2 py-1 rounded"
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            setConfirmDeleteId(task.task_id);
                            setDeleteError('');
                          }}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr><td colSpan={isManager ? 5 : 4} className="py-8 text-center text-slate-400">No tasks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {deleteError && <p className="mt-3 text-sm text-rose-600">{deleteError}</p>}

      <TaskModal 
        currentUser={currentUser}
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }} 
        onRefresh={fetchTasks}
        taskToEdit={editingTask}
      />
    </div>
  );
}