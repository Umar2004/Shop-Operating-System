## Shop Operating Platform (SOP)

This is an offline-first POS and shop management system built with:

- **React + Vite + MUI** (frontend)
- **Node.js + Express + SQLite (better-sqlite3)** (backend)

### Running in Development

1. Install dependencies:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

2. From the project root, start everything:

```bash
npm run dev
```

This will start:

- Backend API on `http://localhost:4000`
- Frontend (Vite) on `http://localhost:5173`

Open your browser and navigate to `http://localhost:5173`

### Default Login

- **Username**: `admin`
- **Password**: `admin`

These are created automatically on first run. Change them in the Users screen when you add it, or directly in the database for now.

### Build Frontend for Production

```bash
npm run build:frontend
```

This will create optimized production files in `frontend/dist/`.

To serve the production build, you can:
1. Use a static file server (e.g., `serve`, `nginx`, `apache`)
2. Configure your backend to serve static files from `frontend/dist/`
3. Deploy to a hosting service

### Running Backend Only

```bash
cd backend
npm start
```

The backend will run on `http://localhost:4000`

### Running Frontend Only

```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

### Database & Backup

- SQLite file is stored in `backend/data/sop.db` on the local machine (or in `%APPDATA%\SOP\data\` on Windows in production).
- You can back it up by copying that file (and later through the in-app backup screen when implemented).

### Environment Variables

You can configure the application using environment variables:

- `PORT` - Backend server port (default: 4000)
- `NODE_ENV` - Environment mode (development/production)
- `DATA_DIR` - Database storage directory
- `UPLOADS_DIR` - File uploads directory

For the frontend:
- `VITE_API_URL` - Backend API URL (default: http://localhost:4000/api)

### Project Structure

```
SOS/
├── backend/          # Node.js/Express backend
│   ├── src/         # Backend source code
│   ├── data/        # Database files
│   └── uploads/     # Uploaded files
├── frontend/         # React frontend
│   ├── src/         # Frontend source code
│   └── dist/        # Production build output
└── package.json     # Root package.json for convenience scripts
```

### Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation and setup guide
- [MANUAL_SERVER_START.md](MANUAL_SERVER_START.md) - Manual server startup guide
- [DIAGNOSE_BACKEND.md](DIAGNOSE_BACKEND.md) - Backend troubleshooting guide
