import { createTheme } from '@mui/material';

// Vexora house theme (black & red) for the screens before login. Fixed values on purpose: the shop's own colours
// (theme.primary, sidebar.*) come from /api/settings, which needs a login. The splash (electron/splash.html) uses
// the same values.
export const VEXORA = {
  red: '#E5202B',
  redBright: '#F23541',
  redLight: '#FF5A62', // red text on dark (6:1); #E5202B is only 4:1 there
  redDeep: '#C41019',
  loginBg: '#07070A',
  card: 'linear-gradient(180deg, rgba(21,21,25,.94), rgba(13,13,16,.97))',
  input: '#0C0C10',
  border: 'rgba(255,255,255,.08)',
  borderStrong: 'rgba(255,255,255,.10)',
  text: '#F6F6F7',
  label: '#D4D4D8',
  muted: '#9A9AA2',
  dim: '#8A8A92', // the design's dim #5E5E66 lifted to 4.5:1 on the card
  focusRing: '0 0 0 3px rgba(229,32,43,.12)',
};

export const vexoraTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: VEXORA.red, light: VEXORA.redBright, dark: VEXORA.redDeep, contrastText: '#FFFFFF' },
    error: { main: VEXORA.redLight },
    background: { default: VEXORA.loginBg, paper: '#131317' },
    text: { primary: VEXORA.text, secondary: VEXORA.dim },
    divider: VEXORA.border,
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: VEXORA.input,
          borderRadius: 12,
          transition: 'box-shadow .15s ease',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.18)' },
          '&.Mui-focused': { boxShadow: VEXORA.focusRing },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: VEXORA.red, borderWidth: 1 },
          '&.Mui-error.Mui-focused': { boxShadow: '0 0 0 3px rgba(255,90,98,.14)' },
          '& .MuiInputAdornment-root, & .MuiInputAdornment-root .MuiIconButton-root': { color: VEXORA.dim },
          '& input::placeholder': { color: VEXORA.dim, opacity: 1 },
          // Chromium autofill would paint the field light
          '& input:-webkit-autofill': {
            WebkitBoxShadow: `0 0 0 100px ${VEXORA.input} inset`,
            WebkitTextFillColor: VEXORA.text,
            caretColor: VEXORA.text,
          },
        },
        notchedOutline: { borderColor: VEXORA.borderStrong },
      },
    },
    MuiButton: {
      styleOverrides: {
        // The red gradient primary button. #E5202B at the top (not the design's #F23541) keeps white text at 4.5:1.
        containedPrimary: {
          color: '#FFFFFF',
          backgroundImage: `linear-gradient(180deg, ${VEXORA.red}, ${VEXORA.redDeep})`,
          boxShadow: '0 10px 26px rgba(229,32,43,.30), inset 0 1px 0 rgba(255,255,255,.14)',
          transition: 'box-shadow .15s ease, transform .08s ease',
          '&:hover': {
            backgroundColor: VEXORA.redDeep,
            boxShadow: '0 14px 34px rgba(229,32,43,.42), inset 0 1px 0 rgba(255,255,255,.18)',
          },
          '&:active': { transform: 'translateY(1px)', boxShadow: '0 6px 16px rgba(229,32,43,.30)' },
          '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(255,90,98,.45), 0 10px 26px rgba(229,32,43,.30)' },
          '&.Mui-disabled': { backgroundImage: 'none', boxShadow: 'none' },
        },
        // Secondary actions (Cancel, Log out, Later): muted, not red
        textPrimary: { color: VEXORA.muted, '&:hover': { color: VEXORA.text, backgroundColor: 'rgba(255,255,255,.05)' } },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standard: { borderRadius: 12, border: `1px solid ${VEXORA.border}` },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundImage: VEXORA.card, border: `1px solid ${VEXORA.border}`, borderRadius: 18 },
      },
    },
  },
});
