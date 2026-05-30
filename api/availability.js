const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// All possible time slots
const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

// Convert a UTC ISO dateTime string to a Pacific time slot label e.g. "9:00 AM"
function toSlotLabel(dateTimeStr) {
  const date = new Date(dateTimeStr);
  // Convert to Pacific time (UTC-7 PDT)
  const pacificHour = date.getUTCHours() - 7;
  const minutes = date.getUTCMinutes();
  if (pacificHour < 0 || pacificHour > 16) return null;
  const h12 = pacificHour === 0 ? 12 : pacificHour > 12 ? pacificHour - 12 : pacificHour;
  const ampm = pacificHour < 12 ? 'AM' : 'PM';
  const minStr = minutes === 0 ? '00' : String(minutes).padStart(2, '0');
  return h12 + ':' + minStr + ' ' + ampm;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
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

    // Build map: date -> [slot1, slot2, ...]
    const slotsByDate = {};
    const countByDate = {};

    for (const event of events) {
      const startStr = event.start.dateTime || event.start.date;
      const dateStr  = startStr.substring(0, 10);
      const slot     = event.start.dateTime ? toSlotLabel(event.start.dateTime) : null;

      countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;

      if (slot) {
        if (!slotsByDate[dateStr]) slotsByDate[dateStr] = [];
        if (!slotsByDate[dateStr].includes(slot)) slotsByDate[dateStr].push(slot);
      }
    }

    // Dates with 3+ jobs are fully blocked
    const fullyBooked = Object.entries(countByDate)
      .filter(([, count]) => count >= 3)
      .map(([date]) => date);

    return res.status(200).json({ fullyBooked, slotsByDate });

  } catch (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Failed to fetch availability', fullyBooked: [], slotsByDate: {} });
  }
};
