-- Add the organizer signup role while preserving all existing user rows.
ALTER TYPE "UserType" ADD VALUE 'organizer';
