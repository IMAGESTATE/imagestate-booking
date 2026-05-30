const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      name,
      email,
      phone,
      address,
      city,
      date,
      time,
      package: pkg,
      sqft,
      services,
      isTwilight,
      doorCode,
      gateCode,
      comboCode,
      accessNotes,
    } = req.body;

    // Build event start/end times
    let startDateTime, endDateTime;
    const eventDate = new Date(date);

    if (isTwilight) {
      // Twilight: placeholder 6pm-7pm block, to be adjusted manually
      const [year, month, day] = date.split('-');
      startDateTime = new Date(`${year}-${month}-${day}T18:00:00`);
      endDateTime = new Date(`${year}-${month}-${day}T19:00:00`);
    } else {
      // Parse the selected time (e.g. "9:00 AM")
      const [timePart, meridiem] = time.split(' ');
      let [hours, minutes] = timePart.split(':').map(Number);
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;

      const [year, month, day] = date.split('-');
      startDateTime = new Date(`${year}-${month}-${day}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`);
      endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour default
    }

    // Build description
    const accessLines = [];
    if (doorCode) accessLines.push(`Front door code: ${doorCode}`);
    if (gateCode) accessLines.push(`Gate code: ${gateCode}`);
    if (comboCode) accessLines.push(`Combo box: ${comboCode}`);
    if (accessNotes) accessLines.push(`Access notes: ${accessNotes}`);

    const serviceList = Array.isArray(services) ? services.join(', ') : services;

    const description = [
      `📋 BOOKING DETAILS`,
      ``,
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      ``,
      `📦 Package: ${pkg}`,
      `📐 Square Footage: ${sqft} sqft`,
      serviceList ? `✨ Add-ons: ${serviceList}` : null,
      isTwilight ? `🌅 Twilight shoot — time TBD, coordinate with client` : null,
      ``,
      accessLines.length > 0 ? `🔑 ACCESS CODES` : null,
      ...accessLines,
    ].filter(Boolean).join('\n');

    const event = {
      summary: `IMAGESTATE MEDIA APPT – ${address}, ${city}`,
      location: `${address}, ${city}`,
      description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      attendees: [
        { email: email, displayName: name },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'email', minutes: 24 * 60 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all', // sends invite to client
    });

    return res.status(200).json({ success: true, eventId: response.data.id });

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ error: 'Failed to create calendar event', details: error.message });
  }
};
