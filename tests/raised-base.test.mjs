// Regression for the UAT 16/11 crash: tapping "Chơi lại" on the result screen killed the app with Fabric's
// "addViewAt: failed to insert view … The specified child already has a parent". The raised button base toggled a
// transform on press, which flips whether it is a native stacking context and so re-parents the face, icon and label
// on every tap. The base must look the same to the native view tree pressed or not; only translateY may change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { raisedBaseProps } from '../src/components/ui/raised-base.ts';

const nativeTraits = ({ collapsable, style }) => ({
  collapsable,
  hasTransform: Array.isArray(style.transform) && style.transform.length > 0,
  hasBackground: style.backgroundColor !== undefined,
});

for (const depth of [0, 3, 4, 5]) {
  test(`raised base keeps its native view across a press (depth ${depth})`, () => {
    const idle = raisedBaseProps({ depth, radius: 18, pressed: false, background: '#141719' });
    const pressed = raisedBaseProps({ depth, radius: 18, pressed: true, background: '#141719' });
    assert.equal(idle.collapsable, false, 'base is never flattened into the Pressable');
    assert.deepEqual(nativeTraits(pressed), nativeTraits(idle));
  });
}

test('pressing only moves the base down by depth - 1', () => {
  const idle = raisedBaseProps({ depth: 5, radius: 18, pressed: false, background: '#141719' });
  const pressed = raisedBaseProps({ depth: 5, radius: 18, pressed: true, background: '#141719' });
  assert.deepEqual(idle.style.transform, [{ translateY: 0 }]);
  assert.deepEqual(pressed.style.transform, [{ translateY: 4 }]);
  assert.deepEqual(
    { ...pressed.style, transform: undefined },
    { ...idle.style, transform: undefined },
  );
});

test('the opaque base colour only shows when there is a shadow under it', () => {
  assert.equal(
    raisedBaseProps({ depth: 4, radius: 12, pressed: false, background: '#141719' }).style
      .backgroundColor,
    '#141719',
  );
  assert.equal(
    raisedBaseProps({ depth: 0, radius: 12, pressed: false, background: '#141719' }).style
      .backgroundColor,
    undefined,
  );
});
