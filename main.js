const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let lastTime = 0;
let gameState = 'menu'; // 'menu', 'playing', 'paused', 'gameover'

// UI Elements
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');
const levelUpScreen = document.getElementById('level-up-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const healthBar = document.getElementById('health-bar');
const xpBar = document.getElementById('xp-bar');
const timerDisplay = document.getElementById('timer');
const levelDisplay = document.getElementById('level-display');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const camera = { x: 0, y: 0 };
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

window.addEventListener('keydown', (e) => {
    if(keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if(e.key.toLowerCase() === 'w') keys.w = true;
    if(e.key.toLowerCase() === 'a') keys.a = true;
    if(e.key.toLowerCase() === 's') keys.s = true;
    if(e.key.toLowerCase() === 'd') keys.d = true;
});

window.addEventListener('keyup', (e) => {
    if(keys.hasOwnProperty(e.key)) keys[e.key] = false;
    if(e.key.toLowerCase() === 'w') keys.w = false;
    if(e.key.toLowerCase() === 'a') keys.a = false;
    if(e.key.toLowerCase() === 's') keys.s = false;
    if(e.key.toLowerCase() === 'd') keys.d = false;
});

// Game Entities
let player;
let enemies = [];
let projectiles = [];
let gems = [];
let particles = [];
let damageNumbers = [];
let gameTime = 0; // seconds
let enemySpawnTimer = 0;

class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.radius = 20;
        this.speed = 200;
        this.maxHealth = 100;
        this.health = 100;
        this.xp = 0;
        this.maxXp = 100;
        this.level = 1;
        this.color = '#4facfe';
        
        this.damageMultiplier = 1;
        this.attackSpeedMultiplier = 1;
        this.weaponCooldown = 1.0; 
        this.lastAttackTime = 0;
    }

    update(dt) {
        let dx = 0;
        let dy = 0;
        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        if (dx !== 0 && dy !== 0) {
            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;
        }

        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        
        camera.x = this.x;
        camera.y = this.y;

        this.lastAttackTime += dt;
        if (this.lastAttackTime >= this.weaponCooldown / this.attackSpeedMultiplier) {
            this.attack();
            this.lastAttackTime -= this.weaponCooldown / this.attackSpeedMultiplier;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    attack() {
        if (enemies.length === 0) return;
        
        let nearestEnemy = null;
        let minDistance = Infinity;
        
        for (const enemy of enemies) {
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < minDistance) {
                minDistance = dist;
                nearestEnemy = enemy;
            }
        }
        
        if (minDistance < 400 * (1 + (this.level * 0.05)) && nearestEnemy) {
            const dx = nearestEnemy.x - this.x;
            const dy = nearestEnemy.y - this.y;
            const length = Math.hypot(dx, dy);
            const dirX = dx / length;
            const dirY = dy / length;
            
            projectiles.push(new Projectile(this.x, this.y, dirX, dirY, 20 * this.damageMultiplier));
        }
    }
    
    takeDamage(amount) {
        this.health -= amount;
        updateHUD();
        if (this.health <= 0) {
            gameOver();
        }
    }

    gainXp(amount) {
        this.xp += amount;
        if (this.xp >= this.maxXp) {
            this.xp -= this.maxXp;
            this.level++;
            this.maxXp = Math.floor(this.maxXp * 1.5);
            triggerLevelUp();
        }
        updateHUD();
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.speed = 100 + Math.random() * 50 + (gameTime / 120) * 50; 
        this.health = 30 + (gameTime / 60) * 15; 
        this.damage = 10 + (gameTime / 120) * 5;
        this.color = '#ff0844';
        this.markedForDeletion = false;
        this.hitCooldown = 0;
    }

    update(dt) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const length = Math.hypot(dx, dy);
        
        if (length > 0) {
            this.x += (dx / length) * this.speed * dt;
            this.y += (dy / length) * this.speed * dt;
        }

        if (this.hitCooldown > 0) {
            this.hitCooldown -= dt;
        } else if (length < this.radius + player.radius) {
            player.takeDamage(this.damage);
            this.hitCooldown = 1.0; 
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    takeDamage(amount) {
        this.health -= amount;
        damageNumbers.push(new DamageNumber(this.x, this.y - 20, amount));
        for(let i=0; i<3; i++) particles.push(new Particle(this.x, this.y, '#ffd700'));

        if (this.health <= 0) {
            this.markedForDeletion = true;
            gems.push(new ExperienceGem(this.x, this.y, 10 + Math.random() * 5));
            for(let i=0; i<15; i++) particles.push(new Particle(this.x, this.y, this.color));
        }
    }
}

class Projectile {
    constructor(x, y, dirX, dirY, damage) {
        this.x = x;
        this.y = y;
        this.dirX = dirX;
        this.dirY = dirY;
        this.speed = 500;
        this.radius = 6;
        this.damage = damage;
        this.color = '#ffd700'; 
        this.lifetime = 2; 
        this.age = 0;
        this.markedForDeletion = false;
    }

    update(dt) {
        this.x += this.dirX * this.speed * dt;
        this.y += this.dirY * this.speed * dt;
        this.age += dt;
        if (this.age >= this.lifetime) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class ExperienceGem {
    constructor(x, y, amount) {
        this.x = x;
        this.y = y;
        this.amount = amount;
        this.radius = 6;
        this.color = '#00f2fe';
        this.markedForDeletion = false;
    }

    update(dt) {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        const pullRadius = player.radius * 4; 
        if (dist < pullRadius) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            this.x += (dx / dist) * 400 * dt;
            this.y += (dy / dist) * 400 * dt;
        }

        if (dist < player.radius + this.radius) {
            player.gainXp(this.amount);
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - this.radius);
        ctx.lineTo(this.x + this.radius, this.y);
        ctx.lineTo(this.x, this.y + this.radius);
        ctx.lineTo(this.x - this.radius, this.y);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 100 + 50;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.5 + 0.5;
        this.radius = Math.random() * 3 + 1;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= this.decay * dt;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class DamageNumber {
    constructor(x, y, amount) {
        this.x = x;
        this.y = y;
        this.amount = Math.floor(amount);
        this.life = 1.0;
        this.vy = -50;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.amount, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 100;
    const spawnX = player.x + Math.cos(angle) * distance;
    const spawnY = player.y + Math.sin(angle) * distance;
    enemies.push(new Enemy(spawnX, spawnY));
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

function startGame() {
    gameState = 'playing';
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    player = new Player();
    enemies = [];
    projectiles = [];
    gems = [];
    particles = [];
    damageNumbers = [];
    gameTime = 0;
    enemySpawnTimer = 0;
    
    updateHUD();
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'gameover';
    gameOverScreen.classList.remove('hidden');
    
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
    document.getElementById('final-time').innerText = `${minutes}:${seconds}`;
    document.getElementById('final-level').innerText = player.level;
}

function triggerLevelUp() {
    gameState = 'paused';
    levelUpScreen.classList.remove('hidden');
    
    const optionsContainer = document.getElementById('upgrade-options');
    optionsContainer.innerHTML = '';
    
    const upgrades = [
        { title: '傷害提升', desc: '攻擊力 +20%', action: () => player.damageMultiplier += 0.2 },
        { title: '攻擊速度', desc: '攻擊速度 +20%', action: () => player.attackSpeedMultiplier += 0.2 },
        { title: '移動速度', desc: '移動速度 +15%', action: () => player.speed += 30 },
        { title: '生命回復', desc: '回復 50% 生命值', action: () => { player.health = Math.min(player.health + player.maxHealth * 0.5, player.maxHealth); updateHUD(); } },
        { title: '最大生命', desc: '最大生命值 +20%', action: () => { 
            player.maxHealth *= 1.2; 
            player.health += player.maxHealth * 0.2;
            updateHUD(); 
        } }
    ];
    
    const shuffled = upgrades.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);
    
    selected.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div class="upgrade-title">${upgrade.title}</div>
            <div class="upgrade-desc">${upgrade.desc}</div>
        `;
        card.onclick = () => {
            upgrade.action();
            levelUpScreen.classList.add('hidden');
            gameState = 'playing';
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        };
        optionsContainer.appendChild(card);
    });
}

function updateHUD() {
    healthBar.style.width = `${(Math.max(player.health, 0) / player.maxHealth) * 100}%`;
    xpBar.style.width = `${(player.xp / player.maxXp) * 100}%`;
    levelDisplay.innerText = `Level ${player.level}`;
}

function drawBackground() {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const gridSize = 100;
    
    const offsetX = -camera.x % gridSize;
    const offsetY = -camera.y % gridSize;
    
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let x = offsetX - gridSize; x < canvas.width + gridSize; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    
    for (let y = offsetY - gridSize; y < canvas.height + gridSize; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    
    ctx.stroke();
}

function checkCollisions() {
    for (let p of projectiles) {
        if (p.markedForDeletion) continue;
        for (let e of enemies) {
            if (e.markedForDeletion) continue;
            
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < p.radius + e.radius) {
                e.takeDamage(p.damage);
                p.markedForDeletion = true; // projectile consumed
                break; 
            }
        }
    }
}

function update(dt) {
    if (gameState !== 'playing') return;
    
    gameTime += dt;
    enemySpawnTimer += dt;
    
    const spawnRate = Math.max(0.05, 1.0 - (gameTime / 150)); 
    if (enemySpawnTimer > spawnRate) {
        spawnEnemy();
        if (gameTime > 60 && Math.random() < 0.5) spawnEnemy();
        if (gameTime > 120) spawnEnemy();
        enemySpawnTimer = 0;
    }
    
    player.update(dt);
    
    for (let e of enemies) e.update(dt);
    for (let p of projectiles) p.update(dt);
    for (let g of gems) g.update(dt);
    for (let pt of particles) pt.update(dt);
    for (let d of damageNumbers) d.update(dt);
    
    checkCollisions();
    
    enemies = enemies.filter(e => !e.markedForDeletion);
    projectiles = projectiles.filter(p => !p.markedForDeletion);
    gems = gems.filter(g => !g.markedForDeletion);
    particles = particles.filter(pt => pt.life > 0);
    damageNumbers = damageNumbers.filter(d => d.life > 0);
    
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${minutes}:${seconds}`;
}

function draw() {
    drawBackground();
    
    if (gameState === 'playing' || gameState === 'gameover' || gameState === 'paused') {
        ctx.save();
        ctx.translate(-camera.x + canvas.width/2, -camera.y + canvas.height/2);
        
        for (let g of gems) g.draw(ctx);
        for (let e of enemies) e.draw(ctx);
        for (let p of projectiles) p.draw(ctx);
        for (let pt of particles) pt.draw(ctx);
        player.draw(ctx);
        for (let d of damageNumbers) d.draw(ctx);
        
        ctx.restore();
    }
}

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); 
    lastTime = timestamp;

    update(dt);
    draw();

    if (gameState !== 'menu') {
        requestAnimationFrame(gameLoop);
    }
}

menuScreen.classList.remove('hidden');
drawBackground();
