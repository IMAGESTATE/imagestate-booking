const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Use a wide window — 30 days back to 120 days forward to catch all events
    const past   = new Date();
    past.setDate(past.getDate() - 30);
    const future = new Date();
    future.setDate(future.getDate() + 120);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      maxResults: 2500,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // Today in Pacific time (UTC-7)
    const nowPac = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const today  = nowPac.toISOString().substring(0, 10);

    // Separate IMAGESTATE bookings from personal/blocker events
    const imagestateEvents = events.filter(e =>
      e.summary && e.summary.toUpperCase().includes('IMAGESTATE')
    );
    const blockerEvents = events.filter(e =>
      !e.summary || !e.summary.toUpperCase().includes('IMAGESTATE')
    );

    // Build slotsByDate for IMAGESTATE events
    const slotsByDate = {};
    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      // Convert event start to Pacific time
      const startUTC   = new Date(event.start.dateTime);
      const startPac   = new Date(startUTC.getTime() - 7 * 60 * 60 * 1000);
      const dateStr    = startPac.toISOString().substring(0, 10);
      const pacHour    = startPac.getUTCHours();
      const pacMin     = startPac.getUTCMinutes();
      const h12        = pacHour === 0 ? 12 : pacHour > 12 ? pacHour - 12 : pacHour;
      const ampm       = pacHour < 12 ? 'AM' : 'PM';
      const slot       = h12 + ':' + String(pacMin).padStart(2,'0') + ' ' + ampm;

      if (!slotsByDate[dateStr]) slotsByDate[dateStr] = [];
      if (!slotsByDate[dateStr].includes(slot)) slotsByDate[dateStr].push(slot);
    }

    // Count raw IMAGESTATE events per date (handles duplicate slots)
    const rawCountByDate = {};
    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      const startPac = new Date(new Date(event.start.dateTime).getTime() - 7 * 60 * 60 * 1000);
      const dateStr  = startPac.toISOString().substring(0, 10);
      rawCountByDate[dateStr] = (rawCountByDate[dateStr] || 0) + 1;
    }

    // Fully booked = 3+ IMAGESTATE events on that date
    const fullyBooked = Object.entries(rawCountByDate)
      .filter(([, count]) => count >= 3)
      .map(([date]) => date);

    // Build blocked dates from non-IMAGESTATE events
    const blockedSet = new Set(fullyBooked);

    for (const event of blockerEvents) {
      // Skip declined events
      const self = (event.attendees || []).find(a => a.self);
      if (self && self.responseStatus === 'declined') continue;
      // Skip free events
      if (event.transparency === 'transparent') continue;

      if (event.start.date) {
        // All-day event
        const start = new Date(event.start.date + 'T00:00:00Z');
        const end   = new Date(event.end.date   + 'T00:00:00Z');
        for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
          blockedSet.add(d.toISOString().substring(0, 10));
        }
      } else if (event.start.dateTime) {
        const startPac = new Date(new Date(event.start.dateTime).getTime() - 7 * 60 * 60 * 1000);
        const endPac   = new Date(new Date(event.end.dateTime).getTime()   - 7 * 60 * 60 * 1000);
        const startDate = startPac.toISOString().substring(0, 10);
        const endDate   = endPac.toISOString().substring(0, 10);
        // Add all dates covered
        const s = new Date(startDate + 'T00:00:00Z');
        const e = new Date(endDate   + 'T00:00:00Z');
        for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
          blockedSet.add(d.toISOString().substring(0, 10));
        }
      }
    }

    return res.status(200).json({
      fullyBooked,
      blockedDates: [...blockedSet],
      slotsByDate,
      today,
      debug: {
        totalEvents: events.length,
        imagestateCount: imagestateEvents.length,
        blockerCount: blockerEvents.length,
        rawCountByDate,
        timeMin: past.toISOString(),
      }
    });

  } catch (error) {
    console.error('Availability error:', error.message);
    return res.status(200).json({
      error: error.message,
      fullyBooked: [],
      blockedDates: [],
      slotsByDate: {},
      today: new Date(Date.now() - 7*60*60*1000).toISOString().substring(0,10),
      debug: { totalEvents: 0, error: error.message }
    });
  }
};