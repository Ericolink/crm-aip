-- CreateTable
CREATE TABLE "assistant_agent_links" (
    "id" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "assistant_agent_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_agent_links_agentId_idx" ON "assistant_agent_links"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_agent_links_assistantId_agentId_key" ON "assistant_agent_links"("assistantId", "agentId");

-- AddForeignKey
ALTER TABLE "assistant_agent_links" ADD CONSTRAINT "assistant_agent_links_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_agent_links" ADD CONSTRAINT "assistant_agent_links_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_agent_links" ADD CONSTRAINT "assistant_agent_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un usuario no puede vincularse consigo mismo.
ALTER TABLE "assistant_agent_links"
  ADD CONSTRAINT "assistant_agent_links_not_self" CHECK ("assistantId" <> "agentId");
