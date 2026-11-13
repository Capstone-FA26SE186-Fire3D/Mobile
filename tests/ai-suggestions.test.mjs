// Trainee AI: which context a question carries and the ready-made questions for criterion-by-criterion guidance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aiContextFromParams, aiContextLabel, aiSuggestions } from '../src/features/ai/suggestions.ts';

test('an article wins, then a result, then a Training', () => {
  assert.deepEqual(aiContextFromParams({ postId: 'p', versionId: 'v', sessionId: 's', trainingId: 't' }), {
    kind: 'Learn',
    postId: 'p',
    versionId: 'v',
  });
  assert.deepEqual(aiContextFromParams({ sessionId: 's', trainingId: 't' }), { kind: 'Result', sessionId: 's' });
  assert.deepEqual(aiContextFromParams({ trainingId: 't' }), { kind: 'Training', trainingId: 't' });
  assert.equal(aiContextFromParams({ postId: 'p' }), undefined, 'an article needs its version');
  assert.equal(aiContextFromParams({ trainingId: '' }), undefined);
  assert.equal(aiContextFromParams({ sessionId: ['a', 'b'] }), undefined, 'repeated params are ignored');
});

test('suggestions guide a Training and review a Result criterion by criterion', () => {
  assert.match(aiSuggestions({ kind: 'Training', trainingId: 't' })[0], /từng tiêu chí/);
  assert.match(aiSuggestions({ kind: 'Result', sessionId: 's' })[0], /từng tiêu chí/);
  assert.deepEqual(aiSuggestions({ kind: 'Learn', postId: 'p', versionId: 'v' }), []);
  assert.deepEqual(aiSuggestions(undefined), []);
});

test('the Training line says the grading is not included', () => {
  assert.match(aiContextLabel({ kind: 'Training', trainingId: 't' }), /không gồm ngưỡng chấm/);
  assert.equal(aiContextLabel(undefined), 'Hỏi về bài học, kết quả của bạn');
});
