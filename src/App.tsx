import { useCallback, useEffect, useState } from 'react';
import { Sidebar, type NavRoute } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ProjectDetailModal } from './components/modals/ProjectDetailModal';
import { ProjectFormModal } from './components/modals/ProjectFormModal';
import { TaskFormModal } from './components/modals/TaskFormModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider, useI18n } from './i18n';
import { apiRequest } from './lib/api';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { AiAssistantPage } from './pages/AiAssistantPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ArchivePage } from './pages/ArchivePage';
import { AuthPage } from './pages/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { ControlCenterPage } from './pages/ControlCenterPage';
import { DashboardPage } from './pages/DashboardPage';
import { IdeasPage } from './pages/IdeasPage';
import { NotesFilesPage } from './pages/NotesFilesPage';
import { NotificationsRemindersPage } from './pages/NotificationsRemindersPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import type { Project, Task } from './types';

function CommandCenterShell({
  refreshSignal,
  triggerRefresh,
}: {
  refreshSignal: number;
  triggerRefresh: () => void;
}) {
  const { user, loading } = useAuth();
  const { l } = useI18n();
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Shared entity caches for modal selectors
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Global Modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultTaskDueDate, setDefaultTaskDueDate] = useState<string | null>(null);

  const loadSharedRefs = useCallback(async () => {
    if (!user) return;
    try {
      const [pRes, tRes, nRes] = await Promise.all([
        apiRequest<{ projects: Project[] }>('/api/projects?archived=0'),
        apiRequest<{ tasks: Task[] }>('/api/tasks?archived=0'),
        apiRequest<{ unreadCount: number }>('/api/notifications'),
      ]);
      setProjects(pRes.projects);
      setTasks(tRes.tasks);
      setUnreadCount(nRes.unreadCount);
    } catch {
      // Handled per-page
    }
  }, [user]);

  useEffect(() => {
    loadSharedRefs();
  }, [loadSharedRefs, refreshSignal]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] text-slate-300 flex items-center justify-center text-sm">
        {l('Noah Command Center başlatılıyor...', 'Starting Noah Command Center...')}
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const openNewProject = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const openNewTask = (dueDate: string | null = null) => {
    setEditingTask(null);
    setDefaultTaskDueDate(dueDate);
    setTaskModalOpen(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setDefaultTaskDueDate(null);
    setTaskModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        unreadCount={unreadCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeRoute={activeRoute}
          unreadCount={unreadCount}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={setActiveRoute}
          onQuickCreateTask={() => openNewTask(null)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeRoute === 'dashboard' && (
            <DashboardPage
              onNavigate={setActiveRoute}
              onOpenNewProject={openNewProject}
              onOpenNewTask={() => openNewTask(null)}
              onOpenProjectDetail={setDetailProjectId}
              refreshSignal={refreshSignal}
            />
          )}
          {activeRoute === 'control' && (
            <ControlCenterPage
              refreshSignal={refreshSignal}
              onOpenProjectDetail={setDetailProjectId}
            />
          )}
          {activeRoute === 'ai' && <AiAssistantPage onDataChanged={triggerRefresh} />}
          {activeRoute === 'projects' && (
            <ProjectsPage
              onOpenNewProject={openNewProject}
              onEditProject={openEditProject}
              onOpenProjectDetail={setDetailProjectId}
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
            />
          )}
          {activeRoute === 'tasks' && (
            <TasksPage
              projects={projects}
              onOpenNewTask={() => openNewTask(null)}
              onEditTask={openEditTask}
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
            />
          )}
          {activeRoute === 'ideas' && (
            <IdeasPage
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
              onOpenProjectDetail={setDetailProjectId}
            />
          )}
          {activeRoute === 'calendar' && (
            <CalendarPage
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
              onOpenNewTaskForDate={(date) => openNewTask(date)}
            />
          )}
          {activeRoute === 'analytics' && (
            <AnalyticsPage
              refreshSignal={refreshSignal}
              onOpenProjectDetail={setDetailProjectId}
            />
          )}
          {activeRoute === 'notes' && (
            <NotesFilesPage
              projects={projects}
              tasks={tasks}
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
            />
          )}
          {activeRoute === 'archive' && (
            <ArchivePage refreshSignal={refreshSignal} onDataChanged={triggerRefresh} />
          )}
          {activeRoute === 'activity' && <ActivityLogPage refreshSignal={refreshSignal} />}
          {activeRoute === 'notifications' && (
            <NotificationsRemindersPage
              projects={projects}
              refreshSignal={refreshSignal}
              onDataChanged={triggerRefresh}
              onNotificationsRead={setUnreadCount}
            />
          )}
          {activeRoute === 'settings' && <SettingsPage onDataChanged={triggerRefresh} />}
        </main>
      </div>

      <ProjectFormModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSaved={() => triggerRefresh()}
        initialProject={editingProject}
      />

      <TaskFormModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSaved={() => triggerRefresh()}
        projects={projects}
        initialTask={editingTask}
        defaultDueDate={defaultTaskDueDate}
      />

      <ProjectDetailModal
        projectId={detailProjectId}
        onClose={() => setDetailProjectId(null)}
        onDataChanged={triggerRefresh}
        onEditProject={openEditProject}
      />
    </div>
  );
}

function ShellWithLanguage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshSignal((s) => s + 1);
  }, []);

  return (
    <LanguageProvider onLanguageChanged={triggerRefresh}>
      <CommandCenterShell refreshSignal={refreshSignal} triggerRefresh={triggerRefresh} />
    </LanguageProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ShellWithLanguage />
      </AuthProvider>
    </ToastProvider>
  );
}
