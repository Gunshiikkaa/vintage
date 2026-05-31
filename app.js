/* ==========================================================================
   STATE VARIABLES & INITIALIZATION
   ========================================================================== */
let player;
let isPlaying = false;
let playerReady = false;
let audioCtx = null;
let staticSynth = null;
let countdownInterval = null;
let autoplayInterval = null;

// DOM Elements
const setupOverlay = document.getElementById('setup-overlay');
const stepFullscreen = document.getElementById('step-fullscreen');
const stepVolume = document.getElementById('step-volume');
const stepCountdown = document.getElementById('step-countdown');

const btnFullscreenYes = document.getElementById('btn-fullscreen-yes');
const btnFullscreenNo = document.getElementById('btn-fullscreen-no');
const btnVolumeContinue = document.getElementById('btn-volume-continue');

const countdownNumber = document.getElementById('countdown-number');
const countdownTimerVal = document.getElementById('countdown-timer-val');
const circleProgress = document.querySelector('.circle-progress');

const mainDashboard = document.getElementById('main-dashboard');
const crtScreen = document.getElementById('crt-screen');
const vinylRecord = document.getElementById('vinyl-record');
const tonearm = document.getElementById('tonearm');
const btnPlayToggle = document.getElementById('btn-play-toggle');
const statusLed = document.getElementById('status-led');
const displayDate = document.getElementById('display-date');
const frequencyPointer = document.querySelector('.frequency-pointer');

// Carousel Elements
const carouselTrack = document.getElementById('carousel-track');
const slides = Array.from(document.querySelectorAll('.polaroid-slide'));
const dots = Array.from(document.querySelectorAll('.dot'));
const btnPrevSlide = document.getElementById('btn-prev-slide');
const btnNextSlide = document.getElementById('btn-next-slide');
let currentSlideIndex = 1; // Start with active middle slide

/* ==========================================================================
   DATE TRACKING INITIALIZATION
   ========================================================================== */
function initializeDate() {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const now = new Date();
    const month = months[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    displayDate.textContent = `${month} ${day}, ${year}`;
}

/* ==========================================================================
   FULLSCREEN UTILITIES
   ========================================================================== */
function enterFullscreen() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => console.log("Fullscreen request failed:", err));
    } else if (docEl.mozRequestFullScreen) { // Firefox
        docEl.mozRequestFullScreen();
    } else if (docEl.webkitRequestFullscreen) { // Chrome, Safari, Opera
        docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) { // IE/Edge
        docEl.msRequestFullscreen();
    }
}

/* ==========================================================================
   WEB AUDIO API: RADIO STATIC NOISE SYNTHESIS
   ========================================================================== */
class RadioStaticSynth {
    constructor() {
        this.ctx = null;
        this.source = null;
        this.filter = null;
        this.gainNode = null;
        this.modulator = null;
    }

    start() {
        try {
            // Create AudioContext (requires user gesture, which we have from button clicks)
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create 2 seconds of white noise buffer
            const bufferSize = 2 * this.ctx.sampleRate;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            // Generate white noise data
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            this.source = this.ctx.createBufferSource();
            this.source.buffer = buffer;
            this.source.loop = true;

            // Biquad Filter to mimic bandpass AM radio tuner static
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = 'bandpass';
            this.filter.frequency.value = 1000;
            this.filter.Q.value = 2.0;

            // Gain node to control volume
            this.gainNode = this.ctx.createGain();
            this.gainNode.gain.setValueAtTime(0.18, this.ctx.currentTime);

            // Connect nodes
            this.source.connect(this.filter);
            this.filter.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);

            this.source.start(0);

            // Tuner scanning modulation (oscillating frequency range)
            this.modulateTuner();
        } catch (e) {
            console.error("Web Audio API not supported or blocked:", e);
        }
    }

    modulateTuner() {
        let direction = 1;
        this.modulator = setInterval(() => {
            if (this.filter && this.ctx) {
                // Randomly shift frequency for crackle tuner sound
                const baseFreq = 950 + Math.random() * 150;
                this.filter.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
                
                // Add minor volume crackles
                const crackleVolume = 0.14 + Math.random() * 0.08;
                this.gainNode.gain.setValueAtTime(crackleVolume, this.ctx.currentTime);
            }
        }, 80);
    }

    stop() {
        if (this.modulator) clearInterval(this.modulator);
        
        if (this.gainNode && this.ctx) {
            // Smooth fade out static noise
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.ctx.currentTime);
            this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
        }

        setTimeout(() => {
            try {
                if (this.source) this.source.stop();
                if (this.ctx) this.ctx.close();
            } catch (err) {
                // Already stopped
            }
        }, 700);
    }
}

/* ==========================================================================
   YOUTUBE PLAYER API INTEGRATION
   ========================================================================== */
function initYoutubePlayer() {
    // Insert YouTube Player API script dynamically
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Global Callback required by YT IFrame API
window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('yt-player', {
        height: '1',
        width: '1',
        videoId: 'Cb6wuzOurPc',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'iv_load_policy': 3,
            'loop': 1,
            'playlist': 'Cb6wuzOurPc', // playlist parameter enables looping of a single video
            'rel': 0,
            'playsinline': 1,
            'enablejsapi': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
};

function onPlayerReady(event) {
    playerReady = true;
    btnVolumeContinue.disabled = false;
    btnVolumeContinue.innerHTML = `CONTINUE
        <svg class="icon-arrow" viewBox="0 0 24 24" width="18" height="18">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
}

function onPlayerStateChange(event) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === YT.PlayerState.PLAYING) {
        setPlaybackState(true);
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        setPlaybackState(false);
    }
}

/* ==========================================================================
   PLAYBACK CONTROL & UI SYNC
   ========================================================================== */
function setPlaybackState(play) {
    isPlaying = play;
    
    if (play) {
        // Spin record & drop tonearm
        vinylRecord.classList.add('spinning');
        tonearm.classList.add('playing');
        
        // Play/Pause button visual toggles
        btnPlayToggle.classList.add('play-active');
        btnPlayToggle.querySelector('.switch-label').textContent = "PAUSE";
        
        // Glow indicators active
        statusLed.className = 'led-light led-green';
        document.querySelectorAll('.tube-filament').forEach(tube => tube.classList.add('glowing'));
        
        // Trigger pointer line position shift micro-interaction
        frequencyPointer.style.top = `${30 + Math.random() * 40}%`;

        // Start slide autoplay
        startAutoplay();
    } else {
        // Pause record & lift tonearm
        vinylRecord.classList.remove('spinning');
        tonearm.classList.remove('playing');
        
        // Play/Pause button visual toggles
        btnPlayToggle.classList.remove('play-active');
        btnPlayToggle.querySelector('.switch-label').textContent = "PLAY";
        
        // Glow indicators resting
        statusLed.className = 'led-light led-red';
        document.querySelectorAll('.tube-filament').forEach(tube => tube.classList.remove('glowing'));
        
        // Reset pointer position
        frequencyPointer.style.top = '50%';

        // Stop slide autoplay
        stopAutoplay();
    }
}

function togglePlayback() {
    if (!playerReady || !player) return;

    if (isPlaying) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

/* ==========================================================================
   INTRO SETUP WAKEUPS & WARMUP TIMER
   ========================================================================== */
function startWarmupCountdown() {
    stepVolume.classList.remove('active');
    stepCountdown.classList.add('active');

    // Start static synth sound
    staticSynth = new RadioStaticSynth();
    staticSynth.start();

    // 2-second countdown
    let secondsLeft = 2;
    countdownNumber.textContent = secondsLeft;
    countdownTimerVal.textContent = secondsLeft;
    
    // Set circle progress animation
    circleProgress.style.strokeDashoffset = "0";

    const totalDuration = 2000;
    const intervalMs = 50;
    let elapsed = 0;

    countdownInterval = setInterval(() => {
        elapsed += intervalMs;
        
        // Calculate dashoffset progress
        const offset = (elapsed / totalDuration) * 283;
        circleProgress.style.strokeDashoffset = offset;

        // Visual timer ticks
        const currentSec = Math.ceil((totalDuration - elapsed) / 1000);
        if (currentSec !== secondsLeft && currentSec >= 0) {
            secondsLeft = currentSec;
            countdownNumber.textContent = secondsLeft;
            countdownTimerVal.textContent = secondsLeft;
        }

        if (elapsed >= totalDuration) {
            clearInterval(countdownInterval);
            finishWarmup();
        }
    }, intervalMs);
}

function finishWarmup() {
    // Fade out static
    if (staticSynth) {
        staticSynth.stop();
        staticSynth = null;
    }

    // Hide setup overlay
    setupOverlay.classList.remove('active');
    
    // Display dashboard
    mainDashboard.classList.add('visible');
    
    // Animate CRT screen turning on (delayed flicker trigger)
    setTimeout(() => {
        crtScreen.classList.remove('screen-off');
        
        // Start YouTube music playback
        if (playerReady && player) {
            player.playVideo();
        } else {
            // Fallback UI states
            setPlaybackState(true);
        }
    }, 400);
}

/* ==========================================================================
   POLAROID SLIDESHOW CAROUSEL LOGIC
   ========================================================================== */
function updateSlides() {
    const totalSlides = slides.length;
    
    slides.forEach((slide, index) => {
        slide.classList.remove('active', 'prev', 'next', 'hidden');
        
        if (index === currentSlideIndex) {
            slide.classList.add('active');
        } else if (index === (currentSlideIndex - 1 + totalSlides) % totalSlides) {
            slide.classList.add('prev');
        } else if (index === (currentSlideIndex + 1) % totalSlides) {
            slide.classList.add('next');
        } else {
            slide.classList.add('hidden');
        }
    });

    // Update dots indicator
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlideIndex);
    });
}

function nextSlide() {
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    updateSlides();
}

function prevSlide() {
    currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    updateSlides();
}

function startAutoplay() {
    stopAutoplay();
    autoplayInterval = setInterval(() => {
        nextSlide();
    }, 5500); // Shift Polaroid photos every 5.5 seconds
}

function stopAutoplay() {
    if (autoplayInterval) {
        clearInterval(autoplayInterval);
        autoplayInterval = null;
    }
}

/* ==========================================================================
   HIGH-PERFORMANCE CANVAS PARTICLE SYSTEM (FLOATING NOTES & EMBER SPARKS)
   ========================================================================== */
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
const maxParticles = 30;
const musicNoteChars = ['♫', '♪', '♬', '♩'];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Particle {
    constructor() {
        this.reset();
        // Stagger initial starting Y positions
        this.y = Math.random() * canvas.height;
    }

    reset() {
        // Emit from bottom-right (near dials) or bottom-left (near record)
        this.isNote = Math.random() > 0.45;
        
        if (this.isNote) {
            // Emitted from turntable or dials
            this.x = Math.random() > 0.5 ? (canvas.width * 0.15 + (Math.random() * 80 - 40)) : (canvas.width * 0.85 + (Math.random() * 80 - 40));
            this.char = musicNoteChars[Math.floor(Math.random() * musicNoteChars.length)];
            this.size = 14 + Math.random() * 12;
            this.color = `rgba(57, 255, 20, ${0.15 + Math.random() * 0.35})`; // Green tint
            this.vx = Math.random() * 1.2 - 0.6;
        } else {
            // Spark embers emitted from vacuum tubes panel area
            this.x = canvas.width * 0.8 + (Math.random() * 150 - 75);
            this.size = 2 + Math.random() * 4;
            this.color = `rgba(255, 106, 0, ${0.3 + Math.random() * 0.5})`; // Amber glow tint
            this.vx = Math.random() * 0.8 - 0.4;
        }

        this.y = canvas.height + 20;
        this.vy = -(0.8 + Math.random() * 1.5);
        this.alpha = 1;
        this.lifeDecay = 0.0015 + Math.random() * 0.002;
    }

    update() {
        // Slow float up
        this.x += this.vx;
        this.y += this.vy;
        
        // Add subtle horizontal sine sway
        if (this.isNote) {
            this.x += Math.sin(this.y * 0.015) * 0.3;
        }

        this.alpha -= this.lifeDecay;

        if (this.alpha <= 0 || this.y < -30) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        
        if (this.isNote) {
            ctx.fillStyle = this.color;
            ctx.font = `${this.size}px 'Share Tech Mono', sans-serif`;
            // Add subtle shadow glow to notes
            ctx.shadowColor = 'rgba(57, 255, 20, 0.4)';
            ctx.shadowBlur = 8;
            ctx.fillText(this.char, this.x, this.y);
        } else {
            // Draw sparks as glowing soft circles
            ctx.fillStyle = this.color;
            ctx.shadowColor = 'rgba(255, 106, 0, 0.6)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

function initParticles() {
    particles = [];
    for (let i = 0; i < maxParticles; i++) {
        particles.push(new Particle());
    }
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only update and show particles if playback is active
    particles.forEach(p => {
        if (isPlaying) {
            p.update();
        } else {
            // Fade out current particles slowly if paused
            p.alpha -= 0.01;
            if (p.alpha <= 0) p.alpha = 0;
            p.y += p.vy * 0.2; // drift slower
        }
        
        if (p.alpha > 0) {
            p.draw();
        }
    });
    
    requestAnimationFrame(animateParticles);
}

// Handle window resizing
window.addEventListener('resize', () => {
    resizeCanvas();
});

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */
function setupEventListeners() {
    
    // Step 1: Fullscreen Prompt
    btnFullscreenYes.addEventListener('click', () => {
        enterFullscreen();
        stepFullscreen.classList.remove('active');
        stepVolume.classList.add('active');
    });

    btnFullscreenNo.addEventListener('click', () => {
        stepFullscreen.classList.remove('active');
        stepVolume.classList.add('active');
    });

    // Step 2: Volume Warning Prompt
    btnVolumeContinue.addEventListener('click', () => {
        startWarmupCountdown();
    });

    // Play Toggle Power Button Switch
    btnPlayToggle.addEventListener('click', () => {
        togglePlayback();
    });

    // TV channel dial rotation micro-interaction
    const channelDial = document.querySelector('.dial-channel');
    let channelAngle = 0;
    channelDial.addEventListener('click', () => {
        channelAngle += 30;
        channelDial.style.transform = `rotate(${channelAngle}deg)`;
        
        // Cycle images on channel rotation
        nextSlide();
    });

    // TV volume dial rotation micro-interaction
    const volumeDial = document.querySelector('.dial-volume');
    let volumeAngle = 0;
    volumeDial.addEventListener('click', () => {
        volumeAngle += 45;
        volumeDial.style.transform = `rotate(${volumeAngle}deg)`;
        
        // Dynamically adjust youtube player volume states
        if (playerReady && player) {
            const currentVolume = player.getVolume();
            const newVolume = (currentVolume + 25) % 125; // 0, 25, 50, 75, 100
            player.setVolume(newVolume > 100 ? 50 : newVolume);
        }
    });

    // Slide Carousel clicks
    slides.forEach(slide => {
        slide.addEventListener('click', () => {
            const idx = parseInt(slide.dataset.index);
            if (idx !== currentSlideIndex) {
                currentSlideIndex = idx;
                updateSlides();
            }
        });
    });

    // Dot Indicators
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            currentSlideIndex = parseInt(dot.dataset.index);
            updateSlides();
        });
    });

    // Slider arrows
    btnPrevSlide.addEventListener('click', (e) => {
        e.stopPropagation();
        prevSlide();
    });

    btnNextSlide.addEventListener('click', (e) => {
        e.stopPropagation();
        nextSlide();
    });
}

/* ==========================================================================
   APP BOOTSTRAP
   ========================================================================== */
function init() {
    initializeDate();
    initYoutubePlayer();
    setupEventListeners();
    
    // Canvas particles setup
    resizeCanvas();
    initParticles();
    animateParticles();
    
    // Ensure button is disabled initially while loading YouTube frame
    btnVolumeContinue.disabled = true;
    btnVolumeContinue.textContent = "LOADING PLAYER...";
}

// Start app
window.addEventListener('DOMContentLoaded', init);
