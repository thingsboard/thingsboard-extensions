///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { WidgetHeaderAction, WidgetHeaderComponent } from "../widget-header/widget-header.component";
import { injectCss, injectScript } from "../cdn-loader";

/** A point to plot on the map. */
export interface MapLocation {
  name: string;
  lat: number;
  lng: number;
}

export type MapType = "roadmap" | "satellite" | "hybrid";

/**
 * Reusable map card: a Leaflet map (loaded lazily from a CDN) with brand-coloured
 * water-drop markers, clustering, a base-layer switcher (Positron / Esri imagery /
 * hybrid), and dark-mode tile inversion for the roadmap. Presentational: it plots
 * the {@link locations} input and emits {@link mapTypeChange}; data fetching and
 * persistence are the host's responsibility.
 */
@Component({
  selector: "tb-map-card",
  templateUrl: "./map-card.component.html",
  styleUrls: ["./map-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetHeaderComponent],
})
export class MapCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  /**
   * Strip the native `title` attribute off the host: `title` is set as an @Input
   * via `title="…"`, but it is also a global HTML attribute, so the browser would
   * otherwise render its own tooltip with that text on hover.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "Map";
  @Input() icon = "location_on";
  /** Message shown when there are no locations to plot. */
  @Input() emptyText = "No locations";
  /** Material icon rendered inside each marker pin. */
  @Input() markerIcon = "water_drop";
  /** Height of the map canvas (any CSS length). */
  @Input() mapHeight = "320px";
  @Input() locations: MapLocation[] = [];
  @Input() dark = false;
  @Input() mapType: MapType = "roadmap";
  /** Header action icon buttons (e.g. a close button when shown in a dialog). */
  @Input() headerActions: WidgetHeaderAction[] = [];
  @Output() mapTypeChange = new EventEmitter<MapType>();
  @Output() headerActionClick = new EventEmitter<string>();

  @ViewChild("mapContainer") mapContainer?: ElementRef<HTMLElement>;
  @ViewChild("mapLayers") mapLayersEl?: ElementRef<HTMLElement>;

  mapPanelOpen = false;
  mapError = false;
  mapEmpty = false;
  readonly mapTypes: { id: MapType; label: string; thumb: string }[] = [
    { id: "roadmap", label: "Roadmap", thumb: "https://a.basemaps.cartocdn.com/light_all/4/3/5.png" },
    { id: "satellite", label: "Satellite", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/3" },
    { id: "hybrid", label: "Hybrid", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/3" },
  ];

  private L: any;
  private map: any;
  private markerLayer: any;
  private baseLayers: Record<string, any> = {};
  private mapReady = false;

  constructor(private readonly zone: NgZone, private readonly cd: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.mapReady) {
      return;
    }
    if (changes["locations"]) {
      this.renderMarkers();
    }
    if (changes["mapType"]) {
      this.applyMapBaseLayer();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  /** Re-measure the map after it has been shown/resized. */
  invalidateSize(): void {
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  toggleMapPanel(): void {
    this.mapPanelOpen = !this.mapPanelOpen;
  }

  /** Recenter the map to its original view that shows all markers. */
  recenter(): void {
    if (!this.mapReady || !this.map) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      if (!this.fitToMarkers()) {
        this.map.setView([20, 0], 2); // no markers → reset to the default world view
      }
    });
  }

  selectMapType(type: MapType): void {
    if (this.mapType === type) {
      return;
    }
    this.mapType = type;
    this.applyMapBaseLayer();
    this.mapTypeChange.emit(type);
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (this.mapPanelOpen && this.mapLayersEl && !this.mapLayersEl.nativeElement.contains(event.target as Node)) {
      this.mapPanelOpen = false;
    }
  }

  private async initMap(): Promise<void> {
    try {
      this.L = await this.loadLeaflet();
    } catch {
      this.mapError = true;
      this.cd.detectChanges();
      return;
    }
    if (!this.mapContainer) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map(this.mapContainer!.nativeElement, { zoomControl: true, attributionControl: true }).setView([20, 0], 2);
      this.createBaseLayers();
      this.applyMapBaseLayer();
      this.markerLayer = this.L.markerClusterGroup
        ? this.L.markerClusterGroup({
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 17,
            maxClusterRadius: 50,
            animate: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: false,
            chunkedLoading: true,
            iconCreateFunction: (cluster: any) =>
              this.L.divIcon({
                html: '<div class="tbm-cluster-inner">' + cluster.getChildCount() + "</div>",
                className: "tbm-cluster",
                iconSize: [28, 28],
              }),
          })
        : this.L.layerGroup();
      this.markerLayer.addTo(this.map);
      this.mapReady = true;
      this.renderMarkers();
    });
  }

  private createBaseLayers(): void {
    const L = this.L;
    this.baseLayers = {
      // Roadmap — CARTO Positron.
      roadmap: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "© OpenStreetMap, © CARTO",
      }),
      // Satellite — Esri World Imagery.
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "© Esri",
      }),
      // Hybrid — Esri imagery + place/boundary labels.
      hybrid: L.layerGroup(
        [
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
          }),
        ],
        { attribution: "© Esri" },
      ),
    };
  }

  /** Show only the base layer matching the current mapType. No-op if not ready. */
  private applyMapBaseLayer(): void {
    if (!this.map || !this.baseLayers[this.mapType]) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      Object.keys(this.baseLayers).forEach((key) => {
        const layer = this.baseLayers[key];
        if (key === this.mapType) {
          if (!this.map.hasLayer(layer)) {
            layer.addTo(this.map);
          }
        } else if (this.map.hasLayer(layer)) {
          layer.remove();
        }
      });
    });
  }

  private renderMarkers(): void {
    if (!this.mapReady || !this.map || !this.L) {
      return;
    }
    this.markerLayer.clearLayers();

    const locs = (this.locations ?? []).filter((l) => isFinite(l.lat) && isFinite(l.lng));
    this.mapEmpty = locs.length === 0;
    this.cd.detectChanges();

    // Position the view FIRST (instant), then add the markers — so the marker
    // cluster doesn't animate them from the old zoom into place when opened.
    this.fitToMarkers(false);

    // Brand circle (28px) with a white glyph, anchored bottom-centre.
    const icon = this.L.divIcon({
      className: "tbm-marker",
      html: `<span class="tbm-marker-pin"><span class="material-icons tbm-marker-icon">${this.markerIcon}</span></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      tooltipAnchor: [0, -30],
    });
    for (const loc of locs) {
      const marker = this.L.marker([loc.lat, loc.lng], { icon }).bindTooltip(loc.name, {
        className: "tbm-tooltip",
        direction: "top",
      });
      marker.on("mouseover", () => this.map.panTo([loc.lat, loc.lng]));
      marker.addTo(this.markerLayer);
    }
  }

  /** Fit the view to all markers. Returns false when there are none to fit. */
  private fitToMarkers(animate = true): boolean {
    const pts = (this.locations ?? [])
      .map((l) => [l.lat, l.lng] as [number, number])
      .filter((p) => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length === 1) {
      this.map.setView(pts[0], 15, { animate });
      return true;
    }
    if (pts.length > 1) {
      this.map.fitBounds(pts, { padding: [24, 24], animate });
      return true;
    }
    return false;
  }

  /** Load Leaflet + the markercluster plugin from CDN once. */
  private async loadLeaflet(): Promise<any> {
    const w = window as any;
    if (!w.L) {
      injectCss("tb-ext-leaflet-css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      await injectScript("tb-ext-leaflet-js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
    }
    if (w.L && !w.L.markerClusterGroup) {
      injectCss("tb-ext-cluster-css", "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css");
      await injectScript("tb-ext-cluster-js", "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js");
    }
    return w.L;
  }
}
