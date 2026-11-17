import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalAccountId, scopedStorageKey, migrateLegacyOwnerStorage,
} from '../src/utils/scopedStorage.ts';

function storage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}
const OWNER = '7607015b-0000-4000-8000-000000000001';
const MEMBER = 'a57aa371-0000-4000-8000-000000000002';
function login(id) {
  localStorage.setItem('ironlab.auth.session.v1', JSON.stringify({
    access_token: 'test', user: { id },
  }));
}

test('isolates local project keys between two accounts', () => {
  globalThis.localStorage = storage();
  login(OWNER);
  assert.equal(getLocalAccountId(), OWNER);
  localStorage.setItem(scopedStorageKey('ftc-electrical-lab-project'), 'owner-project');
  login(MEMBER);
  assert.equal(localStorage.getItem(scopedStorageKey('ftc-electrical-lab-project')), null);
  localStorage.setItem(scopedStorageKey('ftc-electrical-lab-project'), 'member-project');
  login(OWNER);
  assert.equal(localStorage.getItem(scopedStorageKey('ftc-electrical-lab-project')), 'owner-project');
});

test('legacy migration never gives owner data to a different account', () => {
  globalThis.localStorage = storage();
  localStorage.setItem('ftc-electrical-lab-project', '{"robot":"old"}');
  login(MEMBER);
  migrateLegacyOwnerStorage(OWNER);
  assert.equal(localStorage.getItem('ftc-electrical-lab-project'), '{"robot":"old"}');
  assert.equal(localStorage.getItem(scopedStorageKey('ftc-electrical-lab-project')), null);
  login(OWNER);
  migrateLegacyOwnerStorage(OWNER);
  assert.equal(localStorage.getItem('ftc-electrical-lab-project'), null);
  assert.equal(localStorage.getItem(scopedStorageKey('ftc-electrical-lab-project')), '{"robot":"old"}');
});

test('rejects missing or malformed account ids for local namespaces', () => {
  globalThis.localStorage = storage();
  assert.equal(getLocalAccountId(), null);
  assert.equal(scopedStorageKey('project'), 'project:unauthenticated');
  login('evil-user-id');
  assert.equal(getLocalAccountId(), null);
});
