export type AppView =
  | 'login'
  | 'dashboard'
  | 'doccraft'
  | 'operations'
  | 'coder'
  | 'settings';

export type OperationsTab =
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
