import { produce } from 'solid-js/store';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { store, setStore } from './core';
import type { AgentDef } from '../ipc/types';
import type { Agent } from './types';
import { refreshTaskStatus, clearAgentActivity, markAgentSpawned } from './taskStatus';
import { showNotification } from './notification';

function normalizeLegacyAgent(agent: AgentDef): AgentDef {
  if (agent.id !== 'gemini' && agent.command !== 'gemini') return agent;
  return {
    ...agent,
    id: 'opencode',
    name: 'OpenCode CLI',
    command: 'opencode',
    resume_args: ['--continue'],
    skip_permissions_args: [],
    description: 'OpenCode CLI agent',
  };
}

function dedupeAgentsById(agents: AgentDef[]): AgentDef[] {
  const byId = new Map<string, AgentDef>();
  for (const agent of agents) {
    if (!byId.has(agent.id)) byId.set(agent.id, agent);
  }
  return [...byId.values()];
}

export async function loadAgents(): Promise<void> {
  const agents = await invoke<AgentDef[]>(IPC.ListAgents);
  const normalized = dedupeAgentsById(agents.map(normalizeLegacyAgent));
  setStore('availableAgents', normalized);
}

export async function addAgentToTask(taskId: string, agentDef: AgentDef): Promise<void> {
  const task = store.tasks[taskId];
  if (!task) return;

  const agentId = crypto.randomUUID();
  const agent: Agent = {
    id: agentId,
    taskId,
    def: agentDef,
    resumed: false,
    status: 'running',
    exitCode: null,
    signal: null,
    lastOutput: [],
    generation: 0,
  };

  setStore(
    produce((s) => {
      s.agents[agentId] = agent;
      s.tasks[taskId].agentIds.push(agentId);
      s.activeAgentId = agentId;
    }),
  );

  // Start the agent as "busy" immediately, before any PTY data arrives.
  markAgentSpawned(agentId);
}

export function markAgentExited(
  agentId: string,
  exitInfo: { exit_code: number | null; signal: string | null; last_output: string[] },
): void {
  const agent = store.agents[agentId];
  setStore(
    produce((s) => {
      if (s.agents[agentId]) {
        s.agents[agentId].status = 'exited';
        s.agents[agentId].exitCode = exitInfo.exit_code;
        s.agents[agentId].signal = exitInfo.signal;
        s.agents[agentId].lastOutput = exitInfo.last_output;
      }
    }),
  );
  if (agent) {
    clearAgentActivity(agentId);
    refreshTaskStatus(agent.taskId);
  }
}

export async function restartAgent(agentId: string, useResumeArgs: boolean): Promise<void> {
  const agent = store.agents[agentId];
  if (!agent) return;
  const task = store.tasks[agent.taskId];
  if (!task) return;

  // Guard against a stale task whose worktree directory was removed externally.
  // Without this preflight check, restart/resume silently fails in the terminal.
  if (!task.directMode) {
    try {
      await invoke(IPC.GetWorktreeStatus, { worktreePath: task.worktreePath });
    } catch {
      showNotification(`无法重启：工作树不存在或不可访问 (${task.worktreePath})`);
      return;
    }
  }

  setStore(
    produce((s) => {
      if (s.agents[agentId]) {
        s.agents[agentId].status = 'running';
        s.agents[agentId].exitCode = null;
        s.agents[agentId].signal = null;
        s.agents[agentId].lastOutput = [];
        s.agents[agentId].resumed = useResumeArgs;
        s.agents[agentId].generation += 1;
      }
    }),
  );
  markAgentSpawned(agentId);
}
