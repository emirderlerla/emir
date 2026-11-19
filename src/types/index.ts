export const PROJECT_STATUSES = [
  'Fikir',
  'Araştırma',
  'Planlama',
  'Geliştirme',
  'Test',
  'Yayınlandı',
  'Beklemede',
  'Donduruldu',
  'İptal Edildi',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ACTIVE_FOCUS_STATUSES: ProjectStatus[] = [
  'Araştırma',
  'Planlama',
  'Geliştirme',
  'Test',
];

export const TASK_STATUSES = [
  'Yapılacak',
  'Devam Ediyor',
  'İncelemede',
  'Tamamlandı',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITY_LEVELS = [
  'Düşük',
  'Orta',
  'Yüksek',
  'Kritik',
] as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const DIFFICULTY_LEVELS = [
  'Kolay',
  'Orta',
  'Zor',
  'Çok Zor',
] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role_title: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  max_active_projects: number;
  allow_limit_override: boolean;
  inactive_days_threshold: number;
  theme: 'dark' | 'slate' | 'light';
  language: string;
  ai_persona: string;
  ai_auto_daily_summary: boolean;
  notify_overdue: boolean;
  notify_upcoming_days: number;
  notify_inactive_projects: boolean;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  priority: PriorityLevel;
  status: ProjectStatus;
  start_date: string | null;
  deadline: string | null;
  progress: number;
  tags: string[];
  is_archived: boolean;
  archived_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  task_count?: number;
  completed_task_count?: number;
  overdue_task_count?: number;
  milestone_count?: number;
  next_action?: string | null;
}

export interface Subtask {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name?: string | null;
  title: string;
  description: string;
  priority: PriorityLevel;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  estimated_minutes: number;
  actual_minutes: number;
  tags: string[];
  notes: string;
  completed_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  subtasks?: Subtask[];
}

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  potential: number;
  estimated_difficulty: DifficultyLevel;
  priority: PriorityLevel;
  tags: string[];
  notes: string;
  converted_project_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  user_id: string;
  project_id: string;
  project_name?: string;
  title: string;
  description: string;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  project_name?: string | null;
  task_title?: string | null;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  note_id: string | null;
  project_name?: string | null;
  task_title?: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  entity_title: string;
  action: string;
  details: string;
  created_at: string;
}

export interface PendingAiAction {
  id: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface AiConversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  pending_action: PendingAiAction | null;
  action_status: 'pending' | 'confirmed' | 'cancelled' | 'executed' | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  project_name?: string | null;
  task_title?: string | null;
  title: string;
  description: string;
  remind_at: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: 'deadline' | 'overdue' | 'milestone' | 'inactive' | 'ai' | 'control' | 'reminder';
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ControlProjectRisk {
  project: Project;
  riskReasons: string[];
  riskScore: number;
  daysSinceActivity: number;
  overdueTasks: number;
  hasNextAction: boolean;
  nextActionTitle: string | null;
}

export interface ControlSummary {
  activeFocusCount: number;
  maxActiveProjects: number;
  allowLimitOverride: boolean;
  isOverLimit: boolean;
  inactiveThresholdDays: number;
  atRiskProjects: ControlProjectRisk[];
  recommendedAttentionProject: ControlProjectRisk | null;
  totalOverdueTasks: number;
  projectsWithoutNextAction: number;
  inactiveProjectsCount: number;
}

export interface DashboardData {
  kpis: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    pendingTasks: number;
    completedTasks: number;
    overdueTasks: number;
    upcomingDeadlinesCount: number;
    weeklyProductivityRate: number;
  };
  projectStatusDistribution: Array<{ label: string; count: number }>;
  taskStatusDistribution: Array<{ label: string; count: number }>;
  weeklyProductivitySeries: Array<{ label: string; completed: number; created: number }>;
  projectProgressComparison: Array<{ id: string; name: string; progress: number; status: string }>;
  upcomingMilestones: Milestone[];
  priorityTasks: Task[];
  upcomingDeadlines: Array<{
    id: string;
    type: 'project' | 'task' | 'milestone';
    title: string;
    due_date: string;
    priority?: PriorityLevel;
    project_name?: string | null;
  }>;
  recentActivity: ActivityLog[];
  control: ControlSummary;
}
