const nodemailer = require('nodemailer');

const sendOtpEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      secure: true,
      port: 465,
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify transporter configuration
    await transporter.verify();

    const mailOptions = {
      from: `"DERRY Restaurant" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP Code - DERRY Restaurant',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">DERRY Restaurant - Email Verification</h2>
          <p>Your OTP code is:</p>
          <h1 style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; color: #333;">${otp}</h1>
          <p>This code will expire in 30 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error(`Email sending failed: ${error.message}`);
  }
};

module.exports = { sendOtpEmail };
