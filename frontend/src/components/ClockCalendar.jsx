import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Popover } from '@mui/material';
import { MdAccessTime, MdCalendarToday } from 'react-icons/md';

function ClockCalendar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatShortDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
          px: 1.5,
          py: 0.5,
          borderRadius: 1,
          transition: 'background-color 0.2s',
          '&:hover': {
            bgcolor: 'rgba(255, 255, 255, 0.1)',
          },
        }}
        onClick={handleClick}
        aria-describedby="calendar-popover"
      >
        <MdCalendarToday style={{ fontSize: '1.1rem' }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <Typography variant="caption" sx={{ lineHeight: 1.2, fontSize: '0.7rem', opacity: 0.9 }}>
            {formatShortDate(currentTime)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <MdAccessTime style={{ fontSize: '0.85rem', opacity: 0.8 }} />
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
              {formatTime(currentTime)}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Popover
        id="calendar-popover"
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Paper sx={{ p: 2, minWidth: 250 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: 'primary.main' }}>
              {formatDate(currentTime)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1.5 }}>
              <MdAccessTime style={{ fontSize: '1.2rem', color: '#666' }} />
              <Typography variant="h5" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                {formatTime(currentTime)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Click anywhere to close
            </Typography>
          </Box>
        </Paper>
      </Popover>
    </>
  );
}

export default ClockCalendar;
