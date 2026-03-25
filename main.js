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

const images = {
    player: new Image(),
    enemy: new Image(),
    bg: new Image()
};

images.player.src = 'player.png';
images.enemy.src = 'enemy.png';
images.bg.src = 'bg.png';
let bgPattern = null;

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
let dustTrails = [];
let gameTime = 0; // seconds
let enemySpawnTimer = 0;
let score = 0;

function getNearestEnemy(px, py) {
    let nearest = null;
    let minDistance = Infinity;
    for (const enemy of enemies) {
        if(enemy.markedForDeletion) continue;
        const dist = Math.hypot(px - enemy.x, py - enemy.y);
        if (dist < minDistance) {
            minDistance = dist;
            nearest = enemy;
        }
    }
    return nearest ? { enemy: nearest, dist: minDistance } : null;
}

// === WEAPON SYSTEM ===
class Weapon {
    constructor(player) {
        this.player = player;
        this.level = 1;
        this.maxLevel = 5;
    }
    update(dt) {}
    draw(ctx) {}
}

class Pistol extends Weapon {
    constructor(player) {
        super(player);
        this.cooldown = 1.0;
        this.timer = 0;
        this.damage = 25;
    }
    upgrade() {
        this.level++;
        this.damage += 10;
        this.cooldown = Math.max(0.3, this.cooldown - 0.15);
    }
    update(dt) {
        this.timer += dt;
        if (this.timer >= this.cooldown / this.player.attackSpeedMultiplier) {
            let nearest = getNearestEnemy(this.player.x, this.player.y);
            if (nearest && nearest.dist < 500 * (1 + this.level * 0.1)) {
                const dirX = (nearest.enemy.x - this.player.x) / nearest.dist;
                const dirY = (nearest.enemy.y - this.player.y) / nearest.dist;
                projectiles.push(new Projectile(this.player.x, this.player.y, dirX, dirY, this.damage * this.player.damageMultiplier, '#ffd700', 500));
            }
            this.timer = 0;
        }
    }
}

class Shotgun extends Weapon {
    constructor(player) {
        super(player);
        this.cooldown = 1.5;
        this.timer = 0;
        this.damage = 15;
        this.pellets = 3;
    }
    upgrade() {
        this.level++;
        this.damage += 5;
        this.pellets += 1;
        this.cooldown = Math.max(0.6, this.cooldown - 0.1);
    }
    update(dt) {
        this.timer += dt;
        if (this.timer >= this.cooldown / this.player.attackSpeedMultiplier) {
            let nearest = getNearestEnemy(this.player.x, this.player.y);
            if (nearest && nearest.dist < 350 * (1 + this.level * 0.1)) {
                const baseAngle = Math.atan2(nearest.enemy.y - this.player.y, nearest.enemy.x - this.player.x);
                const spread = 0.25; 
                for(let i=0; i<this.pellets; i++) {
                    const angle = baseAngle - (spread * (this.pellets-1)/2) + spread * i;
                    const dirX = Math.cos(angle);
                    const dirY = Math.sin(angle);
                    projectiles.push(new Projectile(this.player.x, this.player.y, dirX, dirY, this.damage * this.player.damageMultiplier, '#ff8800', 400));
                }
            }
            this.timer = 0;
        }
    }
}

class OrbWeapon extends Weapon {
    constructor(player) {
        super(player);
        this.damage = 10;
        this.orbCount = 2; 
        this.rotationSpeed = 3;
        this.distance = 90;
        this.angle = 0;
    }
    upgrade() {
        this.level++;
        this.damage += 5;
        this.orbCount += 1;
        this.distance += 10;
    }
    update(dt) {
        this.angle += this.rotationSpeed * dt;
        for(let i=0; i<this.orbCount; i++) {
            const currentAngle = this.angle + (Math.PI * 2 / this.orbCount) * i;
            const ox = this.player.x + Math.cos(currentAngle) * this.distance;
            const oy = this.player.y + Math.sin(currentAngle) * this.distance;
            
            for(let e of enemies) {
                if(e.markedForDeletion) continue;
                const dist = Math.hypot(ox - e.x, oy - e.y);
                if (dist < 15 + e.radius) {
                    if (gameTime - e.lastOrbHitTime > 0.4) {
                        e.takeDamage(this.damage * this.player.damageMultiplier, null); // Pass null as source
                        e.lastOrbHitTime = gameTime;
                    }
                }
            }
        }
    }
    draw(ctx) {
        for(let i=0; i<this.orbCount; i++) {
            const currentAngle = this.angle + (Math.PI * 2 / this.orbCount) * i;
            const ox = this.player.x + Math.cos(currentAngle) * this.distance;
            const oy = this.player.y + Math.sin(currentAngle) * this.distance;
            
            ctx.beginPath();
            ctx.arc(ox, oy, 12, 0, Math.PI*2);
            ctx.fillStyle = '#00ffff';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.globalAlpha = 0.6;
            ctx.arc(ox, oy, 20, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.radius = 20;
        this.speed = 220;
        this.maxHealth = 100;
        this.health = 100;
        this.xp = 0;
        this.maxXp = 50;
        this.level = 1;
        
        this.damageMultiplier = 1.0;
        this.attackSpeedMultiplier = 1.0;
        
        this.weapons = [];
        this.moveTime = 0;
        this.isMoving = false;
    }

    update(dt) {
        let dx = 0;
        let dy = 0;
        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            this.moveTime += dt * 15;
            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;
            
            if (Math.random() < 0.2) {
                dustTrails.push(new Dust(this.x, this.y + this.radius * 2));
            }
        } else {
            this.isMoving = false;
        }

        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        
        camera.x = this.x;
        camera.y = this.y;

        for(let w of this.weapons) w.update(dt);
    }

    draw(ctx) {
        if (images.player.complete && images.player.naturalWidth > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            const size = this.radius * 7.5; 
            
            if (this.isMoving) {
                const stride = Math.sin(this.moveTime) * 12; 
                ctx.fillStyle = '#111'; 
                ctx.beginPath();
                ctx.ellipse(-12, size/3 + stride, 8, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(12, size/3 - stride, 8, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.translate(0, Math.abs(Math.sin(this.moveTime)) * -6);
            }
            
            ctx.drawImage(images.player, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
        for(let w of this.weapons) w.draw(ctx);
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
            this.maxXp = Math.floor(this.maxXp * 1.3);
            triggerLevelUp();
        }
        updateHUD();
    }
}

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        
        this.markedForDeletion = false;
        this.hitCooldown = 0;
        this.lastOrbHitTime = 0;
        this.moveTime = Math.random() * Math.PI * 2;
        
        if(type === 'zombie') {
            this.radius = 15;
            this.speed = 100 + Math.random() * 50 + (gameTime / 120) * 30; 
            this.maxHealth = 30 + (gameTime / 60) * 15; 
            this.damage = 10 + (gameTime / 120) * 5;
            this.color = '#ff0844';
        } else if (type === 'runner') {
            this.radius = 12;
            this.speed = 220 + Math.random() * 40;
            this.maxHealth = 15 + (gameTime / 60) * 5;
            this.damage = 5;
            this.color = '#ff8800'; 
        } else if (type === 'tank') {
            this.radius = 35;
            this.speed = 50 + Math.random() * 20;
            this.maxHealth = 250 + (gameTime / 60) * 80;
            this.damage = 25;
            this.color = '#9d4edd'; 
        }
        this.health = this.maxHealth;
    }

    update(dt) {
        this.moveTime += dt * (this.type === 'runner' ? 18 : (this.type === 'tank' ? 6 : 12));
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
        if (images.enemy.complete && images.enemy.naturalWidth > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            let angle = Math.atan2(dy, dx);
            ctx.rotate(angle);
            
            const size = this.radius * 7.0; 
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.type === 'tank' ? 8 : 4;
            ctx.lineCap = 'round';
            for (let i = -1; i <= 1; i += 2) {
                const fStride = Math.sin(this.moveTime + i) * 15;
                ctx.beginPath();
                ctx.moveTo(0, i * this.radius);
                ctx.lineTo(this.radius + fStride, i * this.radius * 2);
                ctx.stroke();
                
                const bStride = Math.sin(this.moveTime + i + Math.PI) * 15;
                ctx.beginPath();
                ctx.moveTo(-this.radius*0.8, i * this.radius);
                ctx.lineTo(-this.radius*2 + bStride, i * this.radius * 2);
                ctx.stroke();
            }
            
            ctx.scale(1.0 + Math.sin(this.moveTime*2)*0.03, 1.0 - Math.sin(this.moveTime*2)*0.03);
            
            // Adjust visual style for different types using blend modes or tints if desired, or just raw image scaled
            ctx.drawImage(images.enemy, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
    }
    
    takeDamage(amount, source) {
        this.health -= amount;
        
        // Scattered text so shotgun multi-hits don't completely overlap perfectly
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = (Math.random() - 0.5) * 30;
        damageNumbers.push(new DamageNumber(this.x + offsetX, this.y - 20 + offsetY, amount));
        
        // Add tiny physical knockback when hit by bullets!
        if (source && source.dirX !== undefined) {
            this.x += source.dirX * 6; // 6 pixels pushback per bullet hit
            this.y += source.dirY * 6;
        }

        for(let i=0; i<3; i++) particles.push(new Particle(this.x, this.y, '#ffd700'));

        if (this.health <= 0) {
            this.markedForDeletion = true;
            const xpAmount = this.type === 'tank' ? 50 : (this.type === 'runner' ? 8 : 12);
            gems.push(new ExperienceGem(this.x, this.y, xpAmount));
            for(let i=0; i<15; i++) particles.push(new Particle(this.x, this.y, this.color));
            
            score += this.type === 'tank' ? 100 : (this.type === 'runner' ? 20 : 10);
            document.getElementById('score-display').innerText = `Score: ${score}`;
        }
    }
}

class Projectile {
    constructor(x, y, dirX, dirY, damage, color, speed) {
        this.x = x;
        this.y = y;
        this.dirX = dirX;
        this.dirY = dirY;
        this.speed = speed;
        this.radius = 6;
        this.damage = damage;
        this.color = color; 
        this.lifetime = 1.5; 
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
        this.radius = amount > 20 ? 10 : 6;
        this.color = amount > 20 ? '#ff00ff' : '#00f2fe';
        this.markedForDeletion = false;
    }

    update(dt) {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        const pullRadius = player.radius * 5; 
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
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.amount, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}

class Dust {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.radius = Math.random() * 4 + 2;
        this.vx = (Math.random() - 0.5) * 15;
        this.vy = (Math.random() - 0.5) * 15;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.radius += dt * 5; 
        this.life -= dt * 2.5; 
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life * 0.4);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) / 2 + 100;
    const spawnX = player.x + Math.cos(angle) * distance;
    const spawnY = player.y + Math.sin(angle) * distance;
    
    let type = 'zombie';
    if (gameTime > 15 && Math.random() < 0.3) type = 'runner';
    if (gameTime > 60 && Math.random() < 0.1) type = 'tank';
    
    enemies.push(new Enemy(spawnX, spawnY, type));
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

function startGame() {
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    player = new Player();
    enemies = [];
    projectiles = [];
    gems = [];
    particles = [];
    damageNumbers = [];
    dustTrails = [];
    gameTime = 0;
    enemySpawnTimer = 0;
    score = 0;
    document.getElementById('score-display').innerText = `Score: 0`;
    
    updateHUD();
    triggerLevelUp(true); // Pops initial selection!
}

function gameOver() {
    gameState = 'gameover';
    gameOverScreen.classList.remove('hidden');
    
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
    const timeStr = `${minutes}:${seconds}`;
    
    document.getElementById('final-time').innerText = timeStr;
    document.getElementById('final-level').innerText = player.level;
    document.getElementById('final-score').innerText = score;
    
    handleLeaderboard(score, timeStr, player.level);
}

function triggerLevelUp(isGameStart = false) {
    gameState = 'paused';
    levelUpScreen.classList.remove('hidden');
    
    const optionsContainer = document.getElementById('upgrade-options');
    optionsContainer.innerHTML = '';
    let pool = [];
    
    const hasPistol = player.weapons.find(w => w instanceof Pistol);
    const hasShotgun = player.weapons.find(w => w instanceof Shotgun);
    const hasOrb = player.weapons.find(w => w instanceof OrbWeapon);

    if(isGameStart) {
        document.querySelector('#level-up-screen h2').innerText = '選擇你的初始武器！';
        pool.push({ title: '自動手槍', desc: '單發高傷、精準追蹤', action: () => player.weapons.push(new Pistol(player)) });
        pool.push({ title: '散彈槍', desc: '扇形散射、近戰壓制', action: () => player.weapons.push(new Shotgun(player)) });
        pool.push({ title: '守護法球', desc: '持續牽制、近身防禦', action: () => player.weapons.push(new OrbWeapon(player)) });
    } else {
        document.querySelector('#level-up-screen h2').innerText = '升級！選擇一項能力';
        
        if(!hasPistol) pool.push({ title: '解鎖：自動手槍', desc: '自動解鎖精準鎖定手槍', action: () => player.weapons.push(new Pistol(player)) });
        else if(hasPistol.level < hasPistol.maxLevel) pool.push({ title: `升級：自動手槍 Lv.${hasPistol.level+1}`, desc: '手槍傷害與射速全面提升', action: () => hasPistol.upgrade() });

        if(!hasShotgun) pool.push({ title: '解鎖：散彈槍', desc: '解鎖大範圍強力散彈槍', action: () => player.weapons.push(new Shotgun(player)) });
        else if(hasShotgun.level < hasShotgun.maxLevel) pool.push({ title: `升級：散彈槍 Lv.${hasShotgun.level+1}`, desc: '散彈增加子彈與傷害', action: () => hasShotgun.upgrade() });
        
        if(!hasOrb) pool.push({ title: '解鎖：守護法球', desc: '召喚環繞在身邊的護體法球', action: () => player.weapons.push(new OrbWeapon(player)) });
        else if(hasOrb.level < hasOrb.maxLevel) pool.push({ title: `升級：守護法球 Lv.${hasOrb.level+1}`, desc: '法球增加數量與威力', action: () => hasOrb.upgrade() });
        
        pool.push({ title: '力量鍛鍊', desc: '全武器基礎傷害 +20%', action: () => player.damageMultiplier += 0.2 });
        pool.push({ title: '敏捷強化', desc: '跑速大幅提升', action: () => player.speed += 30 });
        pool.push({ title: '營養補給', desc: '立即恢復 50% 生命', action: () => { player.health = Math.min(player.health + player.maxHealth * 0.5, player.maxHealth); updateHUD(); } });
    }
    
    const shuffled = pool.sort(() => 0.5 - Math.random());
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
    
    if (images.bg.complete && images.bg.naturalWidth > 0) {
        ctx.save();
        const bgWidth = images.bg.width;
        const bgHeight = images.bg.height;
        const offsetX = -camera.x % bgWidth;
        const offsetY = -camera.y % bgHeight;
        ctx.translate(offsetX - bgWidth, offsetY - bgHeight);
        if (!bgPattern) bgPattern = ctx.createPattern(images.bg, 'repeat');
        if (bgPattern) {
            ctx.fillStyle = bgPattern;
            ctx.fillRect(0, 0, canvas.width + bgWidth * 2, canvas.height + bgHeight * 2);
        }
        ctx.restore();
    }
}

function checkCollisions() {
    for (let p of projectiles) {
        if (p.markedForDeletion) continue;
        for (let e of enemies) {
            if (e.markedForDeletion) continue;
            
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < p.radius + e.radius) {
                e.takeDamage(p.damage, p); // Pass the projectile as source
                p.markedForDeletion = true; // hit single target
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
    for (let d of dustTrails) d.update(dt);
    
    checkCollisions();
    
    enemies = enemies.filter(e => !e.markedForDeletion);
    projectiles = projectiles.filter(p => !p.markedForDeletion);
    gems = gems.filter(g => !g.markedForDeletion);
    particles = particles.filter(pt => pt.life > 0);
    damageNumbers = damageNumbers.filter(d => d.life > 0);
    dustTrails = dustTrails.filter(d => d.life > 0);
    
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${minutes}:${seconds}`;
}

function draw() {
    drawBackground();
    
    if (gameState === 'playing' || gameState === 'gameover' || gameState === 'paused') {
        ctx.save();
        ctx.translate(-camera.x + canvas.width/2, -camera.y + canvas.height/2);
        
        for (let d of dustTrails) d.draw(ctx);
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

// --- LEADERBOARD LOGIC ---
function getLeaderboard() {
    const data = localStorage.getItem('survivor_leaderboard');
    return data ? JSON.parse(data) : [];
}

function handleLeaderboard(newScore, timeStr, level) {
    let board = getLeaderboard();
    const entry = { score: newScore, time: timeStr, level: level, date: new Date().toLocaleDateString() };
    
    if (newScore > 0) {
        board.push(entry);
        board.sort((a, b) => b.score - a.score);
        board = board.slice(0, 5);
        localStorage.setItem('survivor_leaderboard', JSON.stringify(board));
    }
    
    renderLeaderboardHTML('gameover-leaderboard', board, newScore);
    renderLeaderboardHTML('menu-leaderboard', board);
}

function renderLeaderboardHTML(containerId, board, highlightScore = -1) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (board.length === 0) {
        container.innerHTML = `<div class="leaderboard-title">英雄榜 (Top 5)</div><div style="text-align:center; color:#888;">暫無紀錄</div>`;
        return;
    }
    
    let html = `<div class="leaderboard-title">英雄榜 (Top 5)</div>`;
    let highlightedIndex = highlightScore > -1 ? board.findIndex(b => b.score === highlightScore) : -1;

    board.forEach((entry, idx) => {
        const isHighlight = idx === highlightedIndex ? 'highlight' : '';
        const rankClass = idx < 3 ? `rank-${idx+1}` : '';
        html += `
            <div class="leaderboard-item ${rankClass} ${isHighlight}">
                <span>#${idx+1} <span style="font-size:12px;color:#aaa;">(${entry.time})</span></span>
                <span>${entry.score} pts</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

renderLeaderboardHTML('menu-leaderboard', getLeaderboard());

menuScreen.classList.remove('hidden');
drawBackground();
