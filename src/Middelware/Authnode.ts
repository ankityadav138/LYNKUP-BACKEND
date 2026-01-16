// const jwt = require("jsonwebtoken");
// const User = require("../Modals/User");

// const verifyToken = async (req, res, next) => {
//   try {
//     // Get authorization header
//     const authorizationHeader = req.headers["authorization"];
//     if (!authorizationHeader) {
//       return res.status(401).json({
//         status: false,
//         message: "Authorization token is required",
//       });
//     }

//     // Verify the token
//     const decoded = await jwt.verify(authorizationHeader, process.env.TOKEN_KEY);

//     // Find the user in the database
//     const user = await User.findById(decoded.user);
//     if (!user) {
//       return res.status(404).json({
//         status: false,
//         message: "User not found",
//       });
//     }

//     // Attach the user to the request for downstream use
//     req.user = user;

//     // Continue to the next middleware or route handler
//     next();
//   } catch (error) {
//     console.error("Token verification error:", error.message);
//     return res.status(401).json({
//       status: false,
//       message: "Invalid or expired token",
//     });
//   }
// };

// module.exports = verifyToken;

