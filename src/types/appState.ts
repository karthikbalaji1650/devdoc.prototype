export type AppView = 
  | 'login'
  | 'dashboard'
  | 'hub'
  | 'doccraft'
  | 'operations'
  | 'coder'
  | 'data-management'
  | 'settings';

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
