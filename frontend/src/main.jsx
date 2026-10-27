import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
// Bundled fonts (the app runs offline): Inter for the UI, Cinzel for the Vexora Labs wordmark
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/800.css';
import './index.css';
import App from './App.jsx';
import { api } from './api/client';
import { setDecimalPlaces } from './utils/numberFormat';

function AppWithTheme() {
  const [theme, setTheme] = useState(
    createTheme({
      palette: {
        primary: {
          main: '#1976D2', // Default color
        },
    success: {
      main: '#2E7D32', // money in
    },
    warning: {
      main: '#ED6C02', // alerts / profit
    },
    error: {
      main: '#D32F2F', // expenses / danger
    },
    background: {
      default: '#F4F6F8', // soft background
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily:
      '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    // Base font size scales with viewport
    fontSize: 16,
    htmlFontSize: 16,
    // Responsive typography variants using clamp()
    h1: {
      fontSize: 'clamp(2rem, 5vw, 3.5rem)',
      lineHeight: 1.2,
    },
    h2: {
      fontSize: 'clamp(1.75rem, 4vw, 3rem)',
      lineHeight: 1.3,
    },
    h3: {
      fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
      lineHeight: 1.3,
    },
    h4: {
      fontSize: 'clamp(1.25rem, 3vw, 2rem)',
      lineHeight: 1.4,
    },
    h5: {
      fontSize: 'clamp(1.125rem, 2.5vw, 1.75rem)',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: 'clamp(1rem, 2vw, 1.5rem)',
      lineHeight: 1.5,
    },
    body1: {
      fontSize: 'clamp(0.875rem, 1.5vw, 1rem)',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: 'clamp(0.75rem, 1.25vw, 0.875rem)',
      lineHeight: 1.6,
    },
    caption: {
      fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
      lineHeight: 1.5,
    },
    button: {
      fontSize: 'clamp(0.75rem, 1.25vw, 0.875rem)',
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 10,
  },
  // Responsive breakpoints
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
      },
    })
  );

  useEffect(() => {
    // Load settings on mount
    const loadSettings = async () => {
      try {
        const settings = await api.getSettings();
        const primaryColor = settings['theme.primary'] || '#1976D2';
        const decimals = settings['system.decimal_places'] || '2';
        
        // Update decimal places
        setDecimalPlaces(decimals);

        // Update theme
        setTheme(
          createTheme({
            palette: {
              primary: {
                main: primaryColor,
              },
              success: {
                main: '#2E7D32',
              },
              warning: {
                main: '#ED6C02',
              },
              error: {
                main: '#D32F2F',
              },
              background: {
                default: '#F4F6F8',
                paper: '#FFFFFF',
              },
            },
            typography: {
              fontFamily:
                '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: 16,
              htmlFontSize: 16,
              h1: {
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                lineHeight: 1.2,
              },
              h2: {
                fontSize: 'clamp(1.75rem, 4vw, 3rem)',
                lineHeight: 1.3,
              },
              h3: {
                fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
                lineHeight: 1.3,
              },
              h4: {
                fontSize: 'clamp(1.25rem, 3vw, 2rem)',
                lineHeight: 1.4,
              },
              h5: {
                fontSize: 'clamp(1.125rem, 2.5vw, 1.75rem)',
                fontWeight: 600,
                lineHeight: 1.4,
              },
              h6: {
                fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                lineHeight: 1.5,
              },
              body1: {
                fontSize: 'clamp(0.875rem, 1.5vw, 1rem)',
                lineHeight: 1.6,
              },
              body2: {
                fontSize: 'clamp(0.75rem, 1.25vw, 0.875rem)',
                lineHeight: 1.6,
              },
              caption: {
                fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
                lineHeight: 1.5,
              },
              button: {
                fontSize: 'clamp(0.75rem, 1.25vw, 0.875rem)',
                textTransform: 'none',
              },
            },
            shape: {
              borderRadius: 10,
            },
            breakpoints: {
              values: {
                xs: 0,
                sm: 600,
                md: 900,
                lg: 1200,
                xl: 1536,
              },
            },
          })
        );
      } catch (err) {
        console.error('Failed to load settings:', err);
        // Use defaults if settings load fails
      }
    };

    loadSettings();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppWithTheme />
  </StrictMode>
);
