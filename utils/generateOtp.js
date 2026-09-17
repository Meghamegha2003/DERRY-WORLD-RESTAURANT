module.exports = function generateOtp(length = 6) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10); 
  }
  console.log(otp)
  return otp;
};
