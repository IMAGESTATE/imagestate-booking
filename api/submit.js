const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    firstName, lastName, email, phone,
    street, city, zip, attending, accessNotes,
    service, photoPrice, videoPrice,
    stagingPrice, floorPrice, tourPrice,
    addons, addonTotal, scheduledDate, scheduledTime,
    specialNotes, grandTotal
  } = req.body;

  const clientName = `${firstName} ${lastName}`;
  const fromEmail = 'cesar@imagestate.homes';

  try {
    // ── NOTIFICATION EMAIL TO CESAR ──────────────────────────
    await resend.emails.send({
      from: `IMAGESTATE Bookings <${fromEmail}>`,
      to: 'cesar@imagestate.homes',
      subject: `New Booking — ${clientName} | ${street}, ${city}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#f8f8f8;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:40px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

                <!-- HEADER -->
                <tr>
                  <td style="background:#042752;padding:32px;text-align:center;">
                    <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:4px;">IMAGESTATE</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:2px;margin-top:6px;">NEW BOOKING RECEIVED</div>
                  </td>
                </tr>

                <!-- BODY -->
                <tr>
                  <td style="padding:40px 32px;">

                    <!-- Client Info -->
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#00a896;border-bottom:2px solid #00a896;padding-bottom:8px;margin-bottom:16px;">Client Information</div>
                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr><td style="color:#666;width:140px;">Name</td><td style="font-weight:bold;">${clientName}</td></tr>
                      <tr><td style="color:#666;">Email</td><td><a href="mailto:${email}" style="color:#00a896;">${email}</a></td></tr>
                      <tr><td style="color:#666;">Phone</td><td>${phone}</td></tr>
                      <tr><td style="color:#666;">Attending?</td><td>${attending}</td></tr>
                    </table>

                    <!-- Property -->
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#00a896;border-bottom:2px solid #00a896;padding-bottom:8px;margin-top:32px;margin-bottom:16px;">Property</div>
                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr><td style="color:#666;width:140px;">Address</td><td style="font-weight:bold;">${street}, ${city}, CA ${zip}</td></tr>
                      <tr><td style="color:#666;">Access Notes</td><td>${accessNotes || 'None'}</td></tr>
                    </table>

                    <!-- Services -->
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#00a896;border-bottom:2px solid #00a896;padding-bottom:8px;margin-top:32px;margin-bottom:16px;">Services Selected</div>
                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr><td style="color:#666;width:140px;">Service Type</td><td>${service}</td></tr>
                      ${photoPrice > 0 ? `<tr><td style="color:#666;">Photography</td><td>$${photoPrice}</td></tr>` : ''}
                      ${videoPrice > 0 ? `<tr><td style="color:#666;">Videography</td><td>$${videoPrice}</td></tr>` : ''}
                      ${stagingPrice > 0 ? `<tr><td style="color:#666;">Virtual Staging</td><td>$${stagingPrice}</td></tr>` : ''}
                      ${floorPrice > 0 ? `<tr><td style="color:#666;">Floor Plan</td><td>$${floorPrice}</td></tr>` : ''}
                      ${tourPrice > 0 ? `<tr><td style="color:#666;">Virtual Tour</td><td>$${tourPrice}</td></tr>` : ''}
                      ${addons ? `<tr><td style="color:#666;">Add-Ons</td><td>${addons} (+$${addonTotal})</td></tr>` : ''}
                    </table>

                    <!-- Appointment -->
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#00a896;border-bottom:2px solid #00a896;padding-bottom:8px;margin-top:32px;margin-bottom:16px;">Appointment</div>
                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr><td style="color:#666;width:140px;">Date</td><td style="font-weight:bold;">${scheduledDate}</td></tr>
                      <tr><td style="color:#666;">Time</td><td style="font-weight:bold;">${scheduledTime}</td></tr>
                      <tr><td style="color:#666;">Special Notes</td><td>${specialNotes || 'None'}</td></tr>
                    </table>

                    <!-- Total -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
                      <tr>
                        <td style="background:#042752;border-radius:8px;padding:24px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;">TOTAL ESTIMATE</td>
                              <td align="right" style="color:#00a896;font-size:32px;font-weight:bold;">$${grandTotal}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                  <td style="background:#042752;padding:20px;text-align:center;">
                    <div style="color:rgba(255,255,255,0.4);font-size:12px;">IMAGESTATE LLC &nbsp;|&nbsp; Coachella Valley, CA &nbsp;|&nbsp; cesar@imagestate.homes</div>
                    <div style="margin-top:8px;"><a href="https://imagestate.homes" style="color:#00a896;font-size:12px;text-decoration:none;">imagestate.homes</a></div>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    });

    // ── CONFIRMATION EMAIL TO CLIENT ─────────────────────────
    await resend.emails.send({
      from: `IMAGESTATE <${fromEmail}>`,
      to: email,
      subject: `Your IMAGESTATE Booking is Confirmed — ${street}, ${city}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#f8f8f8;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:40px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

                <!-- HEADER -->
                <tr>
                  <td style="background:#042752;padding:32px;text-align:center;">
                    <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:4px;">IMAGESTATE</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:2px;margin-top:6px;">REAL ESTATE PHOTOGRAPHY & VIDEO</div>
                  </td>
                </tr>

                <!-- BODY -->
                <tr>
                  <td style="padding:40px 32px;">

                    <h2 style="color:#042752;font-size:24px;margin:0 0 8px;">Booking Received, ${firstName}.</h2>
                    <p style="color:#666;line-height:1.7;margin-bottom:32px;">
                      Thank you for choosing IMAGESTATE. We've received your booking request and will confirm your appointment within <strong>2 hours</strong>. If you have any questions in the meantime, reply to this email or call us directly.
                    </p>

                    <!-- Order Summary -->
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#00a896;border-bottom:2px solid #00a896;padding-bottom:8px;margin-bottom:16px;">Your Order Summary</div>
                    <table width="100%" cellpadding="8" cellspacing="0" style="background:#f8f8f8;border-radius:8px;">
                      <tr><td style="color:#666;width:150px;">Property</td><td style="font-weight:bold;">${street}, ${city}</td></tr>
                      <tr><td style="color:#666;">Service</td><td>${service}</td></tr>
                      <tr><td style="color:#666;">Requested Date</td><td>${scheduledDate}</td></tr>
                      <tr><td style="color:#666;">Requested Time</td><td>${scheduledTime}</td></tr>
                      ${photoPrice > 0 ? `<tr><td style="color:#666;">Photography</td><td>$${photoPrice}</td></tr>` : ''}
                      ${videoPrice > 0 ? `<tr><td style="color:#666;">Videography</td><td>$${videoPrice}</td></tr>` : ''}
                      ${stagingPrice > 0 ? `<tr><td style="color:#666;">Virtual Staging</td><td>$${stagingPrice}</td></tr>` : ''}
                      ${floorPrice > 0 ? `<tr><td style="color:#666;">Floor Plan</td><td>$${floorPrice}</td></tr>` : ''}
                      ${tourPrice > 0 ? `<tr><td style="color:#666;">Virtual Tour</td><td>$${tourPrice}</td></tr>` : ''}
                      ${addons ? `<tr><td style="color:#666;">Add-Ons</td><td>${addons}</td></tr>` : ''}
                    </table>

                    <!-- Total -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                      <tr>
                        <td style="background:#042752;border-radius:8px;padding:20px 24px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:rgba(255,255,255,0.7);font-weight:bold;">Estimated Total</td>
                              <td align="right" style="color:#00a896;font-size:28px;font-weight:bold;">$${grandTotal}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#999;font-size:13px;line-height:1.6;margin-top:24px;">
                      Payment is collected upon delivery of your final images and media. This is an estimate — final invoice will be sent with your completed files.
                    </p>

                  </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                  <td style="background:#042752;padding:24px;text-align:center;">
                    <div style="color:rgba(255,255,255,0.4);font-size:12px;">IMAGESTATE LLC &nbsp;|&nbsp; Coachella Valley, CA &nbsp;|&nbsp; cesar@imagestate.homes</div>
                    <div style="margin-top:8px;"><a href="https://imagestate.homes" style="color:#00a896;font-size:12px;text-decoration:none;">imagestate.homes</a></div>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
