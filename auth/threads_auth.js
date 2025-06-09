require("dotenv").config();
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

const router = express.Router();
const THREADS_APP_ID = process.env.THREADS_APP_ID;
const THREADS_APP_SECRET = process.env.THREADS_APP_SECRET;
const THREADS_REDIRECT_URI = "your_redirect_url/callback";

// 1. Threads 로그인 시작
router.get("/login", (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({ success: false, message: "토큰이 필요합니다." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const state = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const authUrl = `https://threads.net/oauth/authorize?client_id=${THREADS_APP_ID}&redirect_uri=${THREADS_REDIRECT_URI}&scope=threads_basic,threads_content_publish&response_type=code&state=${state}`;
    res.redirect(authUrl);
  } catch (error) {
    console.error("토큰 검증 실패:", error.message);
    return res.status(401).json({ success: false, message: "토큰이 유효하지 않습니다." });
  }
});

// 2. Threads OAuth 콜백
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).json({ message: "필수 파라미터 누락" });

  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ message: "유효하지 않은 state입니다." });
  }

  try {
    // 3. Short-lived Token 요청
    const accessTokenRes = await axios.post(
      "https://graph.threads.net/oauth/access_token",
      new URLSearchParams({
        client_id: THREADS_APP_ID,
        client_secret: THREADS_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: THREADS_REDIRECT_URI,
        code,
      }),
    );

    const accessToken = accessTokenRes.data.access_token;

    // 4. Long-lived Token 요청
    const longTokenRes = await axios.get("https://graph.threads.net/access_token", {
      params: {
        grant_type: "th_exchange_token",
        client_secret: THREADS_APP_SECRET,
        access_token: accessToken,
      },
    });

    const longToken = longTokenRes.data.access_token;
    const expiresIn = longTokenRes.data.expires_in; //토큰 만료일 (90일)

    // 5. 사용자 정보 요청
    const userInfoRes = await axios.get("https://graph.threads.net/v1.0/me", {
      params: {
        fields: "id,username,threads_profile_picture_url",
        access_token: longToken,
      },
    });

    const userInfo = userInfoRes.data;

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const threadsId = userInfo.id;
    const threadsUsername = userInfo.username;
    const threadsProfilePictureUrl = userInfo.threads_profile_picture_url;

    // 6.Threads 데이터 저장
    // const userData = await db.collection("users").updateOne(
    //   { _id: new ObjectId(userId) },
    //   { 
    //     $set: { 
    //       threads: {
    //         userId: threadsId,
    //         username: threadsUsername,
    //         accessToken: longToken,
    //         profileUrl: threadsProfilePictureUrl || null,
    //         expiresIn: expiresIn,
    //       }
    //     } 
    //   },
    // );

    // 7. 프론트로 리디렉션
    return res.redirect("your_redirect_url?state=true");
  } catch (error) {
    console.error("Threads OAuth 인증 실패:", {
      message: error.message,
      responseData: error.response?.data,
      responseStatus: error.response?.status,
    });

    const message = error.response?.data?.error?.message || "";
    if (message.includes("Unsupported get request") || 
        message.includes("Missing permission") || 
        message.includes("Invalid OAuth access token")
        ) {
      // 권한 없음 또는 토큰 만료 등 인증 실패 시 리디렉션
      return res.redirect("your_redirect_url?state=false");
    }
    return res.status(500).json({ message: "Threads OAuth 인증 실패", error: error.message, responseData: error.response?.data });
  }
});

module.exports = router;