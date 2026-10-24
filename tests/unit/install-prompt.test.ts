import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INSTALL_SNOOZE_MS, installMode, isIos, isSnoozed, snooze } from '../../src/platform/install-prompt.ts';
import { STORAGE_KEYS } from '../../src/platform/storage.ts';
import { memoryStorage } from '../helpers/fakes.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('install banner rules', () => {
  it('recognises iOS devices, including iPads that pretend to be a Mac', () => {
    assert.equal(isIos(IPHONE, 5), true);
    assert.equal(isIos(MAC, 5), true);
    assert.equal(isIos(MAC, 0), false);
    assert.equal(isIos(ANDROID, 5), false);
  });

  it('uses the browser dialog when available, the iOS hint otherwise, and nothing once installed', () => {
    assert.equal(installMode({ installed: false, ios: false, canPrompt: true }), 'prompt');
    assert.equal(installMode({ installed: false, ios: true, canPrompt: false }), 'ios');
    assert.equal(installMode({ installed: false, ios: false, canPrompt: false }), null);
    assert.equal(installMode({ installed: true, ios: true, canPrompt: true }), null);
  });

  it('stays away for a week after being closed', () => {
    const storage = memoryStorage();
    const now = 1_000_000_000_000;
    assert.equal(isSnoozed(storage, now), false);
    snooze(storage, now);
    assert.equal(storage.getItem(STORAGE_KEYS.installDismissed), String(now));
    assert.equal(isSnoozed(storage, now + INSTALL_SNOOZE_MS - 1), true);
    assert.equal(isSnoozed(storage, now + INSTALL_SNOOZE_MS), false);
  });
});
