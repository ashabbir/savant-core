-- CreateTable
CREATE TABLE "OpenClawRetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OpenClawRetry_status_idx" ON "OpenClawRetry"("status");

-- CreateIndex
CREATE INDEX "OpenClawRetry_taskId_idx" ON "OpenClawRetry"("taskId");
