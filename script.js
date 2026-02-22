"use strict";

const canvas = document.getElementById("fireworks-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const starLayer = document.getElementById("stars-layer");
const bgMusic = document.getElementById("bg-music");
const musicToggle = document.getElementById("music-toggle");
const musicToggleLabel = musicToggle ? musicToggle.querySelector(".music-toggle__label") : null;
const introScreen = document.getElementById("intro-screen");
const introDust = document.getElementById("intro-dust");
const celebrateBtn = document.getElementById("celebrate-btn");

if (
  !canvas ||
  !ctx ||
  !starLayer ||
  !bgMusic ||
  !musicToggle ||
  !musicToggleLabel ||
  !introScreen ||
  !introDust ||
  !celebrateBtn
) {
  throw new Error("Required visual layers are missing from the page.");
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STAR_COUNT = reduceMotion ? 40 : window.innerWidth < 640 ? 80 : 150;
const INTRO_ASSEMBLE_MS = reduceMotion ? 520 : 3100;
const INTRO_BURST_MS = reduceMotion ? 280 : 820;
const INTRO_REVEAL_MS = reduceMotion ? 300 : 760;

const palette = ["#f4d77b", "#8be9ff", "#ff91d0", "#7eb6ff", "#c2ff9a", "#ffd1a8"];
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const MUSIC_VOLUME = 0.24;
const SOUND_ON_BY_DEFAULT = true;

let width = 0;
let height = 0;
let dpr = 1;

let fireworks = [];
let particles = [];
let nextLaunchTime = 0;
let frameId = 0;
let resizeTimer = 0;

let fireworksStarted = false;
let introStarted = false;
let introCompleted = false;

let audioContext = null;
let fireworkNoiseBuffer = null;
let musicEnabled = SOUND_ON_BY_DEFAULT;

/**
 * Build twinkling stars with randomized positions and timings.
 */
function generateStars(count) {
  const fragment = document.createDocumentFragment();
  starLayer.textContent = "";

  for (let i = 0; i < count; i += 1) {
    const star = document.createElement("span");
    const size = Math.random() * 2 + 0.6;

    star.className = "star";
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 72}%`;
    star.style.opacity = (0.32 + Math.random() * 0.68).toFixed(2);
    star.style.setProperty("--twinkle-duration", `${randomBetween(2.1, 5.6).toFixed(2)}s`);
    star.style.setProperty("--drift-duration", `${randomBetween(18, 34).toFixed(2)}s`);
    star.style.animationDelay = `${randomBetween(-5, 0).toFixed(2)}s, ${randomBetween(-10, 0).toFixed(2)}s`;

    fragment.appendChild(star);
  }

  starLayer.appendChild(fragment);
}

/**
 * Keep canvas crisp on high-density displays.
 */
function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function getResponsiveStarCount() {
  if (reduceMotion) {
    return 40;
  }

  return window.innerWidth < 640 ? 80 : 150;
}

function updateMusicButtonState() {
  const isPlaying = !bgMusic.paused && !bgMusic.muted;

  musicToggle.classList.toggle("is-off", !musicEnabled);
  musicToggle.classList.toggle("is-waiting", musicEnabled && !isPlaying);
  musicToggle.setAttribute("aria-pressed", String(musicEnabled));
  musicToggle.setAttribute("aria-label", musicEnabled ? "Mute background music" : "Unmute background music");
  musicToggleLabel.textContent = musicEnabled ? "Music On" : "Music Off";
}

async function playBackgroundMusic() {
  if (!musicEnabled) {
    return false;
  }

  try {
    await bgMusic.play();
    updateMusicButtonState();
    return true;
  } catch {
    updateMusicButtonState();
    return false;
  }
}

function setupBackgroundMusic() {
  // Keep background music soft and non-intrusive.
  bgMusic.volume = MUSIC_VOLUME;
  bgMusic.loop = true;
  bgMusic.muted = false;
  updateMusicButtonState();
}

function getAudioContext(createIfMissing = true) {
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext && createIfMissing) {
    audioContext = new AudioContextClass();
  }

  return audioContext;
}

async function primeFireworkAudio() {
  const context = getAudioContext(true);
  if (!context) {
    return false;
  }

  if (context.state === "running") {
    return true;
  }

  try {
    await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

function getNoiseBuffer(context) {
  if (fireworkNoiseBuffer && fireworkNoiseBuffer.sampleRate === context.sampleRate) {
    return fireworkNoiseBuffer;
  }

  const length = Math.floor(context.sampleRate * 0.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const decay = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  fireworkNoiseBuffer = buffer;
  return buffer;
}

function createPanNode(context, pan) {
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    return panner;
  }

  return context.createGain();
}

function positionToPan(x) {
  if (!width) {
    return 0;
  }

  const normalized = (x / width) * 2 - 1;
  return Math.max(-0.9, Math.min(0.9, normalized));
}

function playLaunchSound(x) {
  const context = getAudioContext(false);
  if (!context || context.state !== "running") {
    return;
  }

  const now = context.currentTime;
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const panNode = createPanNode(context, positionToPan(x));

  filter.type = "highpass";
  filter.frequency.setValueAtTime(130, now);

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(randomBetween(180, 260), now);
  oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.28);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(panNode);
  panNode.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.32);
}

function playExplosionSound(x, intensity = 1) {
  const context = getAudioContext(false);
  if (!context || context.state !== "running") {
    return;
  }

  const now = context.currentTime;
  const panNode = createPanNode(context, positionToPan(x));
  const volume = Math.max(0.45, Math.min(1.2, intensity));

  panNode.connect(context.destination);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();

  noise.buffer = getNoiseBuffer(context);
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(randomBetween(650, 1300), now);
  noiseFilter.Q.value = 0.8;

  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.2 * volume, now + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(panNode);

  noise.start(now);
  noise.stop(now + 0.45);

  const boom = context.createOscillator();
  const boomGain = context.createGain();

  boom.type = "sine";
  boom.frequency.setValueAtTime(randomBetween(120, 170), now);
  boom.frequency.exponentialRampToValueAtTime(42, now + 0.36);

  boomGain.gain.setValueAtTime(0.0001, now);
  boomGain.gain.exponentialRampToValueAtTime(0.11 * volume, now + 0.02);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

  boom.connect(boomGain);
  boomGain.connect(panNode);

  boom.start(now);
  boom.stop(now + 0.4);
}

class Firework {
  constructor() {
    this.x = randomBetween(width * 0.1, width * 0.9);
    this.y = height + 10;
    this.targetX = this.x + randomBetween(-80, 80);
    this.targetY = randomBetween(height * 0.1, height * 0.55);
    this.speed = randomBetween(3.6, 5.1);
    this.color = palette[(Math.random() * palette.length) | 0];
    this.trail = [];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 7) {
      this.trail.shift();
    }

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance < this.speed) {
      this.explode();
      return true;
    }

    this.x += (dx / distance) * this.speed;
    this.y += (dy / distance) * this.speed;
    return false;
  }

  draw() {
    ctx.beginPath();
    this.trail.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  explode() {
    const count = reduceMotion ? 18 : Math.floor(randomBetween(44, 82));
    playExplosionSound(this.x, count / 60);

    for (let i = 0; i < count; i += 1) {
      particles.push(new Particle(this.x, this.y, this.color));
    }
  }
}

class Particle {
  constructor(x, y, color) {
    const angle = randomBetween(0, Math.PI * 2);
    const force = randomBetween(1.3, 5.8);

    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * force;
    this.vy = Math.sin(angle) * force;
    this.gravity = 0.045;
    this.friction = 0.985;
    this.alpha = 1;
    this.decay = randomBetween(0.012, 0.022);
    this.size = randomBetween(1.5, 3.1);
    this.color = color;
  }

  update() {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;

    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;

    return this.alpha <= 0;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = Math.max(this.alpha, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function launchFireworkBurst() {
  const primary = new Firework();
  fireworks.push(primary);
  playLaunchSound(primary.x);

  if (!reduceMotion && Math.random() > 0.6) {
    setTimeout(() => {
      const secondary = new Firework();
      fireworks.push(secondary);
      playLaunchSound(secondary.x);
    }, randomBetween(120, 260));
  }
}

function updateFireworks() {
  ctx.clearRect(0, 0, width, height);

  for (let i = fireworks.length - 1; i >= 0; i -= 1) {
    const done = fireworks[i].update();
    fireworks[i].draw();

    if (done) {
      fireworks.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const faded = particles[i].update();
    particles[i].draw();

    if (faded) {
      particles.splice(i, 1);
    }
  }

  if (particles.length > 1400) {
    particles.splice(0, particles.length - 1400);
  }
}

function animate(timestamp) {
  if (!fireworksStarted) {
    return;
  }

  if (!nextLaunchTime || timestamp >= nextLaunchTime) {
    launchFireworkBurst();
    const interval = reduceMotion ? randomBetween(1800, 2800) : randomBetween(680, 1400);
    nextLaunchTime = timestamp + interval;
  }

  updateFireworks();
  frameId = requestAnimationFrame(animate);
}

function startFireworksShow() {
  if (fireworksStarted) {
    return;
  }

  fireworksStarted = true;
  nextLaunchTime = 0;

  launchFireworkBurst();
  if (!reduceMotion) {
    setTimeout(() => {
      launchFireworkBurst();
    }, 220);
  }

  frameId = requestAnimationFrame(animate);
}

function buildDustExplosion() {
  introDust.querySelectorAll(".dust-spark").forEach((spark) => spark.remove());

  const sparkCount = reduceMotion ? 10 : 22;
  const maxRadius = Math.min(window.innerWidth, window.innerHeight) * (reduceMotion ? 0.11 : 0.18);

  for (let i = 0; i < sparkCount; i += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const radius = randomBetween(maxRadius * 0.35, maxRadius);
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    const delay = randomBetween(0, reduceMotion ? 0.05 : 0.13);
    const size = randomBetween(3.8, 8.8).toFixed(2);

    const spark = document.createElement("span");
    spark.className = "dust-spark";
    spark.style.setProperty("--dx", `${dx.toFixed(2)}px`);
    spark.style.setProperty("--dy", `${dy.toFixed(2)}px`);
    spark.style.setProperty("--delay", `${delay.toFixed(2)}s`);
    spark.style.setProperty("--size", `${size}px`);
    introDust.appendChild(spark);
  }

  introDust.classList.remove("active");

  // Restart animation cleanly if sequence is retriggered.
  void introDust.offsetWidth;
  introDust.classList.add("active");

  window.setTimeout(() => {
    introDust.querySelectorAll(".dust-spark").forEach((spark) => spark.remove());
  }, 1150);
}

async function beginExperience() {
  if (introStarted) {
    return;
  }

  introStarted = true;
  celebrateBtn.disabled = true;
  celebrateBtn.setAttribute("aria-disabled", "true");

  document.body.classList.add("intro-started");

  // Click on "CELEBRATE" is the user gesture used to unlock audio APIs.
  void primeFireworkAudio();
  if (musicEnabled) {
    await playBackgroundMusic();
  } else {
    updateMusicButtonState();
  }

  setTimeout(() => {
    document.body.classList.add("intro-burst");
    buildDustExplosion();
  }, INTRO_ASSEMBLE_MS);

  setTimeout(() => {
    introCompleted = true;
    document.body.classList.add("scene-ready");
    startFireworksShow();
  }, INTRO_ASSEMBLE_MS + INTRO_BURST_MS);

  setTimeout(() => {
    introScreen.classList.add("is-hidden");
  }, INTRO_ASSEMBLE_MS + INTRO_BURST_MS + INTRO_REVEAL_MS);
}

function init() {
  resizeCanvas();
  generateStars(STAR_COUNT);
  setupBackgroundMusic();
}

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);

  resizeTimer = window.setTimeout(() => {
    resizeCanvas();
    generateStars(getResponsiveStarCount());
  }, 120);
});

celebrateBtn.addEventListener("click", () => {
  void beginExperience();
});

musicToggle.addEventListener("click", () => {
  musicEnabled = !musicEnabled;

  if (!musicEnabled) {
    bgMusic.pause();
    updateMusicButtonState();
    return;
  }

  if (introStarted) {
    void primeFireworkAudio();
    void playBackgroundMusic();
  } else {
    updateMusicButtonState();
  }
});

bgMusic.addEventListener("play", updateMusicButtonState);
bgMusic.addEventListener("pause", updateMusicButtonState);
bgMusic.addEventListener("ended", updateMusicButtonState);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (fireworksStarted) {
      cancelAnimationFrame(frameId);
    }
    return;
  }

  if (fireworksStarted) {
    nextLaunchTime = performance.now() + 250;
    frameId = requestAnimationFrame(animate);
  }

  if (introCompleted && musicEnabled && bgMusic.paused) {
    void playBackgroundMusic();
  }
});

init();
