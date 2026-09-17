const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 2525,
  secure: false,
  tls: {
    rejectUnauthorized: false
  },
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});



const sendOtpEmail = async (email, otp) => {
  return transporter.sendMail({
    from: `"DERRY Restaurant" <${process.env.BREVO_FROM_EMAIL}>`,
    to: email,
    subject: "Your OTP Verification Code",
    html: `
      <div style="font-family: Arial;">
        <h2>Email Verification</h2>
        <p>Your OTP code is:</p>
        <h1 style="letter-spacing:5px">${otp}</h1>
        <p>Expires in 10–30 minutes</p>
      </div>
    `,
  });
};

const sendWelcomeEmail = async (email, name) => {
  return transporter.sendMail({
    from: `"DERRY Restaurant" <${process.env.BREVO_FROM_EMAIL}>`,
    to: email,
    subject: "Welcome to Derry World",
    html: `
      <div style="font-family: Arial;">
        <h2>Welcome ${name}</h2>
        <p>Thanks for joining Derry World</p>
      </div>
    `,
  });
};



module.exports = {
  sendOtpEmail,
  sendWelcomeEmail,
};