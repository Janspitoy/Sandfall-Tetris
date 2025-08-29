const INTERSTITIAL_ID_ANDROID = 'ca-app-pub-4411114348896099/8213724795';
let interstitial;

// --- Переменные для управления рекламой ---
let lastAdTimestamp = 0;
const AD_COOLDOWN_MINUTES = 5;
const AD_COOLDOWN_MS = AD_COOLDOWN_MINUTES * 60 * 1000;
const FIRST_AD_SESSION_DELAY_MINUTES = 3;
const FIRST_AD_SESSION_DELAY_MS = FIRST_AD_SESSION_DELAY_MINUTES * 60 * 1000;
let adInProgress = false;
let isFirstSessionEver = false;
let sessionStartTime = 0;
let hasShownFirstAdOfSession = false;


document.addEventListener('deviceready', async () => {
  if (!window.admob) {
    return;
  }

  interstitial = new admob.InterstitialAd({
    adUnitId: INTERSTITIAL_ID_ANDROID,
  });
  try {
    await interstitial.load();
  } catch (err) {
    console.warn('Interstitial initial load failed:', err);
  }


  // --- Observer для Game Over (без изменений) ---
  const gameOverEl = document.getElementById('gameOver');
  const observer = new MutationObserver(async (mutations) => {
    for (let mutation of mutations) {
      if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
        const visible = gameOverEl.style.display !== 'none' && !gameOverEl.classList.contains('hidden');
        if (visible) {
          setTimeout(() => {
            handleGameOverAdFlow(gameOverEl);
          }, 1);
        }
      }
    }
  });
  observer.observe(gameOverEl, { attributes: true, attributeFilter: ['style', 'class'] });
});

// ====== Константы и данные ======
const BLOCK_W = 8, BLOCK_H = 16;
const PPB = 5;
const PIXEL = 2;
const SAND_W = BLOCK_W * PPB;
const SAND_H = BLOCK_H * PPB;

const PALETTE = [
    [231, 76, 60],
    [46, 204, 113],
    [52, 152, 219],
    [241, 196, 15],
    [155, 89, 182],
    [230, 126, 34],
    [26, 188, 156],
];

const TETROMINOES = [
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[0,1,1],[1,1,0]],
    [[1,1,0],[0,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
];

let canvas, ctx, nextCanvas, nextCtx;
let grid = [];
let activePiece = null;
let nextPiece = null;
let score = 0, level = 1, removedParticlesTotal = 0;
let fallTimer = 0;
let fastDrop = false;
let gameOver = false;
let paused = false;
let lastTime = 0;
let difficultyLevel = 1;
let soundOn = true;
let musicOn = true;
let vibrationOn = true;
let audioContext;
let music, soundEffects = {};
let isMusicPlaying = false;
let musicSource = null;
let lastSwipeTime = 0;
let swipeCooldown = 200;
let startX = 0, startY = 0;
let gameArea;
let countdown = 0;
let lastCountdownTime = 0;
let audioUnlocked = false;
let clearHighscoresOn = false;
let sfxGainNode = null;
let flickerAnimations = [];
let pieceJustLocked = false; // <-- NEW VARIABLE FOR COMBO LOGIC
let hasSwipedHorizontally = false; // <-- ДОБАВЬТЕ ЭТУ СТРОКУ
let lastDownPressTime = 0;          // <-- ДОБАВЬТЕ ЭТУ СТРОКУ
const DOUBLE_TAP_THRESHOLD = 250; // <-- И ЭТУ (250 мс)
let isSandFalling = false;    // Флаг, что песок в процессе падения
let isSandDirty = true;       // Флаг, что песок нужно перерисовать в буфер
let sandCanvas, sandCtx;      // Наш скрытый холст-"черновик"

let pieceLockState = {
    justLocked: false,
    clearedThisTurn: false
};


let chainReactionCounter = 0; // Счетчик для цепной реакции в рамках одного хода

// Game state flag
let comboCounter = 0; // Счетчик для комбо

let inGame = false;


// DOM элементы
const mainMenuScreen = document.getElementById('mainMenuScreen');
const settingsScreen = document.getElementById('settingsScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameContainer = document.getElementById('gameContainer');

const startGameBtn = document.getElementById('startGameBtn');
const settingsBtn = document.getElementById('settingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const backToMainFromSettingsBtn = document.getElementById('backToMainFromSettings');
const musicToggle = document.getElementById('musicToggle');
const soundToggle = document.getElementById('soundToggle');
const vibrationToggle = document.getElementById('vibrationToggle');
const clearHighscoresToggle = document.getElementById('clearHighscoresToggle');

const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const newGameBtn = document.getElementById('newGameBtn');
const exitToMainBtn = document.getElementById('exitToMainBtn');
const restartBtn = document.getElementById('restartBtn');
const exitFromGameOverBtn = document.getElementById('exitFromGameOverBtn');
const highscoresList = document.getElementById('highscoresList');
const easyBtn = document.getElementById('easyBtn');
const mediumBtn = document.getElementById('mediumBtn');
const hardBtn = document.getElementById('hardBtn');

// ====== Аудио ======
function createAudioContext() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

async function loadAudio(url) {
    if (!audioContext) createAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

async function initAudio() {
    createAudioContext();

    if (!sfxGainNode) {
        sfxGainNode = audioContext.createGain();
        sfxGainNode.connect(audioContext.destination);
    }
    sfxGainNode.gain.value = soundOn ? 0.65 : 0;

    try {
        music = await loadAudio('audio/music.mp3');
        soundEffects.fall = await loadAudio('audio/fall.wav');
        soundEffects.clear = await loadAudio('audio/clear.wav');
        soundEffects.rotate = await loadAudio('audio/rotate.wav');
        soundEffects.gameover = await loadAudio('audio/gameover.wav');

        // ---> ВОТ СТРОКА, КОТОРУЮ НУЖНО ДОБАВИТЬ <---
        soundEffects.click = await loadAudio('audio/button_click.mp3');

    } catch (error) {
        console.log('Audio files not found, continuing without audio');
    }
}

function playMusic(buffer) {
    if (isMusicPlaying || !musicOn || !buffer) return;
    isMusicPlaying = true;
    musicSource = audioContext.createBufferSource();
    musicSource.buffer = buffer;
    musicSource.loop = true;
    musicSource.connect(audioContext.destination);
    musicSource.start(0);
}

function stopMusic() {
    if (!isMusicPlaying) return;
    isMusicPlaying = false;
    if (musicSource) {
        try { musicSource.stop(); } catch(_) {}
        musicSource = null;
    }
}

function playSound(buffer) {
    if (!soundOn || !buffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    if (sfxGainNode) {
        source.connect(sfxGainNode);
    } else {
        source.connect(audioContext.destination);
    }
    source.start(0);
}

// ====== Cordova события ======
function onDeviceReady() {
    console.log("Cordova готова");

    document.addEventListener('pause', () => {
        console.log("Приложение на паузе");
        stopMusic();
    }, false);

    document.addEventListener('resume', () => {
        console.log("Приложение возобновлено");
        if (musicOn && inGame && !paused && !gameOver) {
            playMusic(music);
        }
    }, false);

    document.addEventListener('backbutton', (e) => {
        e.preventDefault();
        if (inGame && !gameOver) {
            togglePause();
        }
    }, false);

    window.addEventListener('beforeunload', () => {
        stopMusic();
    });
}

function playVibration() {
    if (vibrationOn && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(100);
    }
}

// --- Сохранение, загрузка и удаление highscores ---
function getHighscores() {
    return new Promise(resolve => {
        if (window.NativeStorage) {
            NativeStorage.getItem('sandfallHighscores',
                (obj) => resolve(obj || []),
                () => resolve([])
            );
        } else {
            const highscores = localStorage.getItem('sandfallHighscores');
            resolve(highscores ? JSON.parse(highscores) : []);
        }
    });
}

function saveHighscore(score) {
    getHighscores().then(highscores => {
        highscores.push({ score, date: new Date().toLocaleDateString() });
        highscores.sort((a, b) => b.score - a.score);
        const topScores = highscores.slice(0, 10);
        if (window.NativeStorage) {
            NativeStorage.setItem('sandfallHighscores', topScores,
                () => console.log('Highscores saved to NativeStorage'),
                (error) => console.error('Error saving highscores:', error)
            );
        } else {
            localStorage.setItem('sandfallHighscores', JSON.stringify(topScores));
        }
    });
}

async function displayHighscores() {
    const highscores = await getHighscores();
    highscoresList.innerHTML = '';

    if (highscores.length === 0) {
        highscoresList.innerHTML = '<p style="text-align:center; padding: 10px;">No records yet.</p>';
        return;
    }

    const ol = document.createElement('ol');
    ol.style.margin = '0';
    ol.style.padding = '0';
    ol.style.listStyle = 'none';

    highscores.forEach(h => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '6px 8px';
        li.style.borderBottom = '2px solid rgba(0,0,0,0.1)';

        const leftSpan = document.createElement('span');
        leftSpan.textContent = `${h.score} points`;

        const rightSpan = document.createElement('span');
        rightSpan.textContent = h.date;
        rightSpan.style.opacity = '0.95';
        rightSpan.style.fontSize = '1em';

        li.appendChild(leftSpan);
        li.appendChild(rightSpan);
        ol.appendChild(li);
    });

    highscoresList.appendChild(ol);
}

async function clearHighscores() {
    if (window.NativeStorage) {
        NativeStorage.remove('sandfallHighscores',
            () => {
                console.log('Highscores cleared from NativeStorage');
                displayHighscores();
            },
            (error) => console.error('Error clearing highscores:', error)
        );
    } else {
        localStorage.removeItem('sandfallHighscores');
        displayHighscores();
    }
}

// --- Сохранение и загрузка настроек ---
function saveSettings() {
    const settings = {
        musicOn,
        soundOn,
        vibrationOn,
        difficultyLevel
    };

    if (window.NativeStorage) {
        NativeStorage.setItem('sandfallSettings', settings,
            () => console.log('Settings saved to NativeStorage'),
            (error) => console.error('Error saving settings:', error)
        );
    } else {
        localStorage.setItem('sandfallSettings', JSON.stringify(settings));
    }
}

async function loadSettings() {
    return new Promise(resolve => {
        if (window.NativeStorage) {
            NativeStorage.getItem('sandfallSettings',
                (settings) => {
                    if (settings) {
                        musicOn = settings.musicOn !== undefined ? settings.musicOn : true;
                        soundOn = settings.soundOn !== undefined ? settings.soundOn : true;
                        vibrationOn = settings.vibrationOn !== undefined ? settings.vibrationOn : true;
                        difficultyLevel = settings.difficultyLevel || 1;
                    }
                    resolve();
                },
                () => resolve()
            );
        } else {
            const settings = JSON.parse(localStorage.getItem('sandfallSettings'));
            if (settings) {
                musicOn = settings.musicOn !== undefined ? settings.musicOn : true;
                soundOn = settings.soundOn !== undefined ? settings.soundOn : true;
                vibrationOn = settings.vibrationOn !== undefined ? settings.vibrationOn : true;
                difficultyLevel = settings.difficultyLevel || 1;
            }
            resolve();
        }
    });
}

function applySettingsToUI() {
    musicToggle.classList.toggle('on', musicOn);
    soundToggle.classList.toggle('on', soundOn);
    vibrationToggle.classList.toggle('on', vibrationOn);

    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.level) === difficultyLevel) {
            btn.classList.add('active');
        }
    });

    if (sfxGainNode) {
        sfxGainNode.gain.value = soundOn ? 0.5 * 1.3 : 0;
    }
}

function random(arr) { return Math.floor(Math.random() * arr.length) >= 0 ? arr[Math.floor(Math.random() * arr.length)] : arr[0]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rotateMatrixCW(mat) {
    const rows = mat.length, cols = mat[0].length;
    const res = Array.from({length: cols}, () => []);
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            res[i][j] = mat[rows - 1 - j][i];
        }
    }
    return res;
}

function initGrid() {
    grid = Array.from({length: SAND_H}, () => Array.from({length: SAND_W}, () => null));
}

function isValidPos(x,y) { return x >= 0 && x < SAND_W && y >= 0 && y < SAND_H; }
function getCell(x,y) { if (isValidPos(x,y)) return grid[y][x]; return null; }
function setCell(x,y,particle) { if (isValidPos(x,y)) grid[y][x] = particle; }

function anyInRegion(x0, y0, w, h) {
    const x1 = clamp(x0 + w, 0, SAND_W);
    const y1 = clamp(y0 + h, 0, SAND_H);
    x0 = clamp(x0, 0, SAND_W);
    y0 = clamp(y0, 0, SAND_H);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (grid[y][x] !== null) return true;
        }
    }
    return false;
}

function fillRegion(x0,y0,w,h,color) {
    const x1 = clamp(x0 + w, 0, SAND_W);
    const y1 = clamp(y0 + h, 0, SAND_H);
    x0 = clamp(x0, 0, SAND_W);
    y0 = clamp(y0, 0, SAND_H);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (grid[y][x] === null) grid[y][x] = { color };
        }
    }
}

function updateSand() {
    let moved = false;
    for (let y = SAND_H - 2; y >= 0; y--) {
        for (let x = 0; x < SAND_W; x++) {
            const particle = grid[y][x];
            if (!particle) continue;
            if (grid[y+1] && grid[y+1][x] === null) {
                grid[y][x] = null;
                grid[y+1][x] = particle;
                moved = true;
                continue;
            }
            const dirs = Math.random() < 0.5 ? [[-1,1],[1,1]] : [[1,1],[-1,1]];
            for (const [dx,dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < SAND_W && ny < SAND_H && grid[ny][nx] === null) {
                    grid[y][x] = null;
                    grid[ny][nx] = particle;
                    moved = true;
                    break;
                }
            }
        }
    }
    if (moved) isSandDirty = true;
    return moved;
}

function findBridges() {
    const toDelete = new Set();
    const leftColors = new Set();
    const rightColors = new Set();

    for (let y = 0; y < SAND_H; y++) {
        if (grid[y][0] !== null) leftColors.add(JSON.stringify(grid[y][0].color));
        if (grid[y][SAND_W-1] !== null) rightColors.add(JSON.stringify(grid[y][SAND_W-1].color));
    }

    const candidateColors = [...leftColors].filter(c => rightColors.has(c));
    if (candidateColors.length === 0) return toDelete;

    for (const colorStr of candidateColors) {
        const visited = Array.from({length:SAND_H}, () => Array.from({length:SAND_W}, () => false));
        const starts = [];
        for (let y = 0; y < SAND_H; y++) {
            if (grid[y][0] !== null && JSON.stringify(grid[y][0].color) === colorStr) starts.push([0,y]);
        }

        for (const [sx,sy] of starts) {
            if (visited[sy][sx]) continue;
            const queue = [[sx,sy]];
            visited[sy][sx] = true;
            const component = [];
            let touchesRight = false;
            while (queue.length) {
                const [x,y] = queue.shift();
                component.push([x,y]);
                if (x === SAND_W - 1) touchesRight = true;
                for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nx = x+dx, ny = y+dy;
                    if (isValidPos(nx,ny) && !visited[ny][nx]) {
                        const cell = grid[ny][nx];
                        if (cell !== null && JSON.stringify(cell.color) === colorStr) {
                            visited[ny][nx] = true;
                            queue.push([nx,ny]);
                        }
                    }
                }
            }
            if (touchesRight) component.forEach(([x,y]) => toDelete.add(`${x},${y}`));
        }
    }
    return toDelete;
}

function clearCells(coordSet) {
    let count = 0;
    coordSet.forEach(str => {
        const [x,y] = str.split(',').map(Number);
        if (grid[y] && grid[y][x] !== null) {
            grid[y][x] = null;
            count++;
        }
    });
    return count;
}

class Piece {
    constructor(color = null) {
        this.shape = random(TETROMINOES).map(row => row.slice());
        this.color = color || random(PALETTE);
        this.x = Math.floor(BLOCK_W/2) - Math.floor(this.shape[0].length/2);
        this.y = 0;
    }

    getBlocks() {
        const blocks = [];
        for (let dy = 0; dy < this.shape.length; dy++) {
            for (let dx = 0; dx < this.shape[dy].length; dx++) {
                if (this.shape[dy][dx]) blocks.push([this.x + dx, this.y + dy]);
            }
        }
        return blocks;
    }

    _blocksForShape(shape, x, y) {
        const blocks = [];
        for (let dy = 0; dy < shape.length; dy++) {
            for (let dx = 0; dx < shape[dy].length; dx++) {
                if (shape[dy][dx]) blocks.push([x + dx, y + dy]);
            }
        }
        return blocks;
    }

    _regionCollides(bx, by) {
        const x0 = bx * PPB;
        const y0 = by * PPB;
        return anyInRegion(x0, y0, PPB, PPB);
    }

    _canPlaceShape(shape, x, y) {
        if (x < 0 || y < 0 || x + shape[0].length > BLOCK_W || y + shape.length > BLOCK_H) return false;
        for (const [bx,by] of this._blocksForShape(shape,x,y)) {
            if (this._regionCollides(bx,by)) return false;
        }
        return true;
    }

    tryMove(dx, dy) {
        if (gameOver || paused) return false;
        const nx = this.x + dx, ny = this.y + dy;
        if (nx < 0 || ny < 0 || nx + this.shape[0].length > BLOCK_W || ny + this.shape.length > BLOCK_H) return false;
        for (const [bx,by] of this._blocksForShape(this.shape, nx, ny)) {
            if (this._regionCollides(bx,by)) return false;
        }
        this.x = nx; this.y = ny;
        // playVibration(); // *** ИЗМЕНЕНИЕ: Удалено отсюда для более точного контроля
        if (dx !== 0) {
            playSound(soundEffects.rotate);
        }
        return true;
    }

    tryRotate() {
        if (gameOver || paused) return false;
        const rotated = rotateMatrixCW(this.shape);
        if (this._canPlaceShape(rotated, this.x, this.y)) {
            this.shape = rotated;
            playVibration();
            playSound(soundEffects.rotate);
            return true;
        }
        for (const kick of [-1,1,-2,2]) {
            if (this._canPlaceShape(rotated, this.x + kick, this.y)) {
                this.x += kick; this.shape = rotated;
                playVibration();
                playSound(soundEffects.rotate);
                return true;
            }
        }
        return false;
    }

    lockToSand() {
        for (const [bx,by] of this.getBlocks()) {
            fillRegion(bx * PPB, by * PPB, PPB, PPB, this.color);
        }
        playSound(soundEffects.fall);
        playVibration(); // *** ИЗМЕНЕНИЕ: Добавлена вибрация при фиксации фигуры
        isSandFalling = true;
        isSandDirty = true;
    }
}

// ===== Игровая логика =====
function getCurrentFallInterval() {
    const base = Math.max(0.05, 0.8 * Math.pow(0.92, level - 1));
    return Math.max(0.02, base * (fastDrop ? 0.15 : 1.0));
}

function spawnPiece() {
    chainReactionCounter = 0;
    console.log(`--- НОВАЯ ФИГУРА --- Счётчик сброшен на: ${chainReactionCounter}`);


    activePiece = nextPiece;
    nextPiece = new Piece();
    if (activePiece && !activePiece._canPlaceShape(activePiece.shape, activePiece.x, activePiece.y)) {
        gameOver = true;
    }
}

function update(dt) {
    if (gameOver || paused) return;

    if (!activePiece && !isSandFalling) {
        spawnPiece();
    }

    if (activePiece) {
        fallTimer += dt;
        if (fallTimer >= getCurrentFallInterval()) {
            fallTimer = 0;
            if (!activePiece.tryMove(0, 1)) {
                console.log('--- ФИГУРА ЗАБЛОКИРОВАНА ---');
                activePiece.lockToSand();
                activePiece = null;
                chainReactionCounter = 0;
            }
        }
    }

    if (isSandFalling) {
        const sandMoved = updateSand();
        if (!sandMoved) {
            isSandFalling = false;
            const bridgeCells = findBridges();
            if (bridgeCells.size > 0) {
                chainReactionCounter++;
                console.log(`%c+++ ЛИНИЯ ОЧИЩЕНА! Счётчик стал: ${chainReactionCounter}`, 'color: blue;');

                const removed = clearCells(bridgeCells);
                isSandDirty = true;
                bridgeCells.forEach(coordStr => {
                    const [x, y] = coordStr.split(',').map(Number);
                    flickerAnimations.push({ x: x, y: y, lifetime: 0.25, maxLifetime: 0.25 });
                });
                let mult = (removed >= 200) ? 1.2 : 1.0;
                if (removed >= 500) mult = 1.5;
                if (removed >= 1000) mult = 2.0;
                let gained = Math.floor(removed * mult);
                if (chainReactionCounter > 1) {
                    gained *= chainReactionCounter;
                    showComboAnimation(chainReactionCounter);
                }
                score += gained;
                removedParticlesTotal += removed;
                level = difficultyLevel + Math.floor(removedParticlesTotal / 500);
                updateUI();
                playVibration();
                playSound(soundEffects.clear);
                isSandFalling = true;
            }
        }
    }
}

function showComboAnimation(comboCount) {
    console.log(`%c!!! ПОКАЗ КОМБО !!! Счётчик: ${comboCount}`, 'color: red; font-weight: bold;');
    const comboEl = document.getElementById('comboText');
    if (!comboEl) return;
    comboEl.textContent = `COMBO x${comboCount}!`;
    comboEl.classList.remove('animate');
    void comboEl.offsetWidth;
    comboEl.classList.add('animate');
}

function drawFlicker() {
    if (flickerAnimations.length === 0) return;

    flickerAnimations.forEach(p => {
        const progress = p.lifetime / p.maxLifetime; // От 1 до 0

        const flickerColor = (Math.floor(Date.now() / 50) % 2 === 0)
            ? 'rgba(255, 255, 255, 0.9)'
            : 'rgba(255, 255, 150, 0.9)';

        ctx.fillStyle = flickerColor;

        ctx.globalAlpha = progress;

        ctx.fillRect(p.x * PIXEL, p.y * PIXEL, PIXEL, PIXEL);
    });

    ctx.globalAlpha = 1.0;
}

function updateFlicker(dt) {
    for (let i = flickerAnimations.length - 1; i >= 0; i--) {
        const p = flickerAnimations[i];
        p.lifetime -= dt;
        if (p.lifetime <= 0) {
            flickerAnimations.splice(i, 1);
        }
    }
}

function updateUI() {
    const s = document.getElementById('score');
    const l = document.getElementById('level');
    const r = document.getElementById('removed');
    const fs = document.getElementById('finalScore');
    if (s) s.textContent = score;
    if (l) l.textContent = level;
    if (r) r.textContent = removedParticlesTotal;
    if (fs) fs.textContent = score;
}

// ===== Рисование =====
function drawParticle(ctx, x, y, color) {
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
}

function drawSand() {
    for (let y = 0; y < SAND_H; y++) {
        for (let x = 0; x < SAND_W; x++) {
            const p = grid[y][x];
            if (p !== null) {
                drawParticle(ctx, x, y, p.color);
            }
        }
    }
}

function drawActivePiece() {
    if (!activePiece) return;
    const blockPixel = PPB * PIXEL;
    ctx.fillStyle = `rgb(${activePiece.color[0]}, ${activePiece.color[1]}, ${activePiece.color[2]})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;

    for (const [bx,by] of activePiece.getBlocks()) {
        const px = bx * blockPixel;
        const py = by * blockPixel;
        ctx.fillRect(px, py, blockPixel, blockPixel);
        ctx.strokeRect(px + 0.5, py + 0.5, blockPixel - 1, blockPixel - 1);
    }
}

function drawNextPiece() {
    if (!nextCanvas || !nextCtx || !nextPiece) return;
    const cw = nextCanvas.width;
    const ch = nextCanvas.height;
    nextCtx.clearRect(0,0,cw,ch);
    nextCtx.fillStyle = 'rgba(20,20,22,0.6)';
    nextCtx.fillRect(0,0,cw,ch);

    const blockPixel = Math.floor(Math.min(cw, ch) / Math.max(nextPiece.shape.length, nextPiece.shape[0].length) / 1.2);
    const shapeW = nextPiece.shape[0].length * blockPixel;
    const shapeH = nextPiece.shape.length * blockPixel;
    const offsetX = Math.floor((cw - shapeW) / 2);
    const offsetY = Math.floor((ch - shapeH) / 2);

    for (let y = 0; y < nextPiece.shape.length; y++) {
        for (let x = 0; x < nextPiece.shape[y].length; x++) {
            if (nextPiece.shape[y][x]) {
                const px = offsetX + x * blockPixel;
                const py = offsetY + y * blockPixel;
                nextCtx.fillStyle = `rgb(${nextPiece.color[0]}, ${nextPiece.color[1]}, ${nextPiece.color[2]})`;
                nextCtx.fillRect(px, py, blockPixel, blockPixel);
                nextCtx.strokeStyle = 'rgba(0,0,0,0.5)';
                nextCtx.lineWidth = 1;
                nextCtx.strokeRect(px + 0.5, py + 0.5, blockPixel - 1, blockPixel - 1);
            }
        }
    }
}

// Новая функция для отрисовки песка в буфер ("черновик")
function drawSandToBuffer() {
    sandCtx.clearRect(0, 0, sandCanvas.width, sandCanvas.height);
    for (let y = 0; y < SAND_H; y++) {
        for (let x = 0; x < SAND_W; x++) {
            const p = grid[y][x];
            if (p !== null) {
                sandCtx.fillStyle = `rgb(${p.color[0]}, ${p.color[1]}, ${p.color[2]})`;
                sandCtx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
            }
        }
    }
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawSand();
    drawActivePiece();
    drawFlicker();
    ctx.strokeStyle = 'rgba(80,80,88,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    drawNextPiece();
}

function drawCountdown() {
    draw();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${canvas.height / 5}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(countdown.toString(), canvas.width / 2, canvas.height / 2);
}

// ===== Управление и события =====
function setupInput() {
    gameArea = document.getElementById('gameArea');

    if (gameArea) {
        gameArea.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                hasSwipedHorizontally = false;
            }
        }, { passive: false });

        gameArea.addEventListener('touchmove', e => {
            e.preventDefault();
            if (paused || gameOver || !activePiece || e.touches.length !== 1) {
                return;
            }
            const currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            const blockWidthInPixels = gameArea.offsetWidth / BLOCK_W;
            if (Math.abs(deltaX) > blockWidthInPixels) {
                if (deltaX > 0) {
                    if (activePiece.tryMove(1, 0)) playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при свайпе вправо
                } else {
                    if (activePiece.tryMove(-1, 0)) playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при свайпе влево
                }
                startX = currentX;
                hasSwipedHorizontally = true;
                draw();
            }
        }, { passive: false });

        gameArea.addEventListener('touchend', e => {
            if (paused || gameOver || !activePiece) return;
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const deltaX = endX - startX;
            const deltaY = endY - startY;
            const swipeThreshold = 50;
            const tapThreshold = 25;

            if (!hasSwipedHorizontally && deltaY > swipeThreshold && deltaY > Math.abs(deltaX) * 1.5) {
                playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при быстром сбросе фигуры
                fastDrop = false;
                while (activePiece && activePiece.tryMove(0, 1)) {}
                if (activePiece) {
                    activePiece.lockToSand();
                    activePiece = null;
                }
            } else if (!hasSwipedHorizontally && Math.abs(deltaX) < tapThreshold && Math.abs(deltaY) < tapThreshold) {
                activePiece.tryRotate();
            }
            draw();
        }, { passive: false });
    } else {
         console.warn("Element with ID 'gameArea' not found. Touch controls disabled.");
    }

    window.addEventListener('keydown', e => {
        if (gameOver || paused || !activePiece) return;
        switch (e.key) {
            case 'ArrowLeft':
                if (activePiece.tryMove(-1, 0)) playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при движении влево
                draw();
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (activePiece.tryMove(1, 0)) playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при движении вправо
                draw();
                e.preventDefault();
                break;
            case 'ArrowDown':
                e.preventDefault();
                const now = performance.now();
                if (now - lastDownPressTime < DOUBLE_TAP_THRESHOLD) {
                    playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при быстром сбросе (двойное нажатие)
                    while (activePiece.tryMove(0, 1)) {}
                    activePiece.lockToSand();
                    activePiece = null;
                    lastDownPressTime = 0;
                    draw();
                } else {
                    fastDrop = true;
                }
                lastDownPressTime = now;
                break;
            case 'ArrowUp':
            case 'x':
            case 'X':
                activePiece.tryRotate();
                draw();
                e.preventDefault();
                break;
            case ' ':
                e.preventDefault();
                playVibration(); // *** ИЗМЕНЕНИЕ: Вибрация при быстром сбросе (пробел)
                while (activePiece.tryMove(0, 1)) {}
                activePiece.lockToSand();
                activePiece = null;
                break;
            case 'p':
            case 'P':
            case 'Escape':
                togglePause();
                break;
        }
    });

    window.addEventListener('keyup', e => {
        if (e.key === 'ArrowDown') {
            fastDrop = false;
        }
    });
}

// ===== Инициализация canvas и размера =====
function resizeCanvasToGrid() {
    canvas.width = SAND_W * PIXEL;
    canvas.height = SAND_H * PIXEL;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.imageSmoothingEnabled = false;
    nextCanvas.width = nextCanvas.clientWidth || 80;
    nextCanvas.height = nextCanvas.clientHeight || 80;
    nextCtx.imageSmoothingEnabled = false;
}

// Функция для показа экранов меню, паузы и т.д.
async function showScreen(screen) {
    // Убираем отступ у главного контейнера
    const appContainer = document.getElementById('gameArea');

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameContainer').style.display = 'none';
    screen.classList.add('active');
}

async function showGameScreen() {
    const appContainer = document.getElementById('gameArea');

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameContainer').style.display = 'flex';
}

function showSettingsScreen() {
    applySettingsToUI();
    showScreen(settingsScreen); // Эта функция уже скроет баннер
}

// Функция паузы
async function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
        stopMusic();

        hideComboAnimation();

        await showScreen(pauseScreen);
    } else {
        await showGameScreen();
        if (musicOn) playMusic(music);
        chainReactionCounter = 0; // Reset combo counter on resume
        flickerAnimations = []; // Очистка анимаций мерцания
        countdown = 3;
        lastCountdownTime = performance.now();
        requestAnimationFrame(countdownLoop);
    }
}

function countdownLoop(now) {
    if (countdown <= 0) {
        lastTime = now / 1000;
        requestAnimationFrame(loop);
        return;
    }
    drawCountdown();
    const dt = (now - lastCountdownTime) / 1000;
    if (dt >= 0.5) { // Отсчёт каждые 0.5 сек
        countdown--;
        lastCountdownTime = now;
    }
    requestAnimationFrame(countdownLoop);
}

function showGameOver() {
    // --- FIREBASE ANALYTICS: СОБЫТИЕ КОНЦА ИГРЫ ---
    if (window.FirebasePlugin) {
        window.FirebasePlugin.logEvent("game_over", {
            final_score: score,
            final_level: level,
            particles_cleared: removedParticlesTotal
        });
    }

    stopMusic();
    inGame = false;
    playVibration();
    playSound(soundEffects.gameover);
    saveSettings();
    document.getElementById('gameOver').style.display = 'flex';
    document.getElementById('finalScore').textContent = score;
    saveHighscore(score);
}

function hideGameOver() {
    document.getElementById('gameOver').style.display = 'none';
}

function hideComboAnimation() {
    const comboEl = document.getElementById('comboText');
    if (comboEl) {
        comboEl.classList.remove('animate');
        comboEl.textContent = ''; // Полностью очищаем текст
    }
}

async function startNewGame() {
    console.log(`Начало новой игры.`);

    if (window.FirebasePlugin) {
        window.FirebasePlugin.logEvent("game_start", {
            difficulty: difficultyLevel // 1 - Easy, 2 - Medium, 3 - Hard
        });
    }

    chainReactionCounter = 0;
    hideComboAnimation();
    flickerAnimations = []; // Очистка анимаций мерцания
    console.log(`%c--- НОВАЯ ИГРА --- Счётчик сброшен на: ${chainReactionCounter}`, 'color: green; font-weight: bold;');

    gameOver = false;
    paused = false;
    inGame = true;
    score = 0;
    level = difficultyLevel;
    removedParticlesTotal = 0;
    fallTimer = 0;
    fastDrop = false;
    lastTime = 0;
    initGrid();
    activePiece = null;
    nextPiece = new Piece();
    updateUI();
    hideGameOver();

    await showGameScreen();

    playSound(soundEffects.clear);
    if (musicOn) playMusic(music);
    requestAnimationFrame(loop);
}

async function backToMain() {
    gameOver = true;
    paused = false;
    inGame = false;
    stopMusic();
    saveSettings();
    showScreen(mainMenuScreen); // Эта функция скроет баннер
    await displayHighscores();
}

function loop(now) {
    if (paused) return;
    const t = now / 1000;
    if (!lastTime) lastTime = t;
    const dt = clamp(t - lastTime, 0, 0.05);
    lastTime = t;
    update(dt);
    updateFlicker(dt);

    draw();
    if (!gameOver) {
        requestAnimationFrame(loop);
    } else {
        showGameOver();
    }
}

async function initEverything() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    nextCanvas = document.getElementById('nextCanvas');
    nextCtx = nextCanvas.getContext('2d');
    gameArea = document.getElementById('gameArea');
    resizeCanvasToGrid();

    await loadSettings();
    applySettingsToUI();

    setupInput();

    startGameBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        if (!audioUnlocked) {
            audioContext.resume().then(() => {
                audioUnlocked = true;
                startNewGame();
            });
        } else {
            startNewGame();
        }

    });

    pauseBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        togglePause();
    });
    resumeBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        togglePause();
    });
    newGameBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        startNewGame();
    });
    exitToMainBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        backToMain();
    });
    restartBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        startNewGame();
    });
    exitFromGameOverBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        backToMain();
    });
    settingsBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        showSettingsScreen();
    });
    backToMainFromSettingsBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        saveSettings();
        showScreen(mainMenuScreen);
    });

    saveSettingsBtn.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        musicOn = musicToggle.classList.contains('on');
        soundOn = soundToggle.classList.contains('on');
        vibrationOn = vibrationToggle.classList.contains('on');

        if (clearHighscoresToggle.classList.contains('on')) {
            clearHighscores();
            clearHighscoresToggle.classList.remove('on');
        }

        if (!musicOn) {
            stopMusic();
        } else {
            if (inGame && !paused && !gameOver) {
                playMusic(music);
            }
        }

        if (sfxGainNode) {
            sfxGainNode.gain.value = soundOn ? 0.5 * 1.3 : 0;
        }
        saveSettings();
        showScreen(mainMenuScreen);
    });

    musicToggle.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        musicToggle.classList.toggle('on');
    });
    soundToggle.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        soundToggle.classList.toggle('on');
    });
    vibrationToggle.addEventListener('click', () => {
        // playSound(soundEffects.click); // <-- ЗДЕСЬ НЕ НУЖНО, так как звук проиграется при включении вибрации ниже
        vibrationToggle.classList.toggle('on');
        vibrationOn = vibrationToggle.classList.contains('on');
        if (vibrationOn) {
            playSound(soundEffects.click); // <-- Звук и вибрация одновременно при включении
            playVibration();
        }
    });
    clearHighscoresToggle.addEventListener('click', () => {
        playSound(soundEffects.click); // <-- ДОБАВЛЕНО
        playVibration();
        clearHighscoresToggle.classList.toggle('on');
    });

    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound(soundEffects.click); // <-- ДОБАВЛЕНО
            playVibration();
            difficultyButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficultyLevel = parseInt(btn.dataset.level, 10);
            saveSettings();
        });
    });

    await displayHighscores();
}

// Оборачиваем всю инициализацию в одну функцию
function initGame() {
    return new Promise(resolve => {
        // Эта функция будет запускать всю основную логику
            const startApp = async () => {
            console.log("Приложение готово. Запускаем инициализацию.");

            // --- FIREBASE ANALYTICS ИНИЦИАЛИЗАЦИЯ ---
            if (window.FirebasePlugin) {
                // Включаем сбор данных аналитики
                window.FirebasePlugin.setAnalyticsCollectionEnabled(true);
                // Отправляем событие, что приложение было запущено
                window.FirebasePlugin.logEvent("app_start", {});
                console.log("Firebase Analytics включен.");
            }

            // Вызываем платформо-зависимые настройки
            if (window.cordova) {
                onDeviceReady();
            } else {
                window.addEventListener('beforeunload', stopMusic);
            }

            // Логика сессий
            sessionStartTime = Date.now();
            const hasHadFirstSession = localStorage.getItem('hasHadFirstSession');
            if (!hasHadFirstSession) {
                console.log("Первая сессия в истории. Реклама не будет показываться.");
                isFirstSessionEver = true;
                localStorage.setItem('hasHadFirstSession', 'true');
            } else {
                console.log("Это не первая сессия. Реклама включена по правилам.");
                isFirstSessionEver = false;
            }

            // Инициализация рекламы (если необходимо)
            if (window.admob && interstitial) {
                try {
                    await interstitial.load();
                } catch (err) {
                    console.warn('Interstitial initial load failed:', err);
                }
            }

            // Загрузка остальных ресурсов
            await initAudio();
            await initEverything();

            // Сообщаем, что всё готово, ТОЛЬКО ПОСЛЕ завершения startApp
            resolve();
        };

        // Определяем, какое событие слушать: deviceready для Cordova или DOMContentLoaded для браузера
        if (window.cordova) {
            document.addEventListener('deviceready', startApp, false);
        } else {
            // Используем DOMContentLoaded, так как он срабатывает раньше 'load'
            document.addEventListener('DOMContentLoaded', startApp, false);
        }
    });
}

/* ===========================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РЕКЛАМЫ
   =========================== */

// Блокируем/разблокируем кнопки в окне Game Over
function disableGameOverButtons() {
    try {
        restartBtn && (restartBtn.disabled = true);
        exitFromGameOverBtn && (exitFromGameOverBtn.disabled = true);
        // если есть другие кнопки в gameOver — блокируем их по селектору:
        const gos = document.querySelectorAll('#gameOver .action-btn');
        gos.forEach(b => b.disabled = true);
    } catch (e) { /* ignore */ }
}

function enableGameOverButtons() {
    try {
        restartBtn && (restartBtn.disabled = false);
        exitFromGameOverBtn && (exitFromGameOverBtn.disabled = false);
        const gos = document.querySelectorAll('#gameOver .action-btn');
        gos.forEach(b => b.disabled = false);
    } catch (e) { /* ignore */ }
}

// Показываем небольшой индикатор загрузки рекламы (опционально)
function showAdLoadingIndicator(container) {
    let indicator = container.querySelector('.ad-loading-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'ad-loading-indicator';
        // минимальные стили инлайном
        indicator.style.position = 'absolute';
        indicator.style.top = '10px';
        indicator.style.right = '10px';
        indicator.style.background = 'rgba(0,0,0,0.7)';
        indicator.style.color = '#fff';
        indicator.style.padding = '8px 12px';
        indicator.style.borderRadius = '4px';
        indicator.style.fontSize = '12px';
        indicator.style.zIndex = '10000';
        indicator.textContent = ' ';
        container.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

function hideAdLoadingIndicator(container) {
    const indicator = container.querySelector('.ad-loading-indicator');
    if (indicator) indicator.style.display = 'none';
}

// Основной поток показа рекламы после появления Game Over
async function handleGameOverAdFlow(gameOverEl) {
    if (adInProgress) return;
    adInProgress = true;
    console.log('Проверяем условия для показа рекламы...');
    disableGameOverButtons();

    try {
        // Правило 1: Никогда не показывать рекламу в самой первой сессии
        if (isFirstSessionEver) {
            console.log("Первая сессия в истории, реклама отключена.");
            return; // Выходим, рекламу не показываем
        }

        const now = Date.now();
        const persisted = localStorage.getItem('lastInterstitialTs');
        if (persisted) lastAdTimestamp = parseInt(persisted, 10) || 0;

        let shouldShowAd = false;

        if (!hasShownFirstAdOfSession) {
            // Правило 2: Логика для ПЕРВОЙ рекламы в текущей сессии
            const sessionDuration = now - sessionStartTime;
            if (sessionDuration >= FIRST_AD_SESSION_DELAY_MS) {
                console.log(`Сессия длится > ${FIRST_AD_SESSION_DELAY_MINUTES} мин. Пора показать первую рекламу.`);
                shouldShowAd = true;
            } else {
                const minutesLeft = Math.ceil((FIRST_AD_SESSION_DELAY_MS - sessionDuration) / 60000);
                console.log(`Для показа первой рекламы нужно играть еще ~${minutesLeft} мин.`);
            }
        } else {
            // Правило 3: Логика для ПОСЛЕДУЮЩИХ реклам в сессии
            if (now - lastAdTimestamp >= AD_COOLDOWN_MS) {
                console.log(`Кулдаун в ${AD_COOLDOWN_MINUTES} мин прошел. Показываем рекламу.`);
                shouldShowAd = true;
            } else {
                const minutesLeft = Math.ceil((AD_COOLDOWN_MS - (now - lastAdTimestamp)) / 60000);
                console.log(`Реклама на кулдауне. Осталось ~${minutesLeft} мин.`);
            }
        }

        if (shouldShowAd && interstitial) {
            showAdLoadingIndicator(gameOverEl);
            const loaded = await interstitial.isLoaded();
            if (!loaded) {
                console.log('Загружаем рекламу...');
                await interstitial.load();
            }
            console.log('Показываем рекламу...');
            await interstitial.show();

            // Успешный показ
            lastAdTimestamp = Date.now();
            localStorage.setItem('lastInterstitialTs', String(lastAdTimestamp));
            hasShownFirstAdOfSession = true; // Отмечаем, что первая реклама в сессии была показана
            console.log('Реклама успешно показана');
        }

    } catch (err) {
        console.warn('Ошибка при показе/загрузке рекламы:', err);
    } finally {
        // Всегда ждем немного и разблокируем UI
        await new Promise(resolve => setTimeout(resolve, 1500));
        hideAdLoadingIndicator(gameOverEl);
        enableGameOverButtons();
        adInProgress = false;
        console.log('Проверка рекламы завершена, UI разблокирован.');
    }
}

// index.js

/**
 * Главная функция, запускающая приложение.
 * Оркестрирует показ экрана загрузки, загрузку ресурсов и переход к главному меню.
 */
function initializeApp() {
    const mainMenuScreen = document.getElementById('mainMenuScreen');
    const progressBar = document.getElementById('loadingProgressBar');
    const progressText = document.getElementById('loadingProgressText');
    const loadingScreen = document.getElementById('loadingScreen');

    loadingScreen.style.display = 'flex';
    loadingScreen.classList.add('active');

    const MIN_LOAD_TIME = 3000;
    const minTimePromise = new Promise(resolve => setTimeout(resolve, MIN_LOAD_TIME));
    const assetsPromise = initGame();

    let startTime = performance.now();
    let animationFrameId;

    progressBar.style.transition = 'none';

    function animateProgress(now) {
        const elapsedTime = now - startTime;
        const progress = Math.min(0.95, elapsedTime / MIN_LOAD_TIME);
        const displayPercent = Math.floor(progress * 100);

        progressBar.style.width = `${displayPercent}%`;
        progressText.textContent = `${displayPercent}%`;

        if (progress < 0.9) {
            animationFrameId = requestAnimationFrame(animateProgress);
        }
    }
    animationFrameId = requestAnimationFrame(animateProgress);

    Promise.all([minTimePromise, assetsPromise]).then(() => {
        cancelAnimationFrame(animationFrameId);

        progressBar.style.transition = 'width 0.8s ease-out';
        progressBar.style.width = '100%';
        progressText.textContent = '100%';

        setTimeout(() => {
            showScreen(mainMenuScreen);
        }, 400);
    });
}

initializeApp();