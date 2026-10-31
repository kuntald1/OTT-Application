-- Live streaming: scheduling/promotion + Pay Per Streaming
-- ---------------------------------------------------------------------
-- This project has no Alembic: app/main.py calls
-- Base.metadata.create_all(), which CREATES NEW TABLES but never adds
-- columns to existing ones. So:
--
--   * live_stream_purchases  -> created automatically on next startup,
--                               nothing to do here.
--   * live_streams           -> already exists, so its new columns have
--                               to be added by hand. That's this file.
--
-- Safe to run more than once (every statement is IF NOT EXISTS) and it
-- runs in one transaction, so a failure part-way leaves nothing behind.
--
-- Run on the server:
--   sudo -u postgres psql -d theomy_db -f <this file>
-- ---------------------------------------------------------------------

BEGIN;

-- The PG type behind LiveStream.monetization_type. SQLAlchemy would
-- have created it alongside the table, but live_streams predates it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'livestreammonetization') THEN
        CREATE TYPE livestreammonetization AS ENUM ('subscription', 'pay_per_stream');
    END IF;
END
$$;

ALTER TABLE live_streams
    ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS promo_from         DATE,
    ADD COLUMN IF NOT EXISTS monetization_type  livestreammonetization NOT NULL DEFAULT 'subscription',
    ADD COLUMN IF NOT EXISTS price_inr          NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS price_usd          NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS is_disabled        BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Check it landed:
--   \d live_streams
