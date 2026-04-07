-- Seedance Video Generation Platform
-- PostgreSQL Schema
-- Run this directly on your PostgreSQL database if not using Prisma migrations

-- Create the enum type for generation status
DO $$ BEGIN
  CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the generations table
CREATE TABLE IF NOT EXISTS "generations" (
  "id"           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id"   VARCHAR(255),
  "prompt"       TEXT             NOT NULL,
  "images_list"  JSONB            NOT NULL DEFAULT '[]',
  "audio_files"  JSONB            NOT NULL DEFAULT '[]',
  "aspect_ratio" VARCHAR(10)      NOT NULL DEFAULT '16:9',
  "duration"     INTEGER          NOT NULL DEFAULT 5,
  "status"       "GenerationStatus" NOT NULL DEFAULT 'PENDING',
  "output_urls"  JSONB            NOT NULL DEFAULT '[]',
  "video_path"   VARCHAR(500),
  "error"        TEXT,
  "created_at"   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by request_id
CREATE INDEX IF NOT EXISTS "idx_generations_request_id" ON "generations" ("request_id");

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS "idx_generations_status" ON "generations" ("status");

-- Index for ordering by creation date
CREATE INDEX IF NOT EXISTS "idx_generations_created_at" ON "generations" ("created_at" DESC);
