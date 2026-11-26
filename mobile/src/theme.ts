/**
 * Design tokens shared with the web storefront (frontend/src/app/globals.css).
 * The names follow Nextcloud's theme variables so a value can be checked
 * against either app. Touch targets are bigger than the web's 34px controls
 * because fingers are bigger than cursors: 44pt is Apple's and Google's floor.
 */
export const color = {
  mainBackground: '#ffffff',
  mainBackgroundBlur: 'rgba(255,255,255,0.86)',
  mainText: '#222222',
  maxContrast: '#6b6b6b',
  backgroundHover: '#f5f5f5',
  backgroundDark: '#ededed',
  backgroundDarker: '#dbdbdb',
  border: '#ededed',
  borderDark: '#dbdbdb',
  borderMaxContrast: '#7d7d7d',

  primary: '#00679e',
  primaryHover: '#3385b1',
  primaryElement: '#00679e',
  primaryElementHover: '#00507a',
  primaryElementText: '#ffffff',
  primaryElementLight: '#e6f0f5',
  primaryElementLightText: '#00293f',
  backgroundPlain: '#00679e',

  error: '#ffe7e7',
  errorText: '#8a0000',
  elementError: '#c90000',
  warning: '#ffeec5',
  warningText: '#664700',
  elementWarning: '#bf7900',
  success: '#d8f3da',
  successText: '#005416',
  elementSuccess: '#099f05',
  info: '#d5f1fa',
  infoText: '#0066ac',
} as const;

/** Map pins. Malcolm's rule for the rider map: yellow waiting, red taken, green done. */
export const pin = {
  pending: '#f2c200',
  pendingStroke: '#7a6100',
  active: '#d62d20',
  done: '#0f9d58',
  blocked: '#9e9e9e',
  shop: '#00679e',
  rider: '#00679e',
  route: '#00679e',
} as const;

export const radius = { small: 4, element: 8, container: 12, large: 16, pill: 100 } as const;
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const font = { small: 13, body: 15, large: 17, title: 20, display: 28 } as const;
export const touch = 44;
