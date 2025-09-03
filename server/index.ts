import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
// TypeScript: Add session property to Express Request
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    strava_id?: string;
  }
}
// Entry point for the Express server
import express from 'express';
import session from 'express-session';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'strava_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
}));

// Example route
app.get('/', (req: express.Request, res: express.Response) => {
  res.send('Express server is running');
});


import axios from 'axios';
import pool from './db';

// Strava OAuth callback endpoint
app.get('/auth/strava/callback', async (req: express.Request, res: express.Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    // Exchange code for access token
    const tokenRes = await axios.post('https://www.strava.com/oauth/token', null, {
      params: {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      },
    });

    type StravaTokenResponse = {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: string };
    };

    const { access_token, refresh_token, expires_at, athlete } = tokenRes.data as StravaTokenResponse;
    const strava_id = athlete.id;

    // Store or update user in DB
    await pool.query(
      `INSERT INTO users (strava_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (strava_id) DO UPDATE SET access_token = $2, refresh_token = $3, expires_at = $4`,
      [strava_id, access_token, refresh_token, expires_at]
    );

  // Store user id in session
  (req.session as any).strava_id = strava_id;
  res.redirect('http://localhost:3000/leaderboard');
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch or store token' });
  }
});

// Endpoint to fetch current user's Strava clubs
app.get('/me/clubs', async (req: express.Request, res: express.Response) => {
  const strava_id = (req.session as any).strava_id;
  console.log(req.session)
  if (!strava_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Get user's access token from DB
    const result = await pool.query('SELECT access_token FROM users WHERE strava_id = $1', [strava_id]);
    console.log(result);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const access_token = result.rows[0].access_token;

    // Fetch clubs from Strava API
    const clubsRes = await axios.get('https://www.strava.com/api/v3/athlete/clubs', {
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    });
    res.json(clubsRes.data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clubs' });
  }
});

// List members of a club
app.get('/clubs/:clubId/members', async (req: express.Request, res: express.Response) => {
  const strava_id = req.session.strava_id;
  if (!strava_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const result = await pool.query('SELECT access_token FROM users WHERE strava_id = $1', [strava_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const access_token = result.rows[0].access_token;
    const clubId = req.params.clubId;
    const membersRes = await axios.get(`https://www.strava.com/api/v3/clubs/${clubId}/members`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    res.json(membersRes.data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch club members' });
  }
});

// Endpoint to fetch recent activities for a club
app.get('/clubs/:clubId/activities', async (req: express.Request, res: express.Response) => {
  const strava_id = req.session.strava_id;
  if (!strava_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const result = await pool.query('SELECT access_token FROM users WHERE strava_id = $1', [strava_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const access_token = result.rows[0].access_token;
    const clubId = req.params.clubId;
    const per_page = req.query.per_page || 30;
    const page = req.query.page || 1;
    const activitiesRes = await axios.get(`https://www.strava.com/api/v3/clubs/${clubId}/activities`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { per_page, page },
    });
    res.json(activitiesRes.data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch club activities' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
