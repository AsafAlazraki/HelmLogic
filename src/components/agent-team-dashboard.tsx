'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
  collection,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentRole = 'scrum-master' | 'developer' | 'test-lead';
type AgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked' | 'offline';
type TaskStatus = 'todo' | 'in-progress' | 'done';

interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask: string | null;
  lastUpdate: Timestamp | null;
  avatar: string;
  completedTasks: number;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'scrum-master';
  text: string;
  timestamp: Timestamp | null;
}

interface SprintTask {
  id: string;
  title: string;
  assignee: string | null;
  status: TaskStatus;
}

// ---------------------------------------------------------------------------
// Defaults & demo data
// ---------------------------------------------------------------------------

const DEFAULT_AGENTS: Omit<Agent, 'lastUpdate' | 'completedTasks' | 'currentTask'>[] = [
  { id: 'scrum-master', name: 'Scrum Master', role: 'scrum-master', avatar: '📋', status: 'idle' },
  { id: 'developer-1', name: 'Developer 1', role: 'developer', avatar: '👨‍💻', status: 'idle' },
  { id: 'developer-2', name: 'Developer 2', role: 'developer', avatar: '👩‍💻', status: 'idle' },
  { id: 'developer-3', name: 'Developer 3', role: 'developer', avatar: '🧑‍💻', status: 'idle' },
  { id: 'test-lead', name: 'Test Lead', role: 'test-lead', avatar: '🔍', status: 'idle' },
];

const DEMO_TASKS: SprintTask[] = [
  { id: '1', title: 'Select All in Boat Picker', assignee: 'Developer 1', status: 'todo' },
  { id: '2', title: 'Range Grouping in Editor', assignee: 'Developer 2', status: 'todo' },
  { id: '3', title: 'Sub Dealer Toggle on Creation', assignee: 'Developer 3', status: 'todo' },
  { id: '4', title: 'Branding Header in Viewer', assignee: null, status: 'todo' },
  { id: '5', title: 'Clickable Rows + Detail Panel', assignee: null, status: 'todo' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<AgentStatus, string> = {
  working: 'bg-green-500 animate-pulse',
  reviewing: 'bg-blue-400 animate-pulse',
  idle: 'bg-yellow-400',
  blocked: 'bg-red-500 animate-pulse',
  offline: 'bg-slate-400',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  working: 'Working',
  reviewing: 'Reviewing',
  idle: 'Idle',
  blocked: 'Blocked',
  offline: 'Offline',
};

const ROLE_BADGE: Record<AgentRole, string> = {
  'scrum-master': 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  developer: 'bg-green-500/15 text-green-600 border-green-500/30',
  'test-lead': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
};

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  todo: 'bg-slate-500/15 text-slate-500 border-slate-500/30',
  'in-progress': 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  done: 'bg-green-500/15 text-green-600 border-green-500/30',
};

function formatTimestamp(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card className="rounded-2xl border-2 w-40 flex flex-col items-center p-3 gap-1.5 bg-card/80 backdrop-blur">
      <span className="text-3xl leading-none">{agent.avatar}</span>
      <p className="text-xs font-semibold text-center leading-tight">{agent.name}</p>
      <Badge
        variant="outline"
        className={`text-[9px] uppercase tracking-widest font-black px-1.5 py-0 border ${ROLE_BADGE[agent.role]}`}
      >
        {agent.role.replace('-', ' ')}
      </Badge>
      <div className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[agent.status]}`} />
        <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">
          {STATUS_LABEL[agent.status]}
        </span>
      </div>
      {agent.currentTask && (
        <p className="text-[9px] text-muted-foreground text-center truncate w-full">
          {agent.currentTask}
        </p>
      )}
      <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
        {agent.completedTasks ?? 0} done
      </p>
    </Card>
  );
}

function TaskCard({ task }: { task: SprintTask }) {
  return (
    <Card className="rounded-2xl border-2 p-3 flex flex-col gap-1">
      <p className="text-xs font-semibold leading-tight">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        {task.assignee ? (
          <span className="text-[9px] text-muted-foreground truncate">{task.assignee}</span>
        ) : (
          <span className="text-[9px] text-slate-400 italic">Unassigned</span>
        )}
        <Badge
          variant="outline"
          className={`text-[9px] uppercase tracking-widest font-black px-1.5 py-0 border shrink-0 ${TASK_STATUS_BADGE[task.status]}`}
        >
          {task.status.replace('-', ' ')}
        </Badge>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export { AgentTeamDashboard as default };

export function AgentTeamDashboard() {
  const firestore = useFirestore();
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Firestore refs (memoised) ---

  const agentsRef = useMemoFirebase(
    () => collection(firestore, 'agent-team'),
    [firestore],
  );

  const messagesRef = useMemoFirebase(
    () => query(
      collection(firestore, 'agent-team/scrum-master/messages'),
      orderBy('timestamp', 'asc'),
      limit(100),
    ),
    [firestore],
  );

  const messagesColRef = useMemoFirebase(
    () => collection(firestore, 'agent-team/scrum-master/messages'),
    [firestore],
  );

  // --- Real-time listeners ---

  const { data: agentsData, loading: agentsLoading } = useCollection<Agent>(agentsRef);
  const { data: messagesData, loading: messagesLoading } = useCollection<ChatMessage>(messagesRef);

  // Merge live data with defaults so we always show the team
  const agents: Agent[] = DEFAULT_AGENTS.map((def) => {
    const live = agentsData?.find((a) => a.id === def.id);
    return live ?? {
      ...def,
      currentTask: null,
      lastUpdate: null,
      completedTasks: 0,
    };
  });

  const scrumMaster = agents.find((a) => a.role === 'scrum-master')!;
  const developers = agents.filter((a) => a.role === 'developer');
  const testLead = agents.find((a) => a.role === 'test-lead')!;

  // Sprint columns
  const todoTasks = DEMO_TASKS.filter((t) => t.status === 'todo');
  const inProgressTasks = DEMO_TASKS.filter((t) => t.status === 'in-progress');
  const doneTasks = DEMO_TASKS.filter((t) => t.status === 'done');

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  // --- Handlers ---

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addDoc(messagesColRef, {
        sender: 'user',
        text,
        timestamp: serverTimestamp(),
      });
      setMessageText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold tracking-tight">Agent Team Dashboard</h1>
        <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mt-1">
          Live agent status and sprint overview
        </p>
      </div>

      {/* ================================================================= */}
      {/* SECTION 1 — Team Overview / Hierarchy */}
      {/* ================================================================= */}
      <Card className="rounded-2xl border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold">Team Overview</CardTitle>
          <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
            Agent hierarchy and live status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[10px] uppercase tracking-widest font-black text-slate-400 animate-pulse">
                Loading agents...
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0">
              {/* User / Product Owner */}
              <Card className="rounded-2xl border-2 w-40 flex flex-col items-center p-3 gap-1.5 bg-slate-50 dark:bg-slate-900/40">
                <span className="text-3xl leading-none">👤</span>
                <p className="text-xs font-semibold">Product Owner</p>
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0 border bg-purple-500/15 text-purple-600 border-purple-500/30"
                >
                  you
                </Badge>
              </Card>

              {/* Connector: PO -> SM */}
              <div className="w-0.5 h-6 bg-slate-300 dark:bg-slate-600" />

              {/* Scrum Master */}
              <AgentCard agent={scrumMaster} />

              {/* Connector: SM -> Devs (branch) */}
              <div className="w-0.5 h-6 bg-slate-300 dark:bg-slate-600" />

              {/* Horizontal line spanning devs */}
              <div className="relative flex items-start justify-center">
                {/* Horizontal bar */}
                <div
                  className="absolute top-0 h-0.5 bg-slate-300 dark:bg-slate-600"
                  style={{ left: '25%', right: '25%', width: '50%' }}
                />
                <div className="flex gap-4">
                  {developers.map((dev) => (
                    <div key={dev.id} className="flex flex-col items-center">
                      <div className="w-0.5 h-6 bg-slate-300 dark:bg-slate-600" />
                      <AgentCard agent={dev} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Connector: middle dev -> Test Lead */}
              <div className="w-0.5 h-6 bg-slate-300 dark:bg-slate-600" />

              {/* Test Lead */}
              <AgentCard agent={testLead} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* SECTION 2 — Sprint Board */}
      {/* ================================================================= */}
      <Card className="rounded-2xl border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold">Sprint Board</CardTitle>
          <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
            Current sprint task breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {/* To Do */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                  To Do
                </span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto border">
                  {todoTasks.length}
                </Badge>
              </div>
              {todoTasks.length === 0 ? (
                <p className="text-[9px] text-slate-400 italic text-center py-4">No tasks</p>
              ) : (
                todoTasks.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>

            {/* In Progress */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                  In Progress
                </span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto border">
                  {inProgressTasks.length}
                </Badge>
              </div>
              {inProgressTasks.length === 0 ? (
                <p className="text-[9px] text-slate-400 italic text-center py-4">No tasks</p>
              ) : (
                inProgressTasks.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>

            {/* Done */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                  Done
                </span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto border">
                  {doneTasks.length}
                </Badge>
              </div>
              {doneTasks.length === 0 ? (
                <p className="text-[9px] text-slate-400 italic text-center py-4">No tasks</p>
              ) : (
                doneTasks.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* SECTION 3 — Chat with Scrum Master */}
      {/* ================================================================= */}
      <Card className="rounded-2xl border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold">Chat with Scrum Master</CardTitle>
          <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
            Direct line to your AI scrum master
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Messages area */}
          <ScrollArea className="h-72 rounded-2xl border-2 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="p-4 flex flex-col gap-3">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-[10px] uppercase tracking-widest font-black text-slate-400 animate-pulse">
                    Loading messages...
                  </span>
                </div>
              ) : !messagesData || messagesData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <span className="text-2xl">📋</span>
                  <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                    No messages yet
                  </span>
                  <span className="text-[9px] text-slate-400">
                    Send a message to start the conversation
                  </span>
                </div>
              ) : (
                messagesData.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-sm bg-card">
                        {isUser ? '👤' : '📋'}
                      </div>
                      {/* Bubble */}
                      <div
                        className={`rounded-2xl border-2 px-3 py-2 ${
                          isUser
                            ? 'bg-blue-500/10 border-blue-500/20'
                            : 'bg-card border-border'
                        }`}
                      >
                        <p className="text-xs leading-relaxed">{msg.text}</p>
                        {msg.timestamp && (
                          <p className="text-[9px] text-slate-400 mt-1">
                            {formatTimestamp(msg.timestamp)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Message the Scrum Master..."
              className="text-xs rounded-xl border-2"
              disabled={sending}
            />
            <Button
              type="submit"
              className="rounded-xl text-xs px-4 shrink-0"
              disabled={sending || !messageText.trim()}
            >
              {sending ? 'Sending...' : 'Send'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
