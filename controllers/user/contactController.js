const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Render contact page
const renderContactPage = async (req, res) => {
  try {
    res.render('contact', {
      user: req.user,
      title: 'Contact Us - Derry World Restaurant',
      message: req.query.message,
      error: req.query.error
    });
  } catch (error) {
    console.error('Error rendering contact page:', error);
    res.status(500).render('error', { error: 'Internal Server Error' });
  }
};

// Handle contact form submission
const handleContactForm = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !subject || !message) {
      return res.redirect('/contact?error=Please fill in all required fields');
    }

    // Email to admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || 'admin@derryworld.com', // Fallback admin email
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    };

    // Email to user
    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting Derry World Restaurant',
      html: `
        <h2>Thank you for contacting us!</h2>
        <p>Dear ${name},</p>
        <p>We have received your message and will get back to you as soon as possible.</p>
        <p>Here's a copy of your message:</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
        <br>
        <p>Best regards,</p>
        <p>Derry World Restaurant Team</p>
      `
    };

    // Send emails
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);

    res.redirect('/contact?message=Thank you for your message. We will get back to you soon!');
  } catch (error) {
    console.error('Error handling contact form:', error);
    res.redirect('/contact?error=There was an error sending your message. Please try again.');
  }
};

module.exports = {
  renderContactPage,
  handleContactForm
};