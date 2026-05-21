import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';

export interface LinePoint {
  /** X-axis label (e.g., a date string). */
  label: string;
  value: number;
}

interface Props {
  data: LinePoint[];
  height?: number;
  width?: number;
  color?: string;
  emptyMessage?: string;
}

const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

export function LineChart({
  data,
  height = 200,
  width = 320,
  color = '#0a7ea4',
  emptyMessage = 'No data yet.',
}: Props) {
  const { points, yMax, yMid } = useMemo(() => {
    if (data.length === 0) {
      return { points: '', yMax: 0, yMid: 0 };
    }
    const ymax = Math.max(1, ...data.map((d) => d.value));
    const innerW = width - PAD_L - PAD_R;
    const innerH = height - PAD_T - PAD_B;
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data
      .map((d, i) => {
        const x = PAD_L + i * step;
        const y = PAD_T + innerH - (d.value / ymax) * innerH;
        return `${x},${y}`;
      })
      .join(' ');
    return { points: pts, yMax: ymax, yMid: Math.round(ymax / 2) };
  }, [data, width, height]);

  if (data.length === 0) {
    return <ThemedText style={styles.empty}>{emptyMessage}</ThemedText>;
  }

  const innerH = height - PAD_T - PAD_B;
  const innerW = width - PAD_L - PAD_R;

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        {/* Axes */}
        <Line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} stroke="#666" strokeWidth={1} />
        <Line
          x1={PAD_L}
          y1={PAD_T + innerH}
          x2={PAD_L + innerW}
          y2={PAD_T + innerH}
          stroke="#666"
          strokeWidth={1}
        />
        {/* Y-axis ticks */}
        <SvgText x={PAD_L - 6} y={PAD_T + 4} fill="#888" fontSize="10" textAnchor="end">
          {yMax}
        </SvgText>
        <SvgText
          x={PAD_L - 6}
          y={PAD_T + innerH / 2 + 4}
          fill="#888"
          fontSize="10"
          textAnchor="end"
        >
          {yMid}
        </SvgText>
        <SvgText x={PAD_L - 6} y={PAD_T + innerH + 4} fill="#888" fontSize="10" textAnchor="end">
          0
        </SvgText>
        {/* Line */}
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2} />
        {/* Dots */}
        {data.map((d, i) => {
          const step = data.length > 1 ? innerW / (data.length - 1) : 0;
          const x = PAD_L + i * step;
          const y = PAD_T + innerH - (d.value / yMax) * innerH;
          return <Circle key={i} cx={x} cy={y} r={3} fill={color} />;
        })}
        {/* X labels: first and last only to avoid clutter */}
        {data.length > 0 && (
          <>
            <SvgText x={PAD_L} y={height - 6} fill="#888" fontSize="10" textAnchor="start">
              {data[0]!.label}
            </SvgText>
            <SvgText x={PAD_L + innerW} y={height - 6} fill="#888" fontSize="10" textAnchor="end">
              {data[data.length - 1]!.label}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  empty: { opacity: 0.6, fontStyle: 'italic' },
});
