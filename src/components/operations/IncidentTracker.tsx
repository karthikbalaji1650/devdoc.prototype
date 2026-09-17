import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle
} from 'lucide-react';
import type { IncidentItem, IncidentSeverity, IncidentStatus } from '../../types/operations';
import { INITIAL_INCIDENTS } from '../../services/jiraService';

interface IncidentTrackerProps {
  onExportToDocCraftRCA?: (incident: IncidentItem) => void;
}

export const IncidentTracker: React.FC<IncidentTrackerProps> = ({ onExportToDocCraftRCA }) => {
  const [incidents, setIncidents] = useState<IncidentItem[]>(INITIAL_INCIDENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showNewModal, setShowNewModal] = useState(false);

  // New incident form state
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>('P2 - Critical');
  const [newSystem, setNewSystem] = useState('');
  const [newRootCause, setNewRootCause] = useState('');
  const [newOwner] = useState('Mani Thangavel');
  const [newJira, setNewJira] = useState('WH3-1225');

  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.affectedSystem.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.owner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === 'ALL' || inc.severity.startsWith(severityFilter);
    const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const handleCreateIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newInc: IncidentItem = {
      id: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      title: newTitle,
      severity: newSeverity,
      status: 'Investigating',
      affectedSystem: newSystem || 'Platform Hardware / REST API',
      rootCause: newRootCause || 'Under investigation by firmware platform engineers.',
      owner: newOwner,
      reportedDate: new Date().toISOString().replace('T', ' ').slice(0, 16),
      jiraTicket: newJira
    };

    setIncidents([newInc, ...incidents]);
    setShowNewModal(false);
    setNewTitle('');
    setNewSystem('');
    setNewRootCause('');
  };

  const getSeverityBadge = (severity: IncidentSeverity) => {
    if (severity.startsWith('P1')) {
      return <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">P1 - BLOCKER</span>;
    }
    if (severity.startsWith('P2')) {
      return <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">P2 - CRITICAL</span>;
    }
    if (severity.startsWith('P3')) {
      return <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">P3 - MAJOR</span>;
    }
    return <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">P4 - MINOR</span>;
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'Resolved':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case 'Monitoring':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 text-[11px] font-medium"><Clock className="w-3 h-3" /> Monitoring</span>;
      case 'Identified':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium"><AlertTriangle className="w-3 h-3" /> Identified</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium"><ShieldAlert className="w-3 h-3" /> Investigating</span>;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
              Option 1
            </span>
            <h2 className="text-xl font-bold text-slate-900">Incident Reporting & Tracking System</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Log technical production bugs, track Mean-Time-To-Resolve (MTTR), and generate 1-click RCA documents in DocCraft Studio.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Report New Incident</span>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, title, subsystem, or owner..."
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none shadow-xs"
            >
              <option value="ALL">All Severities</option>
              <option value="P1">P1 - Blocker</option>
              <option value="P2">P2 - Critical</option>
              <option value="P3">P3 - Major</option>
              <option value="P4">P4 - Minor</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none shadow-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="Investigating">Investigating</option>
              <option value="Identified">Identified</option>
              <option value="Monitoring">Monitoring</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Incident ID & Severity</th>
                <th className="py-3 px-4">Summary & Root Cause</th>
                <th className="py-3 px-4">Subsystem</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Owner & JIRA</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No incidents matched your filter query.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-slate-900 text-xs">{inc.id}</div>
                      <div className="mt-1">{getSeverityBadge(inc.severity)}</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-md">
                      <div className="font-semibold text-slate-900 text-xs">{inc.title}</div>
                      <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        <strong className="text-slate-700">RCA:</strong> {inc.rootCause}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-cyan-700 font-medium">
                      {inc.affectedSystem}
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(inc.status)}
                      {inc.ttrHours && (
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          TTR: {inc.ttrHours}h
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">{inc.owner}</div>
                      {inc.jiraTicket && (
                        <span className="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          {inc.jiraTicket}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onExportToDocCraftRCA?.(inc)}
                        title="Export Incident into DocCraft Studio as an RCA Document"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 transition-all text-xs font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Create RCA Doc</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Incident Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Log New Engineering Incident</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Incident Title / Summary</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g. Flash buffer overflow during dual-image verification"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-rose-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  >
                    <option value="P1 - Blocker">P1 - Blocker</option>
                    <option value="P2 - Critical">P2 - Critical</option>
                    <option value="P3 - Major">P3 - Major</option>
                    <option value="P4 - Minor">P4 - Minor</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">JIRA Ticket Key</label>
                  <input
                    type="text"
                    value={newJira}
                    onChange={(e) => setNewJira(e.target.value)}
                    placeholder="e.g. WH3-1225"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-rose-500 shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Impacted Subsystem</label>
                <input
                  type="text"
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value)}
                  placeholder="e.g. AST2600 Flash Controller / spx_restservice"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-rose-500 shadow-xs"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Root Cause Analysis / Preliminary Notes</label>
                <textarea
                  value={newRootCause}
                  onChange={(e) => setNewRootCause(e.target.value)}
                  rows={3}
                  placeholder="Explain what failed, error logs, and immediate mitigations..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-rose-500 resize-none shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-xs"
                >
                  Save & Log Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
