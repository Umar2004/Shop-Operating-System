import { Alert, AlertTitle, Box, Typography } from '@mui/material';
import { formatCloudTime } from '../utils/cloudStatus';

const Path = ({ children }) => (
  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
    {children}
  </Box>
);

// Shown when backups are not going to the folder set in Settings (e.g. the backup drive is unplugged, so they are
// saved on this PC instead), or when the last backup went elsewhere for that reason. Nothing otherwise.
// location: GET /settings/backup/location
function BackupLocationWarning({ location, compact = false, sx }) {
  if (!location) return null;
  const last = location.last;
  if (location.fallback) {
    return (
      <Alert severity="warning" sx={sx}>
        <AlertTitle>Backups are not going to {location.configured}</AlertTitle>
        That folder can&apos;t be used right now (is the backup drive plugged in?). Backups are being saved on this PC
        instead, in <Path>{location.actual}</Path>. They are not protected if this PC&apos;s disk fails.
        {!compact && location.reason && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Reason: {location.reason}
          </Typography>
        )}
      </Alert>
    );
  }
  if (last && last.fallback_from) {
    return (
      <Alert severity="info" sx={sx}>
        The last backup ({formatCloudTime(last.at)}) was saved on this PC in <Path>{last.dir}</Path> because{' '}
        {last.fallback_from} couldn&apos;t be used then. New backups go to <Path>{location.actual}</Path> again
        {compact ? '.' : '; copy that backup there if you want it with the others.'}
      </Alert>
    );
  }
  return null;
}

export default BackupLocationWarning;
