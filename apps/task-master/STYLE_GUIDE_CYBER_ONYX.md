# Cyber-Onyx UI Style Guide

**Task Master Design System & Component Reference**

> **📍 Location:** `apps/task-master/STYLE_GUIDE_CYBER_ONYX.md`  
> **🔗 Referenced in:** Root `AGENTS.md`

This document is the **single source of truth** for all UI components, design tokens, and patterns in the Task Master web application. All new components **must** follow these guidelines.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Design Tokens](#2-design-tokens)
3. [Layout System](#3-layout-system)
4. [Component Inventory](#4-component-inventory)
5. [Component Design Guidelines](#5-component-design-guidelines)
6. [Animation & Motion](#6-animation--motion)
7. [Accessibility](#7-accessibility)
8. [Adding New Components](#8-adding-new-components)

---

## 1) Design Philosophy

**Theme: "Cyber-Onyx"** — A technical, high-contrast, ultra-dense UI designed for power users and long work sessions.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **High Density** | Prioritize information over whitespace. Use 11-13px base font sizes. |
| **Subtle Depth** | Use thin borders + small glows instead of heavy shadows. |
| **Dark-First** | Optimized for dark mode with careful contrast ratios. |
| **Consistent Patterns** | All similar components follow the same structure. |
| **Fast Transitions** | Snappy 150-200ms animations with smooth easing. |

---

## 2) Design Tokens

All tokens are defined in CSS files under `apps/web/src/`.

### Colors

#### Backgrounds
```css
--bg: #0b1020;                    /* App background */
--panel: #0f172a;                 /* Panel/sidebar background */
--background-secondary: #0f172a;  /* Card backgrounds */
--background-tertiary: #151d2e;   /* Hover states */
--modal-background: rgba(15, 23, 42, 0.98);
```

#### Accents
```css
--brand: #3b82f6;                 /* Primary accent (blue) */
--accent-primary: #3b82f6;        /* Synonymous with brand */
--accent-secondary: #60a5fa;      /* Lighter accent */
```

#### Semantic / Status
```css
--status-success: #00c875;        /* Green */
--status-warning: #ffcb00;        /* Yellow */
--status-error: #f22d46;          /* Red */
--danger: #ef4444;                /* Destructive actions */
```

#### Text
```css
--text-primary: #ffffff;
--text-secondary: rgba(255, 255, 255, 0.7);
--text-tertiary: rgba(255, 255, 255, 0.5);
```

#### Borders
```css
--border: rgba(148, 163, 184, 0.16);
--border-primary: rgba(255, 255, 255, 0.08);
--border-input: rgba(255, 255, 255, 0.15);
```

### Typography

| Use Case | Size | Weight |
|----------|------|--------|
| Body text | 13px | 400 |
| Small/Dense | 11px | 400-500 |
| Labels | 11px | 700, uppercase |
| Headings | 14-18px | 600-700 |
| Card titles | 11-13px | 500-650 |

### Spacing & Radii

| Token | Value | Use |
|-------|-------|-----|
| `--radius-node` | 4px | Small elements, buttons |
| `--radius-container` | 6px | Inputs, badges |
| Card radius | 12-14px | Cards, panels |

---

## 3) Layout System

### 4-Column Architecture

```
┌──────────┬─────────────┬──────────────────────┬─────────────┐
│ Control  │  Filters    │     Main Content     │   Activity  │
│   Nav    │  Drawer     │     (Board/Cards)    │   Drawer    │
│  (48px)  │  (320px)    │      (flexible)      │  (360px)    │
└──────────┴─────────────┴──────────────────────┴─────────────┘
```

### Layout Classes

| Class | Description |
|-------|-------------|
| `.layout` | Base 2-column grid |
| `.layout.withRight` | 3-column with right panel |
| `.layout.leftCollapsed` | Collapsed left sidebar |
| `.layout.full` | Single column, full width |

---

## 4) Component Inventory

### Complete List of Components

| Component | File | Category | Description |
|-----------|------|----------|-------------|
| **ActivityDrawer** | `ActivityDrawer.jsx` | Drawer | Right panel with agents, chat, activity feed, documents |
| **AgentEditDrawer** | `AgentEditDrawer.jsx` | Edit Drawer | 5-tab drawer for editing agent config (metadata, soul, bootstrap, guardrails, context) |
| **AgentsPage** | `AgentsPage.jsx` | Page | Admin page showing all agents in cards/table view |
| **AppFooter** | `AppFooter.jsx` | Shell | Bottom footer with links |
| **AppHeader** | `AppHeader.jsx` | Shell | Top header with hamburger and right toggle |
| **BoardHeader** | `BoardHeader.jsx` | Header | Header for board views with title and actions |
| **CardEditDrawer** | `CardEditDrawer.jsx` | Edit Drawer | Edit task/epic details with comments and activity |
| **ControlNav** | `ControlNav.jsx` | Shell | Left icon rail navigation |
| **EpicBoard** | `EpicBoard.jsx` | Board | Kanban board for epics |
| **EpicCard** | `EpicCard.jsx` | Card | Individual epic card with progress |
| **FilterDrawer** | `FilterDrawer.jsx` | Drawer | Left sidebar with filter sections |
| **FilterSection** | `FilterSection.jsx` | Filter | Collapsible section within FilterDrawer |
| **ProjectPill** | `ProjectPill.jsx` | Badge | Small project indicator pill |
| **ProjectSelector** | `ProjectSelector.jsx` | Page | Project list with cards/table view |
| **RoutingRulesPanel** | `RoutingRulesPanel.jsx` | Panel | Agent routing rules configuration |
| **StoryBoard** | `StoryBoard.jsx` | Board | Kanban board for stories/tasks |
| **TaskCard** | `TaskCard.jsx` | Card | Individual task card (collapsible) |
| **TaskModal** | `TaskModal.jsx` | Modal | Create new task/epic dialog |
| **UserEditDrawer** | `UserEditDrawer.jsx` | Edit Drawer | Edit user details and permissions |
| **AdminUsersPage** | `App.jsx` (inline) | Page | Admin page showing all users |
| **ProjectSettingsDrawer** | `App.jsx` (inline) | Edit Drawer | Edit project settings |
| **ProfilePage** | `App.jsx` (inline) | Page | User profile page |
| **LoginScreen** | `App.jsx` (inline) | Page | Authentication screen |

---

## 5) Component Design Guidelines

### 5.1 Cards

Cards display individual items in a list or grid.

**Components:** `TaskCard`, `EpicCard`, Project cards, Agent cards

#### Structure
```jsx
<div className="task">                    {/* or "card", "projectCard" */}
  <div className="taskTop">
    <div className="taskId">CODE-123</div>
    <div className="taskTitle">Title</div>
  </div>
  <div className="taskDesc">Description...</div>
  <div className="taskBadges">
    <span className="badge">Badge</span>
  </div>
</div>
```

#### Design Rules
- Border: `1px solid var(--border-primary)`
- Background: `var(--card-background)`
- Radius: `12px`
- Padding: `10-12px`
- Hover: Lighten background, add subtle shadow, `translateY(-1px)`
- Selected: Blue border glow

---

### 5.2 Buttons

**Variants:**

| Class | Use Case | Colors |
|-------|----------|--------|
| `.primary` | Main actions (Save, Create) | Blue fill, white text |
| `.secondary` | Cancel, alternative actions | Transparent, border |
| `.danger` | Delete, destructive | Red fill |
| `.success` | Activate, positive | Green fill |
| `.tiny` | Compact inline buttons | Smaller padding, 10px font |

#### Structure
```jsx
<button className="primary">Save</button>
<button className="secondary">Cancel</button>
<button className="danger">Delete</button>
<button className="tiny secondary">⚙</button>
```

#### Design Rules
- Padding: `6px 12px` (standard), `3px 6px` (tiny)
- Font: `11px`, weight `700`
- Radius: `4px`
- Transitions: `150ms`
- Disabled: `opacity: 0.5`

---

### 5.3 Form Inputs

**Classes:** `.detailsInput`, `.detailsTextarea`, `.detailsLabel`

#### Structure
```jsx
<div className="detailsField">
  <label className="detailsLabel">Field Label</label>
  <input className="detailsInput" placeholder="Enter value..." />
  <span style={{ fontSize: 11, opacity: 0.5 }}>Helper text</span>
</div>
```

#### Design Rules
- Background: `rgba(255, 255, 255, 0.06)`
- Border: `1px solid rgba(255, 255, 255, 0.15)`
- Radius: `6px`
- Padding: `8px 10px`
- Focus: `border-color: var(--accent-secondary)`
- Labels: `11px`, `700` weight, uppercase, accent color

---

### 5.4 Edit Drawers

Slide-in panels for editing entities. Used for tasks, projects, agents, users.

**Components:** `AgentEditDrawer`, `CardEditDrawer`, `UserEditDrawer`, `ProjectSettingsDrawer`

#### Standard Structure
```jsx
<aside className="details">
  {/* Header */}
  <div className="detailsHeader">
    <div className="detailsTitleRow">
      <div className="detailsTitle">Entity Name</div>
      <div className="detailsTitleActions">
        <button className="primary">Save</button>
        <button className="closeBtn">✕</button>
      </div>
    </div>
    
    {/* Optional: Tabs */}
    <div className="detailsTabs">
      <button className="tabBtn active">Tab 1</button>
      <button className="tabBtn">Tab 2</button>
    </div>
  </div>

  {/* Body */}
  <div className="detailsBody">
    <div className="detailsField">
      <label className="detailsLabel">Field</label>
      <input className="detailsInput" />
    </div>
    
    {/* Danger Zone (at bottom) */}
    <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
      <div className="detailsLabel" style={{ color: '#ef4444' }}>Danger Zone</div>
      <div className="row" style={{ gap: 12 }}>
        <button className="danger">Deactivate</button>
        <button className="danger secondary">Delete</button>
      </div>
    </div>
  </div>
</aside>
```

#### Design Rules
- Width: `80vw`, min `600px`, max `95vw`
- Background: `var(--modal-background)` with `backdrop-filter: blur(20px)`
- Border: Left border `1px solid var(--border-tertiary)`
- Animation: Slide in from right, `300ms`
- Header: Fixed at top with title and actions
- Danger Zone: Always at bottom, red border separator

---

### 5.5 Modals

Centered dialogs for creating new entities.

**Components:** `TaskModal`, Create Project, Create Agent

#### Standard Structure
```jsx
<div className="modalBackdrop">
  <div className="card modal premiumModal">
    <header className="modalHeader">
      <div className="modalTitle">
        <h2>Create Entity</h2>
        <p className="modalSubtitle">Brief description</p>
      </div>
      <button className="closeBtn">✕</button>
    </header>
    
    <div className="modalBody">
      <section className="modalSection">
        <div className="inputGroup">
          <label>Field</label>
          <input className="detailsInput" />
        </div>
      </section>
    </div>
    
    <div className="modalActions">
      <button className="secondary">Cancel</button>
      <button className="primary">Create</button>
    </div>
  </div>
</div>
```

#### Design Rules
- Backdrop: `rgba(0, 0, 0, 0.85)` with blur
- Modal: Max `1200px` width, `95vw` max
- Header: `24px 32px` padding, subtle background
- Body: `32px` padding, max `70vh` height with scroll
- Actions: Right-aligned, `16px 18px` padding

---

### 5.6 Filter Drawer (Left Sidebar)

Left panel with collapsible filter sections.

**Components:** `FilterDrawer`, `FilterSection`, `ProjectSelector`

#### Structure
```jsx
<aside className="filters">
  <div className="filtersTop">
    <div className="filtersTopTitle">Filters</div>
  </div>
  
  <FilterSection title="Section" initialOpen={true}>
    <div className="filtersList">
      <label className="filterItem checked">
        <input type="checkbox" checked />
        <span className="filterName">Option</span>
      </label>
    </div>
  </FilterSection>
</aside>
```

#### Design Rules
- Width: `320px` (collapsible to 0)
- Background: `var(--background-secondary)`
- Border: Right border
- Sections: Collapsible with chevron
- Filter items: `8px 12px` padding, `8px` radius

---

### 5.7 Activity Drawer (Right Panel)

Right panel with expandable sections.

**Component:** `ActivityDrawer`

#### Sections
- **Agents** — List of available agents
- **Agent Chat** — Messaging with selected agent
- **Activity Feed** — Recent actions log
- **Documents** — Related documents

#### Design Rules
- Width: `360px`
- Sections: Collapsible with +/- buttons
- Uses `.rightPanel`, `.panelSection`, `.panelHeader` classes

---

### 5.8 Boards

Kanban-style boards with columns and cards.

**Components:** `StoryBoard`, `EpicBoard`

#### Structure
```jsx
<div className="boardScroll">
  <div className="board" style={{ gridTemplateColumns: 'repeat(N, minmax(240px, 1fr))' }}>
    <div className="column">
      <div className="columnHeader">
        <h3>Column Name <span>(count)</span></h3>
      </div>
      <div className="tasks">
        {/* Cards or Swimlanes */}
      </div>
    </div>
  </div>
</div>
```

#### Swimlanes (Grouping)
```jsx
<div className="swimlane" style={{ borderColor: epicColor }}>
  <div className="swimlaneHeader" style={{ color: epicColor }}>
    Group Name <span>(count) ▾</span>
  </div>
  {/* Cards */}
</div>
```

#### Design Rules
- Scroll: Horizontal and vertical
- Columns: `240px` min width, `12px` gap
- Column: `14px` radius, `12px` padding
- Drag/drop: Visual feedback on drag over

---

### 5.9 Tabs

Used in edit drawers to organize content.

#### Structure
```jsx
<div className="detailsTabs">
  <button className="tabBtn active">Tab 1</button>
  <button className="tabBtn">Tab 2</button>
  <button className="tabBtn">Tab 3</button>
</div>
```

#### Design Rules
- Border bottom on container: `1px solid rgba(255,255,255,0.1)`
- Active tab: Bottom border `2px solid var(--accent-color)`, higher opacity
- Inactive: `opacity: 0.6`
- Padding: `10px 16px`
- Transition: `200ms`

---

### 5.10 Badges

Small status/metadata indicators.

#### Structure
```jsx
<div className="taskBadges">
  <span className="badge">Default</span>
  <span className="badge type bug">Bug</span>
  <span className="badge pri high">High</span>
  <span className="badge status-active">Active</span>
</div>
```

#### Design Rules
- Font: `11px`, `600` weight
- Padding: `2px 8px`
- Radius: `6px`
- Background: `var(--background-secondary)`
- Semantic colors: Bug=red, High priority=red, Active=green

---

### 5.11 Page Layout

Standard structure for main content pages.

**Classes:** `.pageHeader`, `.pageContent`

#### Structure
```jsx
<div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
  <div className="pageHeader">
    <h1>Page Title</h1>
    <div className="actions">
      <button className="primary">Action</button>
    </div>
  </div>
  
  <div className="pageContent">
    {/* Scrollable content */}
  </div>
</div>
```

#### Design Rules
- Header: Fixed height, border bottom
- Content: Flex grow, overflow auto
- Title: `20px`, `700` weight

---

## 6) Animation & Motion

### Standard Transitions
```css
transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);  /* Fast */
transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);  /* Spring */
```

### Keyframe Animations
```css
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### Guidelines
- Hover effects: `150ms`
- Panel slide: `300ms`
- Modal fade: `200-300ms`
- Always use easing, never linear

---

## 7) Accessibility

- All interactive elements must have visible focus states
- Use semantic HTML (`<button>`, `<label>`, `<input>`)
- Color contrast: WCAG AA (4.5:1 for text)
- Icon-only buttons: Include `title` or `aria-label`
- Keyboard navigation: Support Enter/Space for actions
- Disabled states: `opacity: 0.5`, `cursor: not-allowed`

---

## 8) Adding New Components

### Checklist

Before creating a new component:

- [ ] **Check this guide** — Does a similar pattern exist?
- [ ] **Use design tokens** — Never hardcode colors
- [ ] **Follow JSX structure** — Match patterns shown above
- [ ] **Add CSS to `app.css`** — Keep component styles together
- [ ] **Include all states** — Hover, focus, active, disabled
- [ ] **Add transitions** — Use standard timing
- [ ] **Test accessibility** — Keyboard nav, screen readers
- [ ] **Update this guide** — Document new patterns

### CSS Organization

Add styles in logical groups to `apps/web/src/app.css`:
1. Layout classes at top
2. Component-specific styles grouped together
3. State modifiers (`.selected`, `.active`, `.disabled`)
4. Responsive overrides at bottom

---

## CSS File Reference

| File | Purpose |
|------|---------|
| `app.css` | Main component styles (2000+ lines) |
| `themes.css` | Color theme definitions |
| `index.css` | Base styles, root variables |
| `cyber-onyx.css` | Legacy token aliases |
