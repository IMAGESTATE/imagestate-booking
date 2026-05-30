const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

// Slot start hours in Pacific time
const SLOT_HOURS = { '8:00 AM':8, '9:00 AM':9, '10:00 AM':10, '11:00 AM':11,
                     '12:00 PM':12, '1:00 PM':13, '2:00 PM':14, '3:00 PM':15, '4:00 PM':16 };

function toPacific(isoStr) {
  const d = new Date(new Date(isoStr).getTime() - 7 * 60 * 60 * 1000);
  return {
    date: d.toISOString().substring(0, 10),
    hour: d.getUTCHours(),
    minutes: d.getUTCMinutes()
  };
}

function hourToSlot(hour, minutes) {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return h12 + ':' + String(minutes).padStart(2,'0') + ' ' + ampm;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
    const today  = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString().substring(0, 10);

    const imagestateEvents = events.filter(e => e.summary && e.summary.toUpperCase().includes('IMAGESTATE'));
    const personalEvents   = events.filter(e => {
      if (e.summary && e.summary.toUpperCase().includes('IMAGESTATE')) return false;
      const self = (e.attendees || []).find(a => a.self);
      if (self && self.responseStatus === 'declined') return false;
      if (e.transparency === 'transparent') return false;
      return true;
    });

    // Build IMAGESTATE slots per date
    const slotsByDate = {};
    const rawCountByDate = {};
    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      const { date, hour, minutes } = toPacific(event.start.dateTime);
      const slot = hourToSlot(hour, minutes);
      if (!slotsByDate[date]) slotsByDate[date] = [];
      if (!slotsByDate[date].includes(slot)) slotsByDate[date].push(slot);
      rawCountByDate[date] = (rawCountByDate[date] || 0) + 1;
    }

    // Fully booked = 3+ IMAGESTATE events
    const fullyBooked = Object.entries(rawCountByDate)
      .filter(([, count]) => count >= 3)
      .map(([date]) => date);

    // Build blocked dates (all-day events only) and blocked slots (timed personal events)
    const blockedDatesSet = new Set(fullyBooked);
    // personalBlockedSlots: date -> [slots blocked by personal timed events]
    const personalBlockedSlots = {};

    for (const event of personalEvents) {
      if (event.start.date) {
        // ALL-DAY event → block entire day(s)
        const start = new Date(event.start.date + 'T00:00:00Z');
        const end   = new Date(event.end.date   + 'T00:00:00Z');
        for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
          blockedDatesSet.add(d.toISOString().substring(0, 10));
        }
      } else if (event.start.dateTime) {
        // TIMED event → only block overlapping slots
        const startPac = toPacific(event.start.dateTime);
        const endPac   = toPacific(event.end.dateTime);
        const eventStartHour = startPac.hour + startPac.minutes / 60;
        const eventEndHour   = endPac.hour   + endPac.minutes   / 60;
        const date = startPac.date;

        // If the event spans multiple days, block entire middle days
        if (endPac.date !== startPac.date) {
          // Multi-day timed event - block all days it covers
          const s = new Date(startPac.date + 'T00:00:00Z');
          const e = new Date(endPac.date   + 'T00:00:00Z');
          for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
            blockedDatesSet.add(d.toISOString().substring(0, 10));
          }
        } else {
          // Single-day timed event → block only overlapping slots
          if (!personalBlockedSlots[date]) personalBlockedSlots[date] = [];
          for (const [slot, slotHour] of Object.entries(SLOT_HOURS)) {
            // Block slot if personal event overlaps with it (slot is 1hr long)
            if (eventStartHour < slotHour + 1 && eventEndHour > slotHour) {
              if (!personalBlockedSlots[date].includes(slot)) {
                personalBlockedSlots[date].push(slot);
              }
            }
          }
          // If ALL slots are blocked by personal events, block the whole day
          const allSlotsBlocked = ALL_SLOTS.every(s => (personalBlockedSlots[date] || []).includes(s));
          if (allSlotsBlocked) blockedDatesSet.add(date);
        }
      }
    }

    // Merge personal blocked slots into slotsByDate so the calendar greys them out
    for (const [date, slots] of Object.entries(personalBlockedSlots)) {
      if (blockedDatesSet.has(date)) continue; // already fully blocked
      if (!slotsByDate[date]) slotsByDate[date] = [];
      for (const slot of slots) {
        if (!slotsByDate[date].includes(slot)) slotsByDate[date].push(slot);
      }
      // If all 9 slots are now taken, mark as fully booked
      if (slotsByDate[date].length >= 9) blockedDatesSet.add(date);
    }

    return res.status(200).json({
      fullyBooked: [...new Set([...fullyBooked, ...blockedDatesSet])],
      blockedDates: [...blockedDatesSet],
      slotsByDate,
      today,
      debug: { totalEvents: events.length, imagestateCount: imagestateEvents.length, personalCount: personalEvents.length, rawCountByDate }
    });

  } catch (error) {
    console.error('Availability error:', error.message);
    return res.status(200).json({
      error: error.message,
      fullyBooked: [], blockedDates: [], slotsByDate: {},
      today: new Date(Date.now() - 7*60*60*1000).toISOString().substring(0,10),
    });
  }
};