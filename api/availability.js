const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];
const SLOT_HOURS = { '8:00 AM':8,'9:00 AM':9,'10:00 AM':10,'11:00 AM':11,'12:00 PM':12,'1:00 PM':13,'2:00 PM':14,'3:00 PM':15,'4:00 PM':16 };

// Duration in hours (shoot + buffer) per package
const PACKAGE_DURATION = {
  'photos-only': 2,
  'video-only': 2.5,
  'photo-video': 3,
  'photo-video-floor': 3,
  'full-estate': 4,
};

const MAX_DAY_HOURS = 10;

// Latest start hour (Pacific) per package so shoot ends by 6pm
const LATEST_START = {
  'photos-only': 16,      // 4:00 PM (1hr shoot ends 5pm, buffer ends 6pm)
  'video-only': 15,       // 3:00 PM (1.5hr shoot ends 4:30pm, buffer ends 5:30pm)
  'photo-video': 15,      // 3:00 PM (2hr shoot ends 5pm, buffer ends 6pm)
  'photo-video-floor': 15,// 3:00 PM
  'full-estate': 14,      // 2:00 PM (3hr shoot ends 5pm, buffer ends 6pm)
};

function toPacific(isoStr) {
  const d = new Date(new Date(isoStr).getTime() - 7 * 60 * 60 * 1000);
  return { date: d.toISOString().substring(0,10), hour: d.getUTCHours(), minutes: d.getUTCMinutes() };
}

function hourToSlot(hour, minutes) {
  if (hour < 8 || hour > 16) return null;
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return h12 + ':' + String(minutes).padStart(2,'0') + ' ' + ampm;
}

// Get package ID from event description
function getPackageDuration(event) {
  const desc = (event.description || '').toLowerCase();
  const sum  = (event.summary || '').toLowerCase();
  if (desc.includes('full estate') || sum.includes('full estate')) return PACKAGE_DURATION['full-estate'];
  if (desc.includes('floor plan') || sum.includes('floor plan'))   return PACKAGE_DURATION['photo-video-floor'];
  if (desc.includes('video') && desc.includes('photo'))            return PACKAGE_DURATION['photo-video'];
  if (desc.includes('video') || sum.includes('video'))             return PACKAGE_DURATION['video-only'];
  return PACKAGE_DURATION['photos-only']; // default
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const past = new Date(); past.setDate(past.getDate() - 30);
    const future = new Date(); future.setDate(future.getDate() + 120);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      maxResults: 2500,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const today  = new Date(Date.now() - 7*60*60*1000).toISOString().substring(0,10);

    const imagestateEvents = events.filter(e => e.summary && e.summary.toUpperCase().includes('IMAGESTATE'));
    const personalEvents   = events.filter(e => {
      if (e.summary && e.summary.toUpperCase().includes('IMAGESTATE')) return false;
      const self = (e.attendees || []).find(a => a.self);
      if (self && self.responseStatus === 'declined') return false;
      if (e.transparency === 'transparent') return false;
      return true;
    });

    // Build per-date data for IMAGESTATE events
    // hoursUsedByDate: total hours consumed (shoot + buffer)
    const hoursUsedByDate = {};
    const slotsByDate = {};

    for (const event of imagestateEvents) {
      if (!event.start.dateTime) continue;
      const { date, hour, minutes } = toPacific(event.start.dateTime);
      const duration = getPackageDuration(event); // hours this job occupies (shoot + buffer)

      // Track hours used
      hoursUsedByDate[date] = (hoursUsedByDate[date] || 0) + duration;

      // Block slots covered by this job (shoot + buffer)
      if (!slotsByDate[date]) slotsByDate[date] = [];
      const startHour = hour + minutes / 60;
      const endHour   = startHour + duration;

      for (const [slot, slotHour] of Object.entries(SLOT_HOURS)) {
        if (startHour < slotHour + 1 && endHour > slotHour) {
          if (!slotsByDate[date].includes(slot)) slotsByDate[date].push(slot);
        }
      }
    }

    // Fully booked = 10+ hours used that day
    const fullyBooked = Object.entries(hoursUsedByDate)
      .filter(([, hrs]) => hrs >= MAX_DAY_HOURS)
      .map(([date]) => date);

    // Also full if less than 2hrs remain (can't fit even smallest job)
    const effectivelyFull = Object.entries(hoursUsedByDate)
      .filter(([, hrs]) => hrs > MAX_DAY_HOURS - 2)
      .map(([date]) => date);

    const blockedDatesSet = new Set([...fullyBooked, ...effectivelyFull]);

    // Handle personal events
    const personalBlockedSlots = {};
    for (const event of personalEvents) {
      if (event.start.date) {
        // All-day → block whole day
        const start = new Date(event.start.date + 'T00:00:00Z');
        const end   = new Date(event.end.date   + 'T00:00:00Z');
        for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate()+1)) {
          blockedDatesSet.add(d.toISOString().substring(0,10));
        }
      } else if (event.start.dateTime) {
        const startPac = toPacific(event.start.dateTime);
        const endPac   = toPacific(event.end.dateTime);
        if (endPac.date !== startPac.date) {
          // Multi-day timed event → block all days
          const s = new Date(startPac.date + 'T00:00:00Z');
          const e = new Date(endPac.date   + 'T00:00:00Z');
          for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate()+1)) {
            blockedDatesSet.add(d.toISOString().substring(0,10));
          }
        } else {
          // Single-day timed event → block overlapping slots only
          const date = startPac.date;
          const eventStartHour = startPac.hour + startPac.minutes / 60;
          const eventEndHour   = endPac.hour   + endPac.minutes   / 60;
          if (!personalBlockedSlots[date]) personalBlockedSlots[date] = [];
          for (const [slot, slotHour] of Object.entries(SLOT_HOURS)) {
            if (eventStartHour < slotHour + 1 && eventEndHour > slotHour) {
              if (!personalBlockedSlots[date].includes(slot)) personalBlockedSlots[date].push(slot);
            }
          }
          if (ALL_SLOTS.every(s => (personalBlockedSlots[date]||[]).includes(s))) {
            blockedDatesSet.add(date);
          }
        }
      }
    }

    // Merge personal blocked slots into slotsByDate
    for (const [date, slots] of Object.entries(personalBlockedSlots)) {
      if (blockedDatesSet.has(date)) continue;
      if (!slotsByDate[date]) slotsByDate[date] = [];
      for (const slot of slots) {
        if (!slotsByDate[date].includes(slot)) slotsByDate[date].push(slot);
      }
      if (slotsByDate[date].length >= 9) blockedDatesSet.add(date);
    }

    return res.status(200).json({
      fullyBooked: [...blockedDatesSet],
      blockedDates: [...blockedDatesSet],
      slotsByDate,
      today,
      debug: { totalEvents: events.length, imagestateCount: imagestateEvents.length, hoursUsedByDate }
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