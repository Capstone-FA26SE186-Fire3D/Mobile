import type { ViewStyle } from 'react-native';

/**
 * Props of the opaque base that sits under a raised face (`Raised` in Game.tsx).
 *
 * The base must keep the same native-view traits whether or not it is pressed. On Android (Fabric) a view that only has
 * a background is not a stacking context, so its children (the face, icon and label) are mounted on the parent
 * Pressable; adding a transform makes it one and moves them under the base. Toggling the transform on press therefore
 * re-parented native views on every tap, and when the press release landed in the same commit as a screen change
 * ("Chơi lại" on the result screen → `router.replace`), Fabric inserted the face into the Pressable while it was still in
 * the base and the app crashed ("The specified child already has a parent", UAT 16/11). Pinning the base as its own
 * view and always giving it a transform means a press only updates `translateY`.
 */
export function raisedBaseProps({
  depth,
  radius,
  pressed,
  background,
}: {
  depth: number;
  radius: number;
  pressed: boolean;
  background: string | undefined;
}): { collapsable: false; style: ViewStyle } {
  return {
    collapsable: false,
    style: {
      borderRadius: radius,
      backgroundColor: depth > 0 ? background : undefined,
      transform: [{ translateY: pressed ? depth - 1 : 0 }],
    },
  };
}
