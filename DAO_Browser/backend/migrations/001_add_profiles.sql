-- Migration: Add Profile Support to DAO Browser
-- Description: Creates profile system with data isolation
-- Version: 1.0.0
-- Date: 2026-02-16

-- ==================== PROFILES TABLE ====================
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#4A90E2',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_default CHECK ((is_default = FALSE) OR (SELECT COUNT(*) FROM profiles WHERE is_default = TRUE) <= 1),
    CONSTRAINT unique_active CHECK ((is_active = FALSE) OR (SELECT COUNT(*) FROM profiles WHERE is_active = TRUE) <= 1)
);

-- ==================== PROFILE PREFERENCES ====================
CREATE TABLE IF NOT EXISTS profile_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT,
    preference_type TEXT DEFAULT 'string', -- 'string', 'boolean', 'number', 'json'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, preference_key),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ==================== PROFILE BOOKMARKS ====================
CREATE TABLE IF NOT EXISTS profile_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    folder TEXT DEFAULT 'Default',
    favicon_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ==================== PROFILE FOCUS SCHEDULES ====================
CREATE TABLE IF NOT EXISTS profile_focus_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    schedule_name TEXT NOT NULL,
    start_time TEXT, -- Format: "09:00"
    end_time TEXT,   -- Format: "17:00"
    days_of_week TEXT, -- JSON: ["monday", "tuesday", ...]
    focus_mode_enabled BOOLEAN DEFAULT TRUE,
    blocked_domains TEXT, -- JSON array: ["facebook.com", "youtube.com"]
    allowed_domains TEXT, -- JSON array for exceptions
    notification_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ==================== MODIFY EXISTING TABLES ====================
-- Add profile_id to existing browsing_history table
-- Note: This will be handled in the migration script to preserve existing data

-- ==================== INDEXES FOR PERFORMANCE ====================
CREATE INDEX IF NOT EXISTS idx_profile_preferences_profile_id ON profile_preferences(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_preferences_key ON profile_preferences(profile_id, preference_key);
CREATE INDEX IF NOT EXISTS idx_profile_bookmarks_profile_id ON profile_bookmarks(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_bookmarks_folder ON profile_bookmarks(profile_id, folder);
CREATE INDEX IF NOT EXISTS idx_profile_focus_profile_id ON profile_focus_schedules(profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_default ON profiles(is_default) WHERE is_default = TRUE;

-- ==================== DEFAULT DATA ====================
-- Insert default profile (will be handled by migration script)

-- ==================== TRIGGERS ====================
-- Update last_used_at when profile becomes active
CREATE TRIGGER IF NOT EXISTS update_profile_last_used
    AFTER UPDATE OF is_active ON profiles
    WHEN NEW.is_active = TRUE
BEGIN
    UPDATE profiles SET last_used_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Ensure only one active profile at a time
CREATE TRIGGER IF NOT EXISTS ensure_single_active_profile
    BEFORE UPDATE OF is_active ON profiles
    WHEN NEW.is_active = TRUE
BEGIN
    UPDATE profiles SET is_active = FALSE WHERE is_active = TRUE AND id != NEW.id;
END;

-- Ensure only one default profile at a time  
CREATE TRIGGER IF NOT EXISTS ensure_single_default_profile
    BEFORE UPDATE OF is_default ON profiles
    WHEN NEW.is_default = TRUE
BEGIN
    UPDATE profiles SET is_default = FALSE WHERE is_default = TRUE AND id != NEW.id;
END;