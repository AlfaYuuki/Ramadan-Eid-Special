"use strict";

const canvas = document.getElementById("fireworks-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const starLayer = document.getElementById("stars-layer");
const cloudsLayer = document.getElementById("clouds-layer");
const fireworkLight = document.getElementById("firework-light");
const bgMusic = document.getElementById("bg-music");
const musicToggle = document.getElementById("music-toggle");
const musicToggleLabel = musicToggle ? musicToggle.querySelector(".music-toggle__label") : null;
const introScreen = document.getElementById("intro-screen");
const introDust = document.getElementById("intro-dust");
const celebrateBtn = document.getElementById("celebrate-btn");
const rootStyle = document.documentElement.style;

if (
  !canvas || !ctx || !starLayer || !cloudsLayer || !fireworkLight ||
  !bgMusic || !musicToggle || !musicToggleLabel ||
  !introScreen || !introDust || !celebrateBtn
) {
  throw new Error("Required visual layers are missing from the page.");
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STAR_COUNT = reduceMotion ? 40 : window.innerWidth < 640 ? 80 : 150;
const INTRO_ASSEMBLE_MS = reduceMotion ? 520 : 3100;
const INTRO_BURST_MS = reduceMotion ? 280 : 820;
const INTRO_REVEAL_MS = reduceMotion ? 300 : 760;

const palette = ["#e8c886", "#d7aa63", "#f0e1c2", "#c9915f", "#e7b99b", "#c6a06e"];
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const MUSIC_VOLUME = 0.24;

let width = 0, height = 0, dpr = 1;
let fireworks = [], particles = [];
let nextLaunchTime = 0, frameId = 0;

let fireworksStarted = false, introStarted = false, introCompleted = false;

let audioContext = null;
let musicEnabled = true;

/* -------------------- UTILS -------------------- */

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/* -------------------- TYPE TEXT -------------------- */
function typeText(element, text, speed = 80) {
  let i = 0;
  element.textContent = "";
  const interval = setInterval(() => {
    element.textContent += text[i];
    i++;
    if (i >= text.length) clearInterval(interval);
  }, speed);
}

/* -------------------- CANVAS -------------------- */
function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* -------------------- MUSIC (WITH FADE) -------------------- */
async function playBackgroundMusic() {
  if (!musicEnabled) return false;

  try {
    bgMusic.volume = 0;
    await bgMusic.play();

    let vol = 0;
    const fade = setInterval(() => {
      vol += 0.02;
      bgMusic.volume = Math.min(vol, MUSIC_VOLUME);
      if (vol >= MUSIC_VOLUME) clearInterval(fade);
    }, 100);

    return true;
  } catch {
    return false;
  }
}

/* -------------------- FIREWORK -------------------- */
class Firework {
  constructor() {
    this.x = randomBetween(width * 0.1, width * 0.9);
    this.y = height;
    this.targetX = this.x + randomBetween(-80, 80);
    this.targetY = randomBetween(height * 0.1, height * 0.5);
    this.speed = randomBetween(3, 5);
    this.color = palette[Math.floor(Math.random() * palette.length)];
    this.trail = [];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.speed) {
      this.explode();
      return true;
    }

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
    return false;
  }

  draw() {
    ctx.beginPath();
    this.trail.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = this.color;
    ctx.stroke();
  }

  explode() {
    const count = 50;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(this.x, this.y, this.color));
    }
  }
}

/* -------------------- PARTICLE -------------------- */
class Particle {
  constructor(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(1, 5);

    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.alpha = 1;
    this.decay = randomBetween(0.01, 0.02);
    this.color = color;
  }

  update() {
    this.vy += 0.04;
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
    return this.alpha <= 0;
  }

  draw() {
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* -------------------- LOOP -------------------- */
function launchFirework() {
  fireworks.push(new Firework());
}

function update() {
  ctx.clearRect(0, 0, width, height);

  fireworks = fireworks.filter(f => !f.update());
  fireworks.forEach(f => f.draw());

  particles = particles.filter(p => !p.update());
  particles.forEach(p => p.draw());

  // 🔥 PERFORMANCE FIX
  if (particles.length > 800) {
    particles.splice(0, particles.length - 800);
  }
}

function animate(t) {
  if (!fireworksStarted) return;

  if (!nextLaunchTime || t > nextLaunchTime) {
    launchFirework();
    nextLaunchTime = t + randomBetween(700, 1300);
  }

  update();
  frameId = requestAnimationFrame(animate);
}

/* -------------------- START -------------------- */
function startFireworksShow() {
  if (fireworksStarted) return;

  fireworksStarted = true;
  requestAnimationFrame(animate);
}

/* -------------------- EXPERIENCE -------------------- */
async function beginExperience() {
  if (introStarted) return;
  introStarted = true;

  await playBackgroundMusic();

  setTimeout(() => {
    document.body.classList.add("scene-ready");
    startFireworksShow();

    // ✨ TYPE EFFECT
    typeText(document.getElementById("eid-title"), "Eid Mubarak");

  }, 3000);
}

/* -------------------- EVENTS -------------------- */
window.addEventListener("resize", resizeCanvas);

celebrateBtn.addEventListener("click", beginExperience);

/* 🎆 CLICK FIREWORK */
canvas.addEventListener("click", (e) => {
  const fw = new Firework();
  fw.x = e.clientX;
  fw.y = height;
  fw.targetX = e.clientX;
  fw.targetY = e.clientY;
  fireworks.push(fw);
});

/* -------------------- INIT -------------------- */
resizeCanvas();
