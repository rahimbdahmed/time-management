import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadStoredData,
  saveStoredData,
  getTodayStr,
  getTomorrowStr,
  recordDeletedItemId,
  recordDeletedItemIds,
  mergeDeletedItemIds,
  isItemDeleted,
  getDeletedItemIds,
} from './utils/storage';
import { AppData, Task, Habit, Roadmap, TimeEntry, MonthlyGoal, YearlyVision, Milestone } from './types';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { DailyPlannerView } from './components/DailyPlannerView';
import { TimeAnalysisView } from './components/TimeAnalysisView';
import { HabitsView } from './components/HabitsView';
import { MonthlyPlannerView } from './components/MonthlyPlannerView';
import { YearlyPlannerView } from './components/YearlyPlannerView';
import { ReportsView } from './components/ReportsView';
import { ChecklistView } from './components/ChecklistView';
import { DailyRoutineView } from './components/DailyRoutineView';
import { NotesView } from './components/NotesView';
import { TaskModal } from './components/TaskModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { RemindersModal } from './components/RemindersModal';
import { playAlertChime, playSuccessChime } from './utils/audio';
import { fireConfetti } from './utils/confetti';
import { ChecklistGroup, ChecklistItem, DailyRoutineItem, NoteItem } from './types';
import {
  saveUserDataToCloud,
  loadUserDataFromCloud,
  fetchUserDataFromCloud,
  subscribeToUserData,
  signOutUser,
  getDeviceId,
  getClientSessionId,
  sendSyncPing,
  auth,
  onAuthStateChanged,
} from './lib/firebase';

// Apply authoritative cloud state during real-time sync, startup restore, or manual sync
export function applyAuthoritativeCloudData(cloud: Partial<AppData>, local: AppData): AppData {
  const isValid = <T extends { id: string }>(item: T | null | undefined): boolean => {
    return Boolean(item && item.id);
  };

  // Merge any remote deleted IDs into local persistent tombstones
  if (Array.isArray(cloud.deletedIds)) {
    mergeDeletedItemIds(cloud.deletedIds);
  }

  const localTombstones = Array.from(getDeletedItemIds());
  const deletedSet = new Set<string>([
    ...(cloud.deletedIds || []),
    ...(local.deletedIds || []),
    ...localTombstones,
  ]);

  const isNotDeleted = <T extends { id: string }>(item: T): boolean => {
    return isValid(item) && !deletedSet.has(item.id) && !isItemDeleted(item.id);
  };

  const cloudTasks = (cloud.tasks || []).filter(isNotDeleted);
  const cloudHabits = (cloud.habits || []).filter(isNotDeleted);
  const cloudRoutines = (cloud.dailyRoutine || [])
    .filter(isNotDeleted)
    .filter((item) => !/^dr-\d{1,2}$/.test(item.id));
  const cloudNotes = (cloud.notes || []).filter(isNotDeleted);
  const cloudChecklists = (cloud.checklists || []).filter(isNotDeleted);
  const cloudRoadmaps = (cloud.roadmaps || []).filter(isNotDeleted);
  const cloudTimeEntries = (cloud.timeEntries || []).filter(isNotDeleted);
  const cloudMonthlyGoals = (cloud.monthlyGoals || []).filter(isNotDeleted);

  const combinedDeletedIds = Array.from(
    new Set([
      ...(cloud.deletedIds || []),
      ...(local.deletedIds || []),
      ...localTombstones,
    ])
  ).slice(0, 500);

  return {
    ...local,
    tasks: cloudTasks,
    habits: cloudHabits,
    roadmaps: cloudRoadmaps,
    activeRoadmapId:
      cloud.activeRoadmapId ||
      (cloudRoadmaps[0] ? cloudRoadmaps[0].id : local.activeRoadmapId),
    timeEntries: cloudTimeEntries,
    monthlyGoals: cloudMonthlyGoals,
    yearlyVision:
      cloud.yearlyVision?.coreVision || cloud.yearlyVision?.theme
        ? cloud.yearlyVision
        : local.yearlyVision,
    checklists: cloudChecklists,
    activeChecklistId:
      cloud.activeChecklistId ||
      (cloudChecklists[0] ? cloudChecklists[0].id : local.activeChecklistId),
    dailyRoutine: cloudRoutines,
    notes: cloudNotes,
    deletedIds: combinedDeletedIds,
  };
}

// Authoritative sync: Cloud state is the single source of truth; never resurrect deleted items
export function mergeAppData(cloud: Partial<AppData>, local: AppData): AppData {
  return applyAuthoritativeCloudData(cloud, local);
}

export const App: React.FC = () => {
  const [data, setData] = useState<AppData>(() => loadStoredData());
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Gmail Cloud Sync State
  const [userEmail, setUserEmail] = useState<string>(() => {
    try {
      return localStorage.getItem('timecraft_user_gmail') || '';
    } catch {
      return '';
    }
  });
  const [userName, setUserName] = useState<string>(() => {
    try {
      return localStorage.getItem('timecraft_user_name') || '';
    } catch {
      return '';
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [remoteSyncAlert, setRemoteSyncAlert] = useState<string | null>(null);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser?.email) {
        const email = firebaseUser.email.toLowerCase();
        setUserEmail(email);
        const name = firebaseUser.displayName || '';
        if (name) setUserName(name);
        try {
          localStorage.setItem('timecraft_user_gmail', email);
          if (name) localStorage.setItem('timecraft_user_name', name);
        } catch {}
      }
    });
    return () => unsubscribe();
  }, []);

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskDefaultDate, setTaskDefaultDate] = useState(getTodayStr());

  const [isCloudSyncOpen, setIsCloudSyncOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [dailyPlannerMode, setDailyPlannerMode] = useState<'day' | 'upcoming'>('day');

  // Timestamp of the user's latest local action
  const lastLocalActionTimeRef = useRef<number>(0);

  // Flag to prevent echoing incoming remote Firestore updates back to Firestore
  const isRemoteUpdateRef = useRef<boolean>(false);
  const pendingSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Flag indicating whether the initial cloud state has finished loading for the active user
  const isInitialSyncCompletedRef = useRef<boolean>(false);

  // Directly perform authoritative cloud save
  const performCloudSave = useCallback((savePayload: AppData, actionTime?: number) => {
    if (!userEmail) return;
    if (pendingSaveTimeoutRef.current) {
      clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
    setIsSyncing(true);
    const resolvedTime = actionTime || lastLocalActionTimeRef.current || Date.now();
    saveUserDataToCloud(userEmail, savePayload, resolvedTime)
      .then((ok) => {
        if (ok) setLastSyncTime(new Date());
      })
      .catch((e) => console.warn('Cloud sync error:', e))
      .finally(() => setIsSyncing(false));
  }, [userEmail]);

  // Helper to immediately save locally and schedule cloud sync
  const syncToCloud = useCallback((nextData: AppData, isImmediate = false) => {
    saveStoredData(nextData);
    lastLocalActionTimeRef.current = Date.now();
    if (userEmail) {
      if (pendingSaveTimeoutRef.current) {
        clearTimeout(pendingSaveTimeoutRef.current);
        pendingSaveTimeoutRef.current = null;
      }
      if (isImmediate) {
        performCloudSave(nextData, lastLocalActionTimeRef.current);
      } else {
        pendingSaveTimeoutRef.current = setTimeout(() => {
          performCloudSave(nextData, lastLocalActionTimeRef.current);
        }, 150);
      }
    }
  }, [userEmail, performCloudSave]);

  // Auto-save on local data change: LocalStorage safety
  useEffect(() => {
    // 1. Always save immediately to LocalStorage (100% offline-ready)
    saveStoredData(data);

    // 2. If this state update was triggered by an incoming cloud update, cancel any pending save and do NOT echo!
    if (isRemoteUpdateRef.current) {
      if (pendingSaveTimeoutRef.current) {
        clearTimeout(pendingSaveTimeoutRef.current);
        pendingSaveTimeoutRef.current = null;
      }
      isRemoteUpdateRef.current = false;
      return;
    }
  }, [data]);

  // Real-time listener & proactive sync for incoming remote updates across devices (Notion/Google Docs grade)
  useEffect(() => {
    if (!userEmail) {
      isInitialSyncCompletedRef.current = true;
      return;
    }

    let isCancelled = false;

    // Fetch latest cloud state with conflict protection
    const fetchLatest = (showToast = false) => {
      fetchUserDataFromCloud(userEmail)
        .then((res) => {
          if (isCancelled) return;
          isInitialSyncCompletedRef.current = true;
          if (res.status === 'found' && res.data) {
            // Ignore if from our own session
            if (res.updatedBySessionId && res.updatedBySessionId === getClientSessionId()) {
              return;
            }

            // Cancel any pending local save to avoid overwriting newer cloud state
            if (pendingSaveTimeoutRef.current) {
              clearTimeout(pendingSaveTimeoutRef.current);
              pendingSaveTimeoutRef.current = null;
            }

            isRemoteUpdateRef.current = true;
            setData((prev) => {
              const updated = applyAuthoritativeCloudData(res.data, prev);
              saveStoredData(updated);
              return updated;
            });
            setLastSyncTime(new Date());

            if (showToast && res.updatedByDeviceId && res.updatedByDeviceId !== getDeviceId()) {
              setRemoteSyncAlert('📱 মোবাইল/অন্য ডিভাইস থেকে রিয়েল-টাইমে আপডেট হয়েছে!');
              setTimeout(() => setRemoteSyncAlert(null), 3000);
            }
          }
        })
        .catch(() => {
          isInitialSyncCompletedRef.current = true;
        });
    };

    // Initial load on mount or email change
    fetchLatest(false);

    // Live subscription: listens for changes made on other devices/tabs in real time
    const unsubscribe = subscribeToUserData(
      userEmail,
      (cloudData, updatedAt, updatedBySessionId, updatedByDeviceId, actionTime) => {
        if (isCancelled || !cloudData) return;

        // Ignore our own tab/session echo
        if (updatedBySessionId && updatedBySessionId === getClientSessionId()) {
          return;
        }

        // Cancel any pending save timer so this device won't echo back
        if (pendingSaveTimeoutRef.current) {
          clearTimeout(pendingSaveTimeoutRef.current);
          pendingSaveTimeoutRef.current = null;
        }

        isRemoteUpdateRef.current = true;
        isInitialSyncCompletedRef.current = true;
        setData((prev) => {
          const updated = applyAuthoritativeCloudData(cloudData, prev);
          saveStoredData(updated);
          return updated;
        });
        setLastSyncTime(new Date());

        // Toast notification confirming real-time update from another device
        if (updatedByDeviceId && updatedByDeviceId !== getDeviceId()) {
          setRemoteSyncAlert('📱 মোবাইল/অন্য ডিভাইস থেকে রিয়েল-টাইমে আপডেট হয়েছে!');
        } else {
          setRemoteSyncAlert('⚡ রিয়েল-টাইমে ডেটা সিঙ্ক হয়েছে!');
        }
        setTimeout(() => setRemoteSyncAlert(null), 3000);
      }
    );

    // Handle mobile screen wake-up / tab return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastLocalActionTimeRef.current > 2000) {
          fetchLatest(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userEmail]);

  // Periodic Reminder checker (runs every 30 seconds)
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;
      const todayStr = getTodayStr();

      data.tasks.forEach((t) => {
        if (
          t.hasReminder &&
          !t.completed &&
          !t.reminderDismissed &&
          t.date === todayStr &&
          (t.reminderTime === currentTimeStr || t.time === currentTimeStr)
        ) {
          playAlertChime();
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`আমার টাইম ম্যানেজমেন্ট রিমাইন্ডার: ${t.title}`, {
              body: `অগ্রাধিকার: ${t.priority} | সময়: ${t.time || currentTimeStr}`,
            });
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [data.tasks]);

  // Active reminders count
  const activeRemindersCount = data.tasks.filter(
    (t) => t.hasReminder && !t.completed && !t.reminderDismissed && t.date >= getTodayStr()
  ).length;

  // Task Actions
  const handleToggleTask = (taskId: string) => {
    lastLocalActionTimeRef.current = Date.now();
    setData((prev) => {
      let isNowCompleted = false;
      const updated = prev.tasks.map((t) => {
        if (t.id === taskId) {
          const nextCompleted = !t.completed;
          if (nextCompleted) {
            playSuccessChime();
            fireConfetti();
            isNowCompleted = true;
          }
          return {
            ...t,
            completed: nextCompleted,
            completedAt: nextCompleted ? new Date().toISOString() : undefined,
          };
        }
        return t;
      });
      const nextData = { ...prev, tasks: updated };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleSaveTask = (taskData: Partial<Task> & { id?: string }) => {
    lastLocalActionTimeRef.current = Date.now();
    setData((prev) => {
      let updatedTasks: Task[];
      if (taskData.id) {
        // Edit
        updatedTasks = prev.tasks.map((t) => (t.id === taskData.id ? ({ ...t, ...taskData } as Task) : t));
      } else {
        // Add
        const newTask: Task = {
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: (taskData.title || '').trim(),
          description: taskData.description ? taskData.description.trim() : '',
          date: taskData.date || getTodayStr(),
          time: taskData.time || '09:00',
          durationMinutes: taskData.durationMinutes || 60,
          priority: taskData.priority || 'P1',
          category: taskData.category || 'Work',
          completed: false,
          hasReminder: Boolean(taskData.hasReminder),
          reminderTime: taskData.reminderTime,
        };
        updatedTasks = [newTask, ...prev.tasks];
      }
      playSuccessChime();
      const nextData = { ...prev, tasks: updatedTasks };
      syncToCloud(nextData);
      return nextData;
    });
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  // Checklist Actions
  const handleUpdateChecklists = (updated: ChecklistGroup[], newActiveId?: string) => {
    lastLocalActionTimeRef.current = Date.now();
    let nextDataToSync: AppData | null = null;
    let hasDeletions = false;
    setData((prev) => {
      const removedGroupIds = (prev.checklists || []).filter(c => !updated.some(u => u.id === c.id)).map(c => c.id);
      if (removedGroupIds.length > 0) {
        hasDeletions = true;
        recordDeletedItemIds(removedGroupIds);
      }
      const nextDeletedIds = Array.from(new Set([...removedGroupIds, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        checklists: updated,
        activeChecklistId:
          updated.length > 0
            ? newActiveId || (updated.some((c) => c.id === prev.activeChecklistId) ? prev.activeChecklistId : updated[0]?.id)
            : undefined,
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, hasDeletions);
    }
  };

  const handleToggleChecklistItem = (checklistId: string, itemId: string) => {
    setData((prev) => {
      let isNowDone = false;
      const updated = (prev.checklists || []).map((cl) => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: cl.items.map((item) => {
              if (item.id === itemId) {
                const nextChecked = !item.checked;
                if (nextChecked) isNowDone = true;
                return { ...item, checked: nextChecked };
              }
              return item;
            }),
          };
        }
        return cl;
      });

      if (isNowDone) {
        playSuccessChime();
        fireConfetti();
      }

      const nextData = { ...prev, checklists: updated };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleAddChecklistItem = (checklistId: string, text: string) => {
    const newItem: ChecklistItem = {
      id: `item-${Date.now()}`,
      text,
      checked: false,
      category: 'সাধারণ',
      createdAt: getTodayStr(),
    };
    setData((prev) => {
      const updated = (prev.checklists || []).map((cl) => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: [newItem, ...(cl.items || [])],
          };
        }
        return cl;
      });
      const nextData = { ...prev, checklists: updated };
      syncToCloud(nextData);
      return nextData;
    });
    playSuccessChime();
  };

  const handleUpdateDailyRoutine = (updatedRoutine: DailyRoutineItem[]) => {
    lastLocalActionTimeRef.current = Date.now();
    let nextDataToSync: AppData | null = null;
    let hasDeletions = false;
    setData((prev) => {
      const removedIds = (prev.dailyRoutine || []).filter((r) => !updatedRoutine.some((u) => u.id === r.id)).map((r) => r.id);
      if (removedIds.length > 0) {
        hasDeletions = true;
        recordDeletedItemIds(removedIds);
      }
      const nextDeletedIds = Array.from(new Set([...removedIds, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        dailyRoutine: updatedRoutine,
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, hasDeletions);
    }
  };

  const handleUpdateNotes = (updatedNotes: NoteItem[]) => {
    lastLocalActionTimeRef.current = Date.now();
    let nextDataToSync: AppData | null = null;
    let hasDeletions = false;
    setData((prev) => {
      const removedIds = (prev.notes || []).filter((n) => !updatedNotes.some((u) => u.id === n.id)).map((n) => n.id);
      if (removedIds.length > 0) {
        hasDeletions = true;
        recordDeletedItemIds(removedIds);
      }
      const nextDeletedIds = Array.from(new Set([...removedIds, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        notes: updatedNotes,
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, hasDeletions);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    recordDeletedItemId(taskId);
    const now = Date.now();
    lastLocalActionTimeRef.current = now;
    let nextDataToSync: AppData | null = null;
    setData((prev) => {
      const nextDeletedIds = Array.from(new Set([taskId, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, true);
    }
  };

  const handleMoveTaskDate = (taskId: string, newDate: string) => {
    lastLocalActionTimeRef.current = Date.now();
    setData((prev) => {
      const nextData = {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, date: newDate } : t)),
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleReorderTasks = (newTasks: Task[]) => {
    lastLocalActionTimeRef.current = Date.now();
    setData((prev) => {
      const nextData = {
        ...prev,
        tasks: newTasks,
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleDismissReminder = (taskId: string) => {
    setData((prev) => {
      const nextData = {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, reminderDismissed: true } : t)),
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  // Habit Actions
  const handleToggleHabitDay = (habitId: string, dateStr: string) => {
    setData((prev) => {
      const updated = prev.habits.map((h) => {
        if (h.id === habitId) {
          const wasDone = Boolean(h.history[dateStr]);
          const newHistory = { ...h.history };
          if (wasDone) {
            delete newHistory[dateStr];
          } else {
            newHistory[dateStr] = true;
          }
          const currentStreak = wasDone ? Math.max(0, h.currentStreak - 1) : h.currentStreak + 1;
          const bestStreak = Math.max(h.bestStreak, currentStreak);
          return {
            ...h,
            history: newHistory,
            currentStreak,
            bestStreak,
          };
        }
        return h;
      });
      const nextData = { ...prev, habits: updated };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleAddHabit = (newHabitData: Omit<Habit, 'id' | 'currentStreak' | 'bestStreak' | 'createdAt' | 'history'>) => {
    const newHabit: Habit = {
      ...newHabitData,
      id: `habit-${Date.now()}`,
      currentStreak: 1,
      bestStreak: 1,
      createdAt: getTodayStr(),
      history: { [getTodayStr()]: true },
    };
    setData((prev) => {
      const nextData = {
        ...prev,
        habits: [newHabit, ...prev.habits],
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleDeleteHabit = (id: string) => {
    recordDeletedItemId(id);
    const now = Date.now();
    lastLocalActionTimeRef.current = now;
    let nextDataToSync: AppData | null = null;
    setData((prev) => {
      const nextDeletedIds = Array.from(new Set([id, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        habits: prev.habits.filter((h) => h.id !== id),
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, true);
    }
  };

  const handleReorderHabits = (newHabits: Habit[]) => {
    lastLocalActionTimeRef.current = Date.now();
    setData((prev) => {
      const nextData = {
        ...prev,
        habits: newHabits,
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  // Roadmap Actions
  const handleAddRoadmap = (roadmap: Roadmap) => {
    setData((prev) => {
      const nextData = {
        ...prev,
        roadmaps: [roadmap, ...prev.roadmaps],
        activeRoadmapId: roadmap.id,
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleUpdateRoadmap = (updatedRoadmap: Roadmap) => {
    setData((prev) => {
      const nextData = {
        ...prev,
        roadmaps: prev.roadmaps.map((r) => (r.id === updatedRoadmap.id ? updatedRoadmap : r)),
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleToggleMilestone = (roadmapId: string, phaseId: string, milestoneId: string) => {
    setData((prev) => {
      let isNowCompleted = false;
      const updatedRoadmaps = prev.roadmaps.map((r) => {
        if (r.id === roadmapId) {
          const updatedPhases = r.phases.map((p) => {
            if (p.id === phaseId) {
              const updatedMilestones = p.milestones.map((m) => {
                if (m.id === milestoneId) {
                  const nextState = !m.completed;
                  if (nextState) isNowCompleted = true;
                  return { ...m, completed: nextState };
                }
                return m;
              });
              return { ...p, milestones: updatedMilestones };
            }
            return p;
          });
          return { ...r, phases: updatedPhases };
        }
        return r;
      });

      if (isNowCompleted) {
        playSuccessChime();
        fireConfetti();
      }

      const nextData = { ...prev, roadmaps: updatedRoadmaps };
      syncToCloud(nextData);
      return nextData;
    });
  };

  // Time Entry Actions
  const handleAddTimeEntry = useCallback((entry: Omit<TimeEntry, 'id'>) => {
    const newEntry: TimeEntry = {
      ...entry,
      id: `te-${Date.now()}`,
    };
    setData((prev) => {
      const nextData = {
        ...prev,
        timeEntries: [newEntry, ...prev.timeEntries],
      };
      syncToCloud(nextData);
      return nextData;
    });
    playSuccessChime();
  }, [syncToCloud]);

  const handleDeleteTimeEntry = useCallback((id: string) => {
    recordDeletedItemId(id);
    const now = Date.now();
    lastLocalActionTimeRef.current = now;
    let nextDataToSync: AppData | null = null;
    setData((prev) => {
      const nextDeletedIds = Array.from(new Set([id, ...(prev.deletedIds || [])])).slice(0, 500);
      const nextData: AppData = {
        ...prev,
        timeEntries: prev.timeEntries.filter((e) => e.id !== id),
        deletedIds: nextDeletedIds,
      };
      saveStoredData(nextData);
      nextDataToSync = nextData;
      return nextData;
    });
    if (nextDataToSync) {
      syncToCloud(nextDataToSync, true);
    }
  }, [syncToCloud]);

  // Monthly & Yearly Actions
  const handleAddMonthlyGoal = (goal: Omit<MonthlyGoal, 'id'>) => {
    const newGoal: MonthlyGoal = {
      ...goal,
      id: `mg-${Date.now()}`,
    };
    setData((prev) => {
      const nextData = {
        ...prev,
        monthlyGoals: [...prev.monthlyGoals, newGoal],
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleToggleMonthlyGoal = (id: string) => {
    setData((prev) => {
      const nextData = {
        ...prev,
        monthlyGoals: prev.monthlyGoals.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g)),
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const handleUpdateYearlyVision = (vision: YearlyVision) => {
    setData((prev) => {
      const nextData = {
        ...prev,
        yearlyVision: vision,
      };
      syncToCloud(nextData);
      return nextData;
    });
  };

  const activeRoadmap = data.roadmaps.find((r) => r.id === data.activeRoadmapId) || data.roadmaps[0];

  // User Account & Real-time Cloud Sync Handlers
  const handleConnectEmail = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    setIsSyncing(true);

    try {
      // 1. Fetch existing cloud data BEFORE updating userEmail state!
      // This prevents React useEffect from firing performCloudSave with empty local data!
      const cloudResult = await fetchUserDataFromCloud(cleanEmail);

      // Now set userEmail in state & localStorage
      setUserEmail(cleanEmail);
      try {
        localStorage.setItem('timecraft_user_gmail', cleanEmail);
        localStorage.setItem('timecraft_last_input_email', cleanEmail);
      } catch {}

      if (cloudResult.status === 'found' && cloudResult.data) {
        const cloudData = cloudResult.data;
        // Merge cloud data with any local items created before signing in
        const mergedData = mergeAppData(cloudData, data);
        isRemoteUpdateRef.current = true;
        isInitialSyncCompletedRef.current = true;
        setData(mergedData);
        saveStoredData(mergedData);
        setLastSyncTime(new Date());
        playSuccessChime();
        fireConfetti();

        // Write the authoritative combined data back to cloud
        await saveUserDataToCloud(cleanEmail, mergedData);

        const taskCount = mergedData.tasks?.length || 0;
        const habitCount = mergedData.habits?.length || 0;
        return {
          success: true,
          isNew: false,
          message: `স্বাগতম! আপনার অ্যাকাউন্ট (${cleanEmail}) থেকে ${taskCount}টি কাজ, ${habitCount}টি অভ্যাস ও সম্পূর্ণ ডেটা লাইভ সিঙ্ক হয়েছে।`,
        };
      } else if (cloudResult.status === 'not_found') {
        // Brand new account: upload current local data
        isInitialSyncCompletedRef.current = true;
        setData(data);
        saveStoredData(data);
        await saveUserDataToCloud(cleanEmail, data);
        setLastSyncTime(new Date());
        playSuccessChime();
        return {
          success: true,
          isNew: true,
          message: `আপনার অ্যাকাউন্ট (${cleanEmail}) সফলভাবে যুক্ত হয়েছে এবং ডেটা ক্লাউডে সুরক্ষিত করা হয়েছে।`,
        };
      } else {
        // Network error - do not wipe cloud data!
        isInitialSyncCompletedRef.current = true;
        return {
          success: true,
          message: `অ্যাকাউন্ট যুক্ত হয়েছে। ইন্টারনেট সংযোগ স্বাভাবিক হলে ডেটা লাইভ সিঙ্ক হবে।`,
        };
      }
    } catch (err: any) {
      console.error('Error connecting email:', err);
      return {
        success: false,
        message: 'ইন্টারনেট কানেকশন চেক করে আবার চেষ্টা করুন।',
      };
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectEmail = async () => {
    await signOutUser();
    isInitialSyncCompletedRef.current = false;
    setUserEmail('');
    setUserName('');
    try {
      localStorage.removeItem('timecraft_user_gmail');
      localStorage.removeItem('timecraft_user_name');
    } catch {}
    setLastSyncTime(null);
  };

  const handleRestoreFromCloud = async (): Promise<{ success: boolean; message: string }> => {
    if (!userEmail) {
      return { success: false, message: 'প্রথমে আপনার জিমেইল কানেক্ট করুন।' };
    }
    setIsSyncing(true);
    try {
      const cloudData = await loadUserDataFromCloud(userEmail);
      if (cloudData && typeof cloudData === 'object') {
        isRemoteUpdateRef.current = true;
        const authoritative = applyAuthoritativeCloudData(cloudData, data);
        setData(authoritative);
        saveStoredData(authoritative);
        setLastSyncTime(new Date());
        playSuccessChime();
        fireConfetti();
        const taskCount = authoritative.tasks?.length || 0;
        const habitCount = authoritative.habits?.length || 0;
        const routineCount = authoritative.dailyRoutine?.length || 0;
        return {
          success: true,
          message: `ক্লাউড থেকে সফলভাবে ${habitCount}টি অভ্যাস, ${taskCount}টি কাজ ও সকল ডেটা রিস্টোর করা হয়েছে!`,
        };
      } else {
        return {
          success: false,
          message: 'এই জিমেইলে ক্লাউডে কোনো পূর্বের ব্যাকআপ ডাটা পাওয়া যায়নি।',
        };
      }
    } catch (err: any) {
      console.error('Error restoring from cloud:', err);
      return { success: false, message: 'ক্লাউড থেকে ডাটা লোড করতে সমস্যা হয়েছে। ইন্টারনেট চেক করুন।' };
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSyncNow = async () => {
    if (!userEmail) return false;
    setIsSyncing(true);
    try {
      const ok = await saveUserDataToCloud(userEmail, data);
      if (ok) setLastSyncTime(new Date());
      return ok;
    } catch {
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f7f4] text-[#1a2724] pb-20 md:pb-8 selection:bg-[#005B96]/20 selection:text-[#005B96]">
      {/* Top Header & Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewTask={() => {
          setEditingTask(null);
          setTaskDefaultDate(getTodayStr());
          setIsTaskModalOpen(true);
        }}
        onOpenReminders={() => setIsRemindersOpen(true)}
        onOpenCloudSync={() => setIsCloudSyncOpen(true)}
        activeRemindersCount={activeRemindersCount}
        userEmail={userEmail}
        isSyncing={isSyncing}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-8 md:pb-10">
        {activeTab === 'dashboard' && (
          <DashboardView
            tasks={data.tasks}
            habits={data.habits}
            activeRoadmap={activeRoadmap}
            timeEntries={data.timeEntries}
            yearlyVision={data.yearlyVision}
            dailyRoutine={data.dailyRoutine || []}
            onToggleTask={handleToggleTask}
            onNavigateTab={(tab) => {
              if (tab === 'daily') {
                setDailyPlannerMode('day');
              }
              setActiveTab(tab);
            }}
            onOpenUpcoming={() => {
              setDailyPlannerMode('upcoming');
              setActiveTab('daily');
            }}
            onOpenNewTask={() => {
              setEditingTask(null);
              setTaskDefaultDate(getTodayStr());
              setIsTaskModalOpen(true);
            }}
          />
        )}

        {activeTab === 'daily-routine' && (
          <DailyRoutineView
            dailyRoutine={data.dailyRoutine || []}
            onUpdateDailyRoutine={handleUpdateDailyRoutine}
          />
        )}

        {activeTab === 'checklists' && (
          <ChecklistView
            checklists={data.checklists || []}
            activeChecklistId={data.activeChecklistId}
            onUpdateChecklists={handleUpdateChecklists}
          />
        )}

        {activeTab === 'notes' && (
          <NotesView
            notes={data.notes || []}
            onUpdateNotes={handleUpdateNotes}
          />
        )}

        {activeTab === 'daily' && (
          <DailyPlannerView
            tasks={data.tasks}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onEditTask={(task) => {
              setEditingTask(task);
              setIsTaskModalOpen(true);
            }}
            onOpenNewTask={(customDate?: string) => {
              setEditingTask(null);
              setTaskDefaultDate(customDate || getTodayStr());
              setIsTaskModalOpen(true);
            }}
            onMoveTaskDate={handleMoveTaskDate}
            onReorderTasks={handleReorderTasks}
            initialMode={dailyPlannerMode}
          />
        )}

        {activeTab === 'time-analysis' && (
          <TimeAnalysisView
            timeEntries={data.timeEntries}
            onAddTimeEntry={handleAddTimeEntry}
            onDeleteTimeEntry={handleDeleteTimeEntry}
          />
        )}

        {(activeTab === 'yearly' || activeTab === 'roadmap') && (
          <YearlyPlannerView
            yearlyVision={data.yearlyVision}
            onUpdateYearlyVision={handleUpdateYearlyVision}
          />
        )}

        {activeTab === 'habits' && (
          <HabitsView
            habits={data.habits}
            onToggleHabitDay={handleToggleHabitDay}
            onAddHabit={handleAddHabit}
            onDeleteHabit={handleDeleteHabit}
            onReorderHabits={handleReorderHabits}
          />
        )}

        {activeTab === 'monthly' && (
          <MonthlyPlannerView
            tasks={data.tasks}
            monthlyGoals={data.monthlyGoals}
            onAddMonthlyGoal={handleAddMonthlyGoal}
            onToggleMonthlyGoal={handleToggleMonthlyGoal}
            onSelectDate={(dateStr) => {
              setActiveTab('daily');
            }}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            tasks={data.tasks}
            habits={data.habits}
            activeRoadmap={activeRoadmap}
            timeEntries={data.timeEntries}
          />
        )}
      </main>

      {/* Global Modals */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        editingTask={editingTask}
        defaultDate={taskDefaultDate}
      />

      <CloudSyncModal
        isOpen={isCloudSyncOpen}
        onClose={() => setIsCloudSyncOpen(false)}
        appData={data}
        onRestoreData={(restored) => {
          setData(restored);
          saveStoredData(restored);
          syncToCloud(restored, true);
        }}
        userEmail={userEmail}
        userName={userName}
        onConnectEmail={handleConnectEmail}
        onDisconnectEmail={handleDisconnectEmail}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        onManualSyncNow={handleManualSyncNow}
      />

      <RemindersModal
        isOpen={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
        tasks={data.tasks}
        onDismissReminder={handleDismissReminder}
      />
    </div>
  );
};

export default App;
