export type UserRole =
  | 'admin'
  | 'firmware-lead'
  | 'release-manager'
  | 'qa-director';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  role: UserRole;
  avatarBg: string;
  initials: string;
  avatarUrl?: string;
}

export interface UserSession {
  user: UserProfile;
  token: string;
  loginTime: string;
  isAuthenticated: boolean;
}

export const DEMO_USERS: UserProfile[] = [
  {
    id: 'usr-01',
    name: 'Manivannan Thangavel',
    email: 'mani.thangavel@sanmina.com',
    title: 'Software engineering manager',
    department: 'Platform Systems Engineering',
    role: 'admin',
    avatarBg: 'from-blue-600 to-indigo-600',
    initials: 'MT'
  },
  {
    id: 'usr-02',
    name: 'Vaishnavi Aasaithambi',
    email: 'vaishnavi.aasaithambi@sanmina.com',
    title: 'Technical lead',
    department: 'SW engineering',
    role: 'release-manager',
    avatarBg: 'from-purple-600 to-pink-600',
    initials: 'VA'
  },
  {
    id: 'usr-03',
    name: 'Judia Lumina',
    email: 'judia.lumina@sanmina.com',
    title: 'Team lead',
    department: 'SW engineering',
    role: 'firmware-lead',
    avatarBg: 'from-emerald-600 to-teal-600',
    initials: 'JL'
  }
];
