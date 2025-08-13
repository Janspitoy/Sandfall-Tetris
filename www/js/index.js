// ====================================================================
// ========================= КОНФИГУРАЦИЯ ============================
// ====================================================================

// ===== Константы и переменные =====
const BLOCK_W = 8, BLOCK_H = 16;
const PPB = 8; // particles per block
const PIXEL = 4; // pixel scale per particle
const SAND_W = BLOCK_W * PPB;
const SAND_H = BLOCK_H * PPB;

const PALETTE = [
    [231, 76, 60],  // red
    [46, 204, 113], // green
    [52, 152, 219], // blue
    [241, 196, 15], // yellow
    [155, 89, 182], // purple
    [230, 126, 34], // orange
    [26, 188, 156], // turquoise
];

const TETROMINOES = [
    [[1,1,1,1]], // I
    [[1,1],[1,1]], // O
    [[0,1,0],[1,1,1]], // T
    [[0,1,1],[1,1,0]], // S
    [[1,1,0],[0,1,1]], // Z
    [[1,0,0],[1,1,1]], // J
    [[0,0,1],[1,1,1]], // L
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

// === АУДИО: Обновленная конфигурация ===
let soundOn = true;
let musicOn = true;
let musicGainNode, sfxGainNode;
// ==========================================

let vibrationOn = true;
let audioContext;
let music, soundEffects = {};
let isMusicPlaying = false;
let lastSwipeTime = 0;
let swipeCooldown = 200;
let startX = 0, startY = 0;
let gameArea;
// ===== Переменные для рекламы (новые) =====
let adTimer = 5;
let adIntervalId = null;
// ===== Переменные для обратного отсчета =====
let countdown = 0;
let lastCountdownTime = 0;

// ===== DOM Elements =====
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
// ===== DOM Elements (new) =====
const adScreen = document.getElementById('adScreen');
const closeAdBtn = document.getElementById('closeAdBtn');
const adTimerEl = document.getElementById('ad-timer');




// ===== Настройка AdMob interstitial =====
document.addEventListener('deviceready', () => {
    console.log("Устройство готово. Начинаем настройку AdMob.");

    // Проверяем, что AdMob доступен
    if (window.admob && admob.interstitial) {
        console.log("Плагин AdMob доступен.");
        admob.interstitial.config({
            id: 'ca-app-pub-4411114348896099~1525807767', // Замените на ваш Ad Unit ID
            isTesting: true,            // true для тестирования, false для реальных показов
            autoShow: false             // Не показывать автоматически, будем показывать вручную
        });
        admob.interstitial.prepare();
    } else {
        console.log("Плагин AdMob не найден или недоступен.");
    }

    // Дополнительный код вашего приложения может идти здесь...
    // Например, инициализация игрового движка или других функций.

}, false);
// ====================================================================
// =================== АУДИОЛОГИКА (ОБНОВЛЁННАЯ) =====================
// ====================================================================

function createAudioContext() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Создание узлов усиления для управления громкостью
    musicGainNode = audioContext.createGain();
    sfxGainNode = audioContext.createGain();

    // Подключение к основному выходу
    musicGainNode.connect(audioContext.destination);
    sfxGainNode.connect(audioContext.destination);

    // Установка начальных значений громкости
    // Музыка 50%
    musicGainNode.gain.value = 0.5;
    // Звуки на 30% громче музыки
    sfxGainNode.gain.value = 0.5 * 1.3;
}

/**
 * Асинхронная функция-помощник для загрузки и декодирования аудиофайла.
 * @param {string} url - URL-адрес аудиофайла.
 * @returns {Promise<AudioBuffer>} - Промис, который разрешается в AudioBuffer.
 */
async function loadAudio(url) {
    if (!audioContext) createAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Асинхронная функция для инициализации аудиосистемы.
 * Она создает AudioContext и загружает все необходимые звуковые файлы и музыку.
 */
async function initAudio() {
    try {
        createAudioContext();
        console.log("Начало загрузки аудиофайлов...");

        // === АУДИО: Загрузка аудиофайлов. ===
        // Замените эти URL на реальные, если они у вас есть
        // const tonejs = await import('https://cdcdcdn.jsdelivr.net/npm/tone@14.7.71/build/Tone.js');
        music = await loadAudio('audio/music.mp3');
        soundEffects.fall = await loadAudio('audio/fall.wav');
        soundEffects.clear = await loadAudio('audio/clear.wav');
        soundEffects.rotate = await loadAudio('audio/rotate.wav');

        console.log("Аудиофайлы успешно загружены.");
    } catch (error) {
        console.error("Ошибка при инициализации аудио:", error);
    }
}

function playSound(buffer) {
    if (!soundOn || !buffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    // Подключение к узлу усиления для звуковых эффектов
    source.connect(sfxGainNode);
    source.start(0);
}

function playMusic(buffer) {
    if (isMusicPlaying || !musicOn || !buffer) return;
    isMusicPlaying = true;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Подключение к узлу усиления для музыки
    source.connect(musicGainNode);
    source.start(0);
}

function stopMusic() {
    // This is a simplified stop. In a real app, you would need to store the source node
    // to stop it gracefully. For this example, we just set the flag.
    isMusicPlaying = false;
    if (musicGainNode) musicGainNode.gain.value = 0; // Mute it
}

function playVibration() {
    if (vibrationOn && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(100);
    }
}

// ====================================================================
// ==================== ОСТАЛЬНОЙ КОД ИГРЫ ============================
// ====================================================================

// ===== Local Storage for Highscores =====
function getHighscores() {
    const highscores = localStorage.getItem('sandfallHighscores');
    return highscores ? JSON.parse(highscores) : [];
}

function saveHighscore(score) {
    const highscores = getHighscores();
    highscores.push({ score, date: new Date().toLocaleDateString() });
    highscores.sort((a, b) => b.score - a.score);
    localStorage.setItem('sandfallHighscores', JSON.stringify(highscores.slice(0, 10)));
}

function displayHighscores() {
    const highscores = getHighscores();
    highscoresList.innerHTML = '';
    if (highscores.length === 0) {
        highscoresList.innerHTML = '<p style="text-align:center; padding: 10px;">No records yet.</p>';
    } else {
        const ol = document.createElement('ol');
        highscores.forEach(h => {
            const li = document.createElement('li');
            li.textContent = `${h.score} points (${h.date})`;
            ol.appendChild(li);
        });
        highscoresList.innerHTML = '';
        highscoresList.appendChild(ol);
    }
}

// ===== Утилиты =====
function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
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

// ===== Сетка =====
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

// ===== Песок (простая физика) =====
function updateSand() {
    for (let y = SAND_H - 2; y >= 0; y--) {
        for (let x = 0; x < SAND_W; x++) {
            const particle = grid[y][x];
            if (!particle) continue;
            if (grid[y+1] && grid[y+1][x] === null) {
                grid[y][x] = null;
                grid[y+1][x] = particle;
                continue;
            }
            const dirs = Math.random() < 0.5 ? [[-1,1],[1,1]] : [[1,1],[-1,1]];
            for (const [dx,dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < SAND_W && ny < SAND_H && grid[ny][nx] === null) {
                    grid[y][x] = null;
                    grid[ny][nx] = particle;
                    break;
                }
            }
        }
    }
}

// ===== Поиск мостов (лево->право одной цветом) =====
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

// ===== Класс фигуры =====
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
        playVibration();
        return true;
    }

    tryRotate() {
        if (gameOver || paused) return false;
        const rotated = rotateMatrixCW(this.shape);
        if (this._canPlaceShape(rotated, this.x, this.y)) {
            this.shape = rotated;
            playVibration();
            // === АУДИО: Воспроизведение звука поворота ===
            // playSound(soundEffects.rotate);
            return true;
        }
        for (const kick of [-1,1,-2,2]) {
            if (this._canPlaceShape(rotated, this.x + kick, this.y)) {
                this.x += kick; this.shape = rotated;
                playVibration();
                // === АУДИО: Воспроизведение звука поворота ===
                // playSound(soundEffects.rotate);
                return true;
            }
        }
        return false;
    }

    lockToSand() {
        for (const [bx,by] of this.getBlocks()) {
            fillRegion(bx * PPB, by * PPB, PPB, PPB, this.color);
        }
        // === АУДИО: Воспроизведение звука падения ===
        // playSound(soundEffects.fall);
    }
}

// ===== Игровая логика =====
function getCurrentFallInterval() {
    const base = Math.max(0.05, 0.8 * Math.pow(0.92, level - 1));
    return Math.max(0.02, base * (fastDrop ? 0.15 : 1.0));
}

function spawnPiece() {
    activePiece = nextPiece;
    nextPiece = new Piece();
    // ИСПРАВЛЕНО: Убрал вызов showGameOver() отсюда.
    // Если игра окончена, это обрабатывает главный цикл loop()
    if (activePiece && !activePiece._canPlaceShape(activePiece.shape, activePiece.x, activePiece.y)) {
        gameOver = true;
    }
}

function update(dt) {
    if (gameOver || paused) return;

    if (!activePiece) spawnPiece();

    if (activePiece) {
        fallTimer += dt;
        if (fallTimer >= getCurrentFallInterval()) {
            fallTimer = 0;
            if (!activePiece.tryMove(0,1)) {
                activePiece.lockToSand();
                activePiece = null;
            }
        }
    }

    updateSand();

    const bridgeCells = findBridges();
    if (bridgeCells.size > 0) {
        const removed = clearCells(bridgeCells);
        let mult = 1.0;
        if (removed >= 200) mult = 1.2;
        if (removed >= 500) mult = 1.5;
        if (removed >= 1000) mult = 2.0;
        const gained = Math.floor(removed * mult);
        score += gained;
        removedParticlesTotal += removed;
        level = difficultyLevel + Math.floor(removedParticlesTotal / 500);
        updateUI();
        playVibration();
        // === АУДИО: Воспроизведение звука очистки ===
        // playSound(soundEffects.clear);
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

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);


    function draw() {
        // Сначала фон
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

        // Потом — всё, что уже есть в твоей функции отрисовки
        drawGrid();
        drawPieces();
    }

    drawSand();
    drawActivePiece();
    ctx.strokeStyle = 'rgba(80,80,88,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

    drawNextPiece();
}

function drawCountdown() {
    // Отрисовка игрового поля перед отрисовкой текста
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
    // Кнопки
    document.getElementById('rotateBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (activePiece) activePiece.tryRotate(); draw(); });
    document.getElementById('leftBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (activePiece) activePiece.tryMove(-1,0); draw(); });
    document.getElementById('rightBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (activePiece) activePiece.tryMove(1,0); draw(); });
    document.getElementById('downBtn').addEventListener('pointerdown', e => { e.preventDefault(); fastDrop = true; });
    document.getElementById('downBtn').addEventListener('pointerup', e => { e.preventDefault(); fastDrop = false; });
    document.getElementById('downBtn').addEventListener('pointercancel', e => { fastDrop = false; });

    // Тач-управление
    gameArea.addEventListener('touchstart', e => {
        const now = performance.now();
        // Обработка тапа для поворота
        if (e.touches.length === 1) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }
    }, { passive: false });

    gameArea.addEventListener('touchend', e => {
        const now = performance.now();
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const swipeThreshold = 30;

        if (Math.abs(deltaY) > swipeThreshold) {
            fastDrop = false;
            // Вертикальный свайп - мгновенный сброс
            while (activePiece.tryMove(0,1)) {}
            activePiece.lockToSand();
            activePiece = null;
        } else if (Math.abs(deltaX) < 10) {
            // Тап для поворота
            if (activePiece) { activePiece.tryRotate(); draw(); }
        }

    }, { passive: false });

    gameArea.addEventListener('touchmove', e => {
         e.preventDefault();
         if (paused || gameOver || !activePiece || e.touches.length !== 1) return;

         const currentX = e.touches[0].clientX;
         const deltaX = currentX - startX;
         const swipeThreshold = 30;

         if (Math.abs(deltaX) > swipeThreshold) {
             if (deltaX > 0) {
                 if (activePiece.tryMove(1, 0)) draw();
             } else {
                 if (activePiece.tryMove(-1, 0)) draw();
             }
             startX = currentX;
             lastSwipeTime = performance.now();
         }
    }, { passive: false });

    // Клавиатура
    window.addEventListener('keydown', e => {
        if (gameOver || paused) return;
        if (!activePiece) return;
        if (e.key === 'ArrowLeft') { activePiece.tryMove(-1,0); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { activePiece.tryMove(1,0); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { fastDrop = true; e.preventDefault(); }
        else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') { activePiece.tryRotate(); draw(); e.preventDefault(); }
        else if (e.key === ' ') {
            e.preventDefault();
            if (!activePiece) return;
            while (activePiece.tryMove(0,1)) {}
            activePiece.lockToSand();
            activePiece = null;
        } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); }
    });

    window.addEventListener('keyup', e => {
        if (e.key === 'ArrowDown') fastDrop = false;
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

// ===== Управление экранами =====
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('controls').style.display = 'none';
    screen.classList.add('active');
}

function showGameScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameContainer').style.display = 'flex';
    document.getElementById('controls').style.display = 'flex';
}

function showSettingsScreen() {
    // Установить начальные состояния переключателей
    musicToggle.classList.toggle('on', musicOn);
    soundToggle.classList.toggle('on', soundOn);
    vibrationToggle.classList.toggle('on', vibrationOn);
    showScreen(settingsScreen);
}

function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
        showScreen(pauseScreen);
    } else {
        showGameScreen();
        countdown = 3;
        lastCountdownTime = performance.now();
        requestAnimationFrame(countdownLoop);
    }
}

// === ИСПРАВЛЕНИЕ: Убрана лишняя проверка, которая могла прерывать обратный отсчет. ===
function countdownLoop(now) {
    if (countdown <= 0) {
        // Установка lastTime для плавного старта после паузы
        lastTime = now / 800;
        // Правильный перезапуск основного игрового цикла
        requestAnimationFrame(loop);
        return;
    }

    drawCountdown();

    const dt = (now - lastCountdownTime) / 1000;
    if (dt >= 1) {
        countdown--;
        lastCountdownTime = now;
    }
    requestAnimationFrame(countdownLoop);
}
// =========================================================================================

function showGameOver() {
    showAd(); // <-- ДОБАВЬТЕ ЭТУ СТРОКУ
    document.getElementById('gameOver').style.display = 'flex';
    document.getElementById('finalScore').textContent = score;
    // ИСПРАВЛЕНО: Вызов saveHighscore() перенесён сюда,
    // чтобы он вызывался только один раз при завершении игры
    saveHighscore(score);
}

function hideGameOver() {
    document.getElementById('gameOver').style.display = 'none';
}

// ===== Старт/Рестарт игры =====
function startNewGame() {
    gameOver = false;
    paused = false;
    score = 0;
    level = difficultyLevel;
    removedParticlesTotal = 0;
    fallTimer = 0;
    fastDrop = false;
    lastTime = 0; // Сбрасываем lastTime для нового цикла
    initGrid();
    activePiece = null;
    nextPiece = new Piece();
    updateUI();
    hideGameOver();
    showGameScreen();
    // === АУДИО: Запуск музыки с проверкой настроек ===
    if (musicOn) playMusic(music);
    requestAnimationFrame(loop);
}

function backToMain() {
    gameOver = true; // Останавливаем цикл игры
    paused = false;
    // === АУДИО: Остановка музыки при выходе в меню ===
    // stopMusic();
    showScreen(mainMenuScreen);
    displayHighscores();
}

// ===== Главный цикл =====
function loop(now) {
    if (paused) {
        // Если игра на паузе, ничего не делаем и не вызываем loop() снова
        return;
    }

    const t = now / 1000;
    if (!lastTime) lastTime = t;
    const dt = clamp(t - lastTime, 0, 0.05);
    lastTime = t;

    update(dt);
    draw();

    // ИСПРАВЛЕНО: Переместил проверку gameOver в конец цикла.
    // Теперь, когда gameOver становится true, мы один раз вызываем showGameOver() и останавливаем цикл.
    if (!gameOver) {
        requestAnimationFrame(loop);
    } else {
        showGameOver();
    }
}

// ===== Загрузка / init =====
function initEverything() {
    // DOM элементы
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    nextCanvas = document.getElementById('nextCanvas');
    nextCtx = nextCanvas.getContext('2d');
    gameArea = document.getElementById('gameArea');

    resizeCanvasToGrid();
    initAudio(); // Вызов функции initAudio
    setupInput();

    // Обработчики событий
    startGameBtn.addEventListener('click', startNewGame);
    pauseBtn.addEventListener('click', togglePause);
    resumeBtn.addEventListener('click', togglePause);
    newGameBtn.addEventListener('click', () => {
        startNewGame();
        showScreen(gameContainer);
    });
    exitToMainBtn.addEventListener('click', backToMain);
    restartBtn.addEventListener('click', startNewGame);
    exitFromGameOverBtn.addEventListener('click', backToMain);

    // Обработчики для кнопок настроек
    settingsBtn.addEventListener('click', showSettingsScreen);
    backToMainFromSettingsBtn.addEventListener('click', () => {
        showScreen(mainMenuScreen);
    });
    saveSettingsBtn.addEventListener('click', () => {
        musicOn = musicToggle.classList.contains('on');
        soundOn = soundToggle.classList.contains('on');
        vibrationOn = vibrationToggle.classList.contains('on');

        // Применение изменений
        if (musicOn) {
            // playMusic(music);
            if (musicGainNode) musicGainNode.gain.value = 0.5;
        } else {
            // stopMusic();
            if (musicGainNode) musicGainNode.gain.value = 0;
        }
        if (sfxGainNode) {
            sfxGainNode.gain.value = soundOn ? 0.5 * 1.3 : 0;
        }

        showScreen(mainMenuScreen);
    });

    // Обработчики для переключателей настроек
    musicToggle.addEventListener('click', () => musicToggle.classList.toggle('on'));
    soundToggle.addEventListener('click', () => soundToggle.classList.toggle('on'));
    vibrationToggle.addEventListener('click', () => vibrationToggle.classList.toggle('on'));

    // Обработчики для кнопок сложности
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            difficultyButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficultyLevel = parseInt(btn.dataset.level, 10);
        });
    });

    // Изначальный старт
    window.addEventListener('load', () => {
        displayHighscores();
    });
}

function showAd(callback) {
    adScreen.classList.remove('hidden');
    adTimer = 5;
    adTimerEl.textContent = adTimer;
    closeAdBtn.classList.add('hidden');

    adIntervalId = setInterval(() => {
        adTimer--;
        adTimerEl.textContent = adTimer;
        if (adTimer <= 0) {
            clearInterval(adIntervalId);
            closeAdBtn.classList.remove('hidden');
        }
    }, 1000);

    // !!! ВНИМАНИЕ: AdMob будет работать только в мобильном приложении (Cordova/PhoneGap)
    if (typeof admob !== 'undefined' && admob.interstitial) {
        // Если AdMob доступен, показываем настоящую рекламу
        admob.interstitial.show();
        // При закрытии рекламы вызываем колбэк и готовим следующую
        document.addEventListener('onAdDismiss', () => {
            adScreen.classList.add('hidden');
            if (callback) callback();
            admob.interstitial.prepare();
        }, { once: true });
    } else {
        // Фолбэк: если AdMob не доступен, просто ждем таймер
        closeAdBtn.onclick = () => {
            clearInterval(adIntervalId);
            adScreen.classList.add('hidden');
            if (callback) callback();
        };
    }
}


document.addEventListener('DOMContentLoaded', initEverything);