import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const dataDir = path.join(process.cwd(), 'data');

export function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function readCSV(name) {
  const file = path.join(dataDir, `${name}.csv`);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return [];
  return parse(raw, { columns: true, skip_empty_lines: true });
}

export function writeCSV(name, rows) {
  ensureDataDir();
  const file = path.join(dataDir, `${name}.csv`);
  const csv = stringify(rows, { header: true });
  fs.writeFileSync(file, csv);
}

export function appendRow(name, row) {
  const rows = readCSV(name);
  rows.push(row);
  writeCSV(name, rows);
  return row;
}

export function updateRow(name, id, updates) {
  const rows = readCSV(name);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...updates };
  writeCSV(name, rows);
  return rows[idx];
}

export function findById(name, id) {
  return readCSV(name).find((r) => r.id === id) || null;
}

export function deleteRow(name, id) {
  const rows = readCSV(name);
  const next = rows.filter((r) => r.id !== id);
  writeCSV(name, next);
  return rows.length !== next.length;
}
