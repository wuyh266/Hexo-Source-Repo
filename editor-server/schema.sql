-- Run once in Neon SQL Editor. Safe to rerun; does not modify Waline tables.
CREATE SCHEMA IF NOT EXISTS blog_editor;
CREATE TABLE IF NOT EXISTS blog_editor.drafts (
  id text PRIMARY KEY,
  content text NOT NULL,
  base_sha text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blog_editor.locks (
  id text PRIMARY KEY,
  token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_editor.login_limits (
  key text PRIMARY KEY,
  bucket bigint NOT NULL,
  attempts integer NOT NULL
);
