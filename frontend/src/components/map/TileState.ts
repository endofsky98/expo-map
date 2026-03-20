// TileState.ts — Mapbox-style tile state tracking
// Each tile has an explicit state: idle → loading → loaded | errored
// This replaces the "check existingKeys in layer.children" approach which loses track of loading tiles

import * as PIXI from 'pixi.js';

export type TileStatus = 'loading' | 'loaded' | 'errored';

export interface TileEntry {
  key: string;
  status: TileStatus;
  sprite: PIXI.Sprite | PIXI.Graphics; // placeholder (Graphics) or loaded sprite (Sprite)
  texture?: PIXI.Texture;
  url: string;
  failCount: number;
  // Position/size for recreating sprite
  x: number;
  y: number;
  dw: number;
  dh: number;
  levelIdx: number;
}

export class TileStateManager {
  private tiles = new Map<string, TileEntry>();
  private layer: PIXI.Container;
  private tileCache: Map<string, PIXI.Texture>;
  private apiBase: string;
  private dirtyFlag: { current: boolean };

  constructor(
    layer: PIXI.Container,
    tileCache: Map<string, PIXI.Texture>,
    apiBase: string,
    dirtyFlag: { current: boolean },
  ) {
    this.layer = layer;
    this.tileCache = tileCache;
    this.apiBase = apiBase;
    this.dirtyFlag = dirtyFlag;
  }

  /**
   * Mapbox-style update: given the current viewport's needed tiles,
   * load missing ones, keep loaded ones, remove out-of-viewport ones.
   */
  update(
    imageId: number,
    levelIdx: number,
    tileSize: number,
    sfx: number,
    sfy: number,
    levelWidth: number,
    levelHeight: number,
    colStart: number,
    colEnd: number,
    rowStart: number,
    rowEnd: number,
    currentLevelRef: { current: number },
  ) {
    const neededKeys = new Set<string>();
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        neededKeys.add(`${imageId}_${levelIdx}_${r}_${c}`);
      }
    }

    // 1) Remove tiles from SAME level that are out of viewport
    //    Keep OTHER level tiles as backdrop
    for (const [key, entry] of this.tiles) {
      if (entry.levelIdx === levelIdx && !neededKeys.has(key)) {
        // Out of viewport for current level — remove
        if (entry.sprite.parent) this.layer.removeChild(entry.sprite);
        this.tiles.delete(key);
      }
    }

    // 2) For each needed tile, ensure it's being tracked
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const key = `${imageId}_${levelIdx}_${r}_${c}`;

        const existing = this.tiles.get(key);
        if (existing) {
          // Already tracking — if loaded, make sure sprite is in layer
          if (existing.status === 'loaded' && !existing.sprite.parent) {
            this.layer.addChild(existing.sprite);
          }
          // If loading, just wait. If errored, retry handled separately.
          continue;
        }

        const x = c * tileSize * sfx;
        const y = r * tileSize * sfy;
        const tw = Math.min(tileSize, levelWidth - c * tileSize);
        const th = Math.min(tileSize, levelHeight - r * tileSize);
        const dw = tw * sfx;
        const dh = th * sfy;

        // Check our texture cache first
        const cached = this.tileCache.get(key);
        if (cached && cached.valid) {
          const sprite = new PIXI.Sprite(cached);
          sprite.name = key;
          sprite.x = x; sprite.y = y; sprite.width = dw; sprite.height = dh;
          this.layer.addChild(sprite);
          this.tiles.set(key, {
            key, status: 'loaded', sprite, texture: cached, url: '',
            failCount: 0, x, y, dw, dh, levelIdx,
          });
          continue;
        }

        // Create placeholder + start loading
        const placeholder = new PIXI.Graphics();
        placeholder.name = key;
        placeholder.beginFill(0xe5e7eb, 0.3);
        placeholder.drawRect(0, 0, dw, dh);
        placeholder.endFill();
        placeholder.x = x; placeholder.y = y;
        this.layer.addChild(placeholder);

        const url = `${this.apiBase}/api/tiles/${imageId}/${levelIdx}/${r}/${c}`;

        const entry: TileEntry = {
          key, status: 'loading', sprite: placeholder, url,
          failCount: 0, x, y, dw, dh, levelIdx,
        };
        this.tiles.set(key, entry);

        this.loadTile(entry, currentLevelRef);
      }
    }

    // 3) Clean up old-level tiles if ALL needed tiles for current level are loaded
    const allLoaded = Array.from(neededKeys).every(k => {
      const e = this.tiles.get(k);
      return e && e.status === 'loaded';
    });
    if (allLoaded) {
      for (const [key, entry] of this.tiles) {
        if (entry.levelIdx !== levelIdx) {
          if (entry.sprite.parent) this.layer.removeChild(entry.sprite);
          this.tiles.delete(key);
        }
      }
    }
  }

  private loadTile(entry: TileEntry, currentLevelRef: { current: number }) {
    const { key, url, x, y, dw, dh } = entry;

    // Clear stale pixi cache
    const staleBase = PIXI.utils.BaseTextureCache[url];
    if (staleBase && !staleBase.valid) {
      staleBase.destroy();
      delete PIXI.utils.BaseTextureCache[url];
      delete PIXI.utils.TextureCache[url];
    }

    // If pixi already has a valid cached texture for this URL, use it
    const existingBase = PIXI.utils.BaseTextureCache[url];
    if (existingBase && existingBase.valid) {
      const tex = PIXI.Texture.from(url);
      this.onTileLoaded(entry, tex, currentLevelRef);
      return;
    }

    const tex = PIXI.Texture.from(url, { resourceOptions: { crossorigin: 'anonymous' } });

    if (tex.valid) {
      // Already loaded (pixi cache hit)
      this.onTileLoaded(entry, tex, currentLevelRef);
      return;
    }

    // Not loaded yet — listen for events
    const onLoaded = () => {
      tex.baseTexture.off('error', onError);
      this.onTileLoaded(entry, tex, currentLevelRef);
    };

    const onError = () => {
      tex.baseTexture.off('loaded', onLoaded);
      this.onTileError(entry, currentLevelRef);
    };

    tex.baseTexture.once('loaded', onLoaded);
    tex.baseTexture.once('error', onError);
  }

  private onTileLoaded(entry: TileEntry, tex: PIXI.Texture, currentLevelRef: { current: number }) {
    const { key, x, y, dw, dh } = entry;

    // Cache the texture
    this.tileCache.set(key, tex);

    // Replace placeholder with sprite
    const sprite = new PIXI.Sprite(tex);
    sprite.name = key;
    sprite.x = x; sprite.y = y; sprite.width = dw; sprite.height = dh;

    // Remove old placeholder
    if (entry.sprite.parent) {
      const idx = this.layer.getChildIndex(entry.sprite);
      this.layer.removeChild(entry.sprite);
      this.layer.addChildAt(sprite, Math.min(idx, this.layer.children.length));
    } else {
      this.layer.addChild(sprite);
    }

    entry.sprite = sprite;
    entry.texture = tex;
    entry.status = 'loaded';

    // Clean up old-level tiles if this was the last one needed
    // (Handled in update() next frame via dirty flag)
    this.dirtyFlag.current = true;
  }

  private onTileError(entry: TileEntry, currentLevelRef: { current: number }) {
    entry.failCount++;
    entry.status = 'errored';

    // Destroy broken pixi cache
    const staleBase = PIXI.utils.BaseTextureCache[entry.url];
    if (staleBase) {
      staleBase.destroy();
      delete PIXI.utils.BaseTextureCache[entry.url];
      delete PIXI.utils.TextureCache[entry.url];
    }

    if (entry.failCount <= 3) {
      // Retry after backoff
      setTimeout(() => {
        // Only retry if still in our map (not removed by viewport change)
        if (this.tiles.has(entry.key)) {
          entry.status = 'loading';
          this.loadTile(entry, currentLevelRef);
        }
      }, 500 * entry.failCount);
    } else {
      // Give up — remove placeholder
      if (entry.sprite.parent) this.layer.removeChild(entry.sprite);
    }
  }

  /** Clear all state (e.g., on image change) */
  clear() {
    for (const [, entry] of this.tiles) {
      if (entry.sprite.parent) this.layer.removeChild(entry.sprite);
    }
    this.tiles.clear();
  }

  /** Clear entries for a specific level (on level change, allow fresh retries) */
  clearLevel(levelIdx: number) {
    for (const [key, entry] of this.tiles) {
      if (entry.levelIdx === levelIdx && entry.status === 'errored') {
        entry.failCount = 0;
        entry.status = 'loading';
        // Will be picked up on next update()
      }
    }
  }

  destroy() {
    this.clear();
  }
}
