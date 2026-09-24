-- 001F Universal Event Categories/Modules
-- The EventCategory and EventModuleEnablement tables were introduced by
-- 001A. This migration only expands the module enum for the production
-- 001F contract; existing rows remain valid and existing Exhibition events
-- retain their current enablements.
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'EXHIBITION';
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'PARTNERS';
