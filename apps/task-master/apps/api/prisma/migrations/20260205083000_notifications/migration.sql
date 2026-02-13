-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'slack',
    "target" TEXT NOT NULL DEFAULT '',
    "mentionsOnly" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "NotificationSubscription_userId_idx" ON "NotificationSubscription"("userId");

-- CreateIndex
CREATE INDEX "NotificationSubscription_projectId_idx" ON "NotificationSubscription"("projectId");
