export type AppView =
  | 'login'
  | 'dashboard'
  | 'hub'
  | 'doccraft'
  | 'operations'
  | 'coder'
  | 'settings'
  // Settings opened on its System & Storage tab - admin-only (DDS-SRS-007/008).
  | 'data-management';

export type OperationsTab =
  | 'incidents'
  | 'releases'
  | 'reviewers'
  | 'test-cases';

export interface DockerContainerStatus {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'restarting' | 'stopped';
  port: number;
  cpu: string;
  memory: string;
  uptime: string;
}
