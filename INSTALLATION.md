# Shop Operating Platform - Installation Guide

## System Requirements

- **Operating System**: Windows 10 or later, macOS, or Linux
- **Node.js**: Version 18 or later
- **RAM**: Minimum 2GB, Recommended 4GB
- **Disk Space**: Minimum 200MB for application, additional space for database and backups
- **Internet**: Not required for operation (offline-first application)

## Installation Steps

### 1. Install Node.js

1. Download Node.js from https://nodejs.org/
2. Install Node.js (version 18 or later)
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### 2. Install Application Dependencies

1. **Navigate to project directory:**
   ```bash
   cd path/to/SOS
   ```

2. **Install root dependencies:**
   ```bash
   npm install
   ```

3. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   cd ..
   ```

4. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Running the Application

### Development Mode

1. **Start the backend server:**
   ```bash
   cd backend
   npm run dev
   ```
   The backend will run on `http://localhost:4000`

2. **In a new terminal, start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`

3. **Open your browser:**
   Navigate to `http://localhost:5173`

### Production Mode

1. **Build the frontend:**
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

2. **Start the backend:**
   ```bash
   cd backend
   npm start
   ```

3. **Serve the frontend:**
   You can use any static file server to serve the `frontend/dist` directory, or configure your backend to serve the static files.

## First-Time Setup

### Initial Login

When you first launch the application:

1. **Default Credentials**:
   - Username: `admin`
   - Password: `admin`

2. **Important**: Change the default password immediately after first login:
   - Go to Settings → Users
   - Edit the admin user
   - Change the password to a secure one

### Database Initialization

The application will automatically:
- Create the database on first run
- Initialize default settings
- Create the admin user account

All data is stored locally on your computer in:
- **Windows**: `%APPDATA%\SOP\data\`
- **macOS**: `~/Library/Application Support/SOP/data/`
- **Linux**: `~/.config/SOP/data/`

## Configuration

### Shop Information

1. Go to **Settings → Shop Info**
2. Enter your shop details:
   - Shop Name
   - Phone Number
   - Address
   - Upload Logo (optional)

### Backup Settings

1. Go to **Settings → Database & Backup**
2. Configure backup settings:
   - Set backup storage path (recommended: external drive or cloud sync folder)
   - Enable automatic backups (daily, weekly, monthly)
   - Configure backup schedule

### User Management

1. Go to **Users** (Admin only)
2. Create additional user accounts
3. Assign roles and permissions:
   - **ADMIN**: Full access to all features
   - **MANAGER**: Access to most features except user management
   - **CASHIER**: Basic operations (sales, products, customers)

## Data Storage Locations

### Application Data
- **Windows**: `%APPDATA%\SOP\`
- **macOS**: `~/Library/Application Support/SOP/`
- **Linux**: `~/.config/SOP/`
- **Contains**: Database, backups, uploads, logs

### Database File
- **Location**: `{AppData}/data/sop.db`
- **Backup**: Regularly backup this file or use the built-in backup feature

### Backups
- **Default Location**: `{AppData}/data/backups/`
- **Custom Location**: Can be configured in Settings

### Uploads (Logos)
- **Location**: `{AppData}/uploads/logo/`

## Troubleshooting

### Application Won't Start

1. **Check Node.js Version**: Ensure you're running Node.js 18 or later
2. **Check Dependencies**: Run `npm install` in root, backend, and frontend directories
3. **Check Ports**: Ensure ports 4000 (backend) and 5173 (frontend) are not in use
4. **Check Logs**: Check console output for error messages

### Database Errors

1. **Corrupted Database**: 
   - Restore from backup (Settings → Database & Backup)
   - Or delete the database file to start fresh (will lose all data)

2. **Permission Errors**:
   - Ensure you have write permissions to the application data directory
   - Run as Administrator if needed (Windows)

### Port Already in Use

If you see an error about port 4000 or 5173 being in use:
1. Close any other instances of the application
2. Check if another application is using the port
3. Change the port in the configuration if needed

### Native Module Errors (better-sqlite3)

If you see errors about `better-sqlite3`:
1. Rebuild the module:
   ```bash
   cd backend
   npm rebuild better-sqlite3
   ```
2. Ensure you have build tools installed (Visual Studio Build Tools on Windows, Xcode on macOS, build-essential on Linux)

## Backup and Restore

### Creating Backups

1. **Manual Backup**:
   - Go to Settings → Database & Backup
   - Click "Create Backup Now"

2. **Automatic Backups**:
   - Configure in Settings → Database & Backup
   - Set schedule (daily, weekly, monthly)
   - Choose backup storage location

### Restoring from Backup

1. Go to Settings → Database & Backup
2. Find the backup file in the list
3. Click the restore icon
4. Confirm the restore operation
5. Restart the application

### Manual Backup (File Copy)

You can also manually backup by copying:
- `{AppData}/data/sop.db` - Main database file

To restore, replace the file and restart the application.

## Security Notes

- Change default admin password immediately
- Regularly backup your database
- Store backups in a secure location (external drive or cloud)
- Keep the application updated
- Use strong passwords for user accounts
- Limit user permissions based on roles

## Performance Tips

- Close the application when not in use to free system resources
- Regularly clean up old backups
- Keep at least 500MB free disk space for database growth
- Use SSD storage for better performance
