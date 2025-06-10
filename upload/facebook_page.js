const router = require("express").Router();
const axios = require("axios");
const { ObjectId } = require("mongodb");
// const connectDB = require("../../database");
const jwt = require("jsonwebtoken");
const { uploadFacebook } = require("../utils/s3Uploader");

// let db;
// connectDB.then((client) => {
//   db = client.db("your_DB_name");
// }).catch(console.error);

//페이스북 게시글 업로드
router.post("/upload", async (req, res, next) => {
  const authHeader = req.headers.authorization;

  //1. 인증 토큰 확인
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "인증 토큰이 없습니다." });
  }

  const token = authHeader.split(" ")[1];
  let userId;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "토큰이 만료되었거나 유효하지 않습니다.",
    });
  }

  // S3 업로드 미들웨어에 userId 전달
  req.userId = userId;

  uploadFacebook.single("file")(req, res, async (err) => {
    if (err) {
      console.error("파일 업로드 에러:", err.message);
      return res.status(500).json({ success: false, message: "이미지 업로드 실패" });
    }

    const { message, selectedPageId } = req.body;

  try {
      //3. 유저 정보 조회
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

      if (!user || !user.facebook || !user.facebook.selectedPage) {
        return res.status(400).json({ success: false, message: "Facebook 로그인이 필요합니다." });
      }

      const selectedPage = user.facebook.selectedPage;
      if (selectedPage.id !== selectedPageId) {
        return res.status(400).json({ success: false, message: "선택된 페이지 ID가 일치하지 않습니다." });
    }

    const pageAccessToken = selectedPage.access_token;
      const pageId = selectedPageId;

    let response;
      if (req.file) {
        const imageUrl = req.file.location;
      const form = new URLSearchParams();
      form.append("url", imageUrl);
      form.append("caption", message);
        form.append("access_token", pageAccessToken);  // 페이지 액세스 토큰 사용

      response = await axios.post(`https://graph.facebook.com/v22.0/${pageId}/photos`, form);
    } else {
      // 텍스트만 있는 경우 → /feed
      response = await axios.post(`https://graph.facebook.com/v22.0/${pageId}/feed`, {
        message,
          access_token: pageAccessToken,  // 페이지 액세스 토큰 사용
      });
    }

      return res.json({ success: true, postId: response.data.id });
    } catch (err) {
      console.error("Facebook 업로드 오류:", err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        message: "Facebook 업로드 실패",
        error: err.response?.data || err.message,
      });
  }
  });
});

module.exports = router;