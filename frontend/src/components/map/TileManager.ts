/**
 * TileManager — Mapbox-style tile state management.
 *
 * Each tile has a state: idle → loading → loaded | errored.
 * Errored tiles are retried (up to MAX_RETRIES) with exponential backoff.
 * The pixi internal texture cache is cleaned on error to prevent stale entries.
 *
 * Usage:
 *   const mgr = new TileManager(layer, apiBase, tileCacheRef);
 *   mgr.update(imageId, levelIdx, level, tileSize, sfx, sfy, neededKeys, imgW, imgH);
 *   mgr.onLevelChange(newLevel);
 */
import * as PIXI from 'pixi.js';
import { MAX_TILE_RETRIES, TILE_RETRY_BASE_MS } from './mapTypes';

type TileState = 'loading' | 'loaded' | 'errored';

interface TileRecord {
  key: string;
  url: string;
  levelIdx: number;
  state: TileState;
  retries: number;
  displayObject: PIXI.DisplayObject | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

export class TileManager {
  private tiles = new Map<string, TileRecord>();
  private layer: PIXI.Container;
  private apiBase: string;
  private textureCache: Map<string, PIXI.Texture>;
  private currentLevel = -1;
  private dirty = false;

  constructor(
    layer: PIXI.Container,
    apiBase: string,
    textureCache: Map<string, PIXI.Texture>,
  ) {
    this.layer = layer;
    this.apiBase = apiBase;
    this.textureCache = textureCache;
  }

  /** Mark as dirty (called when retry timer fires). */
  isDirty() { return this.dirty; }
  clearDirty() { this.dirty = false; }

  /** Called when tile level changes — reset error counts. */
  onLevelChange(newLevel: number) {
    if (newLevel === this.currentLevel) return;
    this.currentLevel = newLevel;
    // Clear retry counts for all tiles (new level = fresh start)
    for (const [, rec] of this.tiles) {
      if (rec.retryTimer) clearTimeout(rec.retryTimer);
    }
    // Don't clear tiles — old level tiles stay until replaced (Mapbox pattern)
  }

  /**
   * Main update — called every frame when dirty flag is set.
   * Manages tile lifecycle: create, load, display, remove, retry.
   */
  update(
    imageId: number,
    levelIdx: number,
    cols: number,
    rows: number,
    tileSize: number,
    sfx: number,
    sfy: number,
    levelWidth: number,
    levelHeight: number,
    colStart: number,
    colEnd: number,
    rowStart: number,
    rowEnd: number,
  ) {
    this.onLevelChange(levelIdx);

    // Build set of needed tile keys
    const needed = new Set<string>();
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        needed.add(`${imageId}_${levelIdx}_${r}_${c}`);
      }
    }

    // Remove tiles from SAME level that are out of viewport
    // Keep tiles from OTHER levels as backdrop
    for (let i = this.layer.children.length - 1; i >= 0; i--) {
      const child = this.layer.children[i];
      if (!child.name) continue;
      const parts = child.name.split('_');
      const childLevel = parseInt(parts[1] ?? '', 10);
      if (childLevel === levelIdx && !needed.has(child.name)) {
        this.layer.removeChildAt(i);
        this.tiles.delete(child.name);
      }
    }

    // Process each needed tile
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const key = `${imageId}_${levelIdx}_${r}_${c}`;
        const existing = this.tiles.get(key);

        // Already loaded and displayed
        if (existing?.state === 'loaded') continue;
        // Currently loading — let it finish
        if (existing?.state === 'loading') continue;
        // Errored and exceeded retries — skip
        if (existing?.state === 'errored' && existing.retries >= MAX_TILE_RETRIES) continue;

        // Check if display object already exists in layer
        let alreadyInLayer = false;
        for (const child of this.layer.children) {
          if (child.name === key) { alreadyInLayer = true; break; }
        }
        if (alreadyInLayer && (existing?.state as string) === 'loaded') continue;

        // Calculate position
        const x = c * tileSize * sfx;
        const y = r * tileSize * sfy;
        const tw = Math.min(tileSize, levelWidth - c * tileSize);
        const th = Math.min(tileSize, levelHeight - r * tileSize);
        const dw = tw * sfx;
        const dh = th * sfy;

        const url = `${this.apiBase}/api/tiles/${imageId}/${levelIdx}/${r}/${c}`;

        // Check our own texture cache first
        const cached = this.textureCache.get(key);
        if (cached && cached.valid) {
          if (!alreadyInLayer) {
            const sprite = new PIXI.Sprite(cached);
            sprite.name = key;
            sprite.x = x; sprite.y = y; sprite.width = dw; sprite.height = dh;
            this.layer.addChild(sprite);
          }
          this.tiles.set(key, {
            key, url, levelIdx, state: 'loaded', retries: existing?.retries || 0,
            displayObject: null, retryTimer: null,
          });
          continue;
        }

        // Clean stale pixi cache entries
        const staleBase = PIXI.utils.BaseTextureCache[url];
        if (staleBase && !staleBase.valid) {
          staleBase.destroy();
          delete PIXI.utils.BaseTextureCache[url];
          delete PIXI.utils.TextureCache[url];
        }

        // Create placeholder if not already in layer
        let placeholder: PIXI.Graphics | null = null;
        if (!alreadyInLayer) {
          placeholder = new PIXI.Graphics();
          placeholder.name = key;
          placeholder.beginFill(0xe5e7eb, 0.3);
          placeholder.drawRect(0, 0, dw, dh);
          placeholder.endFill();
          placeholder.x = x; placeholder.y = y;
          this.layer.addChild(placeholder);
        }

        // Start loading
        const retries = existing?.retries || 0;
        const record: TileRecord = {
          key, url, levelIdx, state: 'loading', retries,
          displayObject: placeholder, retryTimer: null,
        };
        this.tiles.set(key, record);

        const tex = PIXI.Texture.from(url, { resourceOptions: { crossorigin: 'anonymous' } });

        if (tex.valid) {
          // Already cached in pixi — immediate
          this.textureCache.set(key, tex);
          record.state = 'loaded';
          if (placeholder?.parent) this.layer.removeChild(placeholder);
          if (!this._hasChildNamed(key)) {
            const sprite = new PIXI.Sprite(tex);
            sprite.name = key;
            sprite.x = x; sprite.y = y; sprite.width = dw; sprite.height = dh;
            this.layer.addChild(sprite);
          }
          this._cleanOldLevelTiles(levelIdx);
        } else {
          tex.baseTexture.on('loaded', () => {
            this.textureCache.set(key, tex);
            record.state = 'loaded';
            // Replace placeholder with sprite
            const ph = this._findChild(key);
            if (ph && !(ph instanceof PIXI.Sprite && (ph as PIXI.Sprite).texture === tex)) {
              const sprite = new PIXI.Sprite(tex);
              sprite.name = key;
              sprite.x = x; sprite.y = y; sprite.width = dw; sprite.height = dh;
              const idx = this.layer.getChildIndex(ph);
              this.layer.removeChild(ph);
              this.layer.addChildAt(sprite, Math.min(idx, this.layer.children.length));
            }
            this._cleanOldLevelTiles(levelIdx);
          });

          tex.baseTexture.on('error', () => {
            // Clean pixi cache so retry gets a fresh texture
            tex.baseTexture.destroy();
            delete PIXI.utils.BaseTextureCache[url];
            delete PIXI.utils.TextureCache[url];

            record.state = 'errored';
            record.retries++;

            // Remove placeholder
            const ph = this._findChild(key);
            if (ph) this.layer.removeChild(ph);

            // Schedule retry with backoff
            if (record.retries <= MAX_TILE_RETRIES) {
              record.retryTimer = setTimeout(() => {
                record.retryTimer = null;
                // Reset state so next update() picks it up
                record.state = 'errored'; // keeps retries count
                this.dirty = true;
              }, TILE_RETRY_BASE_MS * record.retries);
            }
          });
        }
      }
    }
  }

  /** Remove all tiles from other levels (call after all current-level tiles loaded). */
  private _cleanOldLevelTiles(currentLevel: number) {
    for (let j = this.layer.children.length - 1; j >= 0; j--) {
      const ch = this.layer.children[j];
      if (!ch.name) continue;
      const p = ch.name.split('_');
      if (parseInt(p[1] ?? '', 10) !== currentLevel) {
        this.layer.removeChildAt(j);
      }
    }
  }

  private _findChild(name: string): PIXI.DisplayObject | null {
    for (const ch of this.layer.children) {
      if (ch.name === name) return ch;
    }
    return null;
  }

  private _hasChildNamed(name: string): boolean {
    return this._findChild(name) !== null;
  }

  /** Clear everything (image change). */
  clear() {
    for (const [, rec] of this.tiles) {
      if (rec.retryTimer) clearTimeout(rec.retryTimer);
    }
    this.tiles.clear();
    this.currentLevel = -1;
  }

  destroy() {
    this.clear();
  }
}
