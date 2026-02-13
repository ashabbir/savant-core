# Code Graphs

## Backend (API)
```
apps/api/src/index.js
  ├─ auth middleware
  ├─ projects routes
  ├─ tasks routes
  ├─ comments routes
  ├─ activity routes
  ├─ agents routes
  ├─ documents routes
  └─ agent messages routes
```

## Frontend (Web)
```
apps/web/src/App.jsx
  ├─ Navigation
  ├─ Filters panel (left)
  ├─ Board / Epics view
  ├─ Task details overlay
  └─ Right panel (Agents + Chat + Activity + Docs)
```

## Data Flow
```
[UI Action] → API call → Prisma → MongoDB → Response → UI update
```
