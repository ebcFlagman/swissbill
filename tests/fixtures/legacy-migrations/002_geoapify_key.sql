-- Optional Geoapify API key for address suggestions (feature 004).
-- Only the value encrypted with the operating system encryption, never plain text; NULL = not set.
ALTER TABLE settings ADD COLUMN geoapify_api_key BLOB;
