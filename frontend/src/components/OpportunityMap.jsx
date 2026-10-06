import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BASE_LAYER =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function referenceKey(reference) {
  return `${reference.lat}:${reference.lon}`;
}

function validReference(reference) {
  return reference &&
    Number.isFinite(reference.lat) && Number.isFinite(reference.lon) &&
    Math.abs(reference.lat) <= 90 && Math.abs(reference.lon) <= 180;
}

function textElement(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  return element;
}

// Leaflet markers only open popups on Enter; route Enter/Space to selection instead.
function activateOnKeyboard(element, layer) {
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      layer.fire("click");
    }
  });
}

function pairPosition(opportunity) {
  return [
    (opportunity.descReference.lat + opportunity.gpcReference.lat) / 2,
    (opportunity.descReference.lon + opportunity.gpcReference.lon) / 2,
  ];
}

export default function OpportunityMap({
  opportunity,
  referenceAreas,
  opportunities,
  highlightedOpportunityIds,
  selectedOpportunityId,
  selectedReference,
  overview,
  onSelectOpportunity,
  onSelectReference,
}) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const layerGroup = useRef(null);

  useEffect(() => {
    if (!mapElement.current) return undefined;

    const map = L.map(mapElement.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([39.5, -98.35], 4);
    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer(BASE_LAYER, {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);

    mapInstance.current = map;
    layerGroup.current = L.layerGroup().addTo(map);
    const container = mapElement.current;
    let resizeFrame;
    const refreshSize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (container.clientWidth && container.clientHeight) {
          map.invalidateSize({ animate: false, debounceMoveend: true });
        }
      });
    };
    // The adjacent project details can resize the grid after cloud data loads.
    const resizeObserver = new ResizeObserver(refreshSize);
    resizeObserver.observe(container);
    refreshSize();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      map.remove();
      mapInstance.current = null;
      layerGroup.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const layers = layerGroup.current;
    if (!map || !layers) return;

    layers.clearLayers();

    const pairReferences = [opportunity?.descReference, opportunity?.gpcReference]
      .filter(validReference);
    const selectedReferences = [...pairReferences, selectedReference].filter(validReference);
    const selectedKeys = new Set(selectedReferences.map(referenceKey));
    const highlightedIds = new Set(highlightedOpportunityIds);

    Object.values(referenceAreas).forEach((reference) => {
      if (!validReference(reference)) return;
      const selected = selectedKeys.has(referenceKey(reference));
      const circle = L.circleMarker([reference.lat, reference.lon], {
        bubblingMouseEvents: false,
        className: selected ? "map-station map-station-selected" : "map-station",
        radius: selected ? 7 : 4,
        weight: selected ? 2 : 1,
        fillOpacity: 1,
      })
        .bindTooltip(textElement("span", reference.label), { direction: "top", offset: [0, -6] })
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          onSelectReference?.(reference);
        })
        .addTo(layers);

      // Only the selected pair's stations join the tab order; the table is the keyboard path to the rest.
      const element = circle.getElement();
      if (element && selected && onSelectReference) {
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", `Show pairings at ${reference.name}`);
        activateOnKeyboard(element, circle);
      }
    });

    const opportunityGroups = new Map();
    opportunities.forEach((candidate) => {
      if (!validReference(candidate.descReference) || !validReference(candidate.gpcReference)) return;
      const position = pairPosition(candidate);
      const key = `${position[0].toFixed(5)}:${position[1].toFixed(5)}`;
      const group = opportunityGroups.get(key) ?? [];
      group.push(candidate);
      opportunityGroups.set(key, group);
    });

    opportunityGroups.forEach((group) => {
      group.forEach((candidate, index) => {
        const selected = candidate.id === selectedOpportunityId;
        const related = highlightedIds.has(candidate.id);
        const numbered = selected || related;
        const horizontalOffset = (index - (group.length - 1) / 2) * (numbered ? 34 : 14);
        const size = numbered ? 30 : 12;
        const markerTitle = `#${candidate.mapNumber}: ${candidate.descProject.title} and ${candidate.gpcProject.title}`;
        const state = selected ? "selected" : related ? "related" : "other";
        const icon = L.divIcon({
          className: "pairing-map-icon",
          html: `<span class="pairing-map-dot pairing-map-dot-${state}">${numbered ? candidate.mapNumber : ""}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2 - horizontalOffset, size / 2],
        });
        const marker = L.marker(pairPosition(candidate), {
          icon,
          keyboard: numbered,
          title: markerTitle,
          zIndexOffset: selected ? 1000 : related ? 500 : 0,
        })
          .bindTooltip(textElement("span", markerTitle), { direction: "top", offset: [0, -size / 2] })
          .on("click", () => onSelectOpportunity(candidate.id))
          .addTo(layers);

        const element = marker.getElement();
        if (element && numbered) activateOnKeyboard(element, marker);
      });
    });

    const referenceDistance = opportunity?.referenceDistanceMiles;
    if (pairReferences.length === 2 && Number.isFinite(referenceDistance)) {
      L.polyline(
        [
          [opportunity.descReference.lat, opportunity.descReference.lon],
          [opportunity.gpcReference.lat, opportunity.gpcReference.lon],
        ],
        { className: "map-gap-line", weight: 3, dashArray: "7 7", interactive: false },
      ).addTo(layers);
    }

    if (overview) {
      const positions = opportunities
        .filter((candidate) => highlightedIds.has(candidate.id) &&
          validReference(candidate.descReference) && validReference(candidate.gpcReference))
        .map(pairPosition);
      if (positions.length) {
        map.fitBounds(positions, { padding: [40, 40], maxZoom: 6 });
        return;
      }
    }

    const viewportReferences = [...new Map(
      selectedReferences.map((reference) => [referenceKey(reference), reference]),
    ).values()];
    if (viewportReferences.length > 1) {
      map.fitBounds(viewportReferences.map(({ lat, lon }) => [lat, lon]), {
        padding: [70, 70], maxZoom: 8,
      });
    } else if (viewportReferences.length) {
      map.setView(
        [viewportReferences[0].lat, viewportReferences[0].lon],
        7,
      );
    } else {
      const availableReferences = Object.values(referenceAreas).filter(validReference);
      if (availableReferences.length) {
        map.fitBounds(availableReferences.map(({ lat, lon }) => [lat, lon]), {
          padding: [70, 70], maxZoom: 8,
        });
      } else {
        map.setView([39.5, -98.35], 4);
      }
    }
  }, [
    opportunity,
    referenceAreas,
    opportunities,
    highlightedOpportunityIds,
    selectedOpportunityId,
    selectedReference,
    overview,
    onSelectOpportunity,
    onSelectReference,
  ]);

  return (
    <div
      className="opportunity-map"
      ref={mapElement}
      role="region"
      aria-label="Interactive map with recorded substation endpoints and opportunity pairings"
    />
  );
}
