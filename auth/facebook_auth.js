const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = "your_redirect_url/callback";

// 1. Facebook 로그인 시작 (OAuth 요청 URL 생성)
router.get("/login", (req, res) => {
  const facebookAuthUrl = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish&response_type=code`;
  res.redirect(facebookAuthUrl);
});

// 2. Facebook OAuth 콜백 (Access Token 가져오기)
router.get("/callback", async (req, res) => {
  const { code } = req.query;

  try {
    // 1. Access Token 발급
    const tokenResponse = await axios.get(`https://graph.facebook.com/v22.0/oauth/access_token`, {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      },
    });

    const userAccessToken = tokenResponse.data.access_token;

    // 2. sessionId 생성 및 저장
    const sessionId = uuidv4(); // 랜덤 ID
    await db.collection("fb_sessions").insertOne({
      sessionId,
      accessToken: userAccessToken,
      createdAt: new Date(),
    });

    // 3. 프론트로 sessionId를 쿼리로 전달
    return res.redirect(`your_url?sessionId=${sessionId}`);

  } catch (error) {
    console.error("Facebook 로그인 실패:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Facebook 로그인 실패" });
  }
});

//세션아이디로 페이스북 엑세스 토큰 조회하기
router.post("/facebook/session", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, message: "sessionId가 필요합니다." });
  }

  const session = await db.collection("fb_sessions").findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ success: false, message: "세션이 만료되었거나 존재하지 않습니다." });
  }

  return res.json({ success: true, accessToken: session.accessToken });
});

module.exports = router;