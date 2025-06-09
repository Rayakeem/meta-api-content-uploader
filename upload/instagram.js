const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { uploadInstagram } = require("../utils/s3Uploader");

// 1. Instagram 게시물 업로드 (이미지 게시)
router.post("/upload", async (req, res, next) => {
  const authHeader = req.headers.authorization;

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
      message: "TokNow 토큰이 만료되었거나 유효하지 않습니다.",
    });
  }

  // 2. S3 업로드 미들웨어에 userId 전달
  req.userId = userId;

  uploadInstagram.single("file")(req, res, async (err) => {
    if (err) {
      console.error("파일 업로드 에러:", err.message);
      return res.status(500).json({ success: false, message: "이미지 업로드 실패" });
    } 

    const imageUrl = req.file.location;
    const { message } = req.body; // FormData에서 message 필드 가져오기

    try {
      //3. 유저 정보 조회
      const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

      if (!user || !user.instagram.accessToken || !user.instagram.userId) {
        return res.status(400).json({ success: false, message: "Instagram 로그인이 필요합니다." });
      }

      const accessToken = user.instagram.accessToken;
      const igUserId = user.instagram.userId;

      // 4. Instagram media 컨테이너 생성
      const mediaForm = new URLSearchParams();
      mediaForm.append("image_url", imageUrl);
      mediaForm.append("caption", message);
      mediaForm.append("access_token", accessToken);

      const mediaRes = await axios.post(
        `https://graph.instagram.com/v23.0/${igUserId}/media`,
        mediaForm
      );

      const creationId = mediaRes.data.id;

      // 5. media 컨테이너 게시
      const publishForm = new URLSearchParams();
      publishForm.append("creation_id", creationId);
      publishForm.append("access_token", accessToken);

      const publishRes = await axios.post(
        `https://graph.instagram.com/v23.0/${igUserId}/media_publish`,
        publishForm
      );

      return res.json({ success: true, postId: publishRes.data.id });
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.error("❌ Instagram 업로드 오류:", errorMsg);
      console.error("오류 상세:", {
        message: err.message,
        stack: err.stack,
        response: err.response?.data
      });

      // 6. 게시 실패 시 status_code 조회
      if (err.response?.data?.error?.code === 10 && err.config?.data?.creation_id) {
        try {
          const statusRes = await axios.get(
            `https://graph.instagram.com/v23.0/${err.config.data.creation_id}?fields=status_code`,
            { params: { access_token: accessToken } }
          );
          console.log("📍 게시 상태:", statusRes.data.status_code);
        } catch (statusErr) {
          console.error("❌ 상태 코드 조회 실패:", statusErr.message);
        }
      }

      if (err.response && err.response.status !== 200) {
        console.error('❌ Instagram API 응답 에러:', {
          status: err.response.status,
          statusText: err.response.statusText,
          data: err.response.data,
          error: err.response.data.error ? {
            message: err.response.data.error.message,
            type: err.response.data.error.type,
            code: err.response.data.error.code,
            error_subcode: err.response.data.error.error_subcode,
            is_transient: err.response.data.error.is_transient,
            error_user_title: err.response.data.error.error_user_title,
            error_user_msg: err.response.data.error.error_user_msg,
            fbtrace_id: err.response.data.error.fbtrace_id
          } : 'No error details available'
        });
        return res.status(err.response.status).json({
          success: false,
          message: err.response.data.error?.message || 'Instagram API 호출 실패',
          error: err.response.data.error || err.response.data
        });
      }

      return res.status(500).json({ success: false, message: "Instagram 업로드 실패", error: errorMsg });
    }
  });
});

module.exports = router;