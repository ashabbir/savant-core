# Task Master LLM Model Registry — PRD

## Summary

Introduce a first-class LLM Model Registry to Task Master that allows users to:
1. **Register AI Providers** (Google, OpenAI, Anthropic, Ollama, Azure)
2. **Discover Available Models** from registered providers
3. **Register Selected Models** for use in the application
4. **Create Agents** that use registered models with automatic Talon sync

This replaces the current manual model string entry with a structured, provider-aware system that validates credentials, discovers available models, and seamlessly integrates with the Talon AI gateway.

---

## Goals

- **Provider Management**: CRUD operations for LLM providers with encrypted credential storage
- **Connectivity Validation**: Verify provider credentials and reachability before use
- **Model Discovery**: Fetch and display available models from each provider
- **Model Registry**: Store provider+model metadata, capabilities, and enabled state
- **Agent Integration**: When creating an agent, select from registered models; sync with Talon
- **API Key Security**: Encrypt credentials at rest; never expose in logs or responses

## Non-Goals

- Prompt orchestration, routing logic, or multi-model fallback (future enhancement)
- Provider fine-tuning or dataset management
- Full billing dashboards (store optional pricing metadata only)
- CLI interface (UI and API only for v1)

---

## Definitions

| Term | Description |
|------|-------------|
| **Provider** | An LLM platform (Google, OpenAI, Anthropic, Azure, Ollama) |
| **Model** | A specific model on a provider (e.g., `gemini-2.0-flash`, `gpt-4o`) |
| **Registered Model** | A model added to the registry with known metadata and enabled state |
| **Agent** | A Task Master agent that uses a registered model for AI tasks |

---

## Users & Personas

| Persona | Description |
|---------|-------------|
| **Admin** | Configures providers, validates connections, curates model registry |
| **Member** | Creates agents using registered models, uses AI features |

---

## Functional Requirements

### 1. Provider Management

#### Provider CRUD
- Create, read, update, delete providers
- Provider types: `google`, `openai`, `anthropic`, `azure`, `ollama`
- Fields vary by provider type:
  | Provider | Required | Optional |
  |----------|----------|----------|
  | Google | `api_key` | `base_url` |
  | OpenAI | `api_key` | `base_url`, `org_id` |
  | Anthropic | `api_key` | `base_url` |
  | Azure | `api_key`, `base_url`, `deployment_id` | |
  | Ollama | `base_url` | `api_key` |

#### Credential Security
- API keys encrypted at rest using AES-256-GCM
- Master key from `LLM_ENCRYPTION_KEY` environment variable
- Keys never returned in API responses after creation
- Show only last 4 characters in UI (e.g., `****abcd`)

### 2. Connectivity Validation

- "Test Connection" button performs a harmless API call to verify credentials
- Returns: `status` (valid/invalid), `message`, `latency_ms`
- Updates `last_validated_at` timestamp on success
- Actionable error messages for common failures

### 3. Model Discovery

#### Provider-Specific Discovery Endpoints

| Provider | Endpoint | Filter |
|----------|----------|--------|
| Google | `GET /v1/models` | `supportedGenerationMethods` contains `generateContent` |
| OpenAI | `GET /v1/models` | Filter to chat models |
| Anthropic | Static list | Known Claude models |
| Azure | Deployment-based | Uses configured deployment |
| Ollama | `GET /api/tags` | Local model tags |

#### Model Metadata Captured
- `provider_model_id` — canonical ID from provider
- `display_name` — human-readable name
- `modality` — array: `['text']`, `['text', 'vision']`, etc.
- `context_window` — token limit (if available)
- `input_cost_per_1k` — pricing (if available)
- `output_cost_per_1k` — pricing (if available)

### 4. Model Registration

- Select models from discovery list to add to registry
- Enable/disable models without deleting
- Store `last_synced_at` timestamp
- Unique constraint on `(provider_id, provider_model_id)`

### 5. Agent Integration

#### Agent Creation Flow
1. User opens "Create Agent" modal
2. User enters agent name, role, soul, guardrails
3. User selects **Provider** from dropdown
4. User selects **Model** from filtered dropdown (only enabled models from selected provider)
5. On save:
   - Agent created in Task Master database
   - Agent synced to Talon with provider config:
     ```json
     {
       "id": "agent-name",
       "model": "google/gemini-2.0-flash",
       "apiKey": "<decrypted-key>",
       "baseUrl": "<provider-base-url>"
     }
     ```

#### Talon Sync
- On agent create/update: POST/PUT to Talon gateway with model configuration
- On agent delete: DELETE from Talon (non-blocking on failure)
- API key passed securely to Talon; Talon uses it for LLM calls

---

## Data Model (MongoDB via Prisma)

### New Models

```prisma
// LLM Provider
model LlmProvider {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  name            String    @unique
  providerType    String    // google, openai, anthropic, azure, ollama
  baseUrl         String?
  encryptedApiKey Bytes?
  apiKeyNonce     Bytes?
  apiKeyTag       Bytes?
  orgId           String?   // For OpenAI
  deploymentId    String?   // For Azure
  status          String    @default("unknown") // unknown, valid, invalid
  lastValidatedAt DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  models          LlmModel[]
}

// LLM Model
model LlmModel {
  id              String      @id @default(auto()) @map("_id") @db.ObjectId
  providerId      String      @db.ObjectId
  provider        LlmProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  providerModelId String      // e.g., "gemini-2.0-flash"
  displayName     String
  modality        String[]    @default([])
  contextWindow   Int?
  inputCostPer1k  Float?
  outputCostPer1k Float?
  enabled         Boolean     @default(true)
  meta            Json        @default("{}")
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@unique([providerId, providerModelId])
}
```

### Updated Agent Model

```prisma
model Agent {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  name         String    @unique
  role         String?
  // model field DEPRECATED - use modelId instead
  model        String?   // Legacy field - provider/model string
  modelId      String?   @db.ObjectId  // NEW: Reference to LlmModel
  llmModel     LlmModel? @relation(fields: [modelId], references: [id])
  talonId      String?
  soul         String?
  guardrails   String?
  status       String    @default("idle")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  // ... existing fields
}
```

---

## API Endpoints

### Provider Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/llm/providers` | List all providers | Admin |
| POST | `/api/llm/providers` | Create a provider | Admin |
| GET | `/api/llm/providers/:id` | Get provider details | Admin |
| PATCH | `/api/llm/providers/:id` | Update provider | Admin |
| DELETE | `/api/llm/providers/:id` | Delete provider | Admin |
| POST | `/api/llm/providers/:id/test` | Test connection | Admin |
| GET | `/api/llm/providers/:id/discover` | Discover models | Admin |

### Model Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/llm/models` | List registered models | Authed |
| POST | `/api/llm/models` | Register models from discovery | Admin |
| PATCH | `/api/llm/models/:id` | Update model (enable/disable) | Admin |
| DELETE | `/api/llm/models/:id` | Remove from registry | Admin |

### Updated Agent Endpoints

| Method | Endpoint | Description | Change |
|--------|----------|-------------|--------|
| GET | `/api/agents` | List agents | Include `llmModel` relation |
| POST | `/api/agents` | Create agent | Accept `modelId` instead of `model` string |
| PATCH | `/api/agents/:id` | Update agent | Accept `modelId` |

---

## UI Design

### Navigation
Add "LLM Registry" link in admin nav (visible to ADMIN users only):
- **Nav Position**: After "Agents" in the bottom nav section
- **Icon**: 🔌 or similar

### Pages

#### 1. LLM Registry Page (`/llm`)

**Layout**: Two-tab design
- **Tab 1: Providers** — List, add, edit, delete, test providers
- **Tab 2: Models** — List registered models, discover new models

#### 2. Providers Tab

**Table Columns**:
| Column | Description |
|--------|-------------|
| Name | Provider name (e.g., "Google Primary") |
| Type | Badge showing provider type |
| Status | Valid/Invalid/Unknown with color indicator |
| Last Validated | Timestamp |
| Actions | Test, Edit, Delete |

**Add Provider Dialog**:
- Provider Name (text)
- Provider Type (dropdown: Google, OpenAI, Anthropic, Azure, Ollama)
- Conditional fields based on type:
  - Google: API Key (password)
  - OpenAI: API Key (password), Base URL (optional), Org ID (optional)
  - Anthropic: API Key (password)
  - Azure: API Key, Base URL, Deployment ID
  - Ollama: Base URL (default: http://localhost:11434)

#### 3. Models Tab

**Table Columns**:
| Column | Description |
|--------|-------------|
| Model | Display name |
| Provider | Provider name |
| Modality | Chips for text/vision/tools |
| Context | Token window (e.g., "128k") |
| Enabled | Toggle switch |
| Actions | Delete |

**Discover Models Button**:
- Opens dialog to select provider and fetch available models
- Shows checkbox list of discoverable models
- "Add to Registry" registers selected models

#### 4. Updated Create Agent Modal

**New Flow**:
```
┌────────────────────────────────────────────┐
│ Create Agent                               │
├────────────────────────────────────────────┤
│ Name: [____________]                       │
│ Role: [____________]                       │
│                                            │
│ Provider: [Google Primary     ▼]           │
│ Model:    [gemini-2.0-flash   ▼]           │
│                                            │
│ SOUL:                                      │
│ ┌──────────────────────────────────────┐   │
│ │                                      │   │
│ └──────────────────────────────────────┘   │
│                                            │
│ Guardrails:                                │
│ ┌──────────────────────────────────────┐   │
│ │                                      │   │
│ └──────────────────────────────────────┘   │
│                                            │
│                    [Cancel] [Create Agent] │
└────────────────────────────────────────────┘
```

---

## Security

### Encryption
- API keys encrypted using AES-256-GCM
- Master key from `LLM_ENCRYPTION_KEY` environment variable (32 bytes)
- Each key stored with its own nonce and auth tag

### Key Rotation
- Provide utility to re-encrypt all keys with a new master key
- No key exposure during rotation

### Talon Communication
- Decrypted keys passed to Talon over internal network only
- Talon stores keys in memory (not persisted)
- Keys passed via secure headers or request body, not URL params

---

## Backend Implementation

### New Files

```
apps/task-master/apps/api/src/
├── llm/
│   ├── vault.js          # Encryption/decryption utilities
│   ├── registry.js       # Provider and model CRUD
│   ├── adapters/
│   │   ├── base.js       # Abstract adapter interface
│   │   ├── google.js     # Google AI adapter
│   │   ├── openai.js     # OpenAI adapter
│   │   ├── anthropic.js  # Anthropic adapter
│   │   ├── azure.js      # Azure OpenAI adapter
│   │   └── ollama.js     # Ollama adapter
│   └── routes.js         # Express routes for /api/llm/*
```

### Adapter Interface

```javascript
class BaseAdapter {
  constructor(provider) { this.provider = provider; }
  
  async testConnection() {
    // Returns { status: 'valid'|'invalid', message: string, latencyMs: number }
    throw new Error('Not implemented');
  }
  
  async discoverModels() {
    // Returns [{ providerModelId, displayName, modality, contextWindow, ... }]
    throw new Error('Not implemented');
  }
  
  getCredentials() {
    // Returns { apiKey, baseUrl, ... } for Talon
    throw new Error('Not implemented');
  }
}
```

### Updated Talon Sync

When creating/updating an agent with a registered model:

```javascript
async function syncAgentToTalon(agent, llmModel, provider) {
  const credentials = await decryptProviderCredentials(provider);
  
  const payload = {
    id: agent.talonId || agent.name,
    name: agent.name,
    model: `${provider.providerType}/${llmModel.providerModelId}`,
    apiKey: credentials.apiKey,
    baseUrl: provider.baseUrl,
    soul: agent.soul,
    guardrails: agent.guardrails
  };
  
  await fetch(`${TALON_GATEWAY_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TALON_TOKEN}` },
    body: JSON.stringify(payload)
  });
}
```

---

## Migration Plan

### Phase 1: Schema & API
1. Add Prisma models for `LlmProvider` and `LlmModel`
2. Update `Agent` model with `modelId` field
3. Implement LLM routes and adapters
4. Run database migration

### Phase 2: UI
1. Add LLM Registry page with Providers and Models tabs
2. Update Agent creation modal with provider/model selection
3. Add admin nav link

### Phase 3: Integration
1. Update Talon sync to pass credentials from registered models
2. Deprecate direct model string input (keep for backward compatibility)
3. Add migration utility to convert existing agents to use registered models

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LLM_ENCRYPTION_KEY` | Base64-encoded 32-byte key for AES-256-GCM | Yes (for encryption) |
| `TALON_GATEWAY_URL` | URL to Talon gateway | Yes |
| `TALON_GATEWAY_TOKEN` | Auth token for Talon | Yes |

---

## Testing Plan

### Unit Tests
- Encryption/decryption roundtrip
- Provider CRUD operations
- Adapter mock responses (success/failure)
- Model discovery parsing

### Integration Tests
- Full provider lifecycle: create → test → discover → register
- Agent creation with registered model
- Talon sync verification

### Manual Tests
- Google provider with valid/invalid key
- OpenAI provider with organization
- Ollama local connection
- Azure deployment-based setup

---

## Acceptance Criteria

1. ✅ Admin can add a Google provider with API key; test returns success
2. ✅ Admin can discover models from Google; select and register models
3. ✅ Registered models appear in the Models tab with enable/disable toggle
4. ✅ When creating an agent, user can select a provider and model from dropdowns
5. ✅ Agent sync to Talon includes the decrypted API key and base URL
6. ✅ API keys are never returned in API responses (only last 4 chars in UI)
7. ✅ Deleting a provider cascades to delete its registered models
8. ✅ Existing agents with model strings continue to work (backward compatible)

---

## Milestones

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M1: Core Infrastructure** | Schema, Vault, Provider CRUD, Test Connection | Planned |
| **M2: Model Discovery** | Google + Ollama adapters, Discover UI | Planned |
| **M3: Agent Integration** | Updated agent modal, Talon sync with credentials | Planned |
| **M4: Additional Providers** | OpenAI, Anthropic, Azure adapters | Future |

---

## Open Questions

1. **Should Talon store credentials?** 
   - Current design: Task Master passes credentials per-request
   - Alternative: Talon stores credentials and Task Master just references by ID

2. **Multi-model per agent?**
   - v1: 1:1 agent-to-model binding
   - Future: Primary + fallback model support

3. **Rate limiting per provider?**
   - Future enhancement to track and enforce provider-level rate limits

---

## Success Metrics

- Time to configure first model < 3 minutes
- Provider test success rate > 90% for valid credentials
- Zero credential exposure in logs or API responses (verified by audit)
- Agent creation success rate > 95% with model registry

---

## References

- Savant LLM Registry PRD: `/Users/ahmedshabbir/code/savant/docs/prds/done/llm-register.md`
- Savant Frontend Implementation: `/Users/ahmedshabbir/code/savant/frontend/src/pages/LLMRegistry.tsx`
- Task Master Agent Model: `apps/task-master/apps/api/prisma/schema.prisma`
