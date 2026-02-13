import { z } from 'zod';

export const CreateProject = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(10),
  description: z.string().max(1000).optional(),
  enabledColumns: z.array(z.string()).optional(),
  color: z.string().optional()
});

export const UpdateProject = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(10).optional(),
  description: z.string().max(1000).optional(),
  active: z.boolean().optional(),
  enabledColumns: z.array(z.string()).optional(),
  color: z.string().optional()
});

export const UpdateProjectContext = z.object({
  description: z.string().max(5000).optional(),
  repoPath: z.string().max(500).optional(),
  localPath: z.string().max(500).optional(),
  notes: z.string().max(20000).optional()
});

export const CreateTask = z.object({
  projectId: z.string().min(1),
  columnName: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().optional().default(''),
  tags: z.string().optional().default(''),
  dueAt: z.string().datetime().optional(),
  assignee: z.string().optional(),
  createdBy: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(), // 'story' | 'bug' | 'epic'
  epicId: z.string().nullable().optional(),
  epicColor: z.string().optional()
});

export const UpdateTask = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  tags: z.string().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignee: z.string().optional(),
  createdBy: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  epicId: z.string().nullable().optional(),
  epicColor: z.string().optional(),
  columnName: z.string().min(1).optional()
});

export const CreateComment = z.object({
  author: z.string().optional(),
  body: z.string().min(1).max(5000)
});

export const Login = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200)
});

export const ChangePassword = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200)
});

export const AdminCreateUser = z.object({
  username: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  password: z.string().min(6).max(200),
  preferredAgentId: z.string().min(1).optional(),
  color: z.string().optional()
});

export const AdminUpdateUser = z.object({
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  active: z.boolean().optional(),
  monthlyTokenLimit: z.number().int().min(0).optional(),
  monthlyCostLimit: z.number().min(0).optional(),
  preferredAgentId: z.string().min(1).nullable().optional(),
  color: z.string().optional()
});

export const CreateRoutingRule = z.object({
  agentId: z.string().min(1),
  type: z.string().optional().default(''),
  priority: z.string().optional().default(''),
  assignee: z.string().optional().default(''),
  order: z.number().int().min(0).optional(),
  enabled: z.boolean().optional()
});

export const UpdateRoutingRule = z.object({
  agentId: z.string().min(1).optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  order: z.number().int().min(0).optional(),
  enabled: z.boolean().optional()
});

export const CreateNotificationSubscription = z.object({
  projectId: z.string().min(1).optional(),
  channel: z.enum(['slack', 'email']),
  target: z.string().min(1),
  mentionsOnly: z.boolean().optional(),
  active: z.boolean().optional()
});

export const UpdateNotificationSubscription = z.object({
  projectId: z.string().min(1).optional(),
  channel: z.enum(['slack', 'email']).optional(),
  target: z.string().min(1).optional(),
  mentionsOnly: z.boolean().optional(),
  active: z.boolean().optional()
});

export const AdminSetUserPassword = z.object({
  password: z.string().min(6).max(200)
});

export const AdminAssignUserProjects = z.object({
  projectIds: z.array(z.string().min(1)).default([])
});

export const UpdateMe = z.object({
  displayName: z.string().min(1).max(100).optional(),
  preferredAgentId: z.string().min(1).nullable().optional(),
  email: z.string().email().optional()
});

export const CreateAgent = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120).optional(),
  model: z.string().max(200).optional(),
  modelId: z.string().optional(),
  defaultModel: z.string().max(200).optional(),
  fallbackModel: z.string().max(200).optional(),
  talonId: z.string().max(120).optional(),
  isMain: z.boolean().optional(),
  soul: z.string().max(20000).optional(),
  bootstrap: z.string().max(20000).optional(),
  everyone: z.string().max(20000).optional(),
  guardrails: z.string().max(20000).optional(),
  status: z.enum(['idle', 'active', 'blocked']).optional(),
  sessionKey: z.string().max(200).optional(),
  currentTaskId: z.string().nullable().optional()
});

export const UpdateAgent = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.string().max(120).optional(),
  model: z.string().max(200).optional(),
  modelId: z.string().optional(),
  defaultModel: z.string().max(200).optional(),
  fallbackModel: z.string().max(200).optional(),
  talonId: z.string().max(120).optional(),
  isMain: z.boolean().optional(),
  soul: z.string().max(20000).optional(),
  bootstrap: z.string().max(20000).optional(),
  everyone: z.string().max(20000).optional(),
  guardrails: z.string().max(20000).optional(),
  status: z.enum(['idle', 'active', 'blocked']).optional(),
  sessionKey: z.string().max(200).optional(),
  currentTaskId: z.string().nullable().optional()
});

export const CreateDocument = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional().default(''),
  type: z.string().max(80).optional(),
  taskId: z.string().nullable().optional(),
  createdBy: z.string().max(80).optional()
});

export const UpdateDocument = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  type: z.string().max(80).optional(),
  taskId: z.string().nullable().optional()
});

export const CreateAgentMessage = z.object({
  author: z.string().max(120).optional(),
  body: z.string().min(1).max(5000)
});

export const MoveTask = z.object({
  columnName: z.string().min(1),
  order: z.number().int().min(0)
});

export const ReorderColumn = z.object({
  projectId: z.string().min(1),
  columnName: z.string().min(1),
  orderedTaskIds: z.array(z.string().min(1)).min(1)
});

export const JarvisChat = z.object({
  message: z.string().min(1).max(5000),
  agentId: z.string().optional(),
  sessionKey: z.string().optional()
});

export const TaskAgentChat = z.object({
  message: z.string().min(1).max(5000)
});

export const TalonAuthStart = z.object({
  provider: z.string().min(1)
});

export const TalonExchange = z.object({
  provider: z.string().min(1),
  state: z.string().optional(),
  code: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional()
});

export const TalonAuthRemove = z.object({
  provider: z.string().min(1)
});
