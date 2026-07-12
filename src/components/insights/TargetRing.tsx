import React from 'react';
import {View} from 'react-native';

/**
 * Circular progress ring without react-native-svg. "Pie + hole" method: a
 * two-tone disc is clipped to each half and rotated so the colour/track boundary
 * sweeps clockwise from 12 o'clock; an inner circle punches the donut hole.
 */
export default function TargetRing({
  pct,
  size = 104,
  thickness = 11,
  color,
  track,
  innerBg,
  children,
}: {
  pct: number; // 0..1
  size?: number;
  thickness?: number;
  color: string;
  track: string;
  innerBg: string;
  children?: React.ReactNode;
}) {
  const r = size / 2;
  const hole = size - thickness * 2;
  const deg = Math.max(0, Math.min(1, pct)) * 360;
  const rightRotate = Math.min(deg, 180);
  const leftRotate = deg > 180 ? deg - 180 : 0;

  // One clipped half: `side` picks left/right; the disc's coloured half sweeps in.
  const Half = ({side, rotate}: {side: 'left' | 'right'; rotate: number}) => (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: side === 'right' ? r : 0,
        width: r,
        height: size,
        overflow: 'hidden',
      }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: side === 'right' ? -r : 0,
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: track,
          transform: [{rotate: `${rotate}deg`}],
        }}>
        {/* Coloured half of the disc (the side that sweeps into view). */}
        <View style={{position: 'absolute', top: 0, left: side === 'right' ? 0 : r, width: r, height: size, backgroundColor: color}} />
      </View>
    </View>
  );

  return (
    <View style={{width: size, height: size, borderRadius: r, backgroundColor: track, alignItems: 'center', justifyContent: 'center'}}>
      <Half side="right" rotate={rightRotate} />
      {deg > 180 && <Half side="left" rotate={leftRotate} />}
      <View
        style={{
          width: hole,
          height: hole,
          borderRadius: hole / 2,
          backgroundColor: innerBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {children}
      </View>
    </View>
  );
}
