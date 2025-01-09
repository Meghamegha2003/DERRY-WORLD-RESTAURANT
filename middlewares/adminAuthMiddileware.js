const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

const isAdminAuthenticated = async (req, res, next) => {
  try {
    // Check for token in Authorization header first, then cookie
    let token = req.headers.authorization?.split(" ")[1] || req.cookies?.admin_token;
    
    if (!token) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }
      return res.redirect("/admin/login");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isAdmin) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required' 
        });
      }
      return res.redirect("/admin/login");
    }

    if (user.status === "Blocked") {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin account is blocked' 
        });
      }
      return res.redirect("/admin/login");
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err.message);
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }

    res.clearCookie("admin_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    return res.redirect("/admin/login");
  }
};

module.exports = isAdminAuthenticated;
