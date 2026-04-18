(() => {
  const TALKING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/Talking.webm");
  const WAITING_VIDEO_URL = chrome.runtime.getURL("bibin_assets/animation/Conversation/waiting-Picsart-BackgroundRemover.webm");

  const ANIMATION_FRAME_GAPS_MS = {
    appearing: [700, 1300],
  };

  const PET_ANIMATIONS = {
    appearing: {
      frameUrls: [
        chrome.runtime.getURL("bibin_assets/animation/Appearing/1.png"),
        chrome.runtime.getURL("bibin_assets/animation/Appearing/2.png"),
        chrome.runtime.getURL("bibin_assets/animation/Appearing/3.png"),
      ],
      frameDurationsMs: ANIMATION_FRAME_GAPS_MS.appearing,
      durationMs: 4000,
    },
  };

  const PET_IDLE_FRAME = chrome.runtime.getURL("bibin_assets/animation/Conversation/4.png");

  let currentAnimationToken = 0;
  let img = null;
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
    if (!img || (talkingVideo && waitingVideo)) {
      return;
    }

    const parent = img.parentElement;
    if (!parent) {
      return;
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
    Object.values(PET_ANIMATIONS).forEach((animation) => {
      animation.frameUrls.forEach((frameUrl) => {
        const frame = new Image();
        frame.src = frameUrl;
      });
    });

    const idle = new Image();
    idle.src = PET_IDLE_FRAME;

    if (talkingVideo) talkingVideo.load();
    if (waitingVideo) waitingVideo.load();
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
      playFrameAnimation(animationName, options);
      return;
    }

    if (animationName === "conversation") {
      playTalkingVideo(options);
      return;
    }

    showWaitingLoop();
  }

  function playFrameAnimation(animationName, options = {}) {
    if (!img) {
      return;
    }

    clearTalkingTimer();
    hideAllVideos();
    img.style.display = "block";

    const animation = PET_ANIMATIONS[animationName];
    if (!animation || animation.frameUrls.length === 0) {
      return;
    }

    const { onComplete } = options;
    const token = ++currentAnimationToken;
    const frameCount = animation.frameUrls.length;
    const perFrameDurations = normalizeFrameDurations(
      options.frameDurationsMs || animation.frameDurationsMs,
      frameCount
    );
    const fallbackDurationMs = options.durationMs || animation.durationMs;
    const durationMs = perFrameDurations
      ? perFrameDurations.reduce((sum, duration) => sum + duration, 0)
      : fallbackDurationMs;
    const safeDurationMs = Math.max(durationMs, 1);
    const cumulativeDurations = perFrameDurations
      ? perFrameDurations.reduce((acc, duration) => {
          const next = (acc.length > 0 ? acc[acc.length - 1] : 0) + duration;
          acc.push(next);
          return acc;
        }, [])
      : null;
    const start = performance.now();

    const render = (now) => {
      if (token !== currentAnimationToken) {
        return;
      }

      const elapsed = now - start;
      const progress = Math.min(elapsed / safeDurationMs, 1);
      let frameIndex = frameCount - 1;

      if (cumulativeDurations) {
        for (let i = 0; i < cumulativeDurations.length; i += 1) {
          if (elapsed < cumulativeDurations[i]) {
            frameIndex = i;
            break;
          }
        }
      } else {
        const easedProgress = easeInOutQuad(progress);
        frameIndex = Math.min(
          Math.floor(easedProgress * frameCount),
          frameCount - 1
        );
      }

      img.src = animation.frameUrls[frameIndex];

      if (progress < 1) {
        requestAnimationFrame(render);
        return;
      }

      if (typeof onComplete === "function") {
        onComplete();
        return;
      }

      setPetIdleFrame();
    };

    requestAnimationFrame(render);
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
