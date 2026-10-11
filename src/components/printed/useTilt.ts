import { SensorType, useAnimatedReaction, useAnimatedSensor, useSharedValue, type SharedValue } from 'react-native-reanimated';

/** How far gravity has to move along an axis, in m/s², to count as a full tilt. */
const FULL_TILT = 3.2;

/**
 * How the phone is tilted compared with how it was being held a moment ago, from -1 to 1 on each
 * axis. The resting position follows the hand slowly, so a card always settles back to flat.
 */
export function useTilt(): { x: SharedValue<number>; y: SharedValue<number> } {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });
  const restX = useSharedValue(0);
  const restY = useSharedValue(0);
  const primed = useSharedValue(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  useAnimatedReaction(
    () => gravity.sensor.get(),
    (g) => {
      // The simulator, and the first frames on a phone, report no gravity at all.
      if (g.x === 0 && g.y === 0 && g.z === 0) return;
      if (!primed.get()) {
        restX.set(g.x);
        restY.set(g.y);
        primed.set(true);
      }
      restX.set(restX.get() + (g.x - restX.get()) * 0.003);
      restY.set(restY.get() + (g.y - restY.get()) * 0.003);
      const tx = Math.max(-1, Math.min(1, (g.x - restX.get()) / FULL_TILT));
      const ty = Math.max(-1, Math.min(1, (g.y - restY.get()) / FULL_TILT));
      x.set(x.get() + (tx - x.get()) * 0.25);
      y.set(y.get() + (ty - y.get()) * 0.25);
    },
  );

  return { x, y };
}
