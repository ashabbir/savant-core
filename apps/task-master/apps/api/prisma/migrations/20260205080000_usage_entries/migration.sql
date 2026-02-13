-- CreateTable
CREATE TABLE "UsageEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "taskId" TEXT,
    "agentId" TEXT,
    "userId" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UsageEntry_projectId_idx" ON "UsageEntry"("projectId");

-- CreateIndex
CREATE INDEX "UsageEntry_agentId_idx" ON "UsageEntry"("agentId");

-- CreateIndex
CREATE INDEX "UsageEntry_userId_idx" ON "UsageEntry"("userId");
