const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

function toLocalDate(dateTimeStr) {
  const d = new Date(dateTimeStr);
  const pacificHour = d.getUTCHours() - 7;
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  // If hour goes negative, it's the previous day in Pacific time
  if (pacificHour < 0) {
    const prev = new Date(Date.UTC(y, mo, day - 1));
    return prev.toISOString().substring(0, 10);
  }
  return dateTimeStr.substring(0, 10);
}

function toSlotLabel(dateTimeStr) {
  const d = new Date(dateTimeStr);
  const pacificHour = d.getUTCHours() - 7;
  const minutes = d.getUTCMinutes();
  if (pacificHour < 0 || pacificHour > 16) return null;
  const h12 = pacificHour === 0 ? 12 : pacificHour > 12 ? pacificHour - 12 : pacificHour;
  const ampm = pacificHour < 12 ? 'AM' : 'PM';
  const minStr = minutes === 0 ? '00' : String(minutes).padStart(2, '0');
  return h12 + ':' + minStr + ' ' + ampm;
}

// Get all dates a multi-day or all-day event covers
function getBlockedDates(event) {
  const dates = [];
  if (event.start.date) {
    // All-day event
    const start = new Date(event.start.date);
    const end = new Date(event.end.date);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().substring(0, 10));
    }
  } else if (event.start.dateTime) {
    // Timed event — block just that day in Pacific time
    dates.push(toLocalDate(event.start.dateTime));
    // If multi-day timed event
    if (event.end.dateTime) {
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        for (let i = 1; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          dates.push(d.toISOString().substring(0, 10));
        }
      }
    }
  }
  return [...new Set(dates)];
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
    future.setDate(future.getDate() + 120); // 4 months ahead

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      maxResults: 1000,
    });

    const events = response.data.items || [];
    const imagestateEvents = events.filter(e => e.summary && e.summary.includes('IMAGESTATE MEDIA APPT'));
    const blockerEvents   = events.filter(e => !e.summary || !e.summary.includes('IMAGESTATE MEDIA APPT'));

    // Build IMAGESTATE bookings map: date -> [slots]
    const bookingsByDate = {};
    for (const event of imagestateEvents) {
      const dateStr = event.start.dateTime ? toLocalDate(event.start.dateTime) : event.start.date;
      const slot    = event.start.dateTime ? toSlotLabel(event.start.dateTime) : null;
      if (!bookingsByDate[dateStr]) bookingsByDate[dateStr] = [];
      if (slot && !bookingsByDate[dateStr].includes(slot)) bookingsByDate[dateStr].push(slot);
    }

    // Dates with 3+ IMAGESTATE bookings = fully booked
    const fullyBooked = Object.entries(bookingsByDate)
      .filter(([, slots]) => slots.length >= 3)
      .map(([date]) => date);

    // Build blocked dates from non-IMAGESTATE events
    const blockedSet = new Set();
    for (const event of blockerEvents) {
      // Skip declined events
      const selfStatus = (event.attendees || []).find(a => a.self);
      if (selfStatus && selfStatus.responseStatus === 'declined') continue;
      // Skip events marked as free/transparent
      if (event.transparency === 'transparent') continue;
      const dates = getBlockedDates(event);
      dates.forEach(d => blockedSet.add(d));
    }

    // Also add fully booked dates to blocked set
    fullyBooked.forEach(d => blockedSet.add(d));

    // Past dates are also blocked
    const todayStr = now.toISOString().substring(0, 10);

    return res.status(200).json({
      fullyBooked,
      blockedDates: [...blockedSet],
      slotsByDate: bookingsByDate,
      today: todayStr,
    });

  } catch (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Failed to fetch availability', fullyBooked: [], blockedDates: [], slotsByDate: {}, today: '' });
  }
};