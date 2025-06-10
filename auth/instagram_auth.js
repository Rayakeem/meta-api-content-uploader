require("dotenv").config();
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
// const connectDB = require("../../database");
const { ObjectId } = require("mongodb");

const router = express.Router();
const IG_APP_ID = process.env.IG_APP_ID;
const IG_APP_SECRET = process.env.IG_APP_SECRET;
const IG_REDIRECT_URI = "your_redirect_url/callback";

// let db;
// connectDB.then((client) => {
//   db = client.db("your_DB_name");
// }).catch(console.error);

// 1️⃣ Instagram 로그인 시작
router.get("/login", (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({ success: false, message: "TokNow 토큰이 필요합니다." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // state 파라미터에 userId를 JWT로 인코딩
    const state = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${IG_APP_ID}&redirect_uri=${IG_REDIRECT_URI}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments&state=${state}`;
    res.redirect(authUrl);

  } catch (error) {
    console.error("TokNow 토큰 검증 실패:", error.message);
    return res.status(401).json({ success: false, message: "TokNow 토큰이 유효하지 않습니다." });
  }
});

// 2️⃣ Instagram OAuth 콜백
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).json({ message: "필수 파라미터 누락" });

  let userId;
  try {
    // state에서 userId 추출
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ message: "유효하지 않은 state입니다." });
  }

  try {
    // 3️⃣ Short-lived Token 요청
    const shortTokenRes = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      new URLSearchParams({
        client_id: IG_APP_ID,
        client_secret: IG_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: IG_REDIRECT_URI,
        code,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token: shortToken } = shortTokenRes.data;

    // 4️⃣ Long-lived Token 요청
    const longTokenRes = await axios.get("https://graph.instagram.com/access_token", {
      params: {
        grant_type: "ig_exchange_token",
        client_secret: IG_APP_SECRET,
        access_token: shortToken,
      },
    });

    const longLivedToken = longTokenRes.data.access_token;

    // 5️⃣ 사용자 정보 요청
    const profileRes = await axios.get("https://graph.instagram.com/me", {
      params: {
        access_token: longLivedToken,
        fields: "id,username,profile_picture_url"
      },
    });
    
    const { id: instagramUserId, username, profile_picture_url } = profileRes.data;

    // 6️⃣ Instagram 데이터 저장
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          instagram: {
            userId: instagramUserId,
            username: username,
            accessToken: longLivedToken,
            profileUrl: profile_picture_url || null,
          },
        },
      }
    );

    // 7️⃣ 프론트로 리디렉션
    return res.redirect("your_redirect_url?state=true");

    } catch (err) {
      console.error("Instagram 인증 실패:", {
        message: err.message,
        responseData: err.response?.data,
        responseStatus: err.response?.status,
      });

      const message = err.response?.data?.error?.message || "";
      if (
        message.includes("Unsupported get request") ||
        message.includes("Missing permission") ||
        message.includes("Invalid OAuth access token") ||
        message.includes("instagram_business_account")
      ) {
        return res.redirect("your_redirect_url?state=false");
      }

      return res.status(500).json({ message: "Instagram 인증 실패", error: err.message });
    }
});

module.exports = router;