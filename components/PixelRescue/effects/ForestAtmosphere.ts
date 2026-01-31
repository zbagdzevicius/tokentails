import Phaser from "phaser";

export class ForestAtmosphere {
  private scene: Phaser.Scene;
  private tilemap: Phaser.Tilemaps.Tilemap;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private physicsLayer?: Phaser.Tilemaps.TilemapLayer;
  private heartLayer?: Phaser.Tilemaps.TilemapLayer;

  private particleEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private lightningGraphics?: Phaser.GameObjects.Graphics;
  private lightningTimer?: Phaser.Time.TimerEvent;
  private ambientParticles?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lightBeams: Phaser.GameObjects.Graphics[] = [];

  constructor(
    scene: Phaser.Scene,
    tilemap: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
    physicsLayer?: Phaser.Tilemaps.TilemapLayer,
    heartLayer?: Phaser.Tilemaps.TilemapLayer
  ) {
    this.scene = scene;
    this.tilemap = tilemap;
    this.groundLayer = groundLayer;
    this.physicsLayer = physicsLayer;
    this.heartLayer = heartLayer;
  }

  create() {
    this.lightningGraphics = this.scene.add.graphics();
    this.lightningGraphics.setDepth(100);

    this.createAmbientParticles();
    // this.createLocalizedParticleZones();
    this.createLightBeams();
    this.createDangerZoneParticles();
    this.createHeartParticles();
    this.createHeartPathParticles();
  }

  enableLightning() {
    this.startLightningEffects();
  }

  private createAmbientParticles() {
    const graphics = this.scene.make.graphics({}, false);

    graphics.fillStyle(0xffffaa, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.fillStyle(0xffff99, 0.8);
    graphics.fillCircle(8, 8, 6);
    graphics.fillStyle(0xffffcc, 0.6);
    graphics.fillCircle(8, 8, 4);

    graphics.generateTexture("particle-fallback", 16, 16);
    graphics.destroy();

    // Get actual bounds from tiles
    let minTileX = Infinity;
    let maxTileX = -Infinity;
    let minTileY = Infinity;
    let maxTileY = -Infinity;

    this.groundLayer.forEachTile((tile) => {
      if (tile.index !== -1) {
        minTileX = Math.min(minTileX, tile.x);
        maxTileX = Math.max(maxTileX, tile.x);
        minTileY = Math.min(minTileY, tile.y);
        maxTileY = Math.max(maxTileY, tile.y);
      }
    });

    const tileWidth = this.tilemap.tileWidth;
    const tileHeight = this.tilemap.tileHeight;

    const minX = minTileX * tileWidth;
    const maxX = (maxTileX + 1) * tileWidth;
    const minY = minTileY * tileHeight - 500;
    const maxY = (maxTileY + 1) * tileHeight;

    this.ambientParticles = this.scene.add.particles(
      0,
      0,
      "particle-fallback",
      {
        x: { min: minX, max: maxX },
        y: { min: minY, max: maxY },
        speed: { min: 15, max: 40 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.2, end: 0.3 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 6000,
        frequency: 90,
        blendMode: "ADD",
        tint: [0xffffaa, 0xffffcc, 0xaaffaa, 0xccffcc],
      }
    );

    this.ambientParticles.setDepth(5);
  }

  private createLocalizedParticleZones() {
    const zones: { x: number; y: number }[] = [];

    this.groundLayer.forEachTile((tile) => {
      if (tile.index !== -1 && Math.random() < 0.015) {
        zones.push({
          x: tile.getCenterX(),
          y: tile.getCenterY() - 32,
        });
      }
    });

    zones.forEach((zone) => {
      const emitter = this.scene.add.particles(
        zone.x,
        zone.y,
        "particle-fallback",
        {
          speed: { min: 10, max: 30 },
          angle: { min: 250, max: 350 },
          scale: { start: 1.0, end: 0.2 },
          alpha: { start: 0.9, end: 0 },
          lifespan: 4000,
          frequency: 250,
          blendMode: "ADD",
          tint: [0xffffaa, 0xffffcc, 0xaaffaa],
          gravityY: -15,
        }
      );

      emitter.setDepth(-130);
      this.particleEmitters.push(emitter);
    });
  }

  private createLightBeams() {
    const beamPositions: { x: number; y: number }[] = [];
    const minDistance = 400;
    this.groundLayer.forEachTile((tile) => {
      if (tile.index !== -1 && Math.random() < 0.007) {
        const candidatePos = {
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        };

        const isTooClose = beamPositions.some((existingPos) => {
          const dx = candidatePos.x - existingPos.x;
          const dy = candidatePos.y - existingPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < minDistance;
        });

        if (!isTooClose) {
          beamPositions.push(candidatePos);
        }
      }
    });

    beamPositions.forEach((pos) => {
      const beamGraphics = this.scene.add.graphics();
      beamGraphics.setDepth(-100);

      const angleVariation = Phaser.Math.Between(-15, 15);
      const beamWidth = Phaser.Math.Between(50, 100);
      const topY = 0;
      const beamHeight = Math.abs(pos.y - topY);

      const bottomLeft = { x: pos.x - beamWidth / 2, y: pos.y };
      const bottomRight = { x: pos.x + beamWidth / 2, y: pos.y };

      const angleOffset =
        beamHeight * Math.tan((angleVariation * Math.PI) / 180);
      const topWidthMultiplier = 1.3;
      const topLeft = {
        x: pos.x - (beamWidth * topWidthMultiplier) / 2 + angleOffset,
        y: topY,
      };
      const topRight = {
        x: pos.x + (beamWidth * topWidthMultiplier) / 2 + angleOffset,
        y: topY,
      };

      beamGraphics.fillStyle(0xffffaa, 0.08);
      beamGraphics.beginPath();
      beamGraphics.moveTo(bottomLeft.x, bottomLeft.y);
      beamGraphics.lineTo(topLeft.x, topLeft.y);
      beamGraphics.lineTo(topRight.x, topRight.y);
      beamGraphics.lineTo(bottomRight.x, bottomRight.y);
      beamGraphics.closePath();
      beamGraphics.fillPath();

      const midWidthMultiplier = 0.6;
      const midTopWidthMultiplier = 1.0;
      beamGraphics.fillStyle(0xffffcc, 0.12);
      beamGraphics.beginPath();
      beamGraphics.moveTo(pos.x - (beamWidth * midWidthMultiplier) / 2, pos.y);
      beamGraphics.lineTo(
        pos.x - (beamWidth * midTopWidthMultiplier) / 2 + angleOffset,
        topY
      );
      beamGraphics.lineTo(
        pos.x + (beamWidth * midTopWidthMultiplier) / 2 + angleOffset,
        topY
      );
      beamGraphics.lineTo(pos.x + (beamWidth * midWidthMultiplier) / 2, pos.y);
      beamGraphics.closePath();
      beamGraphics.fillPath();

      const coreWidthMultiplier = 0.3;
      const coreTopWidthMultiplier = 0.5;
      beamGraphics.fillStyle(0xffffff, 0.18);
      beamGraphics.beginPath();
      beamGraphics.moveTo(pos.x - (beamWidth * coreWidthMultiplier) / 2, pos.y);
      beamGraphics.lineTo(
        pos.x - (beamWidth * coreTopWidthMultiplier) / 2 + angleOffset,
        topY
      );
      beamGraphics.lineTo(
        pos.x + (beamWidth * coreTopWidthMultiplier) / 2 + angleOffset,
        topY
      );
      beamGraphics.lineTo(pos.x + (beamWidth * coreWidthMultiplier) / 2, pos.y);
      beamGraphics.closePath();
      beamGraphics.fillPath();

      this.scene.tweens.add({
        targets: beamGraphics,
        alpha: { from: 0.5, to: 0.9 },
        duration: Phaser.Math.Between(3000, 5000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.lightBeams.push(beamGraphics);
    });
  }

  private createDangerZoneParticles() {
    if (!this.physicsLayer) return;

    const dangerTiles = [421, 422, 424, 425];
    const dangerPositions: { x: number; y: number }[] = [];

    this.physicsLayer.forEachTile((tile) => {
      if (dangerTiles.includes(tile.index)) {
        dangerPositions.push({
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        });
      }
    });

    dangerPositions.forEach((pos) => {
      const emitter = this.scene.add.particles(
        pos.x,
        pos.y,
        "particle-fallback",
        {
          speed: { min: 10, max: 30 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.6, end: 0.2 },
          alpha: { start: 0.7, end: 0 },
          lifespan: 1500,
          frequency: 100,
          blendMode: "ADD",
          tint: [0x00ff00, 0x44ff00, 0x88ff00, 0xaaff00],
          gravityY: -30,
        }
      );

      emitter.setDepth(10);
      this.particleEmitters.push(emitter);
    });
  }

  private createHeartParticles() {
    if (!this.heartLayer) return;

    const heartTile = 428;
    const heartPositions: { x: number; y: number }[] = [];

    this.heartLayer.forEachTile((tile) => {
      if (tile.index === heartTile) {
        heartPositions.push({
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        });
      }
    });

    heartPositions.forEach((pos) => {
      const emitter = this.scene.add.particles(0, 0, "heart-coin", {
        x: { min: pos.x - 40, max: pos.x + 40 },
        y: { min: pos.y - 40, max: pos.y + 40 },
        speed: { min: 5, max: 15 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.3, end: 0.1 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 2000,
        frequency: 150,
        blendMode: "ADD",
        gravityY: -20,
      });

      emitter.setDepth(10);
      this.particleEmitters.push(emitter);
    });
  }

  private createHeartPathParticles() {
    if (!this.heartLayer) return;

    const heartTile = 428;
    const heartPositions: { x: number; y: number }[] = [];

    this.heartLayer.forEachTile((tile) => {
      if (tile.index === heartTile) {
        heartPositions.push({
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        });
      }
    });

    // Create path particles between consecutive hearts
    for (let i = 0; i < heartPositions.length - 1; i++) {
      const start = heartPositions[i];
      const end = heartPositions[i + 1];

      const distance = Phaser.Math.Distance.Between(
        start.x,
        start.y,
        end.x,
        end.y
      );

      // if (distance < 1000) {
      const numWaypoints = Math.floor(distance / 120);

      for (let j = 1; j <= numWaypoints; j++) {
        const t = j / (numWaypoints + 1);
        const waypointX = start.x + (end.x - start.x) * t;
        const waypointY = start.y + (end.y - start.y) * t;

        // Check if this waypoint position is over a ground tile
        const tileX = this.tilemap.worldToTileX(waypointX);
        const tileY = this.tilemap.worldToTileY(waypointY);

        if (tileX === null || tileY === null) continue;

        const groundTile = this.groundLayer.getTileAt(tileX, tileY);

        // Skip this waypoint if it's over a ground block
        if (groundTile && groundTile.index !== -1) {
          continue;
        }

        // Create small heart particle emitter at each waypoint (only in empty spaces)
        const emitter = this.scene.add.particles(0, 0, "heart-coin", {
          x: { min: waypointX - 20, max: waypointX + 20 },
          y: { min: waypointY - 20, max: waypointY + 20 },
          speed: { min: 3, max: 8 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.15, end: 0.05 },
          alpha: { start: 0.5, end: 0 },
          lifespan: 1500,
          frequency: 150,
          blendMode: "ADD",
          gravityY: -15,
          deathZone: {
            type: "onEnter",
            source: new Phaser.Geom.Rectangle(0, 0, 0, 0),
          },
        });

        // Add custom death check for ground tiles
        emitter.onParticleEmit(
          (particle: Phaser.GameObjects.Particles.Particle) => {
            let isAlive = true;

            const checkInterval = this.scene.time.addEvent({
              delay: 50,
              callback: () => {
                if (!isAlive) {
                  checkInterval.destroy();
                  return;
                }

                const pTileX = this.tilemap.worldToTileX(particle.x);
                const pTileY = this.tilemap.worldToTileY(particle.y);

                if (pTileX === null || pTileY === null) return;

                const tile = this.groundLayer.getTileAt(pTileX, pTileY);
                if (tile && tile.index !== -1) {
                  particle.kill();
                  isAlive = false;
                  checkInterval.destroy();
                }
              },
              loop: true,
            });

            // Clean up when particle dies naturally (matches lifespan: 2500)
            this.scene.time.delayedCall(2500, () => {
              isAlive = false;
              checkInterval.destroy();
            });
          }
        );

        emitter.setDepth(5);
        this.particleEmitters.push(emitter);
      }
    }
  }

  private startLightningEffects() {
    const triggerLightning = () => {
      this.createLightningStrike();
      const nextDelay = Phaser.Math.Between(8000, 15000);
      this.lightningTimer = this.scene.time.delayedCall(
        nextDelay,
        triggerLightning
      );
    };

    const initialDelay = Phaser.Math.Between(8000, 15000);
    this.lightningTimer = this.scene.time.delayedCall(
      initialDelay,
      triggerLightning
    );
  }

  private createLightningStrike() {
    if (!this.lightningGraphics) return;

    const camera = this.scene.cameras.main;
    const worldView = camera.worldView;

    const startX = Phaser.Math.Between(
      worldView.x + 100,
      worldView.x + worldView.width - 100
    );
    const startY = worldView.y - 100;
    const endY = worldView.y + worldView.height;

    const mainBolt = this.generateLightningPath(startX, startY, startX, endY);
    this.scene.cameras.main.flash(100, 255, 255, 255);

    this.lightningGraphics.clear();
    this.lightningGraphics.lineStyle(3, 0xffffff, 1);

    this.lightningGraphics.beginPath();
    this.lightningGraphics.moveTo(mainBolt[0].x, mainBolt[0].y);
    for (let i = 1; i < mainBolt.length; i++) {
      this.lightningGraphics.lineTo(mainBolt[i].x, mainBolt[i].y);
    }
    this.lightningGraphics.strokePath();

    this.lightningGraphics.lineStyle(6, 0xaaaaff, 0.5);
    this.lightningGraphics.beginPath();
    this.lightningGraphics.moveTo(mainBolt[0].x, mainBolt[0].y);
    for (let i = 1; i < mainBolt.length; i++) {
      this.lightningGraphics.lineTo(mainBolt[i].x, mainBolt[i].y);
    }
    this.lightningGraphics.strokePath();

    const impactX = mainBolt[mainBolt.length - 1].x;
    const impactY = mainBolt[mainBolt.length - 1].y;

    const burstEmitter = this.scene.add.particles(
      impactX,
      impactY,
      "particle-fallback",
      {
        speed: { min: 50, max: 150 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.6, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 500,
        quantity: 20,
        blendMode: "ADD",
        tint: 0xaaaaff,
      }
    );

    burstEmitter.setDepth(101);
    burstEmitter.explode(20);

    this.scene.time.delayedCall(150, () => {
      this.lightningGraphics?.clear();
      burstEmitter.destroy();
    });
  }

  private generateLightningPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const segments = 15;
    const displacement = 40;

    points.push({ x: startX, y: startY });

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const x =
        startX +
        (endX - startX) * t +
        Phaser.Math.Between(-displacement, displacement);
      const y = startY + (endY - startY) * t;
      points.push({ x, y });
    }

    points.push({ x: endX, y: endY });
    return points;
  }

  destroy() {
    this.particleEmitters.forEach((emitter) => emitter.destroy());
    this.particleEmitters = [];

    if (this.ambientParticles) {
      this.ambientParticles.destroy();
      this.ambientParticles = undefined;
    }

    if (this.lightningGraphics) {
      this.lightningGraphics.destroy();
      this.lightningGraphics = undefined;
    }

    if (this.lightningTimer) {
      this.lightningTimer.destroy();
      this.lightningTimer = undefined;
    }

    this.lightBeams.forEach((beam) => beam.destroy());
    this.lightBeams = [];
  }
}
