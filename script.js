"use strict";

const starLayer = document.getElementById("stars-layer");
const canvas = document.getElementById("fireworks-canvas");
const ctx = canvas?.getContext("2d", { alpha: true });
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!starLayer || !canvas || !ctx) {
  throw new Error("Required visual layers are missing from the page.");
}

const STAR_COUNT = reduceMotion
  ? 40
  : window.innerWidth < 640
  ? 80
  : 150;

let width = 0;
let height = 0;
let dpr = 1;

let fireworks = [];
let particles = [];
let nextLaunchTime = 0;
let frameId = 0;
let resizeTimer = 0;

const palette = ["#f4d77b", "#8be9ff", "#ff91d0", "#7eb6ff", "#c2ff9a", "#ffd1a8"];

/**
 * Create floating stars with randomized size, position, and animation timing.
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

    star.style.setProperty("--twinkle-duration", `${1.8 + Math.random() * 4}s`);
    star.style.setProperty("--drift-duration", `${18 + Math.random() * 28}s`);
    star.style.animationDelay = `${Math.random() * 5}s, ${Math.random() * 10}s`;

    fragment.appendChild(star);
  }

  starLayer.appendChild(fragment);
}

/**
 * Keep the canvas crisp on high-density displays.
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
  fireworks.push(new Firework());

  if (!reduceMotion && Math.random() > 0.6) {
    setTimeout(() => {
      fireworks.push(new Firework());
    }, randomBetween(120, 260));
  }
}

function updateFireworks() {
  // Clear each frame to avoid an accumulating dark overlay on the page.
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

  // Safety cap to avoid particle build-up on very long sessions.
  if (particles.length > 1400) {
    particles.splice(0, particles.length - 1400);
  }
}

function animate(timestamp) {
  if (!nextLaunchTime || timestamp >= nextLaunchTime) {
    launchFireworkBurst();
    const interval = reduceMotion ? randomBetween(1800, 2800) : randomBetween(680, 1400);
    nextLaunchTime = timestamp + interval;
  }

  updateFireworks();
  frameId = requestAnimationFrame(animate);
}

function getResponsiveStarCount() {
  return reduceMotion
    ? 40
    : window.innerWidth < 640
    ? 80
    : 150;
}

function init() {
  resizeCanvas();
  generateStars(STAR_COUNT);

  // Start with a small welcome burst after initial paint.
  setTimeout(() => {
    launchFireworkBurst();
    if (!reduceMotion) {
      launchFireworkBurst();
    }
  }, 450);

  frameId = requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);

  resizeTimer = window.setTimeout(() => {
    resizeCanvas();
    generateStars(getResponsiveStarCount());
  }, 120);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frameId);
    return;
  }

  nextLaunchTime = performance.now() + 250;
  frameId = requestAnimationFrame(animate);
});

init();
