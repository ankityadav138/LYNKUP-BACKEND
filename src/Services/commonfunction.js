const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");
const crypto = require("crypto");
//otp generate
// module.exports.otpGenerate = () => {
//   const otp = Math.floor(1000 + Math.random() * 9000).toString();
//   return otp;
// };
//generate token
module.exports.generateToken = (user) => {
  const authorization = jwt.sign({ user: user }, process.env.TOKEN_KEY);
  return authorization;
};
//send otp on Mail

// module.exports.sendOtpOnMail = (email, otp) => {
//   console.log(process.env.EMAIL_USER);
//   try {
//     let transporter = nodemailer.createTransport({
//       host: "smtp.gmail.com",
//       port: 587,
//       secure: false,
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });
//     transporter.sendMail({
//       from: process.env.EMAIL_FROM,
//       to: email,
//       subject: "Your OTP",
//       text: `Your OTP is: ${otp}`,
//       html: `<div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
//   <div style="margin:50px auto;width:70%;padding:20px 0">
//     <div class="brand" style="border-bottom:1px solid #eee;background: #1d4a35 !important;color: white;padding: 10px 0 10px 10px;border-radius: 2px;">
//       <a href="" style="font-size:1.4em;color: #fff;text-decoration:none;font-weight:600">45X</a>
//     </div>
//     <p style="font-size:1.1em">Hi,</p>
//     <p>Thank you for choosing 45X. Use the following OTP to complete your Sign Up procedures. OTP is valid for 3 minutes</p>
//     <h2 style="background: #1d4a35;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${otp}</h2>
//     <p style="font-size:0.9em;">Regards,<br />Team 45X</p>
//     <hr style="border:none;border-top:1px solid #eee" />
    
//   </div>
// </div>`,
//     });
//   } catch (error) {
//     console.log(error);
//   }
// };
// send otp on Number
// module.exports.sendOtpOnNumber = async (phone, otp) => {
//   const apiKey = process.env.API_KEY_2FACTOR;
//   const url = `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/${otp}`;
//   try {
//     const response = await axios.get(url);
//     console.log(response.data);
//     if (response.data.Status === "Success") {
//       console.log(`OTP sent successfully to ${phone}`);
//     } else {
//       console.error(`Failed to send OTP to ${phone}: ${response.data.Details}`);
//     }
//   } catch (error) {
//     console.error(`Error sending OTP to ${phone}:`, error);
//   }
// };

module.exports.generateRandomPassword = () => {
  return crypto.randomBytes(8).toString("hex"); // Generates a random 16 character hex string
};
