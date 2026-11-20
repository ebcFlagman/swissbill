import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const dir = join(__dirname, 'legacy-migrations');

/**
 * Builds a database as it was before the switch to TypeORM (schema version 2 with triggers, CHECKs and
 * `user_version`) with fictitious test data: two customers, one draft, one issued and one paid invoice,
 * counters and a Geoapify key blob.
 */
export function createLegacyDb(path: string, version: 1 | 2 = 2): { keyBlob: Buffer } {
  const db = new Database(path);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(dir, '001_init.sql'), 'utf8'));
  db.pragma('user_version = 1');
  const keyBlob = Buffer.from('verschluesselt-nicht-klartext');
  if (version === 2) {
    db.exec(readFileSync(join(dir, '002_geoapify_key.sql'), 'utf8'));
    db.pragma('user_version = 2');
    db.prepare('UPDATE settings SET geoapify_api_key = ? WHERE id = 1').run(keyBlob);
  }
  db.prepare(
    "UPDATE settings SET sender_name = 'Muster AG', invoice_prefix = 'XY', sender_iban = 'CH4431999123000889012' WHERE id = 1",
  ).run();

  const now = '2026-01-10T10:00:00.000Z';
  db.prepare(
    "INSERT INTO customers (name, zip, city, created_at, updated_at) VALUES ('Müller AG', '8000', 'Zürich', ?, ?)",
  ).run(now, now);
  db.prepare(
    "INSERT INTO customers (name, zip, city, created_at, updated_at) VALUES ('Åse Meier', '3000', 'Bern', ?, ?)",
  ).run(now, now);

  // The schema (triggers!) requires: items exist only for drafts, issuing is an update afterwards.
  const insertDraft = db.prepare(
    `INSERT INTO invoices (status, invoice_date, due_date, customer_id, debtor_name, sender_name, created_at, updated_at)
     VALUES ('draft', '2026-01-10', '2026-02-09', 1, 'Müller AG', 'Muster AG', ?, ?)`,
  );
  for (let i = 0; i < 3; i++) insertDraft.run(now, now);
  const insertItem = db.prepare(
    `INSERT INTO invoice_items (invoice_id, position, description, quantity_milli, unit_price_rappen, amount_rappen)
     VALUES (?, 1, 'Beratung', 1000, ?, ?)`,
  );
  insertItem.run(2, 10000, 10000);
  insertItem.run(3, 5000, 5000);
  const issue = db.prepare(
    `UPDATE invoices SET status = 'issued', number = ?, number_year = 2026, number_seq = ?, reference_type = 'QRR',
       reference = ?, total_rappen = ?, layout_version = 1, issued_at = ? WHERE id = ?`,
  );
  issue.run('XY-2026-0001', 1, '000000000000000000000000019', 10000, now, 2);
  issue.run('XY-2026-0002', 2, '000000000000000000000000027', 5000, now, 3);
  db.prepare("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = 3").run(now);
  db.prepare('INSERT INTO number_counters (year, last_seq) VALUES (2026, 2)').run();
  db.close();
  return { keyBlob };
}
