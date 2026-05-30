const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Look 90 days ahead
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 90);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      q: 'IMAGESTATE MEDIA APPT',
      singleEvents: true,
      maxResults: 500,
    });

    const events = (response.data.items || []).filter(e =>
      e.summary && e.summary.includes('IMAGESTATE MEDIA APPT')
    );

    // Count jobs per date
    const countByDate = {};
    for (const event of events) {
      const dateStr = (event.start.dateTime || event.start.date).substring(0, 10);
      countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;
    }

    // Return dates that are fully booked (3 or more)
    const fullyBooked = Object.entries(countByDate)
      .filter(([, count]) => count >= 3)
      .map(([date]) => date);

    return res.status(200).json({ fullyBooked });

  } catch (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Failed to fetch availability', fullyBooked: [] });
  }
};
