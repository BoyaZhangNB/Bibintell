(() => {
  const APPEARING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Appearing/Appearing.webm");
  const TALKING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/Talking.webm");
  const WAITING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/waiting-Picsart-BackgroundRemover.webm");
  const APPEARING_FIXED_DURATION_MS = 5000;
  const PET_ANIMATIONS = {};
  const PET_IDLE_FRAME = "";

  let currentAnimationToken = 0;
  let img = null;
  let appearingVideo = null;
  let talkingVideo = null;
  let waitingVideo = null;
  let appearingTimeoutId = null;
  let talkingTimeoutId = null;
  let appearingEndedHandler = null;

  function initializePetAnimation(targetImg) {
    img = targetImg;
    ensureVideos();
    setPetIdleFrame();
    preloadVideos();
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

  function clearAppearingTimer() {
    if (!appearingTimeoutId) {
      return;
    }

    clearTimeout(appearingTimeoutId);
    appearingTimeoutId = null;
  }

  function clearAppearingEndedHandler() {
    if (!appearingVideo || !appearingEndedHandler) {
      return;
    }

    appearingVideo.removeEventListener("ended", appearingEndedHandler);
    appearingEndedHandler = null;
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

  function isAppearingAnimationPlaying() {
    return Boolean(
      appearingTimeoutId ||
      (appearingVideo && appearingVideo.style.display === "block")
    );
  }

  function cancelCurrentAnimation(options = {}) {
    const goToWaiting = options.goToWaiting !== false;

    currentAnimationToken += 1;
    clearAppearingTimer();
    clearTalkingTimer();
    clearAppearingEndedHandler();
    hideAllVideos();

    if (!img) {
      return;
    }

    if (goToWaiting) {
      showWaitingLoop();
      return;
    }

    img.style.display = "none";
  }

  function showWaitingLoop() {
    ensureVideos();

    if (!waitingVideo) {
      img.style.display = "none";
      return;
    }

    clearAppearingTimer();
    clearTalkingTimer();
    clearAppearingEndedHandler();
    stopVideo(appearingVideo, true);
    stopVideo(talkingVideo, true);
    stopVideo(waitingVideo, false);

    img.style.display = "none";
    waitingVideo.style.display = "block";

    const playResult = waitingVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        img.style.display = "none";
      });
    }
  }

  function preloadVideos() {
    if (talkingVideo) talkingVideo.load();
    if (waitingVideo) waitingVideo.load();
    if (appearingVideo) appearingVideo.load();
  }

  function setPetIdleFrame() {
    if (!img) {
      return;
    }

    // Idle state is always the waiting loop video.
    showWaitingLoop();
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
    if (!appearingVideo) {
      if (typeof options.onComplete === "function") {
        options.onComplete();
      } else {
        setPetIdleFrame();
      }
      return;
    }

    const token = ++currentAnimationToken;
    const { onComplete } = options;
    const timeoutMs = APPEARING_FIXED_DURATION_MS;

    clearAppearingTimer();
    clearTalkingTimer();
    stopVideo(talkingVideo, true);
    stopVideo(waitingVideo, true);
    stopVideo(appearingVideo, false);

    img.style.display = "none";
    appearingVideo.style.display = "block";

    const complete = () => {
      if (token !== currentAnimationToken) {
        return;
      }

      if (typeof onComplete === "function") {
        onComplete();
        return;
      }

      setPetIdleFrame();
    };

    const onEnded = () => {
      // Keep the last frame visible; completion is controlled by the fixed timeout.
    };

    clearAppearingEndedHandler();
    appearingEndedHandler = onEnded;
    appearingVideo.addEventListener("ended", appearingEndedHandler);

    try {
      appearingVideo.currentTime = 0;
    } catch (_) {
      // Metadata may not be ready yet.
    }

    const playResult = appearingVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        clearAppearingEndedHandler();
        complete();
      });
    }

    appearingTimeoutId = setTimeout(() => {
      clearAppearingEndedHandler();
      complete();
    }, Math.max(timeoutMs, 1000));
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

    clearAppearingTimer();
    clearAppearingEndedHandler();
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
    cancelCurrentAnimation,
    isAppearingAnimationPlaying,
  };
})();
