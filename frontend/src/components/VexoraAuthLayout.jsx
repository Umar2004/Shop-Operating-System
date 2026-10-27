import { Box, Divider, ThemeProvider, Typography } from '@mui/material';
import { VENDOR_NAME } from '../config/brand';
import { VEXORA, vexoraTheme } from '../theme/vexora';
import swirl from '../assets/vexora-swirl.png';

// The screens before the main app (login, forced password change, recovery key) in the Vexora house theme: dark
// background with red glows and a faint swirl, one centred card with a red accent bar, "Powered by" footer.
// The theme is scoped to these screens; the main app keeps the shop's own colours (theme.primary).
function VexoraAuthLayout({ children, width = 430 }) {
  return (
    <ThemeProvider theme={vexoraTheme}>
      <Box
        // Its own scroll area (dark scrollbar) for short windows; the card centres with auto margins, which, unlike
        // align-items, never clips its top when the window is shorter than the card
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          overflowX: 'hidden',
          overflowY: 'auto',
          colorScheme: 'dark',
          px: 2,
          py: 4,
          '@media (max-height: 860px)': { py: 2 },
          bgcolor: VEXORA.loginBg,
          backgroundImage:
            'radial-gradient(760px 560px at 0% 0%, rgba(229,32,43,.16), transparent 70%),' +
            'radial-gradient(760px 560px at 100% 100%, rgba(229,32,43,.12), transparent 70%)',
          color: VEXORA.text,
        }}
      >
        <Box
          component="img"
          src={swirl}
          alt=""
          aria-hidden="true"
          sx={{
            position: 'fixed',
            right: { xs: -120, md: -90 },
            bottom: { xs: -120, md: -110 },
            width: { xs: 360, md: 520 },
            opacity: 0.05,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        <Box
          component="main"
          sx={{
            position: 'relative',
            m: 'auto',
            width,
            maxWidth: '92vw',
            px: { xs: 3, sm: 4.5 },
            pt: { xs: 4.5, sm: 5 },
            pb: 3,
            '@media (max-height: 860px)': { pt: 3.5, pb: 2.5 },
            borderRadius: '22px',
            backgroundImage: VEXORA.card,
            border: `1px solid ${VEXORA.border}`,
            boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 70px rgba(229,32,43,.08)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: -1,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 72,
              height: 3,
              borderRadius: '0 0 3px 3px',
              background: `linear-gradient(90deg, ${VEXORA.redDeep}, ${VEXORA.redBright}, ${VEXORA.redDeep})`,
              boxShadow: '0 0 14px rgba(229,32,43,.7)',
            }}
          />

          {children}

          <Divider sx={{ mt: 3, mb: 2, borderColor: VEXORA.border }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Box component="img" src={swirl} alt="" aria-hidden="true" sx={{ width: 16, height: 16 }} />
            <Typography sx={{ fontSize: 12, color: VEXORA.dim }}>
              Powered by{' '}
              <Box component="span" sx={{ color: '#B4B4BC', fontWeight: 600 }}>
                {VENDOR_NAME}
              </Box>
            </Typography>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

// Card heading for the screens after login: a red badge with an icon, the title and a muted line under it
export function VexoraCardHeader({ icon, title, subtitle }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 2.5 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 52,
          height: 52,
          mb: 1.5,
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          backgroundImage: `linear-gradient(145deg, ${VEXORA.redBright}, ${VEXORA.redDeep})`,
          border: `1px solid ${VEXORA.borderStrong}`,
          boxShadow: '0 12px 30px rgba(0,0,0,.45), 0 0 26px rgba(229,32,43,.18)',
        }}
      >
        {icon}
      </Box>
      <Typography component="h1" sx={{ fontSize: 23, fontWeight: 700, lineHeight: 1.3, color: VEXORA.text }}>
        {title}
      </Typography>
      {subtitle && <Typography sx={{ mt: 0.75, fontSize: 14, lineHeight: 1.55, color: VEXORA.muted }}>{subtitle}</Typography>}
    </Box>
  );
}

// A visible <label> above a field (pass the field's id)
export function FieldLabel({ htmlFor, children }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: VEXORA.label }}
    >
      {children}
    </Typography>
  );
}

export default VexoraAuthLayout;
