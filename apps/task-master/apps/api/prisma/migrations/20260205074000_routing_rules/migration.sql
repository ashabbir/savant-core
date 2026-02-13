-- AlterTable
ALTER TABLE "User" ADD COLUMN "monthlyTokenLimit" INTEGER;
ALTER TABLE "User" ADD COLUMN "monthlyCostLimit" REAL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "monthlyTokenLimit" INTEGER;
ALTER TABLE "Project" ADD COLUMN "monthlyCostLimit" REAL;

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "RoutingRule_projectId_idx" ON "RoutingRule"("projectId");

-- CreateIndex
CREATE INDEX "RoutingRule_agentId_idx" ON "RoutingRule"("agentId");
