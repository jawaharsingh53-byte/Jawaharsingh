// ===== Playful Father & Daughter Video Player Logic =====

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentTime = 0; // seconds
    let isPlaying = false;
    const duration = 30.0; // 30 second video
    let animationFrameId = null;
    let lastTime = 0;
    let lastActiveSceneId = -1;

    let soundEnabled = true;
    let voiceEnabled = true;
    let hotspotsEnabled = true;

    // Web Audio Synthesizer variables
    let audioCtx = null;
    let synthTimer = null;
    let chordIndex = 0;

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
    const hotspotPins = document.querySelectorAll('.hotspot-pin');

    // Scenes definitions
    const scenes = [
        {
            id: 1,
            start: 0,
            end: 6.0,
            text: "Good morning, sunshine! Let's build the tallest tower in the world... and CRASH! Down it goes!",
            element: document.getElementById('scene1')
        },
        {
            id: 2,
            start: 6.0,
            end: 12.0,
            text: "Off to the park we go! Wheee! Flying like an airplane high above the grass!",
            element: document.getElementById('scene2')
        },
        {
            id: 3,
            start: 12.0,
            end: 18.0,
            text: "Time for a messy masterpiece! A splash of blue here, some yellow there, and oops! Paint on your nose!",
            element: document.getElementById('scene3')
        },
        {
            id: 4,
            start: 18.0,
            end: 24.0,
            text: "Kitchen helpers reporting for duty! One scoop of flour, one chocolate chip... wait, where did the flour go?",
            element: document.getElementById('scene4')
        },
        {
            id: 5,
            start: 24.0,
            end: 30.0,
            text: "Soft stars are glowing. Cozy and warm, listening to a magical bedtime story. Sweet dreams, little one.",
            element: document.getElementById('scene5')
        }
    ];

    // --- Web Audio Synthesizer Setup (Playful Music Box) ---
    // A sweet glockenspiel sound with physical modeling (metal chime bar harmonics)
    function playChimeNote(frequency, timeOffset, durationSeconds, volume = 0.12) {
        if (!audioCtx || !soundEnabled || !isPlaying) return;

        try {
            const time = audioCtx.currentTime + timeOffset;

            // Primary fundamental frequency (sine wave for pure warmth)
            const osc1 = audioCtx.createOscillator();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(frequency, time);

            // High metallic harmonic (3.01 times frequency, triangle wave, quieter)
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(frequency * 3.012, time);

            // Sub harmonic (half frequency for bell bottom body)
            const osc3 = audioCtx.createOscillator();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(frequency / 2, time);

            // Separate gain nodes
            const gainFund = audioCtx.createGain();
            const gainHarm = audioCtx.createGain();
            const gainSub = audioCtx.createGain();

            // Combined output gain node
            const mainGain = audioCtx.createGain();

            // Connect nodes
            osc1.connect(gainFund);
            osc2.connect(gainHarm);
            osc3.connect(gainSub);

            gainFund.connect(mainGain);
            gainHarm.connect(mainGain);
            gainSub.connect(mainGain);

            mainGain.connect(audioCtx.destination);

            // Playful glockenspiel envelopes (very sharp attack, decay envelope)
            gainFund.gain.setValueAtTime(0, time);
            gainFund.gain.linearRampToValueAtTime(0.6, time + 0.005);
            gainFund.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds);

            gainHarm.gain.setValueAtTime(0, time);
            gainHarm.gain.linearRampToValueAtTime(0.25, time + 0.002);
            gainHarm.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds * 0.45);

            gainSub.gain.setValueAtTime(0, time);
            gainSub.gain.linearRampToValueAtTime(0.15, time + 0.02);
            gainSub.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds * 1.2);

            // Master Volume
            mainGain.gain.setValueAtTime(0, time);
            mainGain.gain.linearRampToValueAtTime(volume, time + 0.01);
            mainGain.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds * 1.2);

            // Start & stop oscillators
            osc1.start(time);
            osc2.start(time);
            osc3.start(time);

            osc1.stop(time + durationSeconds * 1.5);
            osc2.stop(time + durationSeconds * 0.8);
            osc3.stop(time + durationSeconds * 1.8);

        } catch (e) {
            console.error("Failed to synthesize chime note", e);
        }
    }

    // Playful music loop playing arpeggiated cute major progressions (C Major, F Major, G Major, C Major)
    function startMusicLoop() {
        if (synthTimer) clearInterval(synthTimer);

        // Chords frequencies (root, third, fifth, octave, tenth)
        const progressions = [
            // C Major (C4, E4, G4, C5, E5)
            [261.63, 329.63, 392.00, 523.25, 659.25],
            // F Major (F4, A4, C5, F5, A5)
            [349.23, 440.00, 523.25, 698.46, 880.00],
            // G Major (G4, B4, D5, G5, B5)
            [392.00, 493.88, 587.33, 783.99, 987.77],
            // C Major
            [261.63, 329.63, 392.00, 523.25, 659.25]
        ];

        let tick = 0;

        synthTimer = setInterval(() => {
            if (!isPlaying || !soundEnabled) return;

            // Every 1.6s play a soft arpeggio step
            const currentChord = progressions[chordIndex];
            
            // Plink-plank arpeggio notes
            if (tick % 4 === 0) {
                // Play root & octave together
                playChimeNote(currentChord[0], 0, 2.5, 0.12);
                playChimeNote(currentChord[3], 0.05, 1.8, 0.08);
            } else if (tick % 4 === 1) {
                // Play third
                playChimeNote(currentChord[1], 0, 2.0, 0.09);
            } else if (tick % 4 === 2) {
                // Play fifth & high tenth
                playChimeNote(currentChord[2], 0, 2.2, 0.09);
                playChimeNote(currentChord[4], 0.1, 1.6, 0.07);
            } else if (tick % 4 === 3) {
                // Play third/octave bridge
                playChimeNote(currentChord[1], 0, 1.5, 0.08);
                playChimeNote(currentChord[3], 0.2, 1.4, 0.07);
                
                // Advance to next chord in the progression for the next bar
                chordIndex = (chordIndex + 1) % progressions.length;
            }

            tick++;
        }, 800);
    }

    function initAudioContext() {
        if (audioCtx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
            startMusicLoop();
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    }

    // --- Web Speech API (Narration Voiceover) ---
    function speakCaption(text) {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;

        try {
            window.speechSynthesis.resume();
            window.speechSynthesis.cancel(); // cancel previous

            currentSpeechUtterance = new SpeechSynthesisUtterance(text);
            
            // Try to find a warm British or Google voice
            const voices = window.speechSynthesis.getVoices();
            let warmVoice = voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Natural')) ||
                            voices.find(v => v.lang.startsWith('en-US') && v.name.includes('Natural')) ||
                            voices.find(v => v.lang.startsWith('en-') && v.name.includes('Google')) ||
                            voices.find(v => v.lang.startsWith('en-'));
            
            if (warmVoice) {
                currentSpeechUtterance.voice = warmVoice;
            }

            currentSpeechUtterance.rate = 0.95;  // Slow, warm pacing
            currentSpeechUtterance.pitch = 1.15; // Cheerful, slightly higher pitch for playful storytelling
            currentSpeechUtterance.volume = 1.0;

            window.speechSynthesis.speak(currentSpeechUtterance);
        } catch (e) {
            console.error("SpeechSynthesis fail", e);
        }
    }

    // Ensure voices load
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }

    // --- Core Playback Controls ---
    function play() {
        if (isPlaying) return;

        isPlaying = true;
        playerOuter.classList.remove('paused');

        // Toggle buttons
        playPauseBtn.querySelector('.play-icon').classList.add('hidden');
        playPauseBtn.querySelector('.pause-icon').classList.remove('hidden');

        // Init Audio
        initAudioContext();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // Resume voiceover if paused mid-speech
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(updateFrame);
    }

    function pause() {
        if (!isPlaying) return;

        isPlaying = false;
        playerOuter.classList.add('paused');

        // Toggle buttons
        playPauseBtn.querySelector('.play-icon').classList.remove('hidden');
        playPauseBtn.querySelector('.pause-icon').classList.add('hidden');

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Cancel voice synthesis immediately
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        currentVoiceSceneIndex = -1; // Reset tracker so it reads again on resume

        updatePins();
    }

    function restart() {
        seekTo(0);
        if (isPlaying) {
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

    function updateFrame() {
        if (!isPlaying) return;

        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        currentTime += delta;

        // Loop playback boundary
        if (currentTime >= duration) {
            currentTime = 0;
            currentVoiceSceneIndex = -1;
            chordIndex = 0; // reset chords
        }

        timelineSlider.value = currentTime;
        updateTimeDisplays();
        updateFramesLogic(false);

        animationFrameId = requestAnimationFrame(updateFrame);
    }
    // Helper to calculate circular opacity transition centered on boundaries
    function getSceneOpacity(sceneIndex, t) {
        const sceneLen = 6.0;
        const M_i = sceneIndex * sceneLen + (sceneLen / 2); // center of scene
        const H = 0.6; // half transition duration (total 1.2s transition)
        
        let diff = t - M_i;
        // wrap diff to [-15, 15] for circular loop calculations
        if (diff > 15) diff -= 30;
        if (diff < -15) diff += 30;
        
        const absDiff = Math.abs(diff);
        const transitionStartDiff = (sceneLen / 2) - H; // 3.0 - 0.6 = 2.4
        const transitionEndDiff = (sceneLen / 2) + H;   // 3.0 + 0.6 = 3.6
        
        if (absDiff < transitionStartDiff) {
            return 1.0;
        } else if (absDiff < transitionEndDiff) {
            const p = (absDiff - transitionStartDiff) / (2 * H);
            return 1.0 - p;
        } else {
            return 0.0;
        }
    }

    // Timeline/Scene Syncing - Dynamic frame rendering loop
    function updateFramesLogic(forceVoiceReset = false) {
        let activeScene = null;
        let activeIndex = -1;

        for (let i = 0; i < scenes.length; i++) {
            if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
                activeScene = scenes[i];
                activeIndex = i;
                break;
            }
        }

        if (currentTime >= duration) {
            activeScene = scenes[scenes.length - 1];
            activeIndex = scenes.length - 1;
        }

        // 1. Find dominant and subdominant indices based on opacity
        let dominantIndex = 0;
        let dominantOpacity = -1;
        let subdominantIndex = -1;
        let subdominantOpacity = -1;

        scenes.forEach((scene, index) => {
            const opacity = getSceneOpacity(index, currentTime);
            if (opacity > dominantOpacity) {
                subdominantOpacity = dominantOpacity;
                subdominantIndex = dominantIndex;
                dominantOpacity = opacity;
                dominantIndex = index;
            } else if (opacity > subdominantOpacity) {
                subdominantOpacity = opacity;
                subdominantIndex = index;
            }
        });

        // 2. Render all scenes (opacity, z-index, scale, pan, rotation)
        scenes.forEach((scene, index) => {
            const opacity = getSceneOpacity(index, currentTime);
            
            // Stack dominant scene on top, subdominant underneath, others at bottom
            let zIndex = 1;
            if (index === dominantIndex) {
                zIndex = 3;
            } else if (index === subdominantIndex) {
                zIndex = 2;
            }
            
            scene.element.style.opacity = opacity;
            scene.element.style.zIndex = zIndex;
            scene.element.style.pointerEvents = opacity > 0.05 ? 'auto' : 'none';
            
            // Toggle classes for active/outgoing hooks (like CSS blur filter)
            if (index === activeIndex) {
                scene.element.classList.add('active');
                scene.element.classList.remove('outgoing');
            } else if (opacity > 0 && index !== activeIndex) {
                scene.element.classList.add('outgoing');
                scene.element.classList.remove('active');
            } else {
                scene.element.classList.remove('active');
                scene.element.classList.remove('outgoing');
            }

            // Set unique camera motions on the inner image wrapper
            const imgEl = scene.element.querySelector('.scene-image');
            if (imgEl) {
                if (opacity > 0) {
                    let t_rel = currentTime - scene.start;
                    if (t_rel < -15) t_rel += duration;
                    if (t_rel > 15) t_rel -= duration;
                    
                    const p = t_rel / 6.0; // Normalized position (-0.1 to 1.1 in transition window)
                    let transformStr = '';
                    
                    if (scene.id === 1) {
                        // Scene 1: Morning Playtime - Zooming In
                        const scale = 1.02 + p * 0.06;
                        transformStr = `scale(${scale})`;
                    } else if (scene.id === 2) {
                        // Scene 2: Park Adventure - Panning Right (Translating Left)
                        const scale = 1.06;
                        const tx = (0.5 - p) * 20; // +10px to -10px
                        transformStr = `scale(${scale}) translateX(${tx}px)`;
                    } else if (scene.id === 3) {
                        // Scene 3: Finger Painting - Zooming Out
                        const scale = 1.08 - p * 0.06;
                        transformStr = `scale(${scale})`;
                    } else if (scene.id === 4) {
                        // Scene 4: Flour Baking - Panning Up (Translating Down)
                        const scale = 1.06;
                        const ty = (p - 0.5) * 20; // -10px to +10px
                        transformStr = `scale(${scale}) translateY(${ty}px)`;
                    } else if (scene.id === 5) {
                        // Scene 5: Bedtime Story - Zooming In + Rotation
                        const scale = 1.02 + p * 0.06;
                        const rot = (p - 0.5) * 1.5; // -0.75deg to +0.75deg
                        transformStr = `scale(${scale}) rotate(${rot}deg)`;
                    }
                    imgEl.style.transform = transformStr;
                } else {
                    imgEl.style.transform = 'none';
                }
            }
        });

        if (activeScene) {
            lastActiveSceneId = activeScene.id;

            // 3. Update Subtitle
            if (subtitleText.innerText !== activeScene.text) {
                subtitleText.innerText = activeScene.text;
            }

            // 4. Audio Narration voice trigger
            if (voiceEnabled) {
                if (activeIndex !== currentVoiceSceneIndex || forceVoiceReset) {
                    currentVoiceSceneIndex = activeIndex;
                    speakCaption(activeScene.text);
                }
            } else {
                if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                }
            }
        }

        // Optimize pin updates: only run when transitioning scenes or when paused (e.g., scrubbing)
        if (activeIndex !== currentVoiceSceneIndex || !isPlaying) {
            updatePins();
        }
    }

    // Toggle interactive hotspot pins using cached hotspotPins
    function updatePins() {
        let activeSceneId = 1;
        for (let i = 0; i < scenes.length; i++) {
            if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
                activeSceneId = scenes[i].id;
                break;
            }
        }

        hotspotPins.forEach(pin => {
            if (hotspotsEnabled && pin.classList.contains(`scene${activeSceneId}-pin`)) {
                pin.classList.add('active-scene-pin');
            } else {
                pin.classList.remove('active-scene-pin');
            }
        });

        tooltipBox.classList.remove('visible');
    }

    // --- Interactive Hotspot hover event listeners ---
    hotspotPins.forEach(pin => {
        pin.addEventListener('mouseenter', () => {
            const title = pin.getAttribute('data-title');
            const desc = pin.getAttribute('data-desc');

            tooltipBox.querySelector('.tooltip-title').innerText = title;
            tooltipBox.querySelector('.tooltip-desc').innerText = desc;

            pin.style.zIndex = '15';
            tooltipBox.classList.add('visible');
        });

        pin.addEventListener('mouseleave', () => {
            pin.style.zIndex = 'inherit';
            tooltipBox.classList.remove('visible');
        });
    });

    // --- Control Events ---
    playPauseBtn.addEventListener('click', () => {
        if (isPlaying) pause(); else play();
    });

    restartBtn.addEventListener('click', restart);

    timelineSlider.addEventListener('input', (e) => {
        const targetTime = parseFloat(e.target.value);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        seekTo(targetTime);
    });

    timelineSlider.addEventListener('change', () => {
        if (isPlaying) {
            currentVoiceSceneIndex = -1;
            lastTime = performance.now();
        }
    });

    timelineSlider.addEventListener('mousemove', (e) => {
        const rect = timelineSlider.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, offsetX / rect.width));
        const hoverSecs = pct * duration;

        timelineHoverTime.style.left = `${pct * 100}%`;
        timelineHoverTime.innerText = formatTime(hoverSecs);
    });

    // Controls Auto-Hide
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

    // Sound (Music) Toggle
    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
            soundToggleBtn.querySelector('.sound-on-icon').classList.remove('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.add('hidden');
            soundToggleBtn.classList.remove('active-mode');
            initAudioContext();
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        } else {
            soundToggleBtn.querySelector('.sound-on-icon').classList.add('hidden');
            soundToggleBtn.querySelector('.sound-off-icon').classList.remove('hidden');
            soundToggleBtn.classList.add('active-mode');
        }
    });

    // Voice (Speech) Toggle
    voiceToggleBtn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        if (voiceEnabled) {
            voiceToggleBtn.querySelector('.voice-on-icon').classList.remove('hidden');
            voiceToggleBtn.querySelector('.voice-off-icon').classList.add('hidden');
            voiceToggleBtn.classList.remove('active-mode');
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

    // Hotspots (Pins) Toggle
    hotspotsToggleBtn.addEventListener('click', () => {
        hotspotsEnabled = !hotspotsEnabled;
        if (hotspotsEnabled) {
            hotspotsToggleBtn.classList.remove('active-mode');
        } else {
            hotspotsToggleBtn.classList.add('active-mode');
        }
        updatePins();
    });

    // Fullscreen Toggling
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            playerOuter.requestFullscreen().then(() => {
                fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.add('hidden');
                fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.remove('hidden');
            }).catch(err => {
                console.error("Error entering fullscreen", err);
            });
        } else {
            document.exitFullscreen().then(() => {
                fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.remove('hidden');
                fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.add('hidden');
            });
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            fullscreenBtn.querySelector('.fullscreen-enter-icon').classList.remove('hidden');
            fullscreenBtn.querySelector('.fullscreen-exit-icon').classList.add('hidden');
        }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (isPlaying) pause(); else play();
        } else if (e.key === 'r' || e.key === 'R') {
            restart();
        } else if (e.key === 'm' || e.key === 'M') {
            soundToggleBtn.click();
        } else if (e.key === 'v' || e.key === 'V') {
            voiceToggleBtn.click();
        } else if (e.key === 'f' || e.key === 'F') {
            fullscreenBtn.click();
        }
    });

    // --- Intro Screen Play Trigger ---
    introPlayBtn.addEventListener('click', () => {
        soundEnabled = introMusicToggle.checked;
        voiceEnabled = introVoiceToggle.checked;

        // Apply toggle states to buttons
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

        // Hide overlay screen
        introScreen.style.opacity = '0';
        setTimeout(() => {
            introScreen.classList.add('hidden');
            play();
        }, 500);
    });

    updateTimeDisplays();
});
