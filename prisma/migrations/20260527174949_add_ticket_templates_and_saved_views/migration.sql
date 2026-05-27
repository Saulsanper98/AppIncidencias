-- CreateTable
CREATE TABLE "TicketTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'personal',
    "ownerId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tipo" TEXT,
    "subtipo" TEXT,
    "subsubtipo" TEXT,
    "priority" TEXT,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedTicketView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'personal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedTicketView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TicketTemplate_scope_idx" ON "TicketTemplate"("scope");

-- CreateIndex
CREATE INDEX "TicketTemplate_ownerId_idx" ON "TicketTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "SavedTicketView_userId_idx" ON "SavedTicketView"("userId");
