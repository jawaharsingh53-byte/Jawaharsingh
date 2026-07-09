// ===== Interactive Video Player Logic =====

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentTime = 0; // seconds
    let isPlaying = false;
    const duration = 50.0; // 50 second video
    let updateInterval = null;
    let lastTime = 0;

    let soundEnabled = true;
    let voiceEnabled = true;
    let hotspotsEnabled = true;

    // Web Audio Synthesizer variables
    let audioCtx = null;
    let droneOsc = null;
    let droneGain = null;
    let filterNode = null;
    let lfoOsc = null;
    let melodyTimer = null;

    // Speech synthesis tracking
    let currentSpeechUtterance = null;
    let currentVoiceSceneIndex = -1;

    // --- DOM Elements ---
    const playerOuter = document.getElementById('videoPlayerOuter');
    const viewport = document.getElementById('videoViewport');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const restartBtn = document.getElementById('restartBtn');
    const timelineSlider = document.getElementById('timelineSlider');
    const timelineHoverTime = document.getElementById('timelineHoverTime');
    const currentTimeText = document.getElementById('currentTime');
    const subtitleText = document.getElementById('subtitleText');
    const controlsPanel = document.getElementById('controlsPanel');

    // Controls buttons
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    const voiceToggleBtn = document.getElementById('voiceToggleBtn');
    const hotspotsToggleBtn = document.getElementById('hotspotsToggleBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    // Overlays
    const introScreen = document.getElementById('introScreen');
    const introPlayBtn = document.getElementById('introPlayBtn');
    const introMusicToggle = document.getElementById('introMusicToggle');
    const introVoiceToggle = document.getElementById('introVoiceToggle');
    const audioPrompt = document.getElementById('audioPrompt');
    const hotspotsLayer = document.getElementById('hotspotsLayer');
    const tooltipBox = document.getElementById('tooltipBox');

    // Scenes definitions
    const scenes = [
        {
            id: 1,
            start: 0,
            end: 10.0,
            text: "Chemical fertilizers feed the world, but at a devastating ecological cost. What if crops could feed themselves?",
            element: document.getElementById('scene1')
        },
        {
            id: 2,
            start: 10.0,
            end: 20.0,
            text: "Legumes possess a secret. They release molecular signals to attract soil bacteria, initiating a complex symbiosis.",
            element: document.getElementById('scene2')
        },
        {
            id: 3,
            start: 20.0,
            end: 30.0,
            text: "But phosphate availability acts as a gatekeeper. Low phosphate triggers PHR transcription factors to block nodulation master regulators.",
            element: document.getElementById('scene3')
        },
        {
            id: 4,
            start: 30.0,
            end: 40.0,
            text: "At Cambridge, we are using CRISPR-Cas9 genome editing to rewire these pathways in cowpea and soybean for maximum efficiency.",
            element: document.getElementById('scene4')
        },
        {
            id: 5,
            start: 40.0,
            end: 50.0,
            text: "Our goal: self-fertilizing crops that thrive in poor soils. Engineering the future of sustainable, nutrient-smart agriculture.",
            element: document.getElementById('scene5')
        }
    ];

    // --- Web Audio Synthesizer Setup ---
    function initSynth() {
        if (audioCtx) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();

            // Low Ambient Drone (Root Note: C2 - ~65.4Hz)
            droneOsc = audioCtx.createOscillator();
            droneOsc.type = 'triangle';
            droneOsc.frequency.setValueAtTime(65.41, audioCtx.currentTime); // C2

            // Second Oscillator for warmth (perfect fifth: G2 - ~98Hz)
            const harmonyOsc = audioCtx.createOscillator();
            harmonyOsc.type = 'sine';
            harmonyOsc.frequency.setValueAtTime(97.99, audioCtx.currentTime); // G2

            // Lowpass filter to keep it warm and subby
            filterNode = audioCtx.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(250, audioCtx.currentTime);
            filterNode.Q.setValueAtTime(5, audioCtx.currentTime);

            // Modulating LFO for gentle pulsation
            lfoOsc = audioCtx.createOscillator();
            lfoOsc.type = 'sine';
            lfoOsc.frequency.setValueAtTime(0.15, audioCtx.currentTime); // 0.15Hz (once every 6.6s)

            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(80, audioCtx.currentTime); // Modulate filter cutoff by 80Hz

            // Drone gain node
            droneGain = audioCtx.createGain();
            // Start silent
            droneGain.gain.setValueAtTime(0, audioCtx.currentTime);

            // Connect LFO modulation
            lfoOsc.connect(lfoGain);
            lfoGain.connect(filterNode.frequency);

            // Connect audio nodes
            droneOsc.connect(filterNode);
            harmonyOsc.connect(filterNode);
            filterNode.connect(droneGain);
            droneGain.connect(audioCtx.destination);

            // Start generators
            droneOsc.start();
            harmonyOsc.start();
            lfoOsc.start();

            // Start random high-note "molecular arpeggios" in the background
            startMelodyLoop();
        } catch (e) {
            console.error("Web Audio API not supported or failed to initialize", e);
        }
    }

    // Gentle random high bell notes to represent chemical signal interactions
    function playMelodyNote(freq, delay, duration) {
        if (!audioCtx || soundEnabled === false || !isPlaying) return;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        filter.Q.setValueAtTime(10, audioCtx.currentTime + delay);

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        // Soft envelope: attack
        gainNode.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + delay + 0.1);
        // Decay/Sustain
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
    }

    function startMelodyLoop() {
        if (melodyTimer) clearInterval(melodyTimer);

        // Sequence representing signal dialogues: Pentatonic scale in C major (C4, D4, E4, G4, A4, C5, E5)
        const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25];
        
        melodyTimer = setInterval(() => {
            if (isPlaying && soundEnabled) {
                // Randomly play 1 to 3 notes in a short sequence
                const numNotes = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numNotes; i++) {
                    const randomNote = notes[Math.floor(Math.random() * notes.length)];
                    const randomDelay = Math.random() * 1.5;
                    const randomDur = 1.5 + Math.random() * 2;
                    playMelodyNote(randomNote, randomDelay, randomDur);
                }
            }
        }, 3000);
    }

    function rampDroneVolume(targetVolume, durationMs) {
        if (!audioCtx || !droneGain) return;
        
        // If context is suspended, resume it
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const currentVal = droneGain.gain.value;
        droneGain.gain.cancelScheduledValues(audioCtx.currentTime);
        droneGain.gain.setValueAtTime(currentVal, audioCtx.currentTime);
        droneGain.gain.linearRampToValueAtTime(targetVolume, audioCtx.currentTime + (durationMs / 1000));
    }

    // --- Web Speech API (Narration Voice) ---
    function speakNarration(text) {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;

        try {
            // Ensure engine is not stuck in a paused state before speaking
            window.speechSynthesis.resume();
            window.speechSynthesis.cancel();

            currentSpeechUtterance = new SpeechSynthesisUtterance(text);
            
            // Try to find a high-quality English voice
            const voices = window.speechSynthesis.getVoices();
            let englishVoice = voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Natural')) ||
                               voices.find(v => v.lang.startsWith('en-') && v.name.includes('Google')) ||
                               voices.find(v => v.lang.startsWith('en-'));
            
            if (englishVoice) {
                currentSpeechUtterance.voice = englishVoice;
            }

            currentSpeechUtterance.rate = 0.95; // Slightly slower, academic pacing
            currentSpeechUtterance.pitch = 1.0;
            currentSpeechUtterance.volume = 1.0;

            currentSpeechUtterance.onerror = (e) => {
                console.error("SpeechSynthesisUtterance error", e);
            };

            window.speechSynthesis.speak(currentSpeechUtterance);
        } catch (e) {
            console.error("Failed to speak narration", e);
        }
    }

    // Force voice list loading in Chrome
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }

    // --- Video Core Player Controls ---
    function play() {
        if (isPlaying) return;
        
        isPlaying = true;
        playerOuter.classList.remove('paused');
        
        // Toggle play/pause buttons
        playPauseBtn.querySelector('.play-icon').classList.add('hidden');
        playPauseBtn.querySelector('.pause-icon').classList.remove('hidden');

        // Audio initialization
        initSynth();
        if (soundEnabled) {
            rampDroneVolume(0.2, 500); // 20% volume drone
        }

        // Resume Speech if paused mid-speech
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        // Loop controller
        lastTime = performance.now();
        updateInterval = setInterval(updateFrame, 50);
    }

    function pause() {
        if (!isPlaying) return;

        isPlaying = false;
        playerOuter.classList.add('paused');

        // Toggle buttons
        playPauseBtn.querySelector('.play-icon').classList.remove('hidden');
        playPauseBtn.querySelector('.pause-icon').classList.add('hidden');

        // Stop loop timer
        clearInterval(updateInterval);
        updateInterval = null;

        // Ramp down drone
        if (audioCtx) {
            rampDroneVolume(0.0001, 300);
        }

        // Cancel speech synthesis instead of pausing it to prevent global engine locks
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        currentVoiceSceneIndex = -1; // Reset scene voice tracker so resuming play speaks the line again

        // Update visual pins for active scene
        updatePins();
    }

    function restart() {
        seekTo(0);
        if (isPlaying) {
            // Cancel and play voiceover immediately
            currentVoiceSceneIndex = -1;
            updateFramesLogic(true);
        }
    }

    function seekTo(time) {
        currentTime = Math.max(0, Math.min(duration, time));
        timelineSlider.value = currentTime;
        updateTimeDisplays();
        updateFramesLogic(true);
    }

    // Format time: e.g. 14.5 -> "00:14"
    function formatTime(secs) {
        const minutes = Math.floor(secs / 60);
        const seconds = Math.floor(secs % 60);
        const displayMin = minutes < 10 ? '0' + minutes : minutes;
        const displaySec = seconds < 10 ? '0' + seconds : seconds;
        return `${displayMin}:${displaySec}`;
    }

    function updateTimeDisplays() {
        currentTimeText.innerText = formatTime(currentTime);
    }

    // --- Timeline / Scene Updating Engine ---
    function updateFrame() {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        currentTime += delta;

        // Loop boundaries
        if (currentTime >= duration) {
            currentTime = 0;
            currentVoiceSceneIndex = -1; // Reset speech synthesis triggers
        }

        timelineSlider.value = currentTime;
        updateTimeDisplays();
        updateFramesLogic(false);
    }

    // Main frame matching logic
    function updateFramesLogic(forceVoiceReset = false) {
        // Find current scene
        let activeScene = null;
        let activeIndex = -1;

        for (let i = 0; i < scenes.length; i++) {
            if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
                activeScene = scenes[i];
                activeIndex = i;
                break;
            }
        }

        // Fallback for exactly 30s
        if (currentTime >= duration) {
            activeScene = scenes[scenes.length - 1];
            activeIndex = scenes.length - 1;
        }

        if (activeScene) {
            // 1. Scene transitions
            scenes.forEach(scene => {
                if (scene.id === activeScene.id) {
                    if (!scene.element.classList.contains('active')) {
                        scene.element.classList.add('active');
                    }
                } else {
                    scene.element.classList.remove('active');
                }
            });

            // 2. Subtitles update
            if (subtitleText.innerText !== activeScene.text) {
                subtitleText.innerText = activeScene.text;
            }

            // 3. Speech Voiceover triggering
            if (voiceEnabled) {
                if (activeIndex !== currentVoiceSceneIndex || forceVoiceReset) {
                    currentVoiceSceneIndex = activeIndex;
                    speakNarration(activeScene.text);
                }
            } else {
                if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                }
            }
        }

        // Update pins if paused
        if (!isPlaying) {
            updatePins();
        }
    }

    // Update visibility of hotspot pins
    function updatePins() {
        // Get active scene ID
        let activeSceneId = 1;
        for (let i = 0; i < scenes.length; i++) {
            if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
                activeSceneId = scenes[i].id;
                break;
            }
        }

        // Toggle visibility classes on pins
        const allPins = document.querySelectorAll('.hotspot-pin');
        allPins.forEach(pin => {
            if (hotspotsEnabled && pin.classList.contains(`scene${activeSceneId}-pin`)) {
                pin.classList.add('active-scene-pin');
            } else {
                pin.classList.remove('active-scene-pin');
            }
        });

        // Hide tooltip box on update
        tooltipBox.classList.remove('visible');
    }

    // --- Event Listeners ---

    // Play/Pause actions
    playPauseBtn.addEventListener('click', () => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    });

    restartBtn.addEventListener('click', restart);

    // Timeline Drag / Scrubbing
    timelineSlider.addEventListener('input', (e) => {
        const targetTime = parseFloat(e.target.value);
        
        // Cancel speech immediately so scrub is responsive
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        
        seekTo(targetTime);
    });

    timelineSlider.addEventListener('change', () => {
        if (isPlaying) {
            // Force reset of voice triggers for the new seek position
            currentVoiceSceneIndex = -1;
            lastTime = performance.now();
        }
    });

    // Timeline hover time indicator
    timelineSlider.addEventListener('mousemove', (e) => {
        const rect = timelineSlider.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, offsetX / rect.width));
        const hoverSecs = pct * duration;
        
        timelineHoverTime.style.left = `${pct * 100}%`;
        timelineHoverTime.innerText = formatTime(hoverSecs);
    });

    // Controls panels auto-hide on mouse idle during play
    let controlsTimeout = null;
    function resetControlsTimer() {
        controlsPanel.classList.remove('controls-hidden');
        document.body.style.cursor = 'default';
        
        if (controlsTimeout) clearTimeout(controlsTimeout);
        
        if (isPlaying) {
            controlsTimeout = setTimeout(() => {
                controlsPanel.classList.add('controls-hidden');
                document.body.style.cursor = 'none';
            }, 3000);
        }
    }

    playerOuter.addEventListener('mousemove', resetControlsTimer);
    playerOuter.addEventListener('mouseleave', () => {
        if (isPlaying) {
            controlsPanel.classList.add('controls-hidden');
        }
    });

    // Sound toggle buttons
    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
            soundToggleBtn.querySelector('.sound-on-icon').classList.remove('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.add('hidden');
            soundToggleBtn.classList.remove('active-mode');
            if (isPlaying) {
                rampDroneVolume(0.2, 300);
            }
        } else {
            soundToggleBtn.querySelector('.sound-on-icon').classList.add('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.remove('hidden');
            soundToggleBtn.classList.add('active-mode');
            rampDroneVolume(0.0001, 200);
        }
    });

    // Voice Toggle
    voiceToggleBtn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        if (voiceEnabled) {
            voiceToggleBtn.querySelector('.voice-on-icon').classList.remove('hidden');
            voiceToggleBtn.querySelector('.voice-off-icon').classList.add('hidden');
            voiceToggleBtn.classList.remove('active-mode');
            // Force replay voice line
            currentVoiceSceneIndex = -1;
            updateFramesLogic(true);
        } else {
            voiceToggleBtn.querySelector('.voice-on-icon').classList.add('hidden');
            voiceToggleBtn.querySelector('.voice-off-icon').classList.remove('hidden');
            voiceToggleBtn.classList.add('active-mode');
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }
    });

    // Hotspots Toggle
    hotspotsToggleBtn.addEventListener('click', () => {
        hotspotsEnabled = !hotspotsEnabled;
        if (hotspotsEnabled) {
            hotspotsToggleBtn.classList.remove('active-mode');
        } else {
            hotspotsToggleBtn.classList.add('active-mode');
        }
        updatePins();
    });

    // Fullscreen toggling
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            playerOuter.requestFullscreen().then(() => {
                fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.add('hidden');
                fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.remove('hidden');
            }).catch(err => {
                console.error("Error enabling fullscreen", err);
            });
        } else {
            document.exitFullscreen().then(() => {
                fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.remove('hidden');
                fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.add('hidden');
            });
        }
    });

    // Handle escape key or native changes exiting fullscreen
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.remove('hidden');
            fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.add('hidden');
        }
    });

    // Keyboard controls (Space for play/pause, R to restart, M to mute, F for fullscreen)
    document.addEventListener('keydown', (e) => {
        // Only trigger if focus is not on inputs
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (isPlaying) pause(); else play();
        } else if (e.key === 'r' || e.key === 'R') {
            restart();
        } else if (e.key === 'm' || e.key === 'M') {
            soundToggleBtn.click();
        } else if (e.key === 'f' || e.key === 'F') {
            fullscreenBtn.click();
        }
    });

    // --- Interactive Hotspots Popups ---
    const hotspotPins = document.querySelectorAll('.hotspot-pin');
    hotspotPins.forEach(pin => {
        pin.addEventListener('mouseenter', (e) => {
            const title = pin.getAttribute('data-title');
            const desc = pin.getAttribute('data-desc');

            tooltipBox.querySelector('.tooltip-title').innerText = title;
            tooltipBox.querySelector('.tooltip-desc').innerText = desc;
            
            // Highlight pin
            pin.style.zIndex = '15';

            // Show tooltip card
            tooltipBox.classList.add('visible');
        });

        pin.addEventListener('mouseleave', () => {
            pin.style.zIndex = 'inherit';
            tooltipBox.classList.remove('visible');
        });
    });

    // --- Intro Screen Overlay Start ---
    introPlayBtn.addEventListener('click', () => {
        // Get intro checkbox configurations
        soundEnabled = introMusicToggle.checked;
        voiceEnabled = introVoiceToggle.checked;

        // Apply toggle states to control buttons
        if (soundEnabled) {
            soundToggleBtn.querySelector('.sound-on-icon').classList.remove('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.add('hidden');
            soundToggleBtn.classList.remove('active-mode');
        } else {
            soundToggleBtn.querySelector('.sound-on-icon').classList.add('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.remove('hidden');
            soundToggleBtn.classList.add('active-mode');
        }

        if (voiceEnabled) {
            voiceToggleBtn.querySelector('.voice-on-icon').classList.remove('hidden');
            voiceToggleBtn.querySelector('.voice-off-icon').classList.add('hidden');
            voiceToggleBtn.classList.remove('active-mode');
        } else {
            voiceToggleBtn.querySelector('.voice-on-icon').classList.add('hidden');
            voiceToggleBtn.querySelector('.voice-off-icon').classList.remove('hidden');
            voiceToggleBtn.classList.add('active-mode');
        }

        // Fade out overlay
        introScreen.style.opacity = '0';
        setTimeout(() => {
            introScreen.classList.add('hidden');
            // Play presentation
            play();
        }, 500);
    });

    // Initial setup calls
    updateTimeDisplays();
});
