-- Migration: Add integrity check column to exam_activity
-- Purpose: Track logs that failed SHA-256 hash verification

ALTER TABLE exam_activity 
ADD COLUMN integrity_failed BOOLEAN DEFAULT 0;

-- Create index for integrity tracking
CREATE INDEX IF NOT EXISTS idx_activity_integrity 
ON exam_activity(session_id, integrity_failed);
