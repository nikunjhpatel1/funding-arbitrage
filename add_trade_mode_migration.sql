-- Add trade_mode to existing paper_positions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='paper_positions' AND column_name='trade_mode') THEN
        ALTER TABLE public.paper_positions ADD COLUMN trade_mode text NOT NULL DEFAULT 'demo';
    END IF;
END $$;
