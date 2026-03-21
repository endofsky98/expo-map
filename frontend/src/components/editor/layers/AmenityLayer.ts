import * as PIXI from 'pixi.js';
import type { Amenity, SelectedObject } from '../editorTypes';
import { drawAmenityMarker } from '../ShapeDrawer';

interface AmenityLayerProps {
  graphics: PIXI.Graphics;
  amenities: Amenity[];
  scale: number;
  selectedObject: SelectedObject;
}

export function renderAmenityLayer(props: AmenityLayerProps) {
  const { graphics: g, amenities, scale, selectedObject } = props;
  g.clear();

  for (const amenity of amenities) {
    if (!amenity.is_active) continue;

    const selected = selectedObject?.kind === 'amenity' && selectedObject.id === amenity.id;
    drawAmenityMarker(g, amenity.x, amenity.y, amenity.type, selected, scale);
  }
}
