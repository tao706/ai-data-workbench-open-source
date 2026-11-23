import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('atomic persistence retries transient file locks and preserves latest queued state', async () => {
  const temp = await fs.mkdtemp(join(tmpdir(), 'workbench-save-lock-'));
  process.env.WORKBENCH_STATE_FILE = join(temp, 'state.json');
  delete process.env.MYSQL_URL;
  const { db, save } = await import('../dist/store.js');
  const rename = fs.rename;
  let attempts = 0;
  try {
    fs.rename = async (...args) => {
      if (++attempts <= 2) throw Object.assign(new Error('temporary lock'), { code: 'EPERM' });
      return rename(...args);
    };
    db().projects = [{ id: 'first' }];const first = save();
    db().projects = [{ id: 'latest' }];const latest = save();
    await Promise.all([first, latest]);
    assert.equal(attempts, 4);
    assert.equal(JSON.parse(await fs.readFile(process.env.WORKBENCH_STATE_FILE, 'utf8')).projects[0].id, 'latest');
    attempts = 0;
    fs.rename = async () => { attempts++;throw Object.assign(new Error('persistent lock'), { code: 'EACCES' }); };
    await assert.rejects(save(), /状态保存失败/);assert.equal(attempts, 6);
    assert.equal(JSON.parse(await fs.readFile(process.env.WORKBENCH_STATE_FILE, 'utf8')).projects[0].id, 'latest');
    fs.rename = rename;db().projects = [{ id: 'recovered' }];await save();
    assert.equal(JSON.parse(await fs.readFile(process.env.WORKBENCH_STATE_FILE, 'utf8')).projects[0].id, 'recovered');
  } finally { fs.rename = rename;await fs.rm(temp, { recursive: true, force: true }); }
});
