(() => {
  const APPEARING_DURATION_MS = 5000;
  const APPEARING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Appearing/Appearing.webm");
  const TALKING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/Talking.webm");
  const WAITING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/waiting-Picsart-BackgroundRemover.webm");

  const PET_ANIMATIONS = {};

  const PET_IDLE_FRAME = chrome.runtime.getURL("bibin_assets/animation/Conversation/4.png");

  let currentAnimationToken = 0;
  let img = null;
  let appearingVideo = null;
  let talkingVideo = null;
  let waitingVideo = null;
  let talkingTimeoutId = null;

  function initializePetAnimation(targetImg) {
    img = targetImg;
    ensureVideos();
    setPetIdleFrame();
    preloadFrames();
  }

  function createVideoElement(url) {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.display = "none";
    video.style.width = img.style.width || "200px";
    video.style.pointerEvents = "none";
    return video;
  }

  function ensureVideos() {
    if (!img || (appearingVideo && talkingVideo && waitingVideo)) {
      return;
    }

    const parent = img.parentElement;
    if (!parent) {
      return;
    }

    if (!appearingVideo) {
      appearingVideo = createVideoElement(APPEARING_VIDEO_URL);
      appearingVideo.loop = false;
      parent.appendChild(appearingVideo);
    }

    if (!talkingVideo) {
      talkingVideo = createVideoElement(TALKING_VIDEO_URL);
      parent.appendChild(talkingVideo);
    }

    if (!waitingVideo) {
      waitingVideo = createVideoElement(WAITING_VIDEO_URL);
      parent.appendChild(waitingVideo);
    }
  }

  function clearTalkingTimer() {
    if (!talkingTimeoutId) {
      return;
    }

    clearTimeout(talkingTimeoutId);
    talkingTimeoutId = null;
  }

  function stopVideo(videoEl, resetToStart = true) {
    if (!videoEl) {
      return;
    }

    videoEl.pause();
    videoEl.style.display = "none";
    if (resetToStart) {
      try {
        videoEl.currentTime = 0;
      } catch (_) {
        // Some browsers may reject currentTime changes before metadata is ready.
      }
    }
  }

  function hideAllVideos(resetToStart = true) {
    stopVideo(appearingVideo, resetToStart);
    stopVideo(talkingVideo, resetToStart);
    stopVideo(waitingVideo, resetToStart);
  }

  function showWaitingLoop() {
    ensureVideos();

    if (!waitingVideo) {
      img.style.display = "block";
      img.src = PET_IDLE_FRAME;
      return;
    }

    clearTalkingTimer();
    stopVideo(appearingVideo, true);
    stopVideo(talkingVideo, true);
    stopVideo(waitingVideo, false);

    img.style.display = "none";
    waitingVideo.style.display = "block";

    const playResult = waitingVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        img.style.display = "block";
        img.src = PET_IDLE_FRAME;
      });
    }
  }

  function preloadFrames() {
    const idle = new Image();
    idle.src = PET_IDLE_FRAME;

    if (appearingVideo) appearingVideo.load();
    if (talkingVideo) talkingVideo.load();
    if (waitingVideo) waitingVideo.load();
  }

  function setPetIdleFrame() {
    if (!img) {
      return;
    }

    // Idle state is a looping waiting video. PNG remains as a safe fallback.
    showWaitingLoop();
  }

  function normalizeFrameDurations(frameDurationsMs, frameCount) {
    if (!Array.isArray(frameDurationsMs) || frameCount < 2) {
      return null;
    }

    if (frameDurationsMs.length !== frameCount - 1) {
      return null;
    }

    const normalized = frameDurationsMs.map((duration) => Number(duration));
    const isValid = normalized.every((duration) => Number.isFinite(duration) && duration > 0);
    return isValid ? normalized : null;
  }

  function playPetAnimation(animationName, options = {}) {
    if (!img) {
      return;
    }

    ensureVideos();

    if (animationName === "appearing") {
      playAppearingVideo(options);
      return;
    }

    if (animationName === "conversation") {
      playTalkingVideo(options);
      return;
    }

    showWaitingLoop();
  }

  function playAppearingVideo(options = {}) {
    if (!img) {
      return;
    }

    ensureVideos();
    const { onComplete } = options;

    if (!appearingVideo) {
      if (typeof onComplete === "function") {
        onComplete();
        return;
      }
      setPetIdleFrame();
      return;
    }

    const token = ++currentAnimationToken;
    const durationMs = APPEARING_DURATION_MS;

    clearTalkingTimer();
    stopVideo(waitingVideo, true);
    stopVideo(talkingVideo, true);
    stopVideo(appearingVideo, false);
    img.style.display = "none";
    appearingVideo.style.display = "block";
    appearingVideo.loop = false;

    const finish = () => {
      if (token !== currentAnimationToken) {
        return;
      }

      appearingVideo.removeEventListener("ended", onEnded);
      if (typeof onComplete === "function") {
        onComplete();
        return;
      }
      setPetIdleFrame();
    };

    const onEnded = () => finish();
    appearingVideo.addEventListener("ended", onEnded);

    try {
      appearingVideo.currentTime = 0;
    } catch (_) {
      // Some browsers may reject currentTime changes before metadata is ready.
    }

    const playResult = appearingVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        appearingVideo.removeEventListener("ended", onEnded);
        if (typeof onComplete === "function") {
          onComplete();
          return;
        }
        setPetIdleFrame();
      });
    }

    talkingTimeoutId = setTimeout(finish, durationMs);
  }

  function playTalkingVideo(options = {}) {
    if (!img) {
      return;
    }

    ensureVideos();
    if (!talkingVideo) {
      showWaitingLoop();
      return;
    }

    const token = ++currentAnimationToken;
    const { onComplete } = options;
    const hasTimedFinish = Number.isFinite(options.durationMs) && options.durationMs > 0;
    const durationMs = hasTimedFinish ? Math.max(options.durationMs, 250) : 0;

    clearTalkingTimer();
    stopVideo(appearingVideo, true);
    stopVideo(waitingVideo, false);
    stopVideo(talkingVideo, false);
    img.style.display = "none";
    talkingVideo.style.display = "block";

    const playResult = talkingVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        showWaitingLoop();
      });
    }

    if (!hasTimedFinish || typeof onComplete !== "function") {
      return;
    }

    talkingTimeoutId = setTimeout(() => {
      if (token !== currentAnimationToken) {
        return;
      }

      onComplete();
    }, durationMs);
  }

  function playConversationAnimation(options = {}) {
    playPetAnimation("conversation", {
      durationMs: options.durationMs || 2000,
      frameDurationsMs: options.frameDurationsMs,
      onComplete: options.onComplete || setPetIdleFrame,
    });
  }

  window.BibinPetAnimation = {
    PET_ANIMATIONS,
    PET_IDLE_FRAME,
    initializePetAnimation,
    setPetIdleFrame,
    playPetAnimation,
    playConversationAnimation,
  };
})();
