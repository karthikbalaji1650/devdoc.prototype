import React, { useState } from 'react';
import { 
  Calendar, 
  ListTodo, 
  Plus, 
  BarChart3
} from 'lucide-react';
import type { GanttTaskItem } from '../../types/operations';

const INITIAL_GANTT_TASKS: GanttTaskItem[] = [
  {
    id: 'tsk-01',
    jiraKey: 'WH3-1205',
    title: 'Dual-Flash HPM REST upgrade investigation & C backend fix',
    assignee: 'Manivannan Thangavel',
    status: 'Done',
    priority: 'Highest',
    startDay: 1,
    durationDays: 5,
    progressPercent: 100,
    category: 'Firmware'
  },
  {
    id: 'tsk-02',
    jiraKey: 'WH3-1206',
    title: 'WebUI preserve_config payload validation & test scripts',
    assignee: 'Judia Lumina',
    status: 'Done',
    priority: 'High',
    startDay: 4,
    durationDays: 4,
    progressPercent: 100,
    category: 'REST API'
  },
  {
    id: 'tsk-03',
    jiraKey: 'WH3-1210',
    title: 'Dual-Image Bank switching stress & power-cycle verification',
    assignee: 'Vaishnavi Aasaithambi',
    status: 'In Review',
    priority: 'High',
    startDay: 8,
    durationDays: 6,
    progressPercent: 90,
    category: 'QA & Testing'
  },
  {
    id: 'tsk-04',
    jiraKey: 'WH3-1214',
    title: 'Cybersecurity REST API Fuzzing test execution & sign-off',
    assignee: 'Judia Lumina',
    status: 'Done',
    priority: 'Medium',
    startDay: 11,
    durationDays: 4,
    progressPercent: 100,
    category: 'Security'
  },
  {
    id: 'tsk-05',
    jiraKey: 'WH3-1220',
    title: 'WebSocket state streaming optimization for AST2600',
    assignee: 'Manivannan Thangavel',
    status: 'In Progress',
    priority: 'Medium',
    startDay: 14,
    durationDays: 8,
    progressPercent: 45,
    category: 'Firmware'
  },
  {
    id: 'tsk-06',
    jiraKey: 'WH3-1228',
    title: 'Automated CI/CD image regression build pipeline updates',
    assignee: 'Vaishnavi Aasaithambi',
    status: 'In Progress',
    priority: 'Low',
    startDay: 18,
    durationDays: 6,
    progressPercent: 30,
    category: 'DevOps & CI/CD'
  }
];

const MILESTONES = [
  { day: 7, label: 'Sprint 1 Code Cutoff' },
  { day: 14, label: 'Code Freeze & QA Matrix Lock' },
  { day: 21, label: 'Release Candidate 1 (RC1)' },
  { day: 26, label: 'Final GA Release Approval' }
];

export const GanttProjectManager: React.FC = () => {
  const [tasks, setTasks] = useState<GanttTaskItem[]>(INITIAL_GANTT_TASKS);
  const [viewMode, setViewMode] = useState<'gantt' | 'kanban'>('gantt');
  const [showAddModal, setShowAddModal] = useState(false);

  // New task form
  const [newTitle, setNewTitle] = useState('');
  const [newJira, setNewJira] = useState('WH3-1230');
  const [newAssignee, setNewAssignee] = useState('Manivannan Thangavel');
  const [newCategory, setNewCategory] = useState<GanttTaskItem['category']>('Firmware');
  const [newStartDay, setNewStartDay] = useState(5);
  const [newDuration, setNewDuration] = useState(5);

  const totalSprintDays = 28;

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTask: GanttTaskItem = {
      id: `tsk-${Date.now()}`,
      jiraKey: newJira,
      title: newTitle,
      assignee: newAssignee,
      status: 'To Do',
      priority: 'High',
      startDay: Number(newStartDay),
      durationDays: Number(newDuration),
      progressPercent: 0,
      category: newCategory
    };

    setTasks([...tasks, newTask]);
    setShowAddModal(false);
    setNewTitle('');
  };

  const getCategoryColor = (cat: GanttTaskItem['category']) => {
    switch (cat) {
      case 'Firmware':
        return 'from-blue-600 to-indigo-600 border-blue-500 text-white';
      case 'REST API':
        return 'from-cyan-600 to-teal-600 border-cyan-500 text-white';
      case 'QA & Testing':
        return 'from-emerald-600 to-green-600 border-emerald-500 text-white';
      case 'Security':
        return 'from-amber-600 to-orange-600 border-amber-500 text-white';
      case 'DevOps & CI/CD':
        return 'from-purple-600 to-pink-600 border-purple-500 text-white';
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              Option 4
            </span>
            <h2 className="text-xl font-bold text-slate-900">Project & Task Management (JIRA + Gantt Timeline)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Visual Gantt chart timeline tracking sprint milestones, task progress bars, and engineering deliverables.
          </p>
        </div>

        {/* Action and Switcher Buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('gantt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'gantt' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Gantt Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'kanban' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>Task Cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Gantt Chart View */}
      {viewMode === 'gantt' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-6 overflow-hidden">
          
          {/* Milestone Legend & Metrics */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-semibold text-slate-700">Sprint Milestones:</span>
              {MILESTONES.map((m, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Day {m.day}: {m.label}</span>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Current Date: <strong className="text-emerald-700 font-bold">Sprint Day 14 (Code Freeze)</strong>
            </div>
          </div>

          {/* Interactive Gantt Chart Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px] space-y-3">
              
              {/* Timeline Header (Days 1 to 28) */}
              <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-mono border-b border-slate-200 pb-2">
                <div className="col-span-4 text-slate-700 font-bold uppercase">Task & Assignee</div>
                <div className="col-span-8 grid grid-cols-4 text-center font-semibold">
                  <div className="border-r border-slate-200">Week 1 (Days 1-7)</div>
                  <div className="border-r border-slate-200">Week 2 (Days 8-14)</div>
                  <div className="border-r border-slate-200">Week 3 (Days 15-21)</div>
                  <div>Week 4 (Days 22-28)</div>
                </div>
              </div>

              {/* Task Rows with Bars */}
              <div className="space-y-3 pt-1">
                {tasks.map((task) => {
                  const leftPercent = ((task.startDay - 1) / totalSprintDays) * 100;
                  const widthPercent = (task.durationDays / totalSprintDays) * 100;

                  return (
                    <div key={task.id} className="grid grid-cols-12 gap-2 items-center text-xs group hover:bg-slate-50 p-2 rounded-xl transition-colors">
                      
                      {/* Left: Task Summary & JIRA Key */}
                      <div className="col-span-4 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-600 text-[11px]">{task.jiraKey}</span>
                          <span className="font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors" title={task.title}>
                            {task.title}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{task.assignee}</span>
                          <span>•</span>
                          <span className="text-slate-600">{task.category}</span>
                          <span>•</span>
                          <span className="font-mono text-emerald-700 font-bold">{task.progressPercent}%</span>
                        </div>
                      </div>

                      {/* Right: Gantt Bar Track */}
                      <div className="col-span-8 relative h-9 bg-slate-100 rounded-xl border border-slate-200 flex items-center px-1 overflow-hidden">
                        
                        {/* Milestone vertical dotted lines */}
                        {MILESTONES.map((m, idx) => {
                          const mPercent = ((m.day - 1) / totalSprintDays) * 100;
                          return (
                            <div
                              key={idx}
                              style={{ left: `${mPercent}%` }}
                              title={m.label}
                              className="absolute top-0 bottom-0 w-[1px] border-r border-dashed border-amber-400 pointer-events-none z-0"
                            />
                          );
                        })}

                        {/* Current Day Line */}
                        <div
                          style={{ left: `${(14 / totalSprintDays) * 100}%` }}
                          title="Today (Day 14)"
                          className="absolute top-0 bottom-0 w-[2px] bg-emerald-600 pointer-events-none z-10"
                        />

                        {/* The Task Bar */}
                        <div
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(widthPercent, 8)}%`
                          }}
                          className={`absolute h-7 rounded-lg bg-gradient-to-r ${getCategoryColor(task.category)} border shadow-xs flex items-center justify-between px-2 text-[10px] font-bold z-20 transition-all hover:brightness-105`}
                        >
                          <span className="truncate">{task.durationDays}d</span>
                          <span>{task.progressPercent}%</span>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* Kanban Task View */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {(['To Do', 'In Progress', 'In Review', 'Done'] as const).map((columnStatus) => {
            const colTasks = tasks.filter(t => t.status === columnStatus);
            return (
              <div key={columnStatus} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800">{columnStatus}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px]">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.map((t) => (
                    <div key={t.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 hover:border-blue-300 transition-colors shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-blue-600 text-[11px]">{t.jiraKey}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                          {t.category}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 leading-snug">{t.title}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                        <span>{t.assignee}</span>
                        <span className="font-mono text-emerald-700 font-bold">{t.progressPercent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Create New Sprint Task</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Task Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g. Implement dual-image watchdog timer"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">JIRA Key</label>
                  <input
                    type="text"
                    value={newJira}
                    onChange={(e) => setNewJira(e.target.value)}
                    placeholder="e.g. WH3-1230"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Assignee</label>
                  <input
                    type="text"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    placeholder="e.g. Mani Thangavel"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                >
                  <option value="Firmware">Firmware</option>
                  <option value="REST API">REST API</option>
                  <option value="QA & Testing">QA & Testing</option>
                  <option value="Security">Security</option>
                  <option value="DevOps & CI/CD">DevOps & CI/CD</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Start Day (1-28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={newStartDay}
                    onChange={(e) => setNewStartDay(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
