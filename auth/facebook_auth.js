const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
// const connectDB = require("../../database");
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");


const router = express.Router();
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = "your_redirect_url/callback";

// let db;
// connectDB.then((client) => {
//   db = client.db("your_DB_name");
// }).catch(console.error);

// 1️⃣ Facebook 로그인 시작 (OAuth 요청 URL 생성)
router.get("/login", (req, res) => {
  const facebookAuthUrl = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish&response_type=code`;
  res.redirect(facebookAuthUrl);
});

// 2️⃣ Facebook OAuth 콜백 (Access Token 가져오기)
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

    // 3. 프론트로 sessionId만 전달
    return res.redirect(`your_url?sessionId=${sessionId}`);

  } catch (error) {
    console.error("Facebook 로그인 실패:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Facebook 로그인 실패" });
  }
});

//세션아이디로 페이스북 엑세스 토큰 조회하기
router.post("/session", async (req, res) => {
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

//존재하는 페이지를 조회하고 저장하는 로직

// 사용자 페이지 목록 조회
router.get("/pages", async (req, res) => {
  const { accessToken } = req.query;

  if (!accessToken) {
    return res.status(400).json({ success: false, message: "accessToken이 필요합니다." });
  }

  try {
    // 1. Facebook 사용자 정보 가져오기
    const userInfoRes = await axios.get(`https://graph.facebook.com/v17.0/me`, {
      params: {
        access_token: accessToken,
        fields: "id,name",
      },
    });

    const facebookId = userInfoRes.data.id;
    const name = userInfoRes.data.name;

    // 2. Facebook 페이지 리스트 가져오기
    const pageResponse = await axios.get(`https://graph.facebook.com/v22.0/me/accounts`, {
      params: { access_token: accessToken },
    });

    let pages = pageResponse.data.data;

    // 3. 각 페이지의 Instagram 비즈니스 계정 ID 가져오기 (선택사항)
    pages = await Promise.all(
      pages.map(async (page) => {
        try {
          const detail = await axios.get(`https://graph.facebook.com/v22.0/${page.id}`, {
            params: {
              fields: "instagram_business_account",
              access_token: page.access_token,
            },
          });

          return {
            ...page,
            instagram_business_account: detail.data.instagram_business_account?.id || null,
          };
        } catch (err) {
          console.error(`페이지(${page.name}) IG 계정 조회 실패:`, err.response?.data || err.message);
          return {
            ...page,
            instagram_business_account: null,
          };
        }
      })
    );

    return res.json({
      success: true,
      facebookId,
      name,
      pages,
    });
  } catch (error) {
    console.error("Facebook 페이지 정보 가져오기 실패:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Facebook 페이지 정보 가져오기 실패" });
  }
});

//페이지 저장
router.post("/select-page", async (req, res) => {
  const { token, facebookToken, facebookId, selectedPage } = req.body;
  let userId;
  try {
    // TokNow 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    console.error("TokNow 토큰 검증 실패:", err.message);
    return res.status(401).json({
      success: false,
      message: "TokNow 액세스 토큰이 만료되었거나 유효하지 않습니다.",
    });
  }

  try {
    const {
      id: pageId,
      name: pageName,
      access_token: pageAccessToken,
      instagram_business_account: instagramBusinessAccountId,
    } = selectedPage;

    //insta usernmae 조회
    let instagramBusinessUsername = null;
    if (instagramBusinessAccountId) {
      try {
        const igRes = await axios.get(`https://graph.facebook.com/v22.0/${instagramBusinessAccountId}`, {
          params: {
            fields: "username",
            access_token: pageAccessToken,
          },
        });
        instagramBusinessUsername = igRes.data.username;
      } catch (err) {
        console.error("인스타그램 username 가져오기 실패:", err.response?.data || err.message);
      }
    }

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          facebook: {
            userId: facebookId,
            userAccessToken: facebookToken,
            selectedPage: {
              id: pageId,
              name: pageName,
              access_token: pageAccessToken,
              profileUrl: null,
              instagram_business_account: instagramBusinessAccountId || null,
              instagram_business_username: instagramBusinessUsername || null,
            },
          },
        },
      }
    );

    return res.json({
      success: true,
      message: "페이스북 페이지 및 인스타그램 계정 저장 완료",
    });
  } catch (error) {
    console.error("페이지 저장 중 서버 오류:", error);
    return res.status(500).json({
      success: false,
      message: "서버 오류: 페이지 정보를 저장하는 도중 문제가 발생했습니다.",
    });
  }
});

//페이스북 페이지 ID 가져오기
router.get("/page-id", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "인증 토큰이 없습니다." });
  }
  const token = authHeader.split(" ")[1];

  try{
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const user = await db.collection("users").findOne({_id: new ObjectId(userId)});
    if(!user?.facebook?.selectedPage?.id){
      return res.status(404).json({ success: false, error: "선택된 페이스북 페이지가 없습니다." });
    }

    return res.json({
      success: true,
      responseDto : {
        pageId: user.facebook.selectedPage.id,
      }
    });
  }catch(error){
    return res.status(401).json({success: false, error: "인증 실패"});
  }
})


module.exports = router;