import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpicDoneMove } from '../src/taskMoves.js';

test('resolveEpicDoneMove redirects epic done to review when column exists', () => {
  const res = resolveEpicDoneMove({
    taskType: 'epic',
    requestedColumnName: 'Done',
    requestedOrder: 2,
    columns: [{ name: 'Review', enabled: true }],
    reviewMaxOrder: 4
  });
  assert.equal(res.columnName, 'Review');
  assert.equal(res.order, 5);
});

test('resolveEpicDoneMove keeps non-epic in done', () => {
  const res = resolveEpicDoneMove({
    taskType: 'story',
    requestedColumnName: 'Done',
    requestedOrder: 2,
    columns: [{ name: 'Review', enabled: true }],
    reviewMaxOrder: 4
  });
  assert.equal(res.columnName, 'Done');
  assert.equal(res.order, 2);
});

test('resolveEpicDoneMove keeps epic in done when no review column', () => {
  const res = resolveEpicDoneMove({
    taskType: 'epic',
    requestedColumnName: 'Done',
    requestedOrder: 1,
    columns: [{ name: 'Backlog', enabled: true }],
    reviewMaxOrder: null
  });
  assert.equal(res.columnName, 'Done');
  assert.equal(res.order, 1);
});
