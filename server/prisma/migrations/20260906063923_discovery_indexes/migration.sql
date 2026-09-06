-- CreateIndex
CREATE INDEX "exhibitions_status_visibility_idx" ON "exhibitions"("status", "visibility");

-- CreateIndex
CREATE INDEX "organizers_publicProfileEnabled_suspended_idx" ON "organizers"("publicProfileEnabled", "suspended");
