import Phaser from 'phaser';
import './styles.css';

const GAME_WIDTH = 384;
const GAME_HEIGHT = 216;
const TILE = 16;
const FLOOR_COLS = 4;
const FLOOR_ROWS = 2;
const ROOM_WIDTH = GAME_WIDTH;
const ROOM_HEIGHT = GAME_HEIGHT;
const ROOM_COLS = 3;
const ROOM_ROWS = 3;
const WORLD_WIDTH = ROOM_WIDTH * ROOM_COLS;
const WORLD_HEIGHT = ROOM_HEIGHT * ROOM_ROWS;
const HOTBAR_SIZE = 8;
const HOTBAR_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];
const START_ROOM = { x: 1, y: 1 };
const DOOR_HALF_SIZE = 34;
const PASSIVE_INK_REGEN = 2.2;
const INK_BOTTLE_DROP_CHANCE = 0.05;
const INK_BOTTLE_VALUE = 25;

const clamp = Phaser.Math.Clamp;
const dist = Phaser.Math.Distance.Between;
const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
const PLAYER_OUTLINE_OFFSETS = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 }
];
const TILE_FRAME = {
  floor: 0,
  crackedFloor: 1,
  fleckFloor: 2,
  horizontalWall: 3,
  verticalWall: 4,
  cornerWall: 5,
  threshold: 6,
  rewardFloor: 7
};

const SPELL_COLORS = [0x7df9ff, 0xffd166, 0xef476f, 0xa855f7, 0x75f2a7, 0xf78c6b];
const SPELL_ARCHETYPES = [
  {
    type: 'blade',
    names: ['Cutting Draft', 'Knife Psalm', 'Edge Writ'],
    range: [175, 245],
    draw: [12, 24],
    cooldown: [460, 780],
    ink: [7, 14],
    damage: 1,
    behavior: 'blade',
    copies: 1,
    spread: 0,
    speed: 1.12,
    scale: 0.82,
    note: 'FAST LINE'
  },
  {
    type: 'sigil',
    names: ['Still Mandala', 'Circle Seal', 'Anchor Rune'],
    range: [90, 150],
    draw: [22, 36],
    cooldown: [860, 1320],
    ink: [12, 22],
    damage: 2,
    behavior: 'sigil',
    copies: 1,
    spread: 0,
    spin: 3.2,
    scale: 1.42,
    note: 'SLOW AURA'
  },
  {
    type: 'scatter',
    names: ['Torn Leaves', 'Forked Note', 'Splinter Page'],
    range: [125, 190],
    draw: [16, 28],
    cooldown: [720, 1120],
    ink: [11, 20],
    damage: 1,
    behavior: 'scatter',
    copies: 3,
    spread: 0.27,
    speed: 0.96,
    scale: 0.78,
    note: 'THREE CAST'
  },
  {
    type: 'orbit',
    names: ['Pocket Orbit', 'Halo Scrap', 'Loop Charm'],
    range: [80, 135],
    draw: [18, 30],
    cooldown: [920, 1350],
    ink: [10, 18],
    damage: 1,
    behavior: 'orbit',
    copies: 1,
    spread: 0,
    spin: 6.2,
    scale: 1.08,
    note: 'RETURNING'
  }
];

const ENEMY_ROLES = {
  chaser: { texture: 'candle', anim: 'candle-walk', hp: 2, speed: 26, touch: 1, tint: 0xffffff },
  charger: { texture: 'candle', anim: 'candle-walk', hp: 2, speed: 22, touch: 1, tint: 0xffb347 },
  caster: { texture: 'candle', anim: 'candle-walk', hp: 2, speed: 20, touch: 1, tint: 0xa855f7 },
  brute: { texture: 'brute', anim: 'brute-walk', hp: 4, speed: 17, touch: 2, tint: 0x9bbcff }
};

class RogueScene extends Phaser.Scene {
  constructor() {
    super('RogueScene');
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.pickups = [];
    this.weapons = [];
    this.selectedWeapon = 0;
    this.editingWeapon = null;
    this.pendingPickup = null;
    this.replacePrompt = null;
    this.paperDrawing = false;
    this.paperPoints = [];
    this.wave = 1;
    this.hp = 8;
    this.maxHp = 8;
    this.dead = false;
    this.invuln = 0;
    this.score = 0;
    this.nextPickupAt = 0;
    this.maxInk = 100;
    this.ink = this.maxInk;
    this.inkRegen = PASSIVE_INK_REGEN;
    this.rooms = [];
    this.currentRoom = { ...START_ROOM };
  }

  preload() {
    this.load.spritesheet('player', assetUrl('assets/sprites/player-32.png'), { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('candle', assetUrl('assets/sprites/candle-minion-32.png'), { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('brute', assetUrl('assets/sprites/crystal-brute-32.png'), { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('magic', assetUrl('assets/sprites/magic-32.png'), { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('dungeon-tiles', assetUrl('assets/tiles/dungeon-runtime-16.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.image('tile-floor', assetUrl('assets/tiles/tile_1.png'));
    this.load.image('tile-cracked', assetUrl('assets/tiles/tile_cracked.png'));
    this.load.image('tile-magic', assetUrl('assets/tiles/tile_magic.png'));
    this.load.image('tile-magic-2', assetUrl('assets/tiles/tile_magic_2.png'));
  }

  create() {
    this.cameras.main.setBackgroundColor('#111018');
    this.createTextures();
    this.createAnimations();

    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'player').setDepth(12);
    this.player.play('player-idle');
    this.player.body.setSize(12, 14);
    this.player.body.setOffset(10, 14);
    this.player.setCollideWorldBounds(true);
    this.playerOutlineSprites = PLAYER_OUTLINE_OFFSETS.map((offset) => {
      const outline = this.add.image(this.player.x + offset.x, this.player.y + offset.y, 'player', 0).setDepth(11);
      outline.offset = offset;
      outline.setTint(0x05030a);
      outline.setAlpha(0.9);
      return outline;
    });

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.keys = this.input.keyboard.addKeys(`W,A,S,D,UP,LEFT,DOWN,RIGHT,R,${HOTBAR_KEYS.join(',')}`);
    this.pointer = this.input.activePointer;

    this.playerReadabilityLayer = this.add.graphics().setDepth(11);
    this.attackLayer = this.add.graphics().setDepth(18);
    this.worldDrawLayer = this.add.graphics().setDepth(20);

    this.createHud();
    this.startNewRun();
    this.input.on('pointerdown', (pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', () => this.handlePointerUp());
  }

  createTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xf4ead3, 1);
    g.fillRect(1, 2, 11, 10);
    g.fillStyle(0x8b6f4e, 1);
    g.fillRect(1, 2, 11, 1);
    g.fillRect(11, 3, 1, 9);
    g.fillStyle(0x7df9ff, 1);
    g.fillRect(4, 5, 5, 1);
    g.fillRect(5, 7, 4, 1);
    g.generateTexture('paper-pickup', 14, 14);
    g.clear();
    g.fillStyle(0x2f2840, 1);
    g.fillRect(5, 1, 5, 3);
    g.fillRect(4, 4, 7, 9);
    g.fillStyle(0x7df9ff, 1);
    g.fillRect(5, 6, 5, 5);
    g.fillStyle(0xf8f4dc, 1);
    g.fillRect(6, 7, 2, 1);
    g.generateTexture('ink-bottle', 14, 14);
    g.clear();
    g.fillStyle(0x7df9ff, 1);
    g.fillRect(6, 0, 4, 16);
    g.fillRect(0, 6, 16, 4);
    g.fillStyle(0xffffff, 1);
    g.fillRect(7, 7, 2, 2);
    g.generateTexture('spark-core', 16, 16);
    g.clear();
    g.fillStyle(0x7df9ff, 1);
    g.fillRect(3, 3, 3, 3);
    g.fillRect(10, 4, 2, 2);
    g.fillRect(6, 10, 2, 2);
    g.generateTexture('hit-spark', 16, 16);
    g.clear();
    g.fillStyle(0xffd166, 1);
    g.fillRect(6, 2, 4, 12);
    g.fillRect(2, 6, 12, 4);
    g.fillStyle(0xa855f7, 1);
    g.fillRect(7, 7, 2, 2);
    g.generateTexture('enemy-shot', 16, 16);
    g.destroy();
  }

  createAnimations() {
    this.anims.create({ key: 'player-idle', frames: this.anims.generateFrameNumbers('player', { frames: [0, 1, 2, 3] }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'player-side', frames: this.anims.generateFrameNumbers('player', { frames: [4, 5, 6, 7] }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'player-up', frames: this.anims.generateFrameNumbers('player', { frames: [8, 9, 10, 11] }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'player-cast', frames: this.anims.generateFrameNumbers('player', { frames: [12, 13, 14, 15] }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'candle-walk', frames: this.anims.generateFrameNumbers('candle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'brute-walk', frames: this.anims.generateFrameNumbers('brute', { start: 0, end: 3 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'magic-glyph', frames: this.anims.generateFrameNumbers('magic', { start: 0, end: 5 }), frameRate: 12, repeat: -1 });
  }

  createHud() {
    this.hpText = this.addHudText(8, 6);
    this.statusText = this.addHudText(8, 176);
    this.weaponText = this.addHudText(248, 6);
    this.hotbarLayer = this.add.graphics().setDepth(40).setScrollFactor(0);
    this.paperLayer = this.add.graphics().setDepth(70).setScrollFactor(0);
    this.paperText = this.add.text(GAME_WIDTH / 2, 30, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#241929',
      align: 'center'
    }).setOrigin(0.5, 0).setDepth(71).setScrollFactor(0);
    this.paperInfoText = this.add.text(GAME_WIDTH / 2, 160, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#241929',
      align: 'center'
    }).setOrigin(0.5, 0).setDepth(71).setScrollFactor(0);
    this.paperButtonTexts = [
      this.addOverlayText(),
      this.addOverlayText()
    ];
  }

  addHudText(x, y) {
    return this.add.text(x, y, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#f8f4dc',
      stroke: '#09080d',
      strokeThickness: 2
    }).setDepth(40).setScrollFactor(0).setResolution(1);
  }

  addOverlayText() {
    return this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#f8f4dc',
      align: 'center'
    }).setOrigin(0.5, 0.5).setDepth(72).setScrollFactor(0).setResolution(1);
  }

  buildDungeon() {
    if (this.floorBack) this.floorBack.destroy();
    if (this.floor) this.floor.destroy();
    if (this.floorTiles) this.floorTiles.clear(true, true);
    this.floorBack = this.add.graphics().setDepth(-2);
    this.floorBack.fillStyle(0x09080d, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.floor = this.add.graphics().setDepth(1);
    this.floorTiles = this.add.group();
    this.rooms = [];
    const rewardRoomKey = Phaser.Utils.Array.GetRandom([
      '0,0',
      '2,0',
      '0,2',
      '2,2'
    ]);

    for (let ry = 0; ry < ROOM_ROWS; ry++) {
      for (let rx = 0; rx < ROOM_COLS; rx++) {
        const key = `${rx},${ry}`;
        const room = {
          x: rx,
          y: ry,
          type: rx === START_ROOM.x && ry === START_ROOM.y ? 'neutral' : key === rewardRoomKey ? 'reward' : 'combat',
          visited: false,
          cleared: false,
          rewardSpawned: false
        };
        this.rooms.push(room);
        this.drawRoom(room);
      }
    }
  }

  drawRoom(room) {
    const left = room.x * ROOM_WIDTH;
    const top = room.y * ROOM_HEIGHT;
    const right = left + ROOM_WIDTH;
    const bottom = top + ROOM_HEIGHT;
    const doorX = left + ROOM_WIDTH / 2;
    const doorY = top + ROOM_HEIGHT / 2;

    this.floorBack.fillStyle(room.type === 'neutral' ? 0x15131f : 0x111018, 1).fillRect(left, top, ROOM_WIDTH, ROOM_HEIGHT);
    const floorLeft = left + TILE;
    const floorTop = top + TILE;
    const floorWidth = ROOM_WIDTH - TILE * 2;
    const floorHeight = ROOM_HEIGHT - TILE * 2;
    const floorTileWidth = floorWidth / FLOOR_COLS;
    const floorTileHeight = floorHeight / FLOOR_ROWS;
    for (let row = 0; row < FLOOR_ROWS; row++) {
      for (let col = 0; col < FLOOR_COLS; col++) {
        const x = floorLeft + col * floorTileWidth;
        const y = floorTop + row * floorTileHeight;
        this.addFloorTile(this.getFloorTileKey(col, row, room), x, y, floorTileWidth, floorTileHeight, room);
      }
    }

    for (let x = left; x < right; x += TILE) {
      this.addRoomTile(TILE_FRAME.horizontalWall, x, top, room);
      this.addRoomTile(TILE_FRAME.horizontalWall, x, bottom - TILE, room);
    }
    for (let y = top + TILE; y < bottom - TILE; y += TILE) {
      this.addRoomTile(TILE_FRAME.verticalWall, left, y, room);
      this.addRoomTile(TILE_FRAME.verticalWall, right - TILE, y, room);
    }

    this.addRoomTile(TILE_FRAME.cornerWall, left, top, room);
    this.addRoomTile(TILE_FRAME.cornerWall, right - TILE, top, room);
    this.addRoomTile(TILE_FRAME.cornerWall, left, bottom - TILE, room);
    this.addRoomTile(TILE_FRAME.cornerWall, right - TILE, bottom - TILE, room);

    if (room.y > 0) this.drawDoorTiles(doorX - DOOR_HALF_SIZE, top, DOOR_HALF_SIZE * 2, TILE, 'horizontal', room);
    if (room.y < ROOM_ROWS - 1) this.drawDoorTiles(doorX - DOOR_HALF_SIZE, bottom - TILE, DOOR_HALF_SIZE * 2, TILE, 'horizontal', room);
    if (room.x > 0) this.drawDoorTiles(left, doorY - DOOR_HALF_SIZE, TILE, DOOR_HALF_SIZE * 2, 'vertical', room);
    if (room.x < ROOM_COLS - 1) this.drawDoorTiles(right - TILE, doorY - DOOR_HALF_SIZE, TILE, DOOR_HALF_SIZE * 2, 'vertical', room);

    const moteCount = room.type === 'neutral' ? 12 : 28;
    for (let i = 0; i < moteCount; i++) {
      const x = Phaser.Math.Between(left + 24, right - 24);
      const y = Phaser.Math.Between(top + 24, bottom - 24);
      this.floor.fillStyle(room.type === 'reward' ? 0x2c2a3d : 0x242234, 1).fillRect(x, y, 3, 3);
    }
  }

  addRoomTile(frame, x, y, room) {
    const tile = this.add.image(x, y, 'dungeon-tiles', frame).setOrigin(0).setDepth(0);
    if (room.type === 'neutral') tile.setTint(0xd8d0ff);
    if (room.type === 'reward') tile.setTint(0xffefd0);
    this.floorTiles.add(tile);
    return tile;
  }

  addFloorTile(key, x, y, width, height, room) {
    const tile = this.add.image(x, y, key).setOrigin(0).setDepth(0).setDisplaySize(width, height);
    if (room.type === 'neutral') tile.setTint(0xd8d0ff);
    if (room.type === 'reward') tile.setTint(0xffefd0);
    this.floorTiles.add(tile);
    return tile;
  }

  getFloorTileKey(col, row, room) {
    const seed = col * 13 + row * 17 + room.x * 19 + room.y * 23;
    if (room.type === 'reward' && seed % 5 === 0) return 'tile-magic-2';
    if (seed % 13 === 0) return 'tile-magic-2';
    if (seed % 11 === 0) return 'tile-magic';
    if (seed % 3 === 0) return 'tile-cracked';
    return 'tile-floor';
  }

  drawDoorTiles(x, y, width, height, direction, room) {
    if (direction === 'horizontal') {
      for (let tx = x; tx < x + width; tx += TILE) this.addRoomTile(TILE_FRAME.threshold, tx, y, room);
      return;
    }
    for (let ty = y; ty < y + height; ty += TILE) this.addRoomTile(TILE_FRAME.threshold, x, ty, room);
  }

  showRoomClear(room) {
    const bounds = this.getRoomBounds(room);
    const doorX = bounds.centerX;
    const doorY = bounds.centerY;
    this.floor.fillStyle(0x31594f, 1);
    if (room.y > 0) this.floor.fillRect(doorX - DOOR_HALF_SIZE, bounds.top, DOOR_HALF_SIZE * 2, TILE);
    if (room.y < ROOM_ROWS - 1) this.floor.fillRect(doorX - DOOR_HALF_SIZE, bounds.bottom - TILE, DOOR_HALF_SIZE * 2, TILE);
    if (room.x > 0) this.floor.fillRect(bounds.left, doorY - DOOR_HALF_SIZE, TILE, DOOR_HALF_SIZE * 2);
    if (room.x < ROOM_COLS - 1) this.floor.fillRect(bounds.right - TILE, doorY - DOOR_HALF_SIZE, TILE, DOOR_HALF_SIZE * 2);
    this.floor.lineStyle(1, 0x7df9ff, 0.7);
    this.floor.strokeRect(bounds.left + 18, bounds.top + 18, ROOM_WIDTH - 36, ROOM_HEIGHT - 36);
  }

  startNewRun() {
    this.clearWorldEntities();
    this.buildDungeon();
    this.wave = 1;
    this.score = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.invuln = 1200;
    this.weapons = [];
    this.selectedWeapon = 0;
    this.editingWeapon = null;
    this.pendingPickup = null;
    this.replacePrompt = null;
    this.paperDrawing = false;
    this.paperPoints = [];
    this.nextPickupAt = this.time.now + 9000;
    this.ink = this.maxInk;
    this.currentRoom = { ...START_ROOM };
    this.player.clearTint();
    this.player.setAngle(0);
    this.player.setAlpha(1);
    this.playerReadabilityLayer?.clear();
    this.playerOutlineSprites?.forEach((outline) => outline.setVisible(true));
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.player.play('player-idle', true);
    this.physics.resume();
    this.player.anims.resume();
    this.paperLayer?.clear();
    this.attackLayer?.clear();
    this.paperText?.setText('');
    this.paperInfoText?.setText('');
    this.clearButtonTexts?.();
    this.getRoom(START_ROOM.x, START_ROOM.y).visited = true;
    this.spawnStarterPapers();
  }

  clearWorldEntities() {
    [...this.enemies, ...this.projectiles, ...this.enemyProjectiles, ...this.pickups].forEach((entity) => entity.destroy());
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.pickups = [];
  }

  getRoom(x, y) {
    return this.rooms.find((room) => room.x === x && room.y === y);
  }

  getCurrentRoom() {
    return this.getRoom(this.currentRoom.x, this.currentRoom.y);
  }

  getRoomBounds(room = this.getCurrentRoom()) {
    return {
      left: room.x * ROOM_WIDTH,
      right: (room.x + 1) * ROOM_WIDTH,
      top: room.y * ROOM_HEIGHT,
      bottom: (room.y + 1) * ROOM_HEIGHT,
      centerX: room.x * ROOM_WIDTH + ROOM_WIDTH / 2,
      centerY: room.y * ROOM_HEIGHT + ROOM_HEIGHT / 2
    };
  }

  enterRoom(x, y, fromDirection) {
    const room = this.getRoom(x, y);
    if (!room) return;
    this.currentRoom = { x, y };
    const bounds = this.getRoomBounds(room);
    const margin = TILE + 8;
    if (fromDirection === 'left') this.player.setPosition(bounds.right - margin, bounds.centerY);
    if (fromDirection === 'right') this.player.setPosition(bounds.left + margin, bounds.centerY);
    if (fromDirection === 'up') this.player.setPosition(bounds.centerX, bounds.bottom - margin);
    if (fromDirection === 'down') this.player.setPosition(bounds.centerX, bounds.top + margin);

    this.projectiles.forEach((projectile) => projectile.destroy());
    this.enemyProjectiles.forEach((projectile) => projectile.destroy());
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.attackLayer.clear();

    if (room.visited) return;
    room.visited = true;
    if (room.type === 'combat') this.spawnWave(room);
    if (room.type === 'reward' && !room.rewardSpawned) {
      room.rewardSpawned = true;
      room.cleared = true;
      this.spawnPaperPickup(bounds.centerX, bounds.centerY);
      this.showRoomClear(room);
    }
  }

  spawnWave(room = this.getCurrentRoom()) {
    if (!room || room.type === 'neutral') return;
    const bounds = this.getRoomBounds(room);
    const count = room.type === 'reward' ? 0 : 4 + this.wave;
    const roles = ['chaser', 'chaser'];
    if (this.wave >= 2) roles.push('charger');
    if (this.wave >= 3) roles.push('caster');
    if (this.wave >= 4) roles.push('brute');
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 48; tries++) {
        x = Phaser.Math.Between(bounds.left + 38, bounds.right - 38);
        y = Phaser.Math.Between(bounds.top + 38, bounds.bottom - 38);
        if (!this.player || dist(x, y, this.player.x, this.player.y) > 72) break;
      }
      const role = roles[i % roles.length];
      this.spawnEnemy(x, y, role);
    }
  }

  spawnEnemy(x, y, role = 'chaser') {
    const stats = ENEMY_ROLES[role] || ENEMY_ROLES.chaser;
    const enemy = this.physics.add.sprite(x, y, stats.texture).setDepth(8);
    enemy.play(stats.anim);
    enemy.role = role;
    enemy.baseTint = stats.tint;
    enemy.hp = stats.hp + Math.floor(this.wave / 5);
    enemy.speed = stats.speed + Math.min(10, this.wave * 2);
    enemy.touch = stats.touch;
    enemy.chargeCooldown = Phaser.Math.Between(1000, 1800);
    enemy.chargeWindup = 0;
    enemy.chargeTime = 0;
    enemy.chargeAngle = 0;
    enemy.castCooldown = Phaser.Math.Between(800, 1600);
    enemy.body.setSize(role === 'brute' ? 14 : 12, role === 'brute' ? 14 : 12);
    enemy.body.setOffset(role === 'brute' ? 9 : 10, role === 'brute' ? 14 : 15);
    if (stats.tint !== 0xffffff) enemy.setTint(stats.tint);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnPaperPickup(x, y, type = null) {
    const weapon = this.createWeapon(type);
    const pickup = this.physics.add.sprite(
      clamp(x, 32, WORLD_WIDTH - 32),
      clamp(y, 32, WORLD_HEIGHT - 32),
      'paper-pickup'
    ).setDepth(9);
    pickup.kind = 'paper';
    pickup.weapon = weapon;
    pickup.setTint(weapon.color);
    pickup.float = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.pickups.push(pickup);
  }

  spawnInkBottle(x, y) {
    const pickup = this.physics.add.sprite(
      clamp(x, 26, WORLD_WIDTH - 26),
      clamp(y, 26, WORLD_HEIGHT - 26),
      'ink-bottle'
    ).setDepth(9);
    pickup.kind = 'ink';
    pickup.value = INK_BOTTLE_VALUE;
    pickup.float = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.pickups.push(pickup);
  }

  spawnStarterPapers() {
    const spacing = 34;
    const startX = this.player.x - spacing * 1.5;
    SPELL_ARCHETYPES.forEach((archetype, index) => {
      this.spawnPaperPickup(startX + index * spacing, this.player.y + 38, archetype.type);
    });
  }

  createWeapon(type = null) {
    const archetype = SPELL_ARCHETYPES.find((spell) => spell.type === type) || Phaser.Utils.Array.GetRandom(SPELL_ARCHETYPES);
    const color = Phaser.Utils.Array.GetRandom(SPELL_COLORS);
    const weapon = {
      id: `${this.time.now}-${Phaser.Math.Between(100, 999)}`,
      name: Phaser.Utils.Array.GetRandom(archetype.names),
      type: archetype.type,
      note: archetype.note,
      behavior: archetype.behavior,
      color,
      maxPoints: Phaser.Math.Between(archetype.draw[0], archetype.draw[1]),
      maxDistance: Phaser.Math.Between(archetype.range[0], archetype.range[1]),
      cooldown: Phaser.Math.Between(archetype.cooldown[0], archetype.cooldown[1]),
      inkCost: Phaser.Math.Between(archetype.ink[0], archetype.ink[1]),
      cooldownLeft: 0,
      damage: archetype.damage,
      copies: archetype.copies,
      spread: archetype.spread,
      spin: archetype.spin || 0,
      castSpeed: archetype.speed || 1,
      shapeScale: archetype.scale || 1,
      form: null
    };
    return weapon;
  }

  addWeapon(weapon, slot = this.weapons.length) {
    if (slot < this.weapons.length) {
      this.weapons[slot] = weapon;
    } else {
      this.weapons.push(weapon);
    }
    this.selectedWeapon = clamp(slot, 0, HOTBAR_SIZE - 1);
  }

  openPaperEditor(weapon, slot = this.weapons.length) {
    this.addWeapon(weapon, slot);
    this.editingWeapon = weapon;
    this.pendingPickup = null;
    this.replacePrompt = null;
    this.paperDrawing = false;
    this.paperPoints = [];
    this.physics.pause();
    this.player.anims.pause();
    this.paperText.setText(`${weapon.name}\n${weapon.type.toUpperCase()} PAPER - ${weapon.note}`);
  }

  confirmPaperEditor() {
    if (!this.editingWeapon || this.countPaperPoints() < 2) return;
    if (this.countPaperPoints() > Math.floor(this.ink)) return;
    this.ink = Math.max(0, this.ink - this.countPaperPoints());
    this.editingWeapon.form = this.normalizePaperShape(this.paperPoints, this.editingWeapon);
    this.closePaperEditor();
  }

  undoPaperEditor() {
    this.paperDrawing = false;
    this.paperPoints = [];
  }

  closePaperEditor() {
    const weapon = this.editingWeapon;
    if (weapon && !weapon.form) {
      const index = this.weapons.indexOf(weapon);
      if (index !== -1) this.weapons.splice(index, 1);
      this.selectedWeapon = clamp(this.selectedWeapon, 0, Math.max(0, this.weapons.length - 1));
    }
    this.editingWeapon = null;
    this.paperDrawing = false;
    this.paperPoints = [];
    this.physics.resume();
    this.player.anims.resume();
    this.paperLayer.clear();
    this.paperText.setText('');
    this.paperInfoText.setText('');
    this.clearButtonTexts();
  }

  getPaperRect() {
    return new Phaser.Geom.Rectangle(102, 30, 180, 142);
  }

  getConfirmRect() {
    return new Phaser.Geom.Rectangle(116, 178, 64, 20);
  }

  getUndoRect() {
    return new Phaser.Geom.Rectangle(204, 178, 64, 20);
  }

  getReplaceRect() {
    return new Phaser.Geom.Rectangle(91, 126, 92, 22);
  }

  getKeepRect() {
    return new Phaser.Geom.Rectangle(201, 126, 92, 22);
  }

  handlePointerDown(pointer) {
    if (this.replacePrompt) {
      if (this.getReplaceRect().contains(pointer.x, pointer.y)) {
        const { weapon, pickup, slot } = this.replacePrompt;
        this.destroyPickup(pickup);
        this.openPaperEditor(weapon, slot);
      } else if (this.getKeepRect().contains(pointer.x, pointer.y)) {
        this.destroyPickup(this.replacePrompt.pickup);
        this.closeReplacePrompt();
      }
      return;
    }

    if (this.editingWeapon) {
      if (this.getConfirmRect().contains(pointer.x, pointer.y)) {
        this.confirmPaperEditor();
        return;
      }
      if (this.getUndoRect().contains(pointer.x, pointer.y)) {
        this.undoPaperEditor();
        return;
      }
      const rect = this.getPaperRect();
      if (!rect.contains(pointer.x, pointer.y)) return;
      if (this.countPaperPoints() >= this.getAvailableDrawPoints(this.editingWeapon)) return;
      this.paperDrawing = true;
      if (this.paperPoints.length > 0 && this.paperPoints.at(-1) !== null) this.paperPoints.push(null);
      this.paperPoints.push({ x: pointer.x, y: pointer.y });
      return;
    }

    const weapon = this.weapons[this.selectedWeapon];
    if (!weapon || !weapon.form || weapon.cooldownLeft > 0 || this.dead || this.ink < weapon.inkCost) return;
    this.castWeapon(weapon, pointer.worldX, pointer.worldY);
  }

  handlePointerMove(pointer) {
    if (!this.editingWeapon || !this.paperDrawing) return;
    const rect = this.getPaperRect();
    const last = this.paperPoints.at(-1);
    if (!last) return;
    const x = clamp(pointer.x, rect.left + 8, rect.right - 8);
    const y = clamp(pointer.y, rect.top + 26, rect.bottom - 12);
    if (this.countPaperPoints() >= this.getAvailableDrawPoints(this.editingWeapon)) return;
    if (dist(last.x, last.y, x, y) > 4) this.paperPoints.push({ x, y });
  }

  handlePointerUp() {
    if (this.editingWeapon && this.paperDrawing) this.paperDrawing = false;
  }

  normalizePaperShape(points, weapon) {
    const rect = this.getPaperRect();
    const sampled = [];
    let used = 0;
    points.forEach((point) => {
      if (point === null) {
        if (sampled.length > 0 && sampled.at(-1) !== null) sampled.push(null);
        return;
      }
      if (used >= weapon.maxPoints) return;
      sampled.push(point);
      used += 1;
    });
    if (sampled.at(-1) === null) sampled.pop();
    const drawable = sampled.filter(Boolean);
    if (drawable.length === 0) return [];
    const minX = Math.min(...drawable.map((p) => p.x));
    const maxX = Math.max(...drawable.map((p) => p.x));
    const minY = Math.min(...drawable.map((p) => p.y));
    const maxY = Math.max(...drawable.map((p) => p.y));
    const cx = (minX + maxX) / 2 || rect.centerX;
    const cy = (minY + maxY) / 2 || rect.centerY;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = 54 / Math.max(width, height);
    return sampled.map((p) => p === null ? null : ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  }

  countPaperPoints() {
    return this.paperPoints.filter(Boolean).length;
  }

  getAvailableDrawPoints(weapon) {
    return Math.max(0, Math.min(weapon.maxPoints, Math.floor(this.ink)));
  }

  castWeapon(weapon, targetX, targetY) {
    if (this.ink < weapon.inkCost) return;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
    const origin = { x: this.player.x, y: this.player.y };
    const form = {
      id: `${weapon.id}-${this.time.now}`,
      points: weapon.form,
      hitEnemies: new Set()
    };
    this.ink = Math.max(0, this.ink - weapon.inkCost);
    weapon.cooldownLeft = weapon.cooldown;

    const copyCount = weapon.copies || 1;
    for (let copy = 0; copy < copyCount; copy++) {
      const offset = copyCount === 1 ? 0 : (copy - (copyCount - 1) / 2) * weapon.spread;
      const copyAngle = angle + offset;
      const aim = { x: Math.cos(copyAngle), y: Math.sin(copyAngle) };
      for (let i = 0; i < form.points.length; i++) {
        const p = form.points[i];
        if (!p) continue;
        const spark = this.physics.add.sprite(origin.x + p.x * 0.15, origin.y + p.y * 0.15, 'spark-core').setDepth(16);
        spark.setTint(weapon.color);
        spark.body.setCircle(5);
        spark.damage = weapon.damage;
        spark.life = weapon.behavior === 'orbit' ? 820 : 620 / weapon.castSpeed;
        spark.maxLife = spark.life;
        spark.travel = weapon.maxDistance;
        spark.aim = aim;
        spark.index = i;
        spark.copy = copy;
        spark.form = form;
        spark.origin = origin;
        spark.color = weapon.color;
        spark.behavior = weapon.behavior;
        spark.spin = weapon.spin;
        spark.shapeScale = weapon.shapeScale;
        spark.hitRadius = weapon.behavior === 'sigil' ? 23 : weapon.behavior === 'orbit' ? 18 : 16;
        this.projectiles.push(spark);
      }
    }
  }

  update(time, delta) {
    if (this.dead) {
      this.player.setVelocity(0, 0);
      this.playerReadabilityLayer.clear();
      this.playerOutlineSprites.forEach((outline) => outline.setVisible(false));
      this.updateProjectiles(delta);
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.respawnPlayer();
      this.statusText.setText('YOU FELL - PRESS R TO RESPAWN');
      return;
    }

    if (this.replacePrompt) {
      this.drawReplacePrompt();
      this.drawHud();
      return;
    }

    if (this.editingWeapon) {
      this.drawPaperEditor();
      this.drawHud();
      return;
    }

    this.invuln = Math.max(0, this.invuln - delta);
    this.ink = Math.min(this.maxInk, this.ink + this.inkRegen * (delta / 1000));
    this.weapons.forEach((weapon) => {
      weapon.cooldownLeft = Math.max(0, weapon.cooldownLeft - delta);
    });

    this.handleWeaponKeys();
    this.updatePlayer();
    this.drawPlayerReadability();
    this.updateRoomTravel();
    this.updatePickups(time);
    this.updateEnemies(time, delta);
    this.updateEnemyProjectiles(delta);
    this.updateProjectiles(delta);
    this.drawHud();

    if (this.enemies.length === 0) {
      const room = this.getCurrentRoom();
      if (room && room.type === 'combat' && room.visited && !room.cleared) {
        room.cleared = true;
        this.wave += 1;
        this.showRoomClear(room);
      }
    }
  }

  handleWeaponKeys() {
    HOTBAR_KEYS.forEach((keyName, index) => {
      const key = this.keys[keyName];
      if (Phaser.Input.Keyboard.JustDown(key) && this.weapons[index]) {
        this.selectedWeapon = index;
      }
    });
  }

  updatePlayer() {
    if (this.dead) return;
    let vx = 0;
    let vy = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * 82, (vy / len) * 82);
    this.player.setAlpha(this.invuln > 0 && Math.floor(this.invuln / 70) % 2 ? 0.45 : 1);
    if (vy < 0) {
      this.player.setFlipX(false);
      this.player.play('player-up', true);
    } else if (vx !== 0 || vy !== 0) {
      this.player.setFlipX(vx < 0);
      this.player.play(vx !== 0 ? 'player-side' : 'player-idle', true);
    } else {
      this.player.setFlipX(false);
      this.player.play('player-idle', true);
    }
  }

  drawPlayerReadability() {
    this.playerReadabilityLayer.clear();
    this.playerOutlineSprites.forEach((outline) => outline.setVisible(!this.dead));
    if (this.dead) return;
    const x = this.player.x;
    const y = this.player.y + 8;
    this.playerReadabilityLayer.fillStyle(0x030208, 0.58);
    this.playerReadabilityLayer.fillEllipse(x, y + 7, 24, 9);
    this.playerOutlineSprites.forEach((outline) => {
      outline.setVisible(true);
      outline.setFrame(this.player.frame.name);
      outline.setPosition(this.player.x + outline.offset.x, this.player.y + outline.offset.y);
      outline.setFlipX(this.player.flipX);
      outline.setAngle(this.player.angle);
      outline.setAlpha(this.player.alpha * 0.9);
    });
  }

  updateRoomTravel() {
    const room = this.getCurrentRoom();
    if (!room) return;
    const bounds = this.getRoomBounds(room);
    const doorY = bounds.centerY;
    const doorX = bounds.centerX;
    const inHorizontalDoor = Math.abs(this.player.y - doorY) < DOOR_HALF_SIZE - 4;
    const inVerticalDoor = Math.abs(this.player.x - doorX) < DOOR_HALF_SIZE - 4;
    const margin = 13;
    const needsFirstPaper = room.type === 'neutral' && this.weapons.length === 0;
    const sealed = needsFirstPaper || (room.type === 'combat' && room.visited && !room.cleared && this.enemies.length > 0);

    if (this.player.x < bounds.left + margin) {
      if (!sealed && room.x > 0 && inHorizontalDoor) this.enterRoom(room.x - 1, room.y, 'left');
      else this.player.x = bounds.left + margin;
    }
    if (this.player.x > bounds.right - margin) {
      if (!sealed && room.x < ROOM_COLS - 1 && inHorizontalDoor) this.enterRoom(room.x + 1, room.y, 'right');
      else this.player.x = bounds.right - margin;
    }
    if (this.player.y < bounds.top + margin) {
      if (!sealed && room.y > 0 && inVerticalDoor) this.enterRoom(room.x, room.y - 1, 'up');
      else this.player.y = bounds.top + margin;
    }
    if (this.player.y > bounds.bottom - margin) {
      if (!sealed && room.y < ROOM_ROWS - 1 && inVerticalDoor) this.enterRoom(room.x, room.y + 1, 'down');
      else this.player.y = bounds.bottom - margin;
    }
  }

  updatePickups(time) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.y += Math.sin(time / 260 + pickup.float) * 0.015;
      if (dist(pickup.x, pickup.y, this.player.x, this.player.y) < 17) {
        if (pickup.kind === 'ink') {
          this.ink = Math.min(this.maxInk, this.ink + pickup.value);
          this.destroyPickup(pickup);
          break;
        }
        const weapon = pickup.weapon || this.createWeapon();
        if (this.weapons.length >= HOTBAR_SIZE) {
          this.openReplacePrompt(weapon, pickup);
        } else {
          this.destroyPickup(pickup);
          this.openPaperEditor(weapon);
        }
        break;
      }
    }
  }

  destroyPickup(pickup) {
    const index = this.pickups.indexOf(pickup);
    if (index !== -1) this.pickups.splice(index, 1);
    pickup.destroy();
  }

  openReplacePrompt(weapon, pickup) {
    this.replacePrompt = {
      weapon,
      pickup,
      slot: this.selectedWeapon
    };
    this.physics.pause();
    this.player.anims.pause();
  }

  closeReplacePrompt() {
    this.replacePrompt = null;
    this.physics.resume();
    this.player.anims.resume();
    this.paperLayer.clear();
    this.paperText.setText('');
    this.paperInfoText.setText('');
    this.clearButtonTexts();
  }

  updateEnemies(time, delta) {
    for (const enemy of this.enemies) {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      enemy.anims.timeScale = 1;
      if (enemy.role === 'charger') {
        this.updateCharger(enemy, angle, delta);
      } else if (enemy.role === 'caster') {
        this.updateCaster(enemy, angle, delta);
      } else {
        enemy.setVelocity(Math.cos(angle) * enemy.speed, Math.sin(angle) * enemy.speed);
      }
      if (this.invuln <= 0 && dist(enemy.x, enemy.y, this.player.x, this.player.y) < 13) {
        this.damagePlayer(enemy.touch);
      }
    }
  }

  updateCharger(enemy, angle, delta) {
    if (enemy.chargeTime > 0) {
      enemy.chargeTime -= delta;
      enemy.anims.timeScale = 1.7;
      enemy.setTint(0xfff1a8);
      enemy.setVelocity(Math.cos(enemy.chargeAngle) * 132, Math.sin(enemy.chargeAngle) * 132);
      return;
    }
    if (enemy.chargeWindup > 0) {
      enemy.chargeWindup -= delta;
      enemy.setTint(Math.floor(enemy.chargeWindup / 90) % 2 ? 0xfff1a8 : enemy.baseTint);
      enemy.setVelocity(Math.cos(angle) * 8, Math.sin(angle) * 8);
      if (enemy.chargeWindup <= 0) {
        enemy.chargeTime = 360;
        enemy.chargeAngle = angle;
      }
      return;
    }
    enemy.setTint(enemy.baseTint);
    enemy.chargeCooldown -= delta;
    enemy.setVelocity(Math.cos(angle) * enemy.speed, Math.sin(angle) * enemy.speed);
    if (enemy.chargeCooldown <= 0 && dist(enemy.x, enemy.y, this.player.x, this.player.y) < 150) {
      enemy.chargeWindup = 460;
      enemy.chargeCooldown = Phaser.Math.Between(1900, 2600);
    }
  }

  updateCaster(enemy, angle, delta) {
    const distance = dist(enemy.x, enemy.y, this.player.x, this.player.y);
    const desired = distance < 76 ? -1 : distance > 122 ? 1 : 0;
    enemy.setTint(enemy.baseTint);
    enemy.setVelocity(Math.cos(angle) * enemy.speed * desired, Math.sin(angle) * enemy.speed * desired);
    enemy.castCooldown -= delta;
    if (enemy.castCooldown <= 0 && distance < 170) {
      this.spawnEnemyShot(enemy, angle);
      enemy.castCooldown = Phaser.Math.Between(1450, 2300);
    }
  }

  spawnEnemyShot(enemy, angle) {
    const shot = this.physics.add.sprite(enemy.x, enemy.y - 2, 'enemy-shot').setDepth(15);
    shot.setTint(enemy.baseTint);
    shot.body.setCircle(4);
    shot.life = 2200;
    shot.vx = Math.cos(angle) * 74;
    shot.vy = Math.sin(angle) * 74;
    this.enemyProjectiles.push(shot);
  }

  updateEnemyProjectiles(delta) {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const shot = this.enemyProjectiles[i];
      shot.life -= delta;
      shot.x += shot.vx * (delta / 1000);
      shot.y += shot.vy * (delta / 1000);
      shot.setAlpha(clamp(shot.life / 250, 0, 1));
      if (this.invuln <= 0 && dist(shot.x, shot.y, this.player.x, this.player.y) < 12) {
        this.damagePlayer(1);
        shot.destroy();
        this.enemyProjectiles.splice(i, 1);
        continue;
      }
      if (shot.life <= 0) {
        shot.destroy();
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  damagePlayer(amount) {
    this.hp -= amount;
    this.invuln = 850;
    this.cameras.main.shake(120, 0.006);
    if (this.hp <= 0) this.killPlayer();
  }

  killPlayer() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.player.setVelocity(0, 0);
    this.player.anims.stop();
    this.player.setFrame(0);
    this.player.setTint(0x4b3b55);
    this.player.setAngle(90);
    this.player.setAlpha(0.72);
    this.playerReadabilityLayer.clear();
    this.playerOutlineSprites.forEach((outline) => outline.setVisible(false));
    this.enemies.forEach((enemy) => {
      enemy.setVelocity(0, 0);
      enemy.anims.pause();
    });
    this.cameras.main.shake(180, 0.008);
  }

  respawnPlayer() {
    this.startNewRun();
  }

  updateProjectiles(delta) {
    this.attackLayer.clear();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const spark = this.projectiles[i];
      spark.life -= delta;
      const t = 1 - spark.life / spark.maxLife;
      const p = spark.form.points[spark.index];
      const spin = spark.behavior === 'sigil' || spark.behavior === 'orbit' ? t * spark.spin : 0;
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      const px = (p.x * cos - p.y * sin) * spark.shapeScale;
      const py = (p.x * sin + p.y * cos) * spark.shapeScale;
      const eased = Phaser.Math.Easing.Cubic.Out(t);
      const push = spark.behavior === 'orbit'
        ? Math.sin(t * Math.PI) * spark.travel * 0.52
        : eased * spark.travel;
      spark.setPosition(spark.origin.x + spark.aim.x * push + px, spark.origin.y + spark.aim.y * push + py);
      spark.setAlpha(clamp(spark.life / 220, 0, 1));
      spark.setScale(spark.behavior === 'sigil' ? 1.18 : 1);

      this.attackLayer.lineStyle(2, spark.color, 0.55);
      if (spark.index > 0) {
        const prev = this.projectiles.find((other) => other.form === spark.form && other.copy === spark.copy && other.index === spark.index - 1);
        if (prev) this.attackLayer.lineBetween(prev.x, prev.y, spark.x, spark.y);
      }

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        if (!spark.form.hitEnemies.has(enemy) && dist(spark.x, spark.y, enemy.x, enemy.y) < spark.hitRadius) {
          spark.form.hitEnemies.add(enemy);
          enemy.hp -= spark.damage;
          this.applyEnemyHitFeedback(enemy, spark);
          if (enemy.hp <= 0) {
            this.score += 10;
            this.maybeDropInkBottle(enemy.x, enemy.y);
            enemy.destroy();
            this.enemies.splice(j, 1);
          }
        }
      }

      if (spark.life <= 0) {
        spark.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  maybeDropInkBottle(x, y) {
    if (Math.random() > INK_BOTTLE_DROP_CHANCE) return;
    this.spawnInkBottle(
      x + Phaser.Math.Between(-6, 6),
      y + Phaser.Math.Between(-6, 6)
    );
  }

  applyEnemyHitFeedback(enemy, spark) {
    enemy.setTint(0xffffff);
    enemy.setScale(1.22);
    const angle = Phaser.Math.Angle.Between(spark.origin.x, spark.origin.y, enemy.x, enemy.y);
    enemy.x += Math.cos(angle) * 5;
    enemy.y += Math.sin(angle) * 5;
    const burst = this.add.sprite(enemy.x, enemy.y - 5, 'hit-spark').setDepth(19).setTint(spark.color);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.8,
      duration: 140,
      onComplete: () => burst.destroy()
    });
    this.time.delayedCall(90, () => {
      if (!enemy.active) return;
      if (enemy.baseTint && enemy.baseTint !== 0xffffff) enemy.setTint(enemy.baseTint);
      else enemy.clearTint();
      enemy.setScale(1);
    });
  }

  drawPaperEditor() {
    if (this.replacePrompt && !this.editingWeapon) {
      this.paperLayer.clear();
      return;
    }
    const rect = this.getPaperRect();
    this.paperLayer.clear();
    this.paperLayer.fillStyle(0x050409, 0.72).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.paperLayer.fillStyle(0xf2e6c8, 1).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
    this.paperLayer.lineStyle(2, 0x6e5135, 1).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
    this.paperText.setPosition(GAME_WIDTH / 2, 34);
    this.paperInfoText.setPosition(GAME_WIDTH / 2, 160);
    this.paperLayer.lineStyle(1, 0xd8c69d, 1);
    for (let y = rect.y + 48; y < rect.bottom - 16; y += 14) {
      this.paperLayer.lineBetween(rect.x + 14, y, rect.right - 14, y);
    }

    if (!this.editingWeapon) {
      this.paperInfoText.setText('');
      this.clearButtonTexts();
      return;
    }
    const inkLeft = Math.max(0, this.getAvailableDrawPoints(this.editingWeapon) - this.countPaperPoints());
    this.paperInfoText.setText(`${this.editingWeapon.type.toUpperCase()}  DRAW LEFT ${inkLeft}/${this.editingWeapon.maxPoints}  INK ${Math.floor(this.ink)}  RANGE ${this.editingWeapon.maxDistance}`);
    this.paperLayer.lineStyle(3, this.editingWeapon.color, 0.95);
    this.paperLayer.beginPath();
    this.paperPoints.forEach((point, i) => {
      if (point === null) return;
      if (i === 0 || this.paperPoints[i - 1] === null) this.paperLayer.moveTo(point.x, point.y);
      else this.paperLayer.lineTo(point.x, point.y);
    });
    this.paperLayer.strokePath();
    const canConfirm = this.countPaperPoints() >= 2 && this.countPaperPoints() <= Math.floor(this.ink);
    this.drawButton(this.getConfirmRect(), 'CONFIRM', canConfirm ? 0x3f7f5f : 0x77706a, 0);
    this.drawButton(this.getUndoRect(), 'UNDO', 0x7a4b50, 1);
  }

  drawReplacePrompt() {
    const prompt = this.replacePrompt;
    if (!prompt) return;
    this.paperLayer.clear();
    const x = 72;
    const y = 58;
    this.paperLayer.fillStyle(0x050409, 0.72).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.paperLayer.fillStyle(0xf2e6c8, 1).fillRoundedRect(x, y, 300, 124, 4);
    this.paperLayer.lineStyle(2, 0x6e5135, 1).strokeRoundedRect(x, y, 300, 124, 4);
    this.paperText.setPosition(GAME_WIDTH / 2, y + 18);
    this.paperInfoText.setPosition(GAME_WIDTH / 2, y + 60);
    this.paperText.setText(`TOOLBELT FULL\nReplace slot ${prompt.slot + 1}: ${this.weapons[prompt.slot].name}\nwith ${prompt.weapon.name}?`);
    this.paperInfoText.setText(`NEW ${prompt.weapon.type.toUpperCase()}: DRAW ${prompt.weapon.maxPoints}  CAST ${prompt.weapon.inkCost}  RANGE ${prompt.weapon.maxDistance}`);
    this.drawButton(this.getReplaceRect(), 'REPLACE', 0x7a4b50, 0);
    this.drawButton(this.getKeepRect(), 'KEEP OLD', 0x3f5f7f, 1);
  }

  drawButton(rect, label, color, textIndex) {
    this.paperLayer.fillStyle(color, 1).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 3);
    this.paperLayer.lineStyle(1, 0x241929, 1).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 3);
    this.paperButtonTexts[textIndex].setText(label).setPosition(rect.centerX, rect.centerY).setVisible(true);
  }

  clearButtonTexts() {
    this.paperButtonTexts.forEach((text) => text.setText('').setVisible(false));
  }

  drawHud() {
    const hearts = '#'.repeat(Math.max(0, this.hp)).padEnd(8, '-');
    this.hpText.setText(`HP ${hearts}  INK ${Math.floor(this.ink)}/${this.maxInk}  SCORE ${this.score}`);
    if (this.dead) {
      this.statusText.setText('YOU FELL - PRESS R TO RESPAWN');
      this.weaponText.setText('DEAD');
      this.drawHotbar();
      return;
    }
    const selected = this.weapons[this.selectedWeapon];
    const room = this.getCurrentRoom();
    const roomTag = room?.type === 'neutral' && this.weapons.length === 0
      ? 'TAKE THE PAPER'
      : room?.type === 'combat' && !room.cleared && this.enemies.length > 0
        ? 'ROOM SEALED'
        : room?.type === 'combat' && room.cleared
          ? 'ROOM CLEAR'
        : `${(room?.type || 'room').toUpperCase()} ROOM`;
    const status = selected
      ? `${selected.type.toUpperCase()} ${selected.name.toUpperCase()}  ${selected.note}  CAST ${selected.inkCost}  RANGE ${selected.maxDistance}`
      : 'FIND PAPER SPELLS';
    this.statusText.setText(`${roomTag}  ${status}  CLICK CAST  1-8`);
    this.weaponText.setText(selected ? `${this.selectedWeapon + 1}: ${selected.type.toUpperCase()}` : 'NO SPELL');
    this.drawHotbar();
  }

  drawHotbar() {
    this.hotbarLayer.clear();
    const startX = GAME_WIDTH / 2 - (HOTBAR_SIZE * 28) / 2;
    const y = GAME_HEIGHT - 30;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const weapon = this.weapons[i];
      const x = startX + i * 28;
      this.hotbarLayer.fillStyle(i === this.selectedWeapon ? 0xe7d7ac : 0x1d1827, 1).fillRect(x, y, 24, 24);
      this.hotbarLayer.lineStyle(1, i === this.selectedWeapon ? 0xf8f4dc : 0x4e405d, 1).strokeRect(x, y, 24, 24);
      if (!weapon) continue;
      this.hotbarLayer.fillStyle(0xf2e6c8, 1).fillRect(x + 7, y + 4, 10, 13);
      this.hotbarLayer.fillStyle(weapon.color, 1).fillRect(x + 9, y + 8, 6, 2);
      if (weapon.type === 'blade') this.hotbarLayer.fillRect(x + 8, y + 13, 8, 1);
      if (weapon.type === 'sigil') this.hotbarLayer.strokeCircle(x + 12, y + 11, 5);
      if (weapon.type === 'scatter') {
        this.hotbarLayer.fillRect(x + 7, y + 13, 2, 2);
        this.hotbarLayer.fillRect(x + 11, y + 13, 2, 2);
        this.hotbarLayer.fillRect(x + 15, y + 13, 2, 2);
      }
      if (weapon.type === 'orbit') this.hotbarLayer.strokeCircle(x + 12, y + 11, 4);
      this.hotbarLayer.fillStyle(0xf8f4dc, 1).fillRect(x + 3, y + 18, 3, 3);
      if (weapon.cooldownLeft > 0) {
        const pct = weapon.cooldownLeft / weapon.cooldown;
        this.hotbarLayer.fillStyle(0x09080d, 0.75).fillRect(x, y, 24, 24 * pct);
      }
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: RogueScene
};

new Phaser.Game(config);
