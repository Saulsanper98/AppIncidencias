-- CreateTable: Votos upvote del board /sugerencias.
-- Cada usuario puede votar UNA SOLA VEZ por feedback (unique compuesto).
-- Cascade en ambas direcciones: si se elimina el feedback o el usuario,
-- los votos asociados desaparecen también.
CREATE TABLE "FeedbackVote" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "feedbackId" TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "UserFeedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedbackVote_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "User"         ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_feedbackId_userId_key" ON "FeedbackVote"("feedbackId", "userId");
CREATE INDEX        "FeedbackVote_feedbackId_idx"        ON "FeedbackVote"("feedbackId");
