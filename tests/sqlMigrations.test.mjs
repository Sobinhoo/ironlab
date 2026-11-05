import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261105_iron_signup_approval_realtime.sql', import.meta.url),
  'utf8'
);

test('signup migration has balanced SQL dollar-quoted functions', () => {
  // Catch the exact syntax regression that blocked the v0.31 migration:
  // AS $ ... $; is not valid PL/pgSQL.
  assert.doesNotMatch(migration, /^\s*AS \$(?!\$)/m);
  assert.doesNotMatch(migration, /^\$;\s*$/m);
  const quotes = migration.match(/\$\$/g) ?? [];
  assert.ok(quotes.length >= 12);
  assert.equal(quotes.length % 2, 0);
});

test('new accounts are pending and legacy accounts are never auto-approved', () => {
  assert.match(migration, /CREATE TRIGGER iron_create_profile_on_signup/i);
  assert.match(migration, /INSERT INTO public\.profiles/i);
  assert.match(migration, /'member'\s*,\s*false/i);
  assert.match(migration, /ON CONFLICT\s*\(id\)\s*DO NOTHING/i);
});

test('SQL publishes project changes without publishing private profiles or auth users', () => {
  assert.match(migration, /ADD TABLE public\.iron_projects/i);
  assert.doesNotMatch(migration, /ADD TABLE public\.profiles/i);
  assert.doesNotMatch(migration, /ADD TABLE auth\.users/i);
});

test('team membership functions deny unapproved users and respect team membership', () => {
  assert.match(migration, /public\.is_active\(\)/);
  assert.match(migration, /iron_add_team_member_by_email/i);
  assert.match(migration, /iron_list_team_members/i);
  assert.match(migration, /iron_can_access_team/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.iron_add_team_member_by_email/i);
});
