const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    firstName, lastName, email, phone,
    street, city, zip,
    attending, accessNotes,
    service, photoPrice, videoPrice,
    stagingPrice, floorPrice, tourPrice,
    addons, addonTotal,
    scheduledDate, scheduledTime,
    specialNotes, grandTotal
  } = req.body;

  const clientName = `${firstName} ${lastName}`;

  try {
    // Email to YOU
    await resend.emails.send({
      from: 'IMAGESTATE Bookings <bookings@imagestate.homes>',
      to: 'cesar@imagestate.homes',
      subject: `New Booking — ${clientName} | ${street}, ${city}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1f3a; padding: 24px; text-align: center;">
            <h1 style="color: #c9a84c; margin: 0; letter-spacing: 3px; font-size: 20px;">IMAGESTATE</h1>
            <p style="color: rgba(255,255,255,0.6); margin: 4px 0 0; font-size: 12px;">NEW BOOKING RECEIVED</p>
          </div>

          <div style="padding: 32px; background: #f8f6f1;">

            <h2 style="color: #1a1f3a; border-bottom: 2px solid #c9a84c; padding-bottom: 8px;">Client Information</h2>
            <table style="width:100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; width: 140px;">Name</td><td style="padding: 6px 0; font-weight: bold;">${clientName}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Phone</td><td style="padding: 6px 0;">${phone}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Attending?</td><td style="padding: 6px 0;">${attending}</td></tr>
            </table>

            <h2 style="color: #1a1f3a; border-bottom: 2px solid #c9a84c; padding-bottom: 8px; margin-top: 24px;">Property</h2>
            <table style="width:100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; width: 140px;">Address</td><td style="padding: 6px 0; font-weight: bold;">${street}, ${city}, CA ${zip}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Access Notes</td><td style="padding: 6px 0;">${accessNotes || 'None'}</td></tr>
            </table>

            <h2 style="color: #1a1f3a; border-bottom: 2px solid #c9a84c; padding-bottom: 8px; margin-top: 24px;">Services Selected</h2>
            <table style="width:100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; width: 140px;">Service Type</td><td style="padding: 6px 0;">${service}</td></tr>
              ${photoPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Photography</td><td style="padding: 6px 0;">$${photoPrice}</td></tr>` : ''}
              ${videoPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Videography</td><td style="padding: 6px 0;">$${videoPrice}</td></tr>` : ''}
              ${stagingPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Virtual Staging</td><td style="padding: 6px 0;">$${stagingPrice}</td></tr>` : ''}
              ${floorPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Floor Plan</td><td style="padding: 6px 0;">$${floorPrice}</td></tr>` : ''}
              ${tourPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Virtual Tour</td><td style="padding: 6px 0;">$${tourPrice}</td></tr>` : ''}
              ${addons ? `<tr><td style="padding: 6px 0; color: #666;">Add-Ons</td><td style="padding: 6px 0;">${addons} (+$${addonTotal})</td></tr>` : ''}
            </table>

            <h2 style="color: #1a1f3a; border-bottom: 2px solid #c9a84c; padding-bottom: 8px; margin-top: 24px;">Appointment</h2>
            <table style="width:100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; width: 140px;">Date</td><td style="padding: 6px 0; font-weight: bold;">${scheduledDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Time</td><td style="padding: 6px 0; font-weight: bold;">${scheduledTime}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Special Notes</td><td style="padding: 6px 0;">${specialNotes || 'None'}</td></tr>
            </table>

            <div style="background: #1a1f3a; border-radius: 8px; padding: 20px; margin-top: 24px; display: flex; justify-content: space-between;">
              <span style="color: rgba(255,255,255,0.7); font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">TOTAL ESTIMATE</span>
              <span style="color: #c9a84c; font-size: 28px; font-weight: bold;">$${grandTotal}</span>
            </div>

          </div>
        </div>
      `
    });

    // Confirmation email to CLIENT
    await resend.emails.send({
      from: 'IMAGESTATE <bookings@imagestate.homes>',
      to: email,
      subject: `Your IMAGESTATE Booking is Confirmed — ${street}, ${city}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1f3a; padding: 32px; text-align: center;">
            <h1 style="color: #c9a84c; margin: 0; letter-spacing: 4px; font-size: 22px;">IMAGESTATE</h1>
            <p style="color: rgba(255,255,255,0.5); margin: 6px 0 0; font-size: 12px; letter-spacing: 2px;">REAL ESTATE PHOTOGRAPHY & VIDEO</p>
          </div>

          <div style="padding: 40px 32px; background: #ffffff;">
            <h2 style="color: #1a1f3a; font-size: 24px; margin-bottom: 8px;">Booking Received, ${firstName}.</h2>
            <p style="color: #666; line-height: 1.7; margin-bottom: 24px;">
              Thank you for choosing IMAGESTATE. We've received your booking request and will confirm your appointment within <strong>2 hours</strong>. If you have any questions in the meantime, reply to this email or call us directly.
            </p>

            <div style="background: #f8f6f1; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
              <h3 style="color: #1a1f3a; margin: 0 0 16px; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Your Order Summary</h3>
              <table style="width:100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666; width: 140px;">Property</td><td style="padding: 6px 0; font-weight: bold;">${street}, ${city}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Service</td><td style="padding: 6px 0;">${service}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Requested Date</td><td style="padding: 6px 0;">${scheduledDate}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Requested Time</td><td style="padding: 6px 0;">${scheduledTime}</td></tr>
                ${photoPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Photography</td><td style="padding: 6px 0;">$${photoPrice}</td></tr>` : ''}
                ${videoPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Videography</td><td style="padding: 6px 0;">$${videoPrice}</td></tr>` : ''}
                ${stagingPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Virtual Staging</td><td style="padding: 6px 0;">$${stagingPrice}</td></tr>` : ''}
                ${floorPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Floor Plan</td><td style="padding: 6px 0;">$${floorPrice}</td></tr>` : ''}
                ${tourPrice > 0 ? `<tr><td style="padding: 6px 0; color: #666;">Virtual Tour</td><td style="padding: 6px 0;">$${tourPrice}</td></tr>` : ''}
                ${addons ? `<tr><td style="padding: 6px 0; color: #666;">Add-Ons</td><td style="padding: 6px 0;">${addons}</td></tr>` : ''}
              </table>
              <div style="border-top: 1px solid #dde0ea; margin-top: 16px; padding-top: 16px; display: flex; justify-content: space-between;">
                <span style="color: #1a1f3a; font-weight: bold;">Estimated Total</span>
                <span style="color: #1a1f3a; font-weight: bold; font-size: 20px;">$${grandTotal}</span>
              </div>
            </div>

            <p style="color: #999; font-size: 13px; line-height: 1.6;">
              Payment is collected upon delivery of your final images and media. This is an estimate — final invoice will be sent with your completed files.
            </p>
          </div>

          <div style="background: #1a1f3a; padding: 24px; text-align: center;">
            <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin: 0;">
              IMAGESTATE LLC &nbsp;|&nbsp; Coachella Valley, CA &nbsp;|&nbsp; cesar@imagestate.homes
            </p>
            <p style="margin: 8px 0 0;">
              <a href="https://imagestate.homes" style="color: #c9a84c; font-size: 12px; text-decoration: none;">imagestate.homes</a>
            </p>
          </div>
        </div>
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};