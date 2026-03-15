(() => {
  const ANIMATION_FRAME_GAPS_MS = {
    appearing: [700, 1300],
    conversation: [500, 500, 500],
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
    conversation: {
      frameUrls: [
        chrome.runtime.getURL("bibin_assets/animation/Conversation/1.png"),
        chrome.runtime.getURL("bibin_assets/animation/Conversation/2.png"),
        chrome.runtime.getURL("bibin_assets/animation/Conversation/3.png"),
        chrome.runtime.getURL("bibin_assets/animation/Conversation/4.png"),
      ],
      frameDurationsMs: ANIMATION_FRAME_GAPS_MS.conversation,
      durationMs: 4000,
    },
  };

  const PET_IDLE_FRAME = chrome.runtime.getURL("bibin_assets/animation/Conversation/4.png");

  let currentAnimationToken = 0;
  let img = null;

  function initializePetAnimation(targetImg) {
    img = targetImg;
    setPetIdleFrame();
    preloadFrames();
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
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function setPetIdleFrame() {
    if (!img) {
      return;
    }
    img.src = PET_IDLE_FRAME;
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
