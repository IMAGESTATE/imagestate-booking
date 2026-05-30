const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

// Convert UTC ISO string to Pacific date string (YYYY-MM-DD) and hour (0-23)
function utcToPacific(isoStr) {
  const d = new Date(isoStr);
  // PDT = UTC-7, PST = UTC-8. We hardcode -7 (PDT) for Coachella Valley shooting season
  const pacificMs = d.getTime() - (7 * 60 * 60 * 1000);
  const p = new Date(pacificMs);
  const yyyy = p.getUTCFullYear();
  const mm   = String(p.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(p.getUTCDate()).padStart(2, '0');
  const hh   = p.getUTCHours();
  const min  = p.getUTCMinutes();
  return {
    date: `${yyyy}-${mm}-${dd}`,
    hour: hh,
    minutes: min
  };
}

function hourToSlotLabel(hour, minutes) {
  if (hour < 8 || hour > 16) return null;
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const minStr = minutes === 0 ? '00' : String(minutes).padStart(2, '0');
  return `${h12}:${minStr} ${ampm}`;
}

// Get all calendar dates covered by an event (for all-day and multi-day blocking)
function getEventDates(event) {
  const dates = [];
  if (event.start.date) {
    // All-day event: start.date to end.date (end is exclusive in Google Calendar)
    const start = new Date(event.start.date + 'T00:00:00Z');
    const end   = new Date(event.end.date   + 'T00:00:00Z');
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(d.getUTCDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  } else if (event.start.dateTime) {
    const startPac = utcToPacific(event.start.dateTime);
    const endPac   = utcToPacific(event.end.dateTime);
    // Add all dates from start to end
    const startD = new Date(startPac.date + 'T00:00:00Z');
    const endD   = new Date(endPac.date   + 'T00:00:00Z');
    for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(d.getUTCDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
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
    const now    = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 120);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      maxResults: 1000,
    });

    const events = response.data.items || [];
    const imagestateEvents = events.filter(e => e.summary && e.summary.includes('IMAGESTATE MEDIA APPT'));
    const blockerEvents    = events.filter(e => {
      if (!e.summary || !e.summary.includes('IMAGESTATE MEDIA APPT')) {
        // Skip events the user declined
        const self = (e.attendees || []).find(a => a.self);
        if (self && self.responseStatus === 'declined') return false;
        // Skip free/transparent events
        if (e.transparency === 'transparent') return false;
        return true;
      }
      return false;
    });

    // Build IMAGESTATE bookings: date -> Set of slot labels
    const bookingsByDate = {};
    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      const { date, hour, minutes } = utcToPacific(event.start.dateTime);
      const slot = hourToSlotLabel(hour, minutes);
      if (!bookingsByDate[date]) bookingsByDate[date] = new Set();
      if (slot) bookingsByDate[date].add(slot);
    }

    // Convert sets to arrays
    const slotsByDate = {};
    for (const [date, slots] of Object.entries(bookingsByDate)) {
      slotsByDate[date] = [...slots];
    }

    // Dates with 3+ unique IMAGESTATE slots = fully booked
    const fullyBooked = Object.entries(slotsByDate)
      .filter(([, slots]) => slots.length >= 3)
      .map(([date]) => date);

    // Also fully booked if same slot appears multiple times (count raw events per date)
    const rawCountByDate = {};
    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      const { date } = utcToPacific(event.start.dateTime);
      rawCountByDate[date] = (rawCountByDate[date] || 0) + 1;
    }
    Object.entries(rawCountByDate).forEach(([date, count]) => {
      if (count >= 3 && !fullyBooked.includes(date)) fullyBooked.push(date);
    });

    // Build blocked dates from non-IMAGESTATE events
    const blockedSet = new Set(fullyBooked);
    for (const event of blockerEvents) {
      getEventDates(event).forEach(d => blockedSet.add(d));
    }

    // Today in Pacific time
    const todayPac = utcToPacific(now.toISOString());

    console.log('Availability check:', {
      imagestateCount: imagestateEvents.length,
      slotsByDate,
      fullyBooked,
      blockedCount: blockedSet.size
    });

    return res.status(200).json({
      fullyBooked,
      blockedDates: [...blockedSet],
      slotsByDate,
      today: todayPac.date,
    });

  } catch (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Failed to fetch availability', fullyBooked: [], blockedDates: [], slotsByDate: {}, today: '' });
  }
};