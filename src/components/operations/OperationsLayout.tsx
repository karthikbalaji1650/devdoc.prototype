import React from 'react';
import type { AppView, OperationsTab } from '../../types/appState';
import type { UserProfile } from '../../types/auth';
import type { DocumentModel } from '../../types/document';
import type { IncidentItem } from '../../types/operations';

import { AppSidebar } from '../AppSidebar';
import { IncidentTracker } from './IncidentTracker';
import { ReleaseTracker } from './ReleaseTracker';
import { ReviewersLog } from './ReviewersLog';
import { TestCaseManager } from './TestCaseManager';

interface OperationsLayoutProps {
  activeTab: OperationsTab;
  onTabChange: (tab: OperationsTab) => void;
  user: UserProfile;
  currentDocument?: DocumentModel;
  onBackToHub: () => void;
  onLaunchDocCraft: (docId?: string, doc?: DocumentModel) => void;
  onExportIncidentToRCA: (incident: IncidentItem) => void;
  onLogout: () => void;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
}

export const OperationsLayout: React.FC<OperationsLayoutProps> = ({
  activeTab,
  user,
  currentDocument,
  onLaunchDocCraft,
  onExportIncidentToRCA,
  onLogout,
  onNavigate,
}) => {
  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#ededed] font-sans overflow-hidden">
      <AppSidebar
        user={user}
        activeView="operations"
        activeOpsTab={activeTab}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <main className="flex-1 flex flex-col overflow-y-auto bg-[#0a0a0a] p-6 md:p-8">
        {activeTab === 'incidents' && (
          <IncidentTracker onExportToDocCraftRCA={onExportIncidentToRCA} />
        )}
        {activeTab === 'releases' && (
          <ReleaseTracker onOpenDocument={(docId) => onLaunchDocCraft(docId)} />
        )}
        {activeTab === 'reviewers' && (
          <ReviewersLog currentDocument={currentDocument} onOpenDocCraft={() => onLaunchDocCraft()} />
        )}
        {activeTab === 'test-cases' && (
          <TestCaseManager
            currentDocument={currentDocument}
            onNavigateToDocCraft={(doc: DocumentModel) => onLaunchDocCraft(undefined, doc)}
          />
        )}
      </main>

    </div>
  );
};

