import { useState } from 'react';
import { Box, Tabs, Tab, Paper } from '@mui/material';
import SystemSettings from '../components/settings/SystemSettings';
import DatabaseBackup from '../components/settings/DatabaseBackup';
import ShopInfo from '../components/settings/ShopInfo';
import PrinterSettings from '../components/settings/PrinterSettings';
import ReceiptCustomization from '../components/settings/ReceiptCustomization';
import SecuritySettings from '../components/settings/SecuritySettings';
import { useAuthStore } from '../store/authStore';

function Settings() {
  const [activeTab, setActiveTab] = useState(0);
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          <Tab label="System Settings" />
          <Tab label="Database & Backup" />
          <Tab label="Shop Info" />
          <Tab label="Printer" />
          <Tab label="Receipt Customization" />
          {isAdmin && <Tab label="Security" />}
        </Tabs>
      </Paper>

      {activeTab === 0 && <SystemSettings />}
      {activeTab === 1 && <DatabaseBackup />}
      {activeTab === 2 && <ShopInfo />}
      {activeTab === 3 && <PrinterSettings />}
      {activeTab === 4 && <ReceiptCustomization />}
      {activeTab === 5 && isAdmin && <SecuritySettings />}
    </Box>
  );
}

export default Settings;
