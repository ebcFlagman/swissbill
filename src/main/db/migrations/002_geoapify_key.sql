-- Optionaler Geoapify-API-Key für Adressvorschläge (Feature 004).
-- Nur der mit der Betriebssystem-Verschlüsselung verschlüsselte Wert, nie Klartext; NULL = nicht gesetzt.
ALTER TABLE settings ADD COLUMN geoapify_api_key BLOB;
