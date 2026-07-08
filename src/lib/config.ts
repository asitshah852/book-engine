// Central configuration read from the environment.

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

export const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || "";

export const SESSION_SECRET =
  process.env.SESSION_SECRET || "insecure-dev-secret-change-me";

export const HAS_ANTHROPIC_KEY = !!process.env.ANTHROPIC_API_KEY;
