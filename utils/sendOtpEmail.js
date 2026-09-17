const nodemailer = require('nodemailer');

const sendOtpEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"DERRY Restaurant" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP Code - DERRY Restaurant',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>DERRY Restaurant - Email Verification</h2>
          <p>Your OTP code is:</p>
          <h1>${otp}</h1>
          <p>This code will expire in 30 minutes.</p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);

  } catch (error) {
    console.log("EMAIL ERROR:", error);
    throw new Error(error.message);
  }
};

module.exports = { sendOtpEmail };