ALTER TABLE courses ADD COLUMN product_type TEXT NOT NULL DEFAULT 'class' CHECK (product_type IN ('class', 'pdf', 'bundle'));
ALTER TABLE courses ADD COLUMN document TEXT;
