import Svg, { Path, Rect } from 'react-native-svg';

/** The Bazaar's mark: a striped market awning over a shop door. Same paths as the web icon. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessibilityLabel="The Bazaar">
      <Rect width={28} height={28} rx={6} fill="#16130f" />
      <Path d="M4 11h20l-2-5H6z" fill="#d23a1f" />
      <Path
        d="M4 11h5v2a2.5 2.5 0 0 1-5 0zM9 11h5v2a2.5 2.5 0 0 1-5 0zM14 11h5v2a2.5 2.5 0 0 1-5 0zM19 11h5v2a2.5 2.5 0 0 1-5 0z"
        fill="#f4f0e6"
      />
      <Rect x={11} y={17} width={6} height={7} fill="#f4f0e6" />
    </Svg>
  );
}
