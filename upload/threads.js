const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const router = express.Router();
const {uploadThreads} = require("../utils/s3Uploader");

// Threads 게시글 업로드 (이미지/텍스트)
router.post("/upload", async (req, res, next) => {
  const authHeader = req.headers.authorization;

  //1. 톡나우 인증 토큰 확인
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

  // S3 업로드 미들웨어에 userId 전달
  req.userId = userId;

  uploadThreads.single("file")(req, res, async (err) => {
    if (err) {
      console.error("파일 업로드 에러:", err.message);
      return res.status(500).json({ success: false, message: "이미지 업로드 실패" });
    }

    const { message } = req.body;

    try {
      //3. 유저 정보 조회
      const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

      if (!user || !user.threads || !user.threads.accessToken) {
        return res.status(400).json({ success: false, message: "Threads 로그인이 필요합니다." });
      }

      const accessToken = user.threads.accessToken;
      const threadsUserId = user.threads.userId;

      let response;
      if (req.file) {
        // 이미지가 있는 경우
        const imageUrl = req.file.location;
        
        // 1단계: 미디어 컨테이너 생성
        const mediaResponse = await axios.post(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
          null,
          {
            params: {
              media_type: "IMAGE",
              image_url: imageUrl,
              text: message,
              access_token: accessToken,
            },
          }
        );

        const creationId = mediaResponse.data.id;

        // 30초 대기 (Threads API 권장사항)
        await new Promise(resolve => setTimeout(resolve, 20000));

        // 2단계: 게시물 발행
        response = await axios.post(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: accessToken,
            },
          }
        );
      } else {
        // 텍스트만 있는 경우
        const mediaResponse = await axios.post(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
          null,
          {
            params: {
              media_type: "TEXT",
              text: message,
              access_token: accessToken,
            },
          }
        );

        const creationId = mediaResponse.data.id;

        // 30초 대기
        await new Promise(resolve => setTimeout(resolve, 20000));

        response = await axios.post(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: accessToken,
            },
          }
        );
      }

      return res.json({ success: true, postId: response.data.id });
    } catch (err) {
      console.error("Threads 업로드 오류:", err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        message: "Threads 업로드 실패",
        error: err.response?.data || err.message,
      });
    }
  });
});

// Threads 캐러셀 게시글 업로드
router.post("/upload/carousel", async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const { message } = req.body;

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

  req.userId = userId;

  uploadThreads.array("files", 10)(req, res, async (err) => {
    if (err) {
      console.error("파일 업로드 에러:", err.message);
      return res.status(500).json({ success: false, message: "이미지 업로드 실패" });
    }

    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ success: false, message: "캐러셀은 최소 2개 이상의 이미지가 필요합니다." });
    }

    try {
      const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

      if (!user || !user.threads || !user.threads.accessToken) {
        return res.status(400).json({ success: false, message: "Threads 로그인이 필요합니다." });
      }

      const accessToken = user.threads.accessToken;
      const threadsUserId = user.threads.userId;

      // 1단계: 각 이미지에 대한 컨테이너 생성
      const containerIds = await Promise.all(
        req.files.map(async (file) => {
          const response = await axios.post(
            `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
            null,
            {
              params: {
                media_type: "IMAGE",
                image_url: file.location,
                is_carousel_item: true,
                access_token: accessToken,
              },
            }
          );
          return response.data.id;
        })
      );

      // 2단계: 캐러셀 컨테이너 생성
      const carouselResponse = await axios.post(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
        null,
        {
          params: {
            media_type: "CAROUSEL",
            children: containerIds.join(","),
            text: message,
            access_token: accessToken,
          },
        }
      );

      const creationId = carouselResponse.data.id;

      // 30초 대기
      await new Promise(resolve => setTimeout(resolve, 30000));

      // 3단계: 캐러셀 게시물 발행
      const response = await axios.post(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: accessToken,
          },
        }
      );

      return res.json({ success: true, postId: response.data.id });
    } catch (err) {
      console.error("Threads 캐러셀 업로드 오류:", err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        message: "Threads 캐러셀 업로드 실패",
        error: err.response?.data || err.message,
      });
    }
  });
});

module.exports = router;
