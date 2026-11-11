-- Preserve existing saved addresses while adding structured checkout fields.
ALTER TABLE customer_addresses ADD COLUMN house TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_addresses ADD COLUMN street TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_addresses ADD COLUMN area TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_addresses ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_addresses ADD COLUMN postcode TEXT NOT NULL DEFAULT '';
