require("dotenv").config();
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

//auth
app.use('/api/auth/facebook', require('./auth/facebook_auth.js'));
app.use('/api/auth/instagram', require('./auth/instagram_auth.js'));
app.use('/api/auth/threads', require('./auth/threads_auth.js'));

//upload
app.use('/api/upload/facebook', require('./upload/facebook_page.js'));
app.use('/api/upload/facebook-instagram', require('./upload/facebook_instagram.js'));
app.use('/api/upload/instagram', require('./upload/instagram.js'));
app.use('/api/upload/threads', require('./upload/threads.js'));

//s3
app.use('/uploader', require('./utils/s3Uploader.js'));

//refreshToken
app.use('/api/refresh-token', require('./utils/tokenManager.js'));